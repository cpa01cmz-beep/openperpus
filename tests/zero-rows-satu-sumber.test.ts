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
    expect(
      isZeroRows({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      })
    ).toBe(true);
    // Bentuk zero-rows yang dipakai tests/coredata2-races.test.ts:41 (tanpa kode).
    expect(isZeroRows({ message: 'concurrent winner' })).toBe(true);
  });

  it('kode "406" BUKAN zero-rows (status HTTP, bukan error.code) -> false', () => {
    // issue #183: di postgrest-js@2, 406 adalah `status`, bukan `error.code`;
    // menerimanya sebagai kode adalah dead code sekaligus jalan masuk kembali
    // masking kegagalan tulis jadi 409. Arahnya harus fail-loud (500).
    expect(isZeroRows({ code: '406' })).toBe(false);
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
  /** Baris KODE saja (baris komentar dibuang) — larangan kosakata tak boleh
   * mengganggu dokumentasi: menyebut `406` di komentar untuk menjelaskan
   * mengapa TIDAK dipakai justru perilaku yang benar (sisa review #184).
   *
   * Blok komentar dibuang LEBIH DULU: memfilter per-baris saja masih salah
   * hitung blok `/* ... *\/` yang barisnya tidak berawalan `*`/`//` (mis.
   * menyorot potongan kode mati sebagai dokumentasi) — itu memunculkan
   * kegagalan CI palsu dari dokumentasi, persis lubang #2 yang issue ini tutup. */
  const codeLines = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');

  /** PERBANDINGAN kode error terhadap '406' — bentuk cabang dead-code yang
   * dibuang dari helper (#183/#184). Harus tahan bentuk: identifier bertitik
   * (`error.code`), camelCase (`errorCode`), urutan terbalik, kutip ganda, dan
   * `==`/`===`/`!=`/`!==`. Hanya '406' literal; bukan token `406` mentah, jadi
   * menyebut angka itu di komentar/dokumentasi tetap sah. */
  const CODE_COMPARE_406 =
    /\b[\w.]*code\w*\s*(?:!==?|===?)\s*['"`]406['"`]|['"`]406['"`]\s*(?:!==?|===?)\s*[\w.]*code/i;

  it.each(SITES)('%s mengimpor @/lib/zero-rows tanpa salinan lokal', (_name, file) => {
    const src = read(file);
    expect(src, `${file} wajib memakai helper bersama`).toContain(
      "import { isZeroRows } from '@/lib/zero-rows'"
    );
    // Invarian yang benar: KOSAKATA klasifikasi 0-baris hanya boleh hidup di
    // helper. Salinan lokal yang dulu menjadi sumber bahaya #179 (regex
    // alternatif) akan memuat salah satu kosakata di bawah — termasuk bentuk
    // dinamis `new RegExp(msg + ' ' + code)`, yang tidak terdeteksi oleh
    // larangan teks seperti `| 406` (issue #183).
    const code = codeLines(src);
    for (const vocab of ['PGRST116', 'concurrent winner', 'multiple (or no) rows', '0 rows']) {
      expect(
        code,
        `${file} tak boleh memuat kosakata 0-baris "${vocab}" (milik helper)`
      ).not.toContain(vocab);
    }
    // Bentuk dinamis `new RegExp(msg + ' ' + code)` TIDAK memuat kosakata
    // literal, jadi dilacak terpisah: larang konstruksi regex dinamis di
    // berkas site. (Regex literal yang sudah ada untuk deteksi RPC-hilang di
    // extendLoan.ts tetap sah — yang dilarang adalah regex dari field error.)
    expect(src, `${file} tak boleh membangun regex dinamis dari field error`).not.toContain(
      'new RegExp('
    );
    // Sisa review #184: tanpa ini, berkas site boleh MEMBUKA LAGI cabang
    // dead-code `error.code === '406'` yang baru dibuang dari helper tanpa satu
    // assertion pun gagal. Bentuk persisnya: perbandingan kode terhadap '406'.
    // Bentuk yang setara harus ikut kena: `errorCode`, urutan terbalik
    // `'406' === error.code`, kutip ganda, dan `==`/`!==` — kalau hanya
    // `\bcode\w* === '406'`, ketiga bentuk itu membuka kembali dead code tanpa
    // satu assertion pun gagal.
    expect(
      code,
      `${file} tak boleh membandingkan kode error dengan '406' (dead code, milik kontrak helper)`
    ).not.toMatch(CODE_COMPARE_406);
  });

  it('helper hanya menguji frasa kanonik di message tanpa membangun regex dinamis', () => {
    const helper = read('src/lib/zero-rows.ts');
    expect(helper).toContain("error.code === 'PGRST116'");
    // Invarian berbentuk, bukan per-identifier (sisa review #184): input regex
    // WAJIB statis. Interpolasi/konkatenasi/template literal di dalam `.test()`
    // berarti input regex dibangun dinamis — persis kelas bahaya #179 —
    // apapun nama variabelnya.
    expect(helper, 'input regex wajib statis (tak boleh dibangun dinamis)').not.toMatch(
      /\.test\([^)]*(\$\{|`|\+)/
    );
    expect(helper, 'regex wajib menguji message').toMatch(/\.test\(error\.message\b/);
    // `new RegExp(\`${msg} ${code}\`)` duduk DI LUAR `.test(...)`, jadi guard di
    // atas tak pernah melihatnya: tanpa larangan eksplisit di sini, kelas
    // bahaya #179 kembali lewat konstruktor regex, bukan lewat `.test()`.
    expect(helper, 'helper tak boleh membangun regex dinamis dari field error').not.toContain(
      'new RegExp('
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
