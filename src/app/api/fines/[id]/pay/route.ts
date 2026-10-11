import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { jsonError } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { getSession } from '@/lib/session';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

type RpcLike = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;

/** Deteksi "fungsi RPC belum terdeploy" (42883 undefined_function / PGRST202). */
function rpcMissing(err: { code?: string; message?: string } | null, fn: string): boolean {
  if (!err) return false;
  if (err.code === '42883' || err.code === 'PGRST202') return true;
  return new RegExp(`could not find.*${fn}|function.*${fn}.*does not exist`, 'i').test(
    err.message ?? ''
  );
}

/**
 * RECEIPT-FALLBACK: nomor kwitansi lokal bila sequence DB (next_receipt_no)
 * belum tersedia. DB tetap jaminan unik via UNIQUE index payments.receipt_no;
 * jalur produksi normal memakai pay_fine_tx (kwitansi atomik).
 */
function fallbackReceiptNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RCP-${ymd}-${rand}`;
}

/**
 * POST /api/fines/[id]/pay {metode|method?, amount?|nominal?}
 *   — pustakawan+ (semua denda) atau anggota pemilik denda milik sendiri.
 *   amount opsional: default lunasi sisa (amount - paid_amount).
 *   Parsial: status -> partial; lunas: status -> paid + paid_at.
 *   Idempoten: 409 bila sudah paid/waived.
 *   US-03: anggota boleh membayar MILIK SENDIRI (tanpa gateway);
 *   denda orang lain + waive tetap staf saja (403/404).
 *   #72: setiap pembayaran menulis baris payments IMMUTABLE dengan
 *   receipt_no unik — balasan memuat { data: fine, payment }.
 */

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  const s = await getSession();
  if ('errorResponse' in s) return s.errorResponse;
  const { supabase, userId, isStaff, memberId } = s.session;
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID denda tidak valid (harus UUID).', 400);

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

  const revalidated = ['fines', '/admin/peminjaman'];
  const rpc = (supabase as unknown as { rpc?: RpcLike }).rpc;

  // RACE-FINE + RECEIPT: jalur atomik dulu — pay_fine_tx RPC (row lock +
  // guard 409 + validasi nominal + INSERT payments ber-receipt_no single-txn).
  if (typeof rpc === 'function') {
    try {
      const { data: rpcData, error: rpcErr } = await rpc('pay_fine_tx', {
        p_fine_id: id,
        p_amount: payAmount,
        p_method: method,
        p_user_id: userId,
      });
      const rc = (rpcErr as { code?: string; message?: string } | null) ?? null;
      if (!rpcMissing(rc, 'pay_fine_tx') && !rpcErr && rpcData) {
        const payload = rpcData as { fine?: unknown; payment?: unknown };
        // pay_fine_tx (0027) -> {fine, payment}; fungsi lama -> baris fines langsung.
        const data =
          payload && typeof payload === 'object' && payload.fine ? payload.fine : rpcData;
        const payment =
          payload && typeof payload === 'object' && payload.payment ? payload.payment : null;
        return NextResponse.json({ data, payment, revalidated });
      }
      if (!rpcMissing(rc, 'pay_fine_tx') && rc) {
        if (rc.code === '25001') return jsonError('CONFLICT', 'Denda sudah lunas/dibebaskan.', 409);
        if (rc.code === '02000') return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404);
        if (rc.code === '22000')
          return jsonError('VALIDATION', rc.message || 'Nominal tidak valid.', 422);
        if (rc.code === '42501') return jsonError('FORBIDDEN', 'Denda tidak ditemukan.', 403);
      }
    } catch {
      // jatuh ke lapisan di bawah
    }

    // Lapisan 2: pay_own_fine (0013) — pembayaran atomik tanpa kwitansi.
    try {
      const { data: rpcData, error: rpcErr } = await rpc('pay_own_fine', {
        p_fine_id: id,
        p_amount: payAmount,
        p_method: method,
        p_user_id: userId,
      });
      const rc = (rpcErr as { code?: string; message?: string } | null) ?? null;
      if (!rpcMissing(rc, 'pay_own_fine') && !rpcErr && rpcData) {
        return NextResponse.json({ data: rpcData, payment: null, revalidated });
      }
      if (!rpcMissing(rc, 'pay_own_fine') && rc) {
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
      paid_amount: Math.round((paid + payAmount) * 100) / 100,
      status: Math.round((paid + payAmount) * 100) >= Math.round(total * 100) ? 'paid' : 'partial',
      paid_at:
        Math.round((paid + payAmount) * 100) >= Math.round(total * 100)
          ? new Date().toISOString()
          : null,
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

  // RECEIPT: kwitansi immutable di tabel payments (#72). Best-effort pada jalur
  // fallback — kegagalan di sini TIDAK membatalkan pembayaran yang sudah
  // tersimpan; jalur produksi (pay_fine_tx) menulisnya atomik.
  let payment: unknown = null;
  try {
    let receiptNo = '';
    if (typeof rpc === 'function') {
      try {
        const { data: seqData } = await rpc('next_receipt_no', {});
        if (typeof seqData === 'string' && seqData) receiptNo = seqData;
      } catch {
        receiptNo = '';
      }
    }
    if (!receiptNo) receiptNo = fallbackReceiptNo();
    const { data: payRow, error: payErr } = await supabase
      .from('payments')
      .insert({
        fine_id: id,
        amount: payAmount,
        method,
        receipt_no: receiptNo,
        received_by: userId,
      })
      .select()
      .single();
    if (!payErr && payRow) payment = payRow;
  } catch {
    /* best-effort */
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
        receipt_no: (payment as { receipt_no?: string } | null)?.receipt_no ?? null,
      },
    });
  } catch {
    /* best-effort */
  }

  try {
    revalidateTag('fines', 'max');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/peminjaman');
  } catch {
    /* abaikan */
  }

  return NextResponse.json({ data, payment, revalidated });
}
