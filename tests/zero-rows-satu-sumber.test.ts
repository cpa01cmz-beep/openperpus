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
   * KODE (boleh memuat string/template/regex/`.test()` bersarang). Dispatch
   * SATU lintasan (`walk`) menggantikan dua loop terpisah yang dulu bisa
   * menyimpang tanpa terdeteksi (sisa review #190); konteks '/' berbasis
   * operand-lengkap (bukan daftar simbol) menutup kelas salah-baca
   * `obj.new / 2` dan `i++ / 2` (sisa review #190). */
  type Scan = { code: string; testArgs: string[] };

  /** '/' MEMBUKA regex literal ketika ekspresi SEBELUMNYA belum lengkap —
   * setelah operator/pemisah/`(`/`{`/awal berkas, ATAU setelah kata kunci
   * ekspresi (`return`, `typeof`, `case`, …). Dalam posisi itu tata bahasa JS
   * menuntut OPERAND, dan operand boleh berbentuk regex literal. Sebaliknya
   * setelah identifier/`)`/`]`/string/template/regex/`++`/`--`, ekspresi sudah
   * lengkap: '/' berarti PEMBAGIAN.
   *
   * Kata kunci yang berupa nama PROPERTI (`obj.new`, `v.of`) tidak dihitung —
   * di posisi itu ekspresi juga sudah lengkap (sisa review #190: daftar
   * keyword + himpunan simbol versi lalu membuat `obj.new / 2` dan `i++ / 2`
   * salah dibaca sebagai pembuka regex). */
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

  const scanSource = (src: string): Scan => {
    const code: string[] = [];
    const testArgs: string[] = [];
    const n = src.length;
    let i = 0;
    // Konteks leksikal untuk '/': kata terakhir, apakah kata itu nama properti
    // (setelah '.' — bukan keyword konteks), dan apakah ekspresi sudah lengkap
    // (operand-lengkap → '/' = pembagian; belum → '/' = pembuka regex).
    let prevWord = '';
    let prevWordIsProperty = false;
    // TIDAK ADA lagi state "literal angka pernah terlihat" (sisa review #206).
    // Versi lalu (`prevWasNumber`, di-set `readNumber`, tak pernah di-reset)
    // membuat cabang `else if (ch === '.' && prevWasNumber)` menyala untuk `.`
    // di statement LAIN — konteksnya ditentukan lokasi angka yang jauh, bukan
    // properti lokal dari '.'-nya. Bentuk `1..` sekarang dikonsumsi `readNumber`
    // sebagai SATU token operand (angka + titik akses member), jadi loop simbol
    // tidak punya cabang '.' yang bisa bergantung pada kode jauh. Yang
    // terverifikasi assertion hanyalah konteks '/' — lihat
    // `scanSource: akses member literal angka — guard bisa gagal` dan
    // `scanSource: token angka presisi` di bawah.
    let prevIsOperand = false;

    /** '/' di posisi ini membuka regex literal? */
    const regexAhead = (): boolean =>
      (prevWord !== '' && !prevWordIsProperty && REGEX_KEYWORDS.has(prevWord)) || !prevIsOperand;

    const skipBlockComment = (): void => {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      code.push(' ');
    };

    const skipLineComment = (): void => {
      const end = src.indexOf('\n', i + 2);
      i = end === -1 ? n : end; // newline disalin walk: jumlah baris utuh
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
      prevIsOperand = true;
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
          // Konteks leksikal di-reset seperti argumen `.test(`: isi interpolasi
          // adalah ekspresi baru, bukan lanjutan teks template (sisa review #194).
          prevWord = '';
          prevWordIsProperty = false;
          prevIsOperand = false;
          walk('}');
          continue;
        }
        code.push(ch);
        i += 1;
      }
      prevWord = '';
      prevIsOperand = true;
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
      prevIsOperand = true;
    };

    /** Baca satu kata (identifier/keyword) sebagai satu token. Kata yang lahir
     * tepat setelah '.' adalah nama PROPERTI — bukan keyword konteks walau
     * ejaannya sama (`obj.new`, `v.of`; sisa review #190). */
    const readWord = (): void => {
      let j = i;
      while (j < n && /[\w$]/.test(src.charAt(j))) j += 1;
      let k = i - 1;
      while (k >= 0 && /\s/.test(src.charAt(k))) k -= 1;
      code.push(src.slice(i, j));
      prevWordIsProperty = k >= 0 && src.charAt(k) === '.';
      prevWord = src.slice(i, j).toLowerCase();
      prevIsOperand = true;
      i = j;
    };

    /** Baca literal ANGKA sebagai satu token operand (sisa review #192): `10 / 2`
     * dulu jatuh ke cabang simbol per-karakter sehingga '0' terakhir menjadi
     * "simbol" dan '/' sesudahnya dibaca pembuka regex — komentar di span itu
     * ikut tertelan (CI merah palsu). Bentuk: `10`, `1.5`, `.5`, `1e10`.
     *
     * Presisi (sisa review #194): `[\w.]` buta MENGGABUNGKAN `2.5.toFixed` dan
     * memecah `1e-5` — token angka dibatasi tepat: digit(+`_`), fraksional
     * hanya bila '.' diikuti digit, eksponen hanya `[eE][+-]?digit`, dan '.'
     * TRAILLING yang sah (`1. / 2`, `1.;`) ikut token (sisa review #199) —
     * tanpa itu token jadi `1` + '.', '.' mengeset operand-selesai false, dan
     * '/' sesudahnya menelan komentar `//` (CI merah palsu).
     *
     * `..` ikut token (sisa review #206): titik KEDUA akses member, bukan akhir
     * token angka — `1..toString()` dibaca SATU operand sehingga '/' sesudahnya
     * tetap PEMBAGIAN lewat sifat LOKAL token, tanpa flag lintas-statement.
     *
     * Titik trailing SESUDAH eksponen (sisa review #208): ketiga cabang di atas
     * menguji posisi `j` SELAGI masih menunjuk `e`/`E`; setelah digit eksponen
     * habis tak ada yang menengok ke belakang mencari '.', sehingga `1e5. / 2`
     * jadi token `1e5` + '.' dan '/' sesudahnya menelan komentar `//` (CI merah
     * palsu) — kelas sunyi sejak review #199 karena loop `literal angka adalah
     * operand` hanya menguji `1e5 / 2` TANPA titik trailing.
     *
     * Pengecualian `.test(` (sisa review #208): saat `..` diikuti tepat `test(`
     * titik KEDUA sengaja ditinggalkan — kalau tidak, `i` mendarat di `test`
     * (bukan di `.test(`) sehingga dispatch `walk` tak pernah cocok dan
     * argumennya hilang TANPA JEJAK (`testInputs('1..test(a + b)')` → `[]`).
     * `code` tetap verbatim: `1.` + `.test(` = `1..test(`. */
    const readNumber = (): void => {
      let j = i;
      if (src.charAt(j) === '.') j += 1; // bentuk .5
      while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
      if (src.charAt(j) === '.' && src.charAt(j + 1) === '.') {
        // `1..toString()`: angka + titik akses member = satu token operand —
        // KECUALI `..test(`: titik kedua dilepas untuk dispatch `.test(` di walk
        // (lihat catatan di atas). Ambang `j += 1` vs `j += 2` adalah SBU.
        j += src.startsWith('test(', j + 2) ? 1 : 2;
      } else if (src.charAt(j) === '.' && /[0-9]/.test(src.charAt(j + 1))) {
        j += 1;
        while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
      } else if (
        src.charAt(j) === '.' &&
        src.charAt(j + 1) !== '.' &&
        !/[A-Za-z_$]/.test(src.charAt(j + 1))
      ) {
        // Bentuk JS yang SAH: `.` trailling (`1. / 2`, `1.;`). Tanpa cabang ini
        // token jadi `1` + `.` dan '.' mengeset operand-selesai=false sehingga
        // '/' sesudahnya dibaca pembuka regex yang menelan komentar `//` di span
        // itu (CI merah palsu, sisa review #199). Bentuk `1..` TIDAK masuk sini —
        // titik keduanya sudah dikonsumsi di cabang pertama di atas.
        j += 1;
      }
      if (/[eE]/.test(src.charAt(j))) {
        // Eksponen: tanda WAJIB diikuti digit — `j += 2` buta dulu menelan
        // tanda literal rusak (`1e-`, `1e+`) ke dalam token angka (sisa review
        // #198).
        const signAt = src.charAt(j + 1);
        const hasSign = signAt === '+' || signAt === '-';
        const digitAt = /[0-9]/.test(src.charAt(j + (hasSign ? 2 : 1)));
        if (!digitAt) {
          code.push(src.slice(i, j));
          prevWord = '';
          prevIsOperand = true;
          i = j;
          return;
        }
        j += hasSign ? 2 : 1;
        while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
      }
      // Titik trailing SESUDAH eksponen (`1e5. / 2`, `1e5.;`) — syarat SAMA
      // seperti cabang pra-eksponen di atas (sisa review #208). Tanpa cabang ini
      // token berhenti di `.` sehingga '.' jatuh ke loop simbol: operand-selesai
      // jadi false, '/' sesudahnya memenuhi `regexAhead()`, dan komentar `//` di
      // span itu terbaca sebagai KODE (CI merah palsu). Bentuk `1e5..toString()`
      // TIDAK masuk sini (titik keduanya = akses member, ditangani loop simbol
      // seperti sebelum review ini) dan fraksional lanjutan `1e5.5` tetap satu
      // token — bukan `1e5.` + `5` yang terpisah.
      if (src.charAt(j) === '.' && src.charAt(j + 1) !== '.') {
        if (/[0-9]/.test(src.charAt(j + 1))) {
          j += 1;
          while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
        } else if (!/[A-Za-z_$]/.test(src.charAt(j + 1))) {
          j += 1;
        }
      }
      code.push(src.slice(i, j));
      prevWord = '';
      prevIsOperand = true;
      i = j;
    };

    /** SATU lintasan: KODE bersih komentar, string/template/regex literal
     * disalin verbatim, argumen `.test()` ditangkap di posisi KODE.
     * `closer` '' = sampai EOF; ')'/`'}` = konteks ekspresi (argumen
     * `.test()` dan interpolasi `${}`). Kedalaman hanya menghitung kurung
     * SEJENIS. Satu dispatch bersama menggantikan dua loop terpisah yang dulu
     * bisa menyimpang tanpa terdeteksi (sisa review #190). Return true bila
     * penutup `closer` benar-benar dikonsumsi. */
    const walk = (closer: string): boolean => {
      const opener = closer === ')' ? '(' : closer === '}' ? '{' : '';
      let depth = 1;
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
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
          readNumber();
          continue;
        }
        if (closer !== '' && ch === closer) {
          depth -= 1;
          code.push(ch);
          i += 1;
          if (depth === 0) return true;
          continue;
        }
        if (closer !== '' && ch === opener) {
          depth += 1;
        }
        code.push(ch);
        i += 1;
        if (!/\s/.test(ch)) {
          // Konteks '/' berikutnya: `)`, `]`, dan `++`/`--` (dua simbol sama
          // berurutan) MENYELESAIKAN ekspresi — '/' setelahnya pembagian;
          // operator/pemisah lain menuntut operand — '/' setelahnya regex.
          // Sengaja TIDAK ada cabang khusus '.' (sisa review #206): bentuk
          // `1..` sudah dikonsumsi `readNumber` sebagai satu token, jadi '.'
          // di sini murni pemisah yang menuntut operand — tak ada lagi state
          // lintas-token/statement yang bisa menyalanya dari kode jauh.
          if (ch === ')' || ch === ']') prevIsOperand = true;
          else if ((ch === '+' || ch === '-') && src.charAt(i - 2) === ch) prevIsOperand = true;
          else prevIsOperand = false;
        }
      }
      return false; // EOF tanpa penutup (hanya relevan untuk konteks ekspresi)
    };

    /** Tangkap argumen `.test(` — hanya dari posisi KODE, ditarik sampai `)`
     * yang berimbang (string/template/regex/komentar di dalamnya dikenali).
     *
     * Konteks leksikal WAJIB di-reset lebih dulu (sisa review #194): tanpa itu,
     * argumen mewarisi konteks luar — `X.test(/x/ …)` menyisakan operand-lengkap
     * dari kata `X`, sehingga '/' pembuka di AWAL argumen dibaca PEMBAGIAN dan
     * '/' penutup regex dibaca pembuka regex BARU yang menelan sisa argumen
     * sampai EOF (`re.test(/x/ / 2 + code)` → argumen jadi "/x/ / 2 + code);").
     *
     * Pemeriksaan `closed` mencegah MEMANGKAS karakter nyata saat pemanggilan
     * tak tertutup — versi lalu selalu membuang elemen terakhir sehingga
     * `re.test(msg + code` kehilangan 'e'-nya (sisa review #190). */
    const captureTestArg = (): void => {
      code.push('.test(');
      i += 6;
      prevWord = '';
      prevWordIsProperty = false;
      prevIsOperand = false; // awal argumen = posisi operand: '/' PEMBUKA regex
      const argStart = code.length;
      const closed = walk(')');
      const raw = code.slice(argStart).join('');
      testArgs.push(closed ? raw.slice(0, -1) : raw);
    };

    walk('');
    return { code: code.join(''), testArgs };
  };

  const codeOnly = (src: string): string => scanSource(src).code;
  const testInputs = (src: string): string[] => scanSource(src).testArgs;

  /** true bila argumen `.test()` dibangun DINAMIS — persis kelas bahaya #179
   * (input regex dari field error). Bentuk dinamis: konkatenasi `+` di luar
   * string, interpolasi `${` di template literal (escape `\${` dan backtick
   * ter-escape `\`` dilewati), dan pemisah ARGUMEN `,` di luar string —
   * tanda tangan pencampuran beberapa sumber (`f(msg, code)`,
   * `[msg, code].join(' ')`, sisa review #188). Isi REGEX literal dilewati:
   * `+`/`,` di badan `/…/` bukan operasi argumen — versi lama menghukumnya
   * (CI merah palsu) dan menyembunyikan operasi SETELAH regex (sisa review
   * #190). Template literal TANPA interpolasi statis dan sah (sisa review
   * #186).
   *
   * Batas yang DISENGAJA dan didokumentasikan: pembungkus SATU-sumber
   * (`buildPattern(msg)`) tak terbedakan oleh bentuk dari passthrough gaya
   * `.trim()`; gerbang terakhir untuk kelas itu tetap tes kontrak
   * `isZeroRows` + larangan kosakata di berkas site. */
  const dynamicTestInput = (input: string): boolean => {
    let i = 0;
    const n = input.length;
    let last = ''; // karakter non-spasi terakhir: regex-literal vs pembagian
    while (i < n) {
      const c = input.charAt(i);
      if (c === "'" || c === '"') {
        i += 1;
        while (i < n && input.charAt(i) !== c) i += input.charAt(i) === '\\' ? 2 : 1;
        i += 1;
        last = c;
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
        last = '`';
        continue;
      }
      if (c === '/' && !/[A-Za-z0-9_$)\]`'"\/]/.test(last)) {
        // Konteks operand → regex literal: lewati badannya (escape & class aware).
        // Kelas operand WAJIB memuat kutip, backtick, dan '/' — string/template/
        // regex literal juga menyelesaikan ekspresi (sisa review #192): tanpa itu,
        // '/' SESUDAH string/regex dibaca pembuka regex lagi dan badan-skip jalan
        // sampai EOF, menelan '+'/`,` sesudahnya (false negative).
        i += 1;
        let inClass = false;
        while (i < n) {
          if (input.charAt(i) === '\\') {
            i += 2;
            continue;
          }
          const r = input.charAt(i);
          i += 1;
          if (r === '[') inClass = true;
          else if (r === ']') inClass = false;
          else if (r === '/' && !inClass) break;
        }
        last = '/';
        continue;
      }
      if (c === '+' || c === ',') return true; // konkatenasi / pemisah argumen
      i += 1;
      if (!/\s/.test(c)) last = c;
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
    // Anti-vakum (sisa review #190): bila capture rusak, loop di bawah jadi
    // nol iterasi dan LULUS tanpa memeriksa apa pun — wajib ada minimal satu.
    expect(
      testArgs.length,
      'helper wajib memanggil .test(...) setidaknya sekali (loop dinamis di bawah anti-vakum)'
    ).toBeGreaterThan(0);
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
    // Panjaga anti-vakum (sisa review #190): `[0] ?? ''` dulu membuat
    // `toBe(false)` lulus ketika capture gagal — panjang wajib dipastikan.
    const escInterp = testInputs('re.test(`a\\`b ${code}c`);');
    expect(escInterp.length).toBeGreaterThan(0);
    expect(dynamicTestInput(escInterp[0] ?? '')).toBe(true);
    const escDollar = testInputs('re.test(`\\${literal}`);');
    expect(escDollar.length).toBeGreaterThan(0);
    expect(dynamicTestInput(escDollar[0] ?? '')).toBe(false);
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
    // Isi regex literal dilewati (sisa review #190): `+`/`,` di badan `/…/`
    // bukan operasi argumen — dulu memerahkan CI palsu.
    expect(dynamicTestInput('/\\d+/')).toBe(false);
    // (Cek berbasis argumen untuk regex literal polos ada di self-check
    // #192 dengan panjaga anti-vakum — jangan diduplikasi di sini, sisa
    // review #194.)
    // Pembagian di argumen: '/' setelah operand TIDAK membuka regex —
    // '+' sesudahnya tetap tertangkap.
    expect(testInputs('re.test(msg.len / 2 + code);').some(dynamicTestInput)).toBe(true);
  });

  it('scanSource: keyword-property dan ++ tetap pembagian (sisa review #190)', () => {
    // `obj.new / 2`: 'new' ejaan keyword tetapi NAMA PROPERTI — '/'
    // pembagian; komentar sesudahnya wajib dibuang.
    const prop = `const x = obj.new / 2;
// komentar 0 rows wajib dibuang`;
    expect(scanSource(prop).code).not.toContain('komentar');
    expect(scanSource(prop).code).toContain('obj.new / 2');
    // `i++ / 2` postfix: ekspresi lengkap → '/' pembagian.
    const inc = `let i = 0;
const y = i++ / 2;
// komentar PGRST116 wajib dibuang`;
    expect(scanSource(inc).code).not.toContain('komentar');
    expect(scanSource(inc).code).toContain('i++ / 2');
    // Tetap regex setelah keyword konteks (hari jangan over-correct).
    const kw = 'const m = /x/.test(msg);\n// komentar 0 rows wajib dibuang';
    expect(scanSource(kw).code).not.toContain('komentar');
  });

  it('captureTestArg: argumen tak tertutup tak lagi dipangkas (sisa review #190)', () => {
    // Versi lama selalu membuang elemen kode terakhir — `re.test(msg + code`
    // (EOF di tengah) kehilangan karakter nyata dari argumen.
    const args = testInputs('re.test(msg + code');
    expect(args.length).toBe(1);
    expect(args[0]).toBe('msg + code');
    expect(dynamicTestInput(args[0] ?? '')).toBe(true);
  });

  it('scanSource: literal angka adalah operand (sisa review #192)', () => {
    // Regresi yang diperkenalkan PR #192: angka jatuh ke cabang simbol
    // per-karakter, jadi '/' SESUDAH angka dibaca pembuka regex dan komentar
    // di span itu ikut tertelan (CI merah palsu) — `10 / 2`, `100 / total`.
    // Entri `1e5. / 2` (sisa review #208): titik trailing SESUDAH eksponen dulu
    // tak pernah dikonsumsi token (cabang pra-eksponen menguji posisi `j` yang
    // masih menunjuk `e`), jadi `1e5` + '.' + '/' → regex → komentar tertelan.
    // Bentuk ini lolos vakum selama loop hanya berisi `1e5 / 2` tanpa titik.
    for (const [src, code] of [
      ['const x = 10 / 2;', '10 / 2'],
      ['const v = -1 / 2;', '-1 / 2'],
      ['const r = 100 / total;', '100 / total'],
      ['const f = 1e5 / 2;', '1e5 / 2'],
      ['const g = .5 / 2;', '.5 / 2'],
      ['const w = 1e5. / 2;', '1e5. / 2'],
    ] as const) {
      const out = scanSource(`${src}\n// komentar PGRST116 wajib dibuang`);
      expect(out.code, `${src} wajib memuat teks utuh`).toContain(code);
      expect(out.code, `${src}: komentar sesudahnya wajib dibuang`).not.toContain('komentar');
    }
  });

  it('dynamicTestInput: string/regex literal juga menyelesaikan ekspresi (sisa review #192)', () => {
    // '/' SESUDAH string/regex literal dulu dibaca pembuka regex lagi:
    // badan-skip jalan sampai EOF dan menelan '+'/`,` sesudahnya (false negative).
    expect(testInputs("re.test('ab' / 2 + code);").some(dynamicTestInput)).toBe(true);
    // Argumen yang MULAI dengan regex literal (sisa review #194): konteks
    // argumen dulu mewarisi konteks luar (`X.test(` menyisakan operand-lengkap
    // dari kata `X`) sehingga '/' pembuka di awal argumen dibaca PEMBAGIAN dan
    // '/' penutup dibaca pembuka regex BARU yang menelan sisa argumen sampai
    // EOF. Dengan reset konteks, argumen utuh dan '+' sesudah pembagian tetap
    // tertangkap LEWAT jalur yang dimaksud (bukan karena salah-parse).
    const withRegex = testInputs('re.test(/x/ / 2 + code);');
    expect(withRegex).toEqual(['/x/ / 2 + code']);
    expect(dynamicTestInput(withRegex[0] ?? '')).toBe(true);
    // Regex literal polos tetap statis — argumen WAJIB tertangkap (anti-vakum;
    // dulu assertion berbentuk `.some(...)` bisa lulus hijau hanya karena
    // capture gagal, sisa review #194).
    const pure = testInputs('re.test(/\\d+/);');
    expect(pure.length).toBe(1);
    expect(pure[0]).toBe('/\\d+/');
    expect(dynamicTestInput(pure[0] ?? '')).toBe(false);
  });

  it('scanSource: interpolasi template adalah ekspresi baru (sisa review #194)', () => {
    // Isi `${...}` mewarisi konteks teks template dulu — '/' pembuka regex di
    // awal interpolasi salah konteks. Dengan reset, '/' di awal `${` = regex.
    const tpl = 'const ok = m(`x ${/re/.test(msg)} y`);\n// komentar PGRST116 wajib dibuang';
    const tplCode = scanSource(tpl).code;
    expect(tplCode).not.toContain('komentar');
    // Assertion POSITIF (sisa review #198): assertion negatif saja lulus vakum
    // bila copyTemplate rusak lalu menelan isi interpolasi — kode wajib utuh.
    expect(tplCode).toContain('const ok = m(`x ${/re/.test(msg)} y`);');
    // Interpolasi dengan string lalu '/' (pembagian) tetap aman.
    const tpl2 = "const v = `${'a'} / 2 + ${code}`;\n// komentar 0 rows wajib dibuang";
    const tpl2Code = scanSource(tpl2).code;
    expect(tpl2Code).not.toContain('komentar');
    // Assertion POSITIF (sisa review #199): jaga vakum sama seperti tpl.
    expect(tpl2Code).toContain("const v = `${'a'} / 2 + ${code}`;");
  });

  it('scanSource: token angka presisi (sisa review #194)', () => {
    // `[\w.]` buta dulu menggabungkan `2.5.toFixed` dan memecah `1e-5` — token
    // angka dibatasi tepat: `2.5` terpisah dari `toFixed`, `1e-5` utuh.
    const out = scanSource(
      'const a = 2.5.toFixed(1);\nconst b = 1e-5 / 2;\n// komentar 0 rows wajib dibuang'
    );
    expect(out.code).not.toContain('komentar');
    expect(out.code).toContain('2.5.toFixed(1)');
    expect(out.code).toContain('1e-5 / 2');
    // Eksponen rusak (`1e-`): tanda TIDAK ikut token angka (sisa review #198).
    const malformed = scanSource('const c = 1e-;\n// komentar 0 rows wajib dibuang');
    expect(malformed.code).toContain('1e-;');
    expect(malformed.code).not.toContain('komentar');
    // Eksponen positif tanda EKSPLISIT (sisa review #199): klaim dokumentasi
    // tanpa assertion = jaga palsu.
    const posExp = scanSource('const d = 1e+5 / 2;\n// komentar 0 rows wajib dibuang');
    expect(posExp.code).toContain('1e+5 / 2');
    expect(posExp.code).not.toContain('komentar');
    const posExpBad = scanSource('const e = 1e+;\n// komentar 0 rows wajib dibuang');
    expect(posExpBad.code).toContain('1e+;');
    expect(posExpBad.code).not.toContain('komentar');
    // Klaim "tidak menyatu" untuk `1..2` TIDAK bisa diamati lewat keluaran
    // `code` (verbatim, tanpa pemisah — sisa review #200): token gabung vs
    // terpisah menghasilkan teks identik. Yang BENAR-BENAR teramati adalah
    // konteks '/' setelah token, jadi itulah yang diuji di sini.
    const chain = scanSource('const f = 1.. / 2;\n// komentar 0 rows wajib dibuang');
    expect(chain.code).toContain('1.. / 2');
    expect(chain.code).not.toContain('komentar');
    const trailingDot = scanSource('const g = 1. / 2;\n// komentar PGRST116 wajib dibuang');
    expect(trailingDot.code).toContain('1. / 2');
    expect(trailingDot.code).not.toContain('komentar');
    const trailingDotSemi = scanSource('const h = 1.;\n// komentar 0 rows wajib dibuang');
    expect(trailingDotSemi.code).toContain('1.;');
    expect(trailingDotSemi.code).not.toContain('komentar');
  });

  it('scanSource: akses member literal angka — guard bisa gagal (sisa review #203)', () => {
    // Review #203 (WARNING @baris memberAccess): bentuk `1..toString() / 2`
    // TIDAK bisa dipakai sebagai klaim — '/' di sana sesudah `)`, yang SUDAH
    // menyelesaikan ekspresi walau cabang `else if (ch === '.' && prevWasNumber)`
    // dibuang, jadi kedua assertion-nya tetap hijau dan tak menjaga apa pun.
    // Bentuk yang benar-benar bergantung pada cabang itu: '/' datang TETAP
    // sesudah titik kedua, boleh lewat komentar blok. Sisa review #206: cabang
    // itu sekarang DIBUANG sepenuhnya dan bentuk `1..` dikonsumsi `readNumber`
    // sebagai satu token — diverifikasi dengan mutasi, cabang `..` itu dibuang
    // → '/' dibaca pembuka regex dan komentar `//` + blok di bawah ikut tertelan
    // (memberAccess GAGAL). Dengan cabang itu ADA, assertion di bawah tetap
    // hijau DAN byte-identik dengan keluaran sebelum perbaikan.
    const memberAccess = scanSource(
      'const i2 = 1.. /* blok */ / 2;\n// komentar 0 rows wajib dibuang'
    );
    expect(memberAccess.code).not.toContain('komentar');
    expect(memberAccess.code).not.toContain('blok');
    // Kontrol positif: komentar blok dibuang jadi SATU spasi, kode tetap utuh.
    expect(memberAccess.code).toBe('const i2 = 1..   / 2;\n ');

    // Guard JUJUR tanpa angka-depan (sisa review #206): bentuk `1 + "s" . / 2`
    // versi lalu hijau HANYA karena angka di DEPAN — buang `1 +` dan komentar
    // langsung tertelan, jadi guard itu bocor (diverifikasi: `"s" . / 2` dan
    // `"s". / 2` sudah tertelan sejak sebelum perbaikan). Sekarang '.' di loop
    // simbol tidak punya cabang khusus lagi: '.' menuntut operand, '/' sesudahnya
    // dibaca pembuka regex, dan komentarnya memang tertelan — perilaku LOKAL yang
    // jujur, diassert apa adanya (sisa review #208: teks inputnya pun menyebut
    // harapan SEBENARNYA — TERTELAN — bukan kebalikannya). Bentuk ini
    // FAIL-CAPABLE: mutasi membuat '.' SELALU menyelesaikan ekspresi
    // (`else if (ch === '.') prevIsOperand = true`) menghapus komentar yang benar
    // dan assertion ini GAGAL.
    const afterString = scanSource(
      'const j = "s" . / 2;\n// komentar 0 rows TERTELAN — regex sesudah titik'
    );
    expect(afterString.code).toContain('komentar');
    // Bentuk sama dengan angka JAUH di statement lain: dulu komentar DIBUANG
    // hanya karena ada `1` di statement pertama — konteks lintas-statement, bukan
    // properti '.'-nya (diverifikasi mutasi). Sekarang tertelan juga. Bentuk ini
    // FAIL-CAPABLE terhadap regresi yang PERSIS dibenahi issue ini: menghidupkan
    // kembali flag sticky (`else if (ch === '.' && prevWasNumber)`) membuat
    // komentarnya DIBUANG dan assertion ini GAGAL.
    const distantNumberThenString = scanSource(
      'const a = 1;\nconst j = "x" . / 2;\n// komentar 0 rows TERTELAN — regex sesudah titik'
    );
    expect(distantNumberThenString.code).toContain('komentar');
    // Kontrol positif bentuk BERANGKA `1..` (sisa review #208): assertion
    // `dottedNumber` yang dulu duduk di sini MENDUPLIKASI assertion `chain` di
    // atas — input `const .. = 1.. / 2;` + komentar ekor DAN kedua assertion
    // `toContain('1.. / 2')`/`not.toContain('komentar')` identik, hanya nama
    // variabelnya yang beda, padahal berkas ini sendiri melarang duplikasi
    // (sisa review #194). Gantiannya BUKAN assertion member `1..toString() / 2`
    // yang disarankan review #203 — '/' di sana sesudah `)`, yang sudah
    // menyelesaikan ekspresi walau cabang `..` dibuang (assertion vakum, persis
    // pelajaran review #203). Yang benar-benar bergantung pada ambang `..` dan
    // BELUM teramati assertion mana pun: pengecualian `.test(` di `readNumber`.
    // Tanpa pengecualian itu `i` mendarat di `test`, bukan di `.test(`, sehingga
    // dispatch di `walk` tak pernah cocok dan argumen hilang TANPA JEJAK
    // (`testInputs` → `[]`, bukan assertion gagal). Mutasi terkunci: ambang
    // `j += 1` dijadikan `j += 2` → assertion ini GAGAL.
    const numReceiver = 'const r = 1..test(msg + code);';
    expect(testInputs(numReceiver)).toEqual(['msg + code']);
    // Kontrol anti-vakum: `code` tetap VERBATIM (`1.` + `.test(` = `1..test(`),
    // jadi capture argumen tidak menimpa teks kode.
    expect(codeOnly(numReceiver)).toContain('1..test(msg + code)');
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
