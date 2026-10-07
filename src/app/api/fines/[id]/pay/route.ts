import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { jsonError } from '@/lib/supabase/auth';
import { getSession } from '@/lib/session';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/fines/[id]/pay {metode|method?, amount?|nominal?}
 *   — pustakawan+ (semua denda) atau anggota pemilik denda milik sendiri.
 *   amount opsional: default lunasi sisa (amount - paid_amount).
 *   Parsial: status -> partial; lunas: status -> paid + paid_at.
 *   Idempoten: 409 bila sudah paid/waived.
 *   US-03: anggota boleh membayar MILIK SENDIRI (tanpa gateway);
 *   denda orang lain + waive tetap staf saja (403/404).
 */

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  const s = await getSession();
  if ('errorResponse' in s) return s.errorResponse;
  const { supabase, userId, isStaff, memberId } = s.session;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const method =
    String(body.metode ?? body.method ?? body.payment_method ?? 'cash').trim() || 'cash';

  const { data: fine } = await supabase.from('fines').select('*').eq('id', id).single();
  if (!fine) return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404);
  const f = fine as {
    amount: number | string;
    paid_amount: number | string;
    status: string;
    member_id: string;
    loan_id: string;
  };

  // US-03: pemilik boleh membayar MILIK SENDIRI; non-staf + bukan pemilik → 403/404.
  if (!isStaff && (!memberId || f.member_id !== memberId)) {
    return jsonError('FORBIDDEN', 'Denda tidak ditemukan.', 403);
  }

  // FINE-PAY-IDEMPOTENT: 409 bila sudah paid/waived + compare-and-set
  // .in("status", ["unpaid", "partial"]) agar dua submit konkuren hanya
  // satu yang menang; error/0-baris → 409 konsisten via jsonError.
  if (f.status === 'paid' || f.status === 'waived') {
    return jsonError('CONFLICT', 'Denda sudah lunas/dibebaskan.', 409);
  }

  const total = Number(f.amount);
  const paid = Number(f.paid_amount);
  const remain = Math.round((total - paid) * 100) / 100;
  if (remain <= 0) return jsonError('CONFLICT', 'Denda sudah lunas.', 409);

  const rawAmount = body.amount ?? body.nominal;
  const payAmount =
    rawAmount === undefined || rawAmount === null || rawAmount === '' ? remain : Number(rawAmount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return jsonError('VALIDATION', 'amount/nominal harus angka > 0.', 422);
  }
  // Toleransi floating: tolak bila melebihi sisa.
  if (Math.round(payAmount * 100) > Math.round(remain * 100)) {
    return jsonError('VALIDATION', `Nominal melebihi sisa denda (${remain}).`, 422);
  }

  const newPaid = Math.round((paid + payAmount) * 100) / 100;
  const isFull = Math.round(newPaid * 100) >= Math.round(total * 100);

  // RACE-FINE: jalur atomik dulu — pay_own_fine RPC (row lock + guard 409
  // + validasi nominal single-txn). Fallback CAS bila fungsi belum terdeploy.
  const rpc = supabase.rpc as unknown as
    | ((fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)
    | undefined;
  if (typeof rpc === 'function') {
    try {
      const { data: rpcData, error: rpcErr } = await rpc('pay_own_fine', {
        p_fine_id: id,
        p_amount: payAmount,
        p_method: method,
        p_user_id: userId,
      });
      const rc = (rpcErr as { code?: string; message?: string } | null) ?? null;
      const rpcMissing =
        rc?.code === '42883' ||
        rc?.code === 'PGRST202' ||
        /could not find.*pay_own_fine|function.*pay_own_fine.*does not exist/i.test(
          rc?.message ?? ''
        );
      if (!rpcMissing && !rpcErr && rpcData) {
        return NextResponse.json({ data: rpcData, revalidated: ['fines', '/admin/peminjaman'] });
      }
      if (!rpcMissing && rc) {
        if (rc.code === '25001') return jsonError('CONFLICT', 'Denda sudah lunas/dibebaskan.', 409);
        if (rc.code === '02000') return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404);
        if (rc.code === '22000')
          return jsonError('VALIDATION', rc.message || 'Nominal tidak valid.', 422);
        if (rc.code === '42501') return jsonError('FORBIDDEN', 'Denda tidak ditemukan.', 403);
      }
    } catch {
      // jatuh ke fallback CAS di bawah
    }
  }

  const { data, error } = await supabase
    .from('fines')
    .update({
      paid_amount: newPaid,
      status: isFull ? 'paid' : 'partial',
      paid_at: isFull ? new Date().toISOString() : null,
      notes:
        typeof body.notes === 'string' && body.notes.trim()
          ? body.notes.trim()
          : `Dibayar via ${method}.`,
    })
    .eq('id', id)
    .eq('paid_amount', paid)
    .in('status', ['unpaid', 'partial'])
    .select()
    .single();

  if (error || !data) {
    log.warn('fines.id.pay.conflict', { detail: error?.message ?? 'conflict' });
    return jsonError('CONFLICT', 'Denda sudah berubah status, muat ulang dulu.', 409, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action: 'fines.pay',
      entity_type: 'fines',
      entity_id: id,
      metadata: {
        loan_id: f.loan_id,
        member_id: f.member_id,
        amount: payAmount,
        method,
        status: (data as { status: string }).status,
      },
    });
  } catch {
    /* best-effort */
  }

  const revalidated: string[] = [];
  try {
    revalidateTag('fines', 'max');
    revalidated.push('fines');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/peminjaman');
    revalidated.push('/admin/peminjaman');
  } catch {
    /* abaikan */
  }

  return NextResponse.json({ data, revalidated });
}
