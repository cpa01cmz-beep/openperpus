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
   * Pemindai SATU lintasan (sisa review #188): sadar string/template/regex
   * literal, dan argumen `.test()` hanya diambil dari posisi KODE. Pemindai
   * generasi #186 sadar string tapi masih punya 4 lubang (semua diverifikasi
   * dengan menjalankannya terhadap bentuk regresi, bukan asumsi):
   *
   *   1. Template literal tak sadar interpolasi — string bersarang berbacktick
   *      (`` `${f("`")}` ``) menutup template terlalu awal; sisa berkas terbaca
   *      salah posisi sehingga komentar di dalamnya tak dibuang (CI merah palsu).
   *   2. `.test(` dicari dengan regex mentah atas teks — kecocokan di dalam
   *      string/regex literal jadi argumen palsu dan memerahkan CI.
   *   3. Escape (`\`` dan `\${`) tak dilewati: interpolasi SETELAH backtick
   *      ter-escape lolos (lolos vakum), `${` ter-escape salah dihitung dinamis
   *      (CI merah palsu).
   *   4. Heuristik regex literal salah dua arah: `]` ikut himpunan konteks
   *      sehingga pembagian `arr[i] / n` dibaca pembuka regex → komentar di
   *      span itu tak dibuang; `/` setelah keyword (`return /p/.test(x)`) tak
   *      dikenali sebagai regex → kutip di dalamnya membuka string fantom.
   *
   * Pemindai di bawah menutup semuanya: komentar dibuang, string/template/
   * regex literal disalin verbatim, interpolasi `${...}` diperlakukan sebagai
   * KODE (boleh memuat string/template/regex/`.test()` bersarang). */
  type Scan = { code: string; testArgs: string[] };

  /** '/' MEMBUKA regex literal setelah kata kunci di bawah (konteks ekspresi)
   * atau simbol pemisah. `]` sengaja TIDAK ada: yang mengikuti indexing adalah
   * pembagian (`arr[i] / n`), bukan regex. */
  const REGEX_KEYWORDS = new Set([
    'return',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'case',
    'do',
    'else',
    'yield',
    'throw',
    'await',
  ]);
  const REGEX_SYMBOLS = new Set([
    '=',
    '(',
    '[',
    ',',
    ':',
    ';',
    '!',
    '&',
    '|',
    '?',
    '{',
    '<',
    '>',
    '+',
    '-',
    '*',
    '%',
    '~',
    '^',
  ]);
  /** Pasangan pembuka kurung per jenis penutup — hanya sejenis yang menutup. */
  const BRACE_OPENERS: Record<string, string> = { ')': '(', '}': '{', ']': '[' };

  const scanSource = (src: string): Scan => {
    const code: string[] = [];
    const testArgs: string[] = [];
    const n = src.length;
    let i = 0;
    let prevWord = '';
    let prevSym = '';

    const regexAhead = (): boolean =>
      (prevWord !== '' && REGEX_KEYWORDS.has(prevWord)) || REGEX_SYMBOLS.has(prevSym);

    const skipBlockComment = (): void => {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      code.push(' ');
    };

    const skipLineComment = (): void => {
      const end = src.indexOf('\n', i + 2);
      i = end === -1 ? n : end; // newline disalin loop induk: jumlah baris utuh
      code.push(' ');
    };

    const copyPlainString = (): void => {
      const quote = src.charAt(i);
      code.push(quote);
      i += 1;
      while (i < n) {
        if (src.charAt(i) === '\\') {
          code.push(src.slice(i, i + 2));
          i += 2;
          continue;
        }
        const ch = src.charAt(i);
        code.push(ch);
        i += 1;
        if (ch === quote) break;
      }
      prevWord = '';
      prevSym = quote;
    };

    /** Template literal SADAR interpolasi: `${` berpindah ke mode kode, jadi
     * string bersarang berbacktick tak lagi menutup template terlalu awal. */
    const copyTemplate = (): void => {
      code.push('`');
      i += 1;
      while (i < n) {
        if (src.charAt(i) === '\\') {
          code.push(src.slice(i, i + 2));
          i += 2;
          continue;
        }
        const ch = src.charAt(i);
        if (ch === '`') {
          code.push(ch);
          i += 1;
          break;
        }
        if (ch === '$' && src.charAt(i + 1) === '{') {
          code.push('${');
          i += 2;
          scanExpr('}');
          continue;
        }
        code.push(ch);
        i += 1;
      }
      prevWord = '';
      prevSym = '`';
    };

    const copyRegex = (): void => {
      code.push('/');
      i += 1;
      let inClass = false;
      while (i < n) {
        const ch = src.charAt(i);
        if (ch === '\\') {
          code.push(src.slice(i, i + 2));
          i += 2;
          continue;
        }
        code.push(ch);
        i += 1;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
      }
      while (i < n && /[a-z]/.test(src.charAt(i))) {
        code.push(src.charAt(i));
        i += 1;
      }
      prevWord = '';
      prevSym = '/';
    };

    /** Baca satu kata (identifier/keyword) sebagai satu token. */
    const readWord = (): void => {
      let j = i;
      while (j < n && /[\w$]/.test(src.charAt(j))) j += 1;
      code.push(src.slice(i, j));
      prevWord = src.slice(i, j).toLowerCase();
      prevSym = '';
      i = j;
    };

    /** Tangkap argumen `.test(` — hanya dari posisi KODE, ditarik sampai `)`
     * yang berimbang (string/template/regex/komentar di dalamnya dikenali). */
    const captureTestArg = (): void => {
      code.push('.test(');
      i += 6;
      const argStart = code.length;
      scanExpr(')');
      testArgs.push(code.slice(argStart, code.length - 1).join(''));
    };

    /** Ekspresi sampai penutup `closer` — kedalaman hanya dihitung untuk kurung
     * sejenis; kurung jenis lain tetap kode biasa. */
    const scanExpr = (closer: string): void => {
      const opener = BRACE_OPENERS[closer] ?? '';
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = src.charAt(i);
        if (ch === "'" || ch === '"') {
          copyPlainString();
          continue;
        }
        if (ch === '`') {
          copyTemplate();
          continue;
        }
        if (ch === '/' && src.charAt(i + 1) === '*') {
          skipBlockComment();
          continue;
        }
        if (ch === '/' && src.charAt(i + 1) === '/') {
          skipLineComment();
          continue;
        }
        if (ch === '/' && regexAhead()) {
          copyRegex();
          continue;
        }
        if (src.startsWith('.test(', i)) {
          captureTestArg();
          continue;
        }
        if (/[A-Za-z_$]/.test(ch)) {
          readWord();
          continue;
        }
        if (ch === closer) {
          depth -= 1;
          if (depth === 0) {
            code.push(closer);
            i += 1;
            return;
          }
        } else if (ch === opener) {
          depth += 1;
        }
        code.push(ch);
        i += 1;
        if (!/\s/.test(ch)) prevSym = ch;
      }
    };

    while (i < n) {
      const ch = src.charAt(i);
      if (ch === '/' && src.charAt(i + 1) === '*') {
        skipBlockComment();
        continue;
      }
      if (ch === '/' && src.charAt(i + 1) === '/') {
        skipLineComment();
        continue;
      }
      if (ch === "'" || ch === '"') {
        copyPlainString();
        continue;
      }
      if (ch === '`') {
        copyTemplate();
        continue;
      }
      if (ch === '/' && regexAhead()) {
        copyRegex();
        continue;
      }
      if (src.startsWith('.test(', i)) {
        captureTestArg();
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        readWord();
        continue;
      }
      code.push(ch);
      i += 1;
      if (!/\s/.test(ch)) prevSym = ch;
    }
    return { code: code.join(''), testArgs };
  };

  const codeOnly = (src: string): string => scanSource(src).code;
  const testInputs = (src: string): string[] => scanSource(src).testArgs;

  /** true bila argumen `.test()` dibangun DINAMIS — persis kelas bahaya #179
   * (input regex dari field error). Bentuk dinamis: konkatenasi `+` di luar
   * string, interpolasi `${` di template literal (escape `\${` dan backtick
   * ter-escape `\`` dilewati), dan pemisah ARGUMEN `,` di luar string —
   * tanda tangan pencampuran beberapa sumber (`f(msg, code)`,
   * `[msg, code].join(' ')`, sisa review #188). Template literal TANPA
   * interpolasi statis dan sah (sisa review #186).
   *
   * Batas yang DISENGAJA dan didokumentasikan: pembungkus SATU-sumber
   * (`buildPattern(msg)`) tak terbedakan oleh bentuk dari passthrough gaya
   * `.trim()`; gerbang terakhir untuk kelas itu tetap tes kontrak
   * `isZeroRows` + larangan kosakata di berkas site. */
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
          if (input.charAt(i) === '\\') {
            i += 2; // backtick/karakter ter-escape: bukan penutup/`${`
            continue;
          }
          if (input.charAt(i) === '$' && input.charAt(i + 1) === '{') return true;
          i += 1;
        }
        i += 1;
        continue;
      }
      if (c === '+' || c === ',') return true; // konkatenasi / pemisah argumen
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
    // Teks helper diperiksa setelah dibersihkan komentar (sisa review #186):
    // dokumentasi yang MENJELASKAN larangan boleh menyebut bentuk terlarang;
    // cek berlaku pada KODE saja. Argumen `.test()` diambil dari posisi KODE
    // (sisa review #188): kecocokan `.test(` di dalam string/regex literal
    // bukan argumen.
    const { code, testArgs } = scanSource(read('src/lib/zero-rows.ts'));
    expect(code).toContain("error.code === 'PGRST116'");
    // Invarian berbentuk, bukan per-identifier (sisa review #184): input regex
    // WAJIB statis — tak boleh dibangun dinamis dari bagian-bagian. Yang
    // dinamis: konkatenasi `+` di luar string, interpolasi `${` di template,
    // dan pemisah argumen `,` (tanda pencampuran beberapa sumber, sisa review
    // #188). Template literal TANPA interpolasi tetap sah (statis, #186).
    for (const input of testArgs) {
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
    expect(testInputs('re.test(`multiple (or no) rows`);').some(dynamicTestInput)).toBe(false);
    // Statis: literal biasa.
    expect(testInputs("re.test('x');").some(dynamicTestInput)).toBe(false);
    // Dinamis: konkatenasi — tanpa kurung di antara `+` dan penutup.
    expect(testInputs('re.test(msg + code);').some(dynamicTestInput)).toBe(true);
    // Dinamis: konkatenasi DENGAN kurung sebelumnya — bentuk yang meloloskan
    // `[^)]*` di guard lama.
    expect(testInputs('re.test(String(msg).trim() + code);').some(dynamicTestInput)).toBe(true);
    // Dinamis: interpolasi template.
    expect(testInputs('re.test(`${msg} ${code}`);').some(dynamicTestInput)).toBe(true);
    // `+` di dalam string literal statis BUKAN konkatenasi.
    expect(testInputs("re.test('1 + 1 = 2');").some(dynamicTestInput)).toBe(false);
    // Dilarang juga: `.test(` di dalam string literal BUKAN argumen (sisa
    // review #188) — teks dokumentasi tak bisa memerahkan CI.
    expect(testInputs('const s = "contoh: re.test(a + b)";')).toEqual([]);
  });

  it('scanSource: regex literal vs pembagian tak tertukar (sisa review #188)', () => {
    // '/' setelah ']' adalah PEMBAGIAN — dulu salah dibaca pembuka regex,
    // sehingga komentar setelahnya tak dibuang (CI merah palsu).
    const div = `const arr = [1, 2];
const x = arr[0] / 2;
// komentar 0 rows wajib dibuang`;
    const outDiv = scanSource(div);
    expect(outDiv.code).not.toContain('komentar');
    expect(outDiv.code).toContain('arr[0] / 2');
    // '/' setelah keyword MEMBUKA regex literal — kutip di dalamnya tak boleh
    // membuka string fantom yang menyisakan komentar.
    const kw = `function f(s: string) {
  return /can'/.test(s);
  // komentar PGRST116 wajib dibuang
  return 0;
}`;
    expect(scanSource(kw).code).not.toContain('komentar');
  });

  it('scanSource: template literal sadar interpolasi + escape (sisa review #188)', () => {
    // String bersarang berbacktick tak lagi menutup template terlalu awal.
    const nested = 'const x = `${f("`")} ok`;\n// komentar 0 rows wajib dibuang';
    expect(scanSource(nested).code).not.toContain('komentar');
    // Escape: backtick ter-escape tak menutup template — interpolasi SESUDAHnya
    // tetap terlihat (dulu lolos); `${` ter-escape bukan interpolasi.
    expect(dynamicTestInput(testInputs('re.test(`a\\`b ${code}c`);')[0] ?? '')).toBe(true);
    expect(dynamicTestInput(testInputs('re.test(`\\${literal}`);')[0] ?? '')).toBe(false);
  });

  it('dynamicTestInput: bentuk pencampuran argumen (sisa review #188)', () => {
    // Tanda pencampuran beberapa sumber: pemisah argumen di luar string.
    expect(testInputs('re.test(f(msg, code));').some(dynamicTestInput)).toBe(true);
    expect(testInputs("re.test([msg, code].join(' '));").some(dynamicTestInput)).toBe(true);
    // Koma/plus di dalam string literal statis bukan konstruksi.
    expect(testInputs("re.test('a, b + c');").some(dynamicTestInput)).toBe(false);
    // Batas terdokumentasi: pembungkus satu-sumber tak dibedakan dari
    // passthrough oleh bentuk — gerbang terakhir = tes kontrak isZeroRows.
    expect(testInputs('re.test(buildPattern(msg));').some(dynamicTestInput)).toBe(false);
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
