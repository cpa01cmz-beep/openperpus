import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #181 (sisa review #180): klasifikasi 0-baris punya SATU sumber
// (@/lib/zero-rows) dan tidak boleh lagi memakai substring gabungan
// `message + code`. Di main sebelum perbaikan, legacyReturn.ts dan
// extendLoan.ts masih menguji regex `concurrent winner|PGRST116|406|0 rows|
// multiple (or no) rows` atas `${msg} ${code}`, sehingga kegagalan Postgres
// sungguhan yang detailnya memuat "406"/"0 rows" ikut jadi 409 CONFLICT —
// kelas kegagalan yang PERSIS sudah ditutup issue #179 di route reservasi.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { isZeroRows } from '@/lib/zero-rows';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Ketiga titik tulisan kondisional yang wajib memakai helper bersama. */
const SITES = [
  ['PUT /api/reservations/{id}', 'src/app/api/reservations/[id]/route.ts'],
  ['pengembalian legacy (RACE-01)', 'src/lib/legacyReturn.ts'],
  ['perpanjangan pinjaman (RACE-02)', 'src/lib/extendLoan.ts'],
] as const;

describe('isZeroRows — kontrak satu sumber', () => {
  it('0-baris (miss guard optimistik-lock) -> true', () => {
    // Bentuk asli postgrest-js@2: `.single()` 0 baris pada 200 `[]` TIDAK
    // mengisi error (hanya >1 baris yang set PGRST116 + status 406).
    expect(isZeroRows(null)).toBe(true);
    expect(isZeroRows(undefined)).toBe(true);
    expect(isZeroRows({ code: 'PGRST116' })).toBe(true);
    expect(isZeroRows({ code: '406' })).toBe(true);
    expect(
      isZeroRows({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      })
    ).toBe(true);
    // Bentuk zero-rows yang dipakai tests/coredata2-races.test.ts:41 (tanpa kode).
    expect(isZeroRows({ message: 'concurrent winner' })).toBe(true);
  });

  it('kegagalan DB sungguhan -> false (bukan 409), termasuk angka 406 di detail', () => {
    // Kelas #179: angka acuan "406" muncul di dalam detail error Postgres.
    expect(
      isZeroRows({ code: '22P02', message: 'invalid input syntax for type integer: "406"' })
    ).toBe(false);
    expect(
      isZeroRows({ code: '22001', message: 'value too long for type character varying(406)' })
    ).toBe(false);
    // Frasa lepas "0 rows" juga bukan penanda zero-rows guard.
    expect(isZeroRows({ code: 'P0001', message: 'RPC gagal: 0 rows diperbarui' })).toBe(false);
    // Kegagalan RLS / fungsi hilang / tulis gagal.
    expect(isZeroRows({ code: '42501', message: 'permission denied for table loans' })).toBe(false);
    expect(
      isZeroRows({ code: '23505', message: 'duplicate key value violates unique constraint' })
    ).toBe(false);
    expect(isZeroRows({ code: '42883', message: 'function extend_loan does not exist' })).toBe(
      false
    );
  });
});

describe('paritas statis — ketiga titik impor helper yang sama', () => {
  it.each(SITES)('%s mengimpor @/lib/zero-rows tanpa salinan lokal', (_name, file) => {
    const src = read(file);
    expect(src, `${file} wajib memakai helper bersama`).toContain(
      "import { isZeroRows } from '@/lib/zero-rows'"
    );
    // Bahaya #179: `406` / `0 rows` sebagai alternatif substring regex.
    expect(src, `${file} tak boleh mencocokkan 406 sebagai substring`).not.toMatch(/\|\s*406\b/);
    expect(src, `${file} tak boleh mencocokkan "0 rows" sebagai substring`).not.toMatch(
      /\|\s*0 rows\b/
    );
  });

  it('helper tidak menguji regex atas gabungan message + code', () => {
    const helper = read('src/lib/zero-rows.ts');
    expect(helper).toContain("error.code === 'PGRST116'");
    expect(helper, 'tak boleh ada interpolasi ${msg}/${code} sebagai input regex').not.toMatch(
      /\$\{/
    );
  });
});

/**
 * Chain mock sticky ala tests/iter2-sweep-zerorow.test.ts: hanya dua panggilan
 * `.single()` pertama yang "berhasil" (settings + baris loans); setiap
 * panggilan berikutnya mengembalikan `sticky` — termasuk update optimistik.
 * Dengan begitu tes tidak bergantung pada jumlah persis `.single()` yang
 * dilewati getFineRate/getFineMax/getReplacementFee (semua error-safe).
 */
function stickyChain(sticky: () => { data: unknown; error: unknown }) {
  let calls = 0;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.update = () => chain;
  chain.single = async () => {
    calls += 1;
    if (calls === 1) return { data: { fine_per_day: 1000 }, error: null };
    if (calls === 2)
      return {
        data: {
          id: 'L-x',
          status: 'borrowed',
          due_at: new Date().toISOString(),
          book_id: '22222222-2222-4222-8222-222222222222',
          member_id: '11111111-1111-4111-8111-111111111111',
        },
        error: null,
      };
    return sticky();
  };
  return chain;
}

describe('regresi — kegagalan DB sungguhan tak lagi jadi 409 (RED sebelum #181)', () => {
  it('RACE-07 return: 22001 dengan literal "406" di detail -> 500 SAVE_FAILED, bukan 409', async () => {
    const { returnLoan } = (await import('@/lib/loans-return')) as unknown as {
      returnLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    const chain = stickyChain(() => ({
      data: null,
      error: { code: '22001', message: 'value too long for type character varying(406)' },
    }));
    const from = vi.fn(() => chain);
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from };
    const supabase = (createClient as unknown as () => unknown)();
    const res = await returnLoan({
      supabase,
      id: 'L-x',
      userId: 'U-1',
      returnedAt: new Date().toISOString(),
    });
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('SAVE_FAILED');
  });

  it('RACE-08 extend: 22P02 dengan literal "406" di detail -> 500, bukan 409', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    let calls = 0;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = () => chain;
    chain.single = async () => {
      calls += 1;
      if (calls === 1)
        return {
          data: { id: 'L-y', status: 'borrowed', due_at: new Date().toISOString() },
          error: null,
        };
      return {
        data: null,
        error: { code: '22P02', message: 'invalid input syntax for type integer: "406"' },
      };
    };
    const from = vi.fn(() => chain);
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from };
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-y', userId: 'U-1', days: 7 });
    expect(res.status).toBe(500);
    const j = (await res.json()) as { error: { code: string } };
    expect(j.error.code).toBe('SAVE_FAILED');
  });

  it('0-baris asli tetap 409 (regression guard: jangan over-correct jadi 500)', async () => {
    const { extendLoan } = (await import('@/lib/loans-return')) as unknown as {
      extendLoan: (a: Record<string, unknown>) => Promise<Response>;
    };
    const { createClient } = await import('@/lib/supabase/server');
    let calls = 0;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = () => chain;
    chain.single = async () => {
      calls += 1;
      if (calls === 1)
        return {
          data: { id: 'L-z', status: 'borrowed', due_at: new Date().toISOString() },
          error: null,
        };
      // Bentuk ASLI postgrest-js@2 untuk miss guard: 200 + [] -> data null,
      // error null.
      return { data: null, error: null };
    };
    const from = vi.fn(() => chain);
    (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = { from };
    const supabase = (createClient as unknown as () => unknown)();
    const res = await extendLoan({ supabase, id: 'L-z', userId: 'U-1', days: 7 });
    expect(res.status).toBe(409);
  });
});
