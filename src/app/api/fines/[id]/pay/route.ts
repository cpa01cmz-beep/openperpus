import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/supabase/auth';

type Ctx = { params: { id: string } };

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
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return jsonError('UNAUTHORIZED', 'Silakan login.', 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = ((profile as { role: string } | null)?.role ?? 'member') as string;
  const isStaff = role === 'admin' || role === 'librarian';

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const method =
    String(body.metode ?? body.method ?? body.payment_method ?? 'cash').trim() || 'cash';

  const { data: fine } = await supabase.from('fines').select('*').eq('id', params.id).single();
  if (!fine) return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404);
  const f = fine as {
    amount: number | string;
    paid_amount: number | string;
    status: string;
    member_id: string;
    loan_id: string;
  };

  // US-03: pemilik boleh membayar MILIK SENDIRI; non-staf + bukan pemilik → 403/404.
  if (!isStaff) {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const ownMemberId = (member as { id: string } | null)?.id ?? null;
    if (!ownMemberId || f.member_id !== ownMemberId) {
      return jsonError('FORBIDDEN', 'Denda tidak ditemukan.', 403);
    }
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
    .eq('id', params.id)
    .in('status', ['unpaid', 'partial'])
    .select()
    .single();

  if (error || !data)
    return jsonError(
      'CONFLICT',
      'Denda sudah berubah status, muat ulang dulu.',
      409,
      error?.message
    );

  try {
    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      action: 'fines.pay',
      entity_type: 'fines',
      entity_id: params.id,
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
    revalidateTag('fines');
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
