import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonError, parsePaging, requireStaff } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/fines?member_id=&status=&page=&per_page=
 *   — anggota: otomatis miliknya (member_id diabaikan); pustakawan+: semua/filter.
 * POST /api/fines { loan_id?, member_id, amount, notes? } -> admin/librarian
 *   — denda manual (di luar denda otomatis return); audit fines.create best-effort.
 * Kolom migrasi 0001: loan_id, member_id, amount, paid_amount, status
 * unpaid|partial|paid|waived, issued_at, paid_at, notes.
 * Bayar via POST /api/fines/[id]/pay (pustakawan+).
 */

const STATUSES = ['unpaid', 'partial', 'paid', 'waived'] as const;

function isUuid(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
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
  const role = (profile as { role: string } | null)?.role ?? 'member';
  const isStaff = role === 'admin' || role === 'librarian';

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const ownMemberId = (member as { id: string } | null)?.id ?? null;

  const { sp, page, perPage, from, to } = parsePaging(req.url, 20);
  const status = (sp.get('status') ?? '').trim();
  let memberFilter = (sp.get('member_id') ?? '').trim();
  if (!isStaff) memberFilter = ownMemberId ?? '__none__';

  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return jsonError('VALIDATION', 'status harus: unpaid|partial|paid|waived.', 422);
  }

  let query = supabase
    .from('fines')
    .select('*, loans(id,book_id,due_at,status), members(id,member_code)', { count: 'exact' })
    .order('issued_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (memberFilter) query = query.eq('member_id', memberFilter);

  const { data, error, count } = await query;
  if (error) {
    log.error('fines.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil denda.', 500, { requestId: log.requestId });
  }
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      meta: { page, per_page: perPage, total },
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const member_id = body.member_id as string;
  if (!isUuid(member_id)) return jsonError('VALIDATION', 'member_id harus UUID valid.', 422);
  const loan_id = body.loan_id as string | undefined;
  if (loan_id !== undefined && loan_id !== null && loan_id !== '' && !isUuid(loan_id)) {
    return jsonError('VALIDATION', 'loan_id harus UUID valid.', 422);
  }
  const amount = Number(body.amount ?? body.nominal);
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonError('VALIDATION', 'amount/nominal harus angka > 0.', 422);
  }

  const { data, error } = await supabase
    .from('fines')
    .insert({
      loan_id: loan_id || null,
      member_id,
      amount,
      paid_amount: 0,
      status: 'unpaid',
      notes: (body.notes as string | null) ?? null,
    })
    .select()
    .single();
  if (error) {
    log.error('fines.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mencatat denda.', 500, { requestId: log.requestId });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      action: 'fines.create',
      entity_type: 'fines',
      entity_id: (data as { id: string }).id,
      metadata: { member_id, loan_id: loan_id ?? null, amount },
    });
  } catch {}
  return NextResponse.json({ data }, { status: 201 });
}
