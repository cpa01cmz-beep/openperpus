import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/supabase/auth';
import { createLogger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

function retryableError(message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: { code: 'SAVE_FAILED', message, retryable: true },
      ...(details === undefined ? {} : { details }),
    },
    { status: 500, headers: { 'Retry-After': '1' } }
  );
}

export type ExtendLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  /** jumlah hari perpanjangan (1..90). Default 7. */
  days?: number;
};

/**
 * S-roi7 single-source extend — due_at += N days untuk loan aktif.
 * Aktif = borrowed|overdue. returned/lost -> 409. Audit loans.extend
 * dengan old_due_at + new_due_at. is_overdue dihitung ulang dari new due.
 * Primary: RPC extend_loan (SELECT FOR UPDATE, validasi DB). Fallback: optimistic-lock.
 */
export async function extendLoan(opts: ExtendLoanOptions): Promise<Response> {
  const { supabase, id } = opts;
  const userId = opts.userId ?? null;
  const days = opts.days === undefined ? 7 : Number(opts.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return jsonError('VALIDATION', 'days harus bilangan bulat 1..90.', 422);
  }

  // Try RPC first (atomic DB-side with SELECT FOR UPDATE).
  // Guard seperti returnLoan.ts: klien tanpa .rpc (mock/legacy) langsung
  // jatuh ke fallback optimistic-lock di bawah, bukan TypeError 500.
  if (typeof supabase.rpc === 'function') {
    // Fetch old due_at before RPC for audit metadata
    const { data: oldLoan } = await supabase.from('loans').select('due_at').eq('id', id).single();
    const oldDueAt = oldLoan?.due_at ?? null;

    const { data: rpcData, error: rpcError } = await supabase.rpc('extend_loan', {
      p_loan_id: id,
      p_days: days,
    });

    // If RPC works, use its result
    if (!rpcError && rpcData && rpcData.length > 0) {
      const loan = rpcData[0] as {
        id: string;
        due_at: string;
        status: string;
        is_overdue: boolean;
        [key: string]: unknown;
      };

      const auditPayload = {
        user_id: userId,
        action: 'loans.extend',
        entity_type: 'loans',
        entity_id: id,
        metadata: { old_due_at: oldDueAt, new_due_at: loan.due_at, days },
      };
      const firstAudit = await supabase.from('activity_logs').insert(auditPayload);
      if (firstAudit.error) {
        createLogger().warn('audit.activity_logs_retry', { detail: firstAudit.error.message });
        const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
        if (retryAudit.error) {
          createLogger().error('audit.activity_logs_failed', {
            detail: retryAudit.error.message,
            entity_id: id,
          });
        }
      }

      return NextResponse.json({ data: { ...loan, is_overdue: loan.is_overdue } });
    }

    // Handle RPC 409 (loan returned/lost) - return proper 409
    const rpcMsg = (rpcError as { message?: string; code?: string } | null)?.message ?? '';
    const rpcCode = (rpcError as { code?: string } | null)?.code ?? '';
    if (
      rpcCode === '40901' ||
      rpcCode === '409' ||
      /sudah selesai|already (returned|lost)/i.test(rpcMsg)
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: rpcMsg || 'Peminjaman sudah selesai, tidak bisa diperpanjang.',
          },
        },
        { status: 409 }
      );
    }

    // RPC hilang (42883/PGRST202) -> jatuh ke fallback optimistic-lock di bawah.
    const isMissingRpc =
      !rpcData &&
      (rpcCode === '42883' ||
        rpcCode === 'PGRST202' ||
        /function.*not exist|undefined/i.test(`${rpcMsg} ${rpcCode}`));

    if (!isMissingRpc) {
      // Some other RPC error
      return retryableError('Gagal memperpanjang pinjaman. Silakan coba lagi.', rpcError?.message);
    }
  }

  // --- Fallback: optimistic-lock ---
  const { data: loan } = await supabase.from('loans').select('*').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  const l = loan as { status: string; due_at: string };
  if (l.status === 'returned' || l.status === 'lost') {
    return jsonError('CONFLICT', 'Peminjaman sudah selesai, tidak bisa diperpanjang.', 409);
  }

  const oldDue = new Date(l.due_at);
  // RACE-03: tolak due_at rusak sebelum aritmetika (hindari RangeError 500).
  if (Number.isNaN(oldDue.getTime())) {
    return jsonError('VALIDATION', 'due_at peminjaman tidak valid.', 422);
  }
  const newDue = new Date(oldDue.getTime() + days * 86400000);
  const newDueIso = newDue.toISOString();

  // RACE-02: optimistic-lock — dua extend konkuren, hanya 1 yang menang.
  const { data, error } = await supabase
    .from('loans')
    .update({ due_at: newDueIso, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('due_at', l.due_at)
    .select()
    .single();
  if (error || !data) {
    const msg2 = (error as { message?: string; code?: string } | null)?.message ?? '';
    const code2 = (error as { code?: string } | null)?.code ?? '';
    if (
      !data &&
      (!error ||
        /concurrent winner|PGRST116|406|0 rows|multiple \(or no\) rows/i.test(`${msg2} ${code2}`))
    ) {
      return jsonError('CONFLICT', 'Peminjaman sudah diperpanjang pihak lain.', 409);
    }
    return retryableError(
      'Gagal memperpanjang pinjaman. Silakan coba lagi.',
      (error as { message?: string } | null)?.message
    );
  }

  const row = { ...(data as Record<string, unknown>), is_overdue: newDue.getTime() < Date.now() };

  const auditPayload = {
    user_id: userId,
    action: 'loans.extend',
    entity_type: 'loans',
    entity_id: id,
    metadata: { old_due_at: l.due_at, new_due_at: newDueIso, days },
  };
  const firstAudit = await supabase.from('activity_logs').insert(auditPayload);
  if (firstAudit.error) {
    createLogger().warn('audit.activity_logs_retry', { detail: firstAudit.error.message });
    const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
    if (retryAudit.error) {
      createLogger().error('audit.activity_logs_failed', {
        detail: retryAudit.error.message,
        entity_id: id,
      });
    }
  }

  return NextResponse.json({ data: row });
}
