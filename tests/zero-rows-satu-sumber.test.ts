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
  /** Baris KODE saja (komentar dibuang) — larangan kosakata tak boleh
   * mengganggu dokumentasi: menyebut `406` di komentar untuk menjelaskan
   * mengapa TIDAK dipakai justru perilaku yang benar (sisa review #184).
   *
   * Scanner sadar string/template/regex literal (sisa review #186):
   * membuang komentar dengan regex `/* ... *\/` mentah bisa MENELAN KODE NYATA
   * — string apa pun yang memuat `/*` (mis. URL, contoh dokumentasi) membuka
   * "blok komentar" palsu sampai penanda `*\/` berikutnya (mis. di string lain), dan
   * assertion yang dihitung atas sisa teks itu LOLOS VAKUM: berkas site boleh
   * membuka kembali dead-code `error.code === '406'` di wilayah yang tertelan
   * tanpa satu assertion pun gagal. Kebalikannya juga wajib: komentar EKOR
   * (mis. `const x = 1; // dulu: error.code === '406'`) dulu ikut terhitung
   * sebagai KODE sehingga dokumentasi wajar memerahkan CI palsu. Scanner di
   * bawah menyalin kode verbatim sambil melompati string, template literal,
   * dan regex literal — hanya `//` dan blok komentar yang dibuang. */
  const QUOTES = new Set(["'", '"', '`']);
  const codeOnly = (src: string): string => {
    let out = '';
    let i = 0;
    const n = src.length;
    let prev = ''; // tanda non-spasi terakhir: membedakan '/' regex dari pembagi
    while (i < n) {
      const c = src.charAt(i);
      const nx = src.charAt(i + 1);
      if (c === '/' && nx === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
        out += ' ';
        continue;
      }
      if (c === '/' && nx === '/') {
        const end = src.indexOf('\n', i + 2);
        if (end === -1) {
          out += ' ';
          i = n;
        } else {
          i = end; // newline ikut: jumlah baris tetap utuh
        }
        continue;
      }
      if (QUOTES.has(c)) {
        out += c;
        i += 1;
        while (i < n) {
          if (src.charAt(i) === '\\') {
            out += src.slice(i, i + 2);
            i += 2;
            continue;
          }
          out += src.charAt(i);
          const ch = src.charAt(i);
          i += 1;
          if (ch === c) break;
        }
        prev = c;
        continue;
      }
      // Regex literal: '/' setelah konteks operasi/pemisah, bukan pembagi.
      // Tanpa cabang ini, regex literal berisi kutip (mis. /don't/) membuka
      // string fantom dan menelan kode sampai kutip berikutnya — lolos vakum.
      if (c === '/' && /[=(,:;!&|?{}[\]<>]/.test(prev)) {
        out += c;
        i += 1;
        let inClass = false;
        while (i < n) {
          const ch = src.charAt(i);
          if (ch === '\\') {
            out += src.slice(i, i + 2);
            i += 2;
            continue;
          }
          out += ch;
          i += 1;
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) break;
        }
        while (i < n && /[a-z]/.test(src.charAt(i))) {
          out += src.charAt(i);
          i += 1;
        }
        prev = '/';
        continue;
      }
      out += c;
      if (!/\s/.test(c)) prev = c;
      i += 1;
    }
    return out;
  };

  /** Argumen SETIAP pemanggilan `.test(...)` — ekstraksi berimbang sadar-string
   * (sisa review #186). Guard berbentuk regex `\.test\([^)]*...` berhenti di
   * tanda kurung tutup PERTAMA, sehingga bentuk dinamis yang tanda kurungnya
   * muncul lebih dulu — `.test(String(msg).trim() + code)` — lolos: `[^)]*`
   * hanya menjangkau `String(msg` sebelum `)`. Ekstraksi di bawah menghitung
   * kedalaman kurung per pemanggilan dan melompati isi string, jadi bentuk
   * bersarang sekalipun tetap terlihat argumennya utuh. */
  const testInputs = (code: string): string[] => {
    const inputs: string[] = [];
    const re = /\.test\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      let i = m.index + m[0].length;
      let depth = 1;
      let arg = '';
      while (i < code.length && depth > 0) {
        const c = code.charAt(i);
        if (QUOTES.has(c)) {
          arg += c;
          i += 1;
          while (i < code.length) {
            if (code.charAt(i) === '\\') {
              arg += code.slice(i, i + 2);
              i += 2;
              continue;
            }
            arg += code.charAt(i);
            const ch = code.charAt(i);
            i += 1;
            if (ch === c) break;
          }
          continue;
        }
        if (c === '(') depth += 1;
        else if (c === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        arg += c;
        i += 1;
      }
      inputs.push(arg);
    }
    return inputs;
  };

  /** true bila argumen `.test()` dibangun DINAMIS: konkatenasi `+` di luar
   * string, atau interpolasi `${` di template literal — persis kelas bahaya
   * #179 (input regex dari field error). Template literal TANPA interpolasi
   * (mis. `` .test(`multiple (or no) rows`) ``) sah: bentuknya statis (sisa
   * review #186 — larangan backtick kategoris dulu melarang bentuk ini). */
  const dynamicTestInput = (input: string): boolean => {
    let i = 0;
    const n = input.length;
    while (i < n) {
      const c = input.charAt(i);
      if (c === "'" || c === '"') {
        i += 1;
        while (i < n && input.charAt(i) !== c) i += input.charAt(i) === '\\' ? 2 : 1;
        i += 1;
        continue;
      }
      if (c === '`') {
        i += 1;
        while (i < n && input.charAt(i) !== '`') {
          if (input.charAt(i) === '$' && input.charAt(i + 1) === '{') return true;
          i += 1;
        }
        i += 1;
        continue;
      }
      if (c === '+') return true; // konkatenasi di luar string
      i += 1;
    }
    return false;
  };

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
    const code = codeOnly(src);
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
    // Teks yang diperiksa sudah dibersihkan dari komentar: dokumentasi yang
    // MENJELASKAN larangan ini tetap boleh menyebut bentuk terlarang (sisa
    // review #186 — teks mentah dulu menghukum dokumentasi juga).
    expect(code, `${file} tak boleh membangun regex dinamis dari field error`).not.toContain(
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
    // Teks helper sudah dibersihkan komentar (sisa review #186): dokumentasi
    // yang MENJELASKAN larangan boleh menyebut bentuk terlarang; cek berlaku
    // pada KODE saja. JSDoc helper memuat kode contoh ber-kutip balik — tanpa
    // pembersihan, assertion di bawah menghukum dokumentasi.
    const code = codeOnly(read('src/lib/zero-rows.ts'));
    expect(code).toContain("error.code === 'PGRST116'");
    // Invarian berbentuk, bukan per-identifier (sisa review #184): input regex
    // WAJIB statis — tak boleh dibangun dinamis dari bagian-bagian. Yang
    // dinamis: konkatenasi `+` di luar string dan interpolasi `${` di template
    // literal, persis kelas bahaya #179, apapun nama variabelnya. Template
    // literal TANPA interpolasi tetap sah (statis, sisa review #186).
    for (const input of testInputs(code)) {
      expect(
        dynamicTestInput(input),
        `input regex wajib statis, bukan dibangun dinamis: ${input.trim()}`
      ).toBe(false);
    }
    expect(code, 'regex wajib menguji message').toMatch(/\.test\(error\.message\b/);
    // `new RegExp(\`${msg} ${code}\`)` duduk DI LUAR `.test(...)`, jadi guard di
    // atas tak pernah melihatnya: tanpa larangan eksplisit di sini, kelas
    // bahaya #179 kembali lewat konstruktor regex, bukan lewat `.test()`.
    expect(code, 'helper tak boleh membangun regex dinamis dari field error').not.toContain(
      'new RegExp('
    );
  });

  // --- Self-check invariant pembersih (sisa review #186) ---
  // Assertion di atas hanya berguna bila pembersih komentarnya sendiri benar:
  // tidak boleh menelan kode (lolos vakum) dan tidak boleh menyisakan komentar
  // (kegagalan palsu). Ketiga bentuk di bawah adalah bentuk yang DULU bocor.
  it('codeOnly tidak menelan kode yang diapit string ber-/* ... */', () => {
    // String yang memuat '/*' lalu string lain dengan '*/': regex blok-komentar
    // versi #186 menelan tengahnya — termasuk baris dead-code di dalamnya.
    const fenced = `const a = 'url: https://x.invalid/*docs';
if (error.code === '406') return 409;
const b = 'tutup */ dokumentasi';`;
    expect(codeOnly(fenced)).toContain("if (error.code === '406') return 409;");
    // Dan komentar blok sungguhan tetap dibuang.
    expect(codeOnly('kode ok; /* komentar\nberbaris */ kode lanjut;')).not.toContain('komentar');
  });

  it('codeOnly membuang komentar baris PENUH dan komentar ekor', () => {
    const trailing = `const c = 1; // dulu: error.code === '406' (issue #183, dead code)
const d = 2; // PGRST116 disebut sebagai riwayat`;
    const trailingCode = codeOnly(trailing);
    expect(trailingCode).not.toMatch(CODE_COMPARE_406);
    for (const vocab of ['PGRST116', '0 rows']) {
      expect(trailingCode).not.toContain(vocab);
    }
    expect(trailingCode).toContain('const d = 2;');
  });

  it('testInputs/dynamicTestInput: statis dibolehkan, dinamis ditangkap', () => {
    // Statis: template literal tanpa interpolasi — dulu dilarang backtick kategoris.
    expect(testInputs(codeOnly('re.test(`multiple (or no) rows`);')).some(dynamicTestInput)).toBe(
      false
    );
    // Statis: literal biasa.
    expect(testInputs(codeOnly("re.test('x');")).some(dynamicTestInput)).toBe(false);
    // Dinamis: konkatenasi — tanpa kurung di antara `+` dan penutup.
    expect(testInputs(codeOnly('re.test(msg + code);')).some(dynamicTestInput)).toBe(true);
    // Dinamis: konkatenasi DENGAN kurung sebelumnya — bentuk yang meloloskan
    // `[^)]*` di guard lama.
    expect(testInputs(codeOnly('re.test(String(msg).trim() + code);')).some(dynamicTestInput)).toBe(
      true
    );
    // Dinamis: interpolasi template.
    expect(testInputs(codeOnly('re.test(`${msg} ${code}`);')).some(dynamicTestInput)).toBe(true);
    // `+` di dalam string literal statis BUKAN konkatenasi.
    expect(testInputs(codeOnly("re.test('1 + 1 = 2');")).some(dynamicTestInput)).toBe(false);
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
