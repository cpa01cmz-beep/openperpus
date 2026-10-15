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

  /** `literalMode` (sisa review #213): default `'verbatim'` — isi string/
   * template literal disalin APA ADANYA, jadi keluaran untuk SEMUA assertion
   * lain di berkas ini tak berubah satu byte pun. Mode `'space'` mengganti
   * ISI string/template literal dengan spasi (delimiter utuh, interpolasi
   * `${...}` tetap KODE) dan HANYA dipakai cek domain non-JSX: `</x>` di
   * dalam literal tak lagi terlihat guard, tanpa menyembunyikan `</x>` yang
   * benar-benar di posisi KODE. Regex literal TIDAK dikosongkan — lihat
   * `domainCode`: `/` pemicu regex fantom justru yang harus tetap terlihat
   * guard. */
  const scanSource = (src: string, literalMode: 'verbatim' | 'space' = 'verbatim'): Scan => {
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
          code.push(literalMode === 'space' ? '  ' : src.slice(i, i + 2));
          i += 2;
          continue;
        }
        const ch = src.charAt(i);
        // Penutup string ikut VERBATIM walau mode 'space' (sisa review #215):
        // versi lama mengganti kutip PENUTUP dengan spasi — pemindai tetap
        // menutup string dengan benar (`if (ch === quote) break` di bawah)
        // tapi delimiter-nya HILANG dari `code`, sehingga `domainCode` tak
        // seimbang untuk SETIAP string polos dan melanggar kontrak
        // "delimiter utuh" yang dijanjikan `literalMode` di atas. Tak ADA
        // assertion yang gagal karena itu — guard hanya mencari `</` + char
        // tag dan `}` + `/>`, dan keduanya tak bisa lahir dari kutip yang
        // hilang — sehingga lubangnya SENYAP. `copyTemplate` sejak awal sudah
        // benar (backtick penutup di-push utuh), jadi salinan ini kini
        // konsisten dengannya. Posisi/jumlah baris tetap: satu char tetap satu
        // char (spasi vs kutip), jadi mode 'verbatim' pun tak bergeser.
        code.push(literalMode === 'space' && ch !== quote ? ' ' : ch);
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
          code.push(literalMode === 'space' ? '  ' : src.slice(i, i + 2));
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
          code.push('${'); // interpolasi = KODE: tak dikosongkan di mode 'space'
          i += 2;
          // Konteks leksikal di-reset seperti argumen `.test(`: isi interpolasi
          // adalah ekspresi baru, bukan lanjutan teks template (sisa review
          // #194).
          prevWord = '';
          prevWordIsProperty = false;
          prevIsOperand = false;
          walk('}');
          continue;
        }
        code.push(literalMode === 'space' ? ' ' : ch);
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
     * memecah `1e-5` — token angka dibatasi tepat: digit(+`_`), eksponen hanya
     * `[eE][+-]?digit`, dan aturan titik (fraksional/trailing/akses-member
     * `..`) di DELEGASIKAN ke `readDotSuffix` di bawah — SATU salinan untuk
     * posisi pra- DAN sesudah-eksponen (sisa review #209), dulu dua salinan
     * yang bisa menyimpang tanpa terdeteksi.
     *
     * `..` ikut token (sisa review #206): titik KEDUA akses member, bukan akhir
     * token angka — `1..toString()` dibaca SATU operand sehingga '/' sesudahnya
     * tetap PEMBAGIAN lewat sifat LOKAL token, tanpa flag lintas-statement.
     * Pengecualian `.test(` (sisa review #208): saat `..` diikuti tepat `test(`
     * titik KEDUA sengaja ditinggalkan — kalau tidak, `i` mendarat di `test`
     * (bukan di `.test(`) sehingga dispatch `walk` tak pernah cocok dan
     * argumennya hilang TANPA JEJAK (`testInputs('1..test(a + b)')` → `[]`).
     * `code` tetap verbatim: `1.` + `.test(` = `1..test(`. */
    /** SATU aturan titik untuk posisi PRA- dan SESUDAH-eksponen (sisa review
     * #209): aturan fraksional/trailing-dot dulu ditulis DUA kali — salinan
     * sesudah-eksponen bisa menyimpang tanpa terdeteksi, dan justru itu yang
     * membuat lubang `1e5. / 2` (#208) lahir sunyi sejak #199. Mengembalikan
     * posisi `j` baru; tidak mengubah `i`/keluaran. Tiga bentuk:
     *   - `..` (akses member): `1..toString()` = angka + titik-akses sebagai
     *     SATU token operand. KECUALI `..test(`: titik kedua dilepas supaya
     *     dispatch `.test(` di walk cocok (kalau `..` utuh ikut token, `i`
     *     mendarat di `test` dan argumennya hilang TANPA JEJAK). Ambang
     *     `j += 1` vs `j += 2` adalah SBU. Berlaku SAMA di kedua posisi:
     *     `1e5.. / 2` dulu TIDAK dikonsumsi token, kedua titik jatuh ke loop
     *     simbol yang mengeset operand-selesai=false, '/' sesudahnya dibaca
     *     pembuka regex yang menelan slash pertama `//` — teks komentar
     *     BERTAHAN di `code` (keluaran byte-identik dengan input). Kelas "CI
     *     merah palsu" yang dijaga berkas ini, padahal pra-eksponen
     *     `1.. / 2` sudah benar membuangnya.
     *   - `.5` fraksional lanjutan: ikut token (`2.5`, `1e5.5`) — bukan
     *     `2.` + `5` yang terpisah.
     *   - `.` trailing yang SAH (`1. / 2`, `1.;`, `1e5.;`): ikut token — tanpa
     *     itu token berhenti sebelum '.' dan '/' sesudahnya menelan komentar
     *     `//` (CI merah palsu, sisa review #199/#208). */
    const readDotSuffix = (j: number): number => {
      if (src.charAt(j) !== '.') return j;
      if (src.charAt(j + 1) === '.') {
        return j + (src.startsWith('test(', j + 2) ? 1 : 2);
      }
      if (/[0-9]/.test(src.charAt(j + 1))) {
        j += 1;
        while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
        return j;
      }
      if (!/[A-Za-z_$]/.test(src.charAt(j + 1))) return j + 1;
      return j;
    };

    const readNumber = (): void => {
      let j = i;
      if (src.charAt(j) === '.') j += 1; // bentuk .5
      while (j < n && /[\d_]/.test(src.charAt(j))) j += 1;
      j = readDotSuffix(j);
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
      // Titik SESUDAH eksponen — aturan SAMA dengan pra-eksponen lewat helper
      // bersama `readDotSuffix` (sisa review #209): `1e5. / 2` dan `1e5.;`
      // trailing-dot, `1e5.5` fraksional, dan `1e5..toString()`/`1e5.. / 2`
      // akses member — satu salinan aturan, tak bisa menyimpang. Tanpa
      // konsumsi titik di sini token berhenti sebelum '.', '.' jatuh ke loop
      // simbol: operand-selesai jadi false, '/' sesudahnya memenuhi
      // `regexAhead()`, dan komentar `//` di span itu terbaca sebagai KODE
      // (CI merah palsu) — kelas sunyi sejak review #199 karena loop
      // `literal angka adalah operand` hanya menguji `1e5 / 2` TANPA titik.
      j = readDotSuffix(j);
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

  /** Pola domain NON-JSX (issue #212, diperlebar sisa review #213). Bentuk yang
   * membuat '/' masuk `copyRegex()` sehingga SELURUH jaminan berkas ini gugur:
   *   - `</tag>` (issue #212) dan `</>` (fragmen): '/' tepat sesudah '<'
   *     (simbol → operand-selesai=false);
   *   - `}` + `/>` (self-closing dengan atribut EKSPRESI): setiap atribut
   *     ekspresi berakhir '}' (simbol), '/' sesudahnya pembuka regex fantom.
   * Bentuk AMAN sengaja TIDAK ikut pola (kunci anti-over-correction di bawah):
   * `<br/>` dan atribut STRING (`<img src="a" />`) — '/' sesudah kata/string =
   * PEMBAGIAN, jaminan utuh. Pola `\/>/` polos akan memerah bentuk itu.
   *
   * Dijalankan atas keluaran mode `'space'` (`domainCode`): isi string/template
   * literal dikosongkan supaya `</x>` di dalam literal — kelas "CI merah
   * palsu" (sisa review #213) — tak lagi terlihat, sedangkan `</x>` di posisi
   * KODE (termasuk di dalam interpolasi `${...}`) TETAP terlihat. Regex literal
   * sengaja TIDAK dikosongkan: mengosongkannya akan menyembunyikan '/' pemicu
   * regex fantom pada `}/>` — persis lubang senyap yang ditutup isu ini. */
  const JSX_DOMAIN = /<\/[A-Za-z_$>]|\}\s*\/>/;

  /** KODE untuk cek domain non-JSX: komentar dibuang (seperti biasa) DAN isi
   * string/template literal dikosongkan. Regex literal dibiarkan verbatim —
   * alasannya ada di `JSX_DOMAIN`. Mode `'space'` TIDAK mengubah keluaran
   * untuk assertion lain: `scanSource(src)` (default 'verbatim') byte-identik
   * dengan sebelum isu ini (dijaga assertion `mode verbatim byte-identik`). */
  const domainCode = (src: string): string => scanSource(src, 'space').code;

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
    // DOMAIN wajib non-JSX (issue #212): `</tag>` dibaca PEMBUKA regex oleh
    // pemindai (setelah `<` ekspresi belum lengkap → `regexAhead()` menyala),
    // sehingga komentar di span itu TERTELAN dan argumen `.test()` DINAMIS
    // HILANG SENYAP (keduanya terverifikasi, lihat `batas terdokumentasi` di
    // bawah). Seluruh jaminan berkas ini hanya berlaku untuk kode NON-JSX —
    // assertion ini yang menskopusnya: menambahkan berkas `.tsx` ke SITES gagal
    // TERANG-terangan alih-alih membuat jaminan di atas palsu tanpa CI memerah.
    // Diperiksa atas `code` (bukan teks mentah) supaya menyebut `</div>` di dalam
    // komentar/dokumentasi — yang dibuang pemindai — tidak memerah palsu.
    // Diperlebar sisa review #213: pola kini juga mengenali `</>` (fragmen) dan
    // `}/>` (self-closing atribut-ekspresi) — bentuk yang MEMICU regex fantom
    // yang sama tapi lolos guard lama tanpa jejak; dan isi string/template
    // literal dikosongkan (`domainCode`) supaya `</x>` di dalam literal tak
    // memerah palsu. Regex literal dibiarkan verbatim (lihat JSX_DOMAIN) —
    // konsekuensinya batas char-class di bawah (`/[</a]/`) juga memicu
    // JSX_DOMAIN pada berkas non-JSX yang sah, jadi pesan gagal WAJIB
    // menyebutnya (sisa review #217): tanpa itu, berkas SITES yang belakangan
    // memuat bentuk itu memerah CI dengan tuduhan yang SALAH (`</tag>`/`</>`/
    // `}/>`) dan tak ada self-diagnosis menuju batas yang sebenarnya.
    expect(
      domainCode(src),
      `${file} wajib non-JSX (batas pemindai </tag>, </>, }/>, /[</a]/ char-class, #212/#214/#215)`
    ).not.toMatch(JSX_DOMAIN);
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

  it('CODE_COMPARE_406: SETIAP bentuk terdokumentasi wajib COCOK (guard vakum tanpa assertion positif, sisa review #227)', () => {
    // Guard `CODE_COMPARE_406` hanya pernah dipakai `.not.toMatch` (loop SITES
    // + komentar ekor) — NOL assertion positif di seluruh berkas. Dengan
    // mutasi (regex dijadikan tak-pernah-cocok / alternatif KEDUA dibuang /
    // persempit jadi hanya `===` kutip tunggal) SETIAP assertion itu TETAP
    // hijau, jadi kelas bahaya #183/#184 — berkas site membuka lagi cabang
    // dead-code `error.code === '406'` — bisa kembali SUNYAP. Persis pola
    // anti-vakum yang konvensi berkas ini tegakkan sejak #190/#194/#203, hanya
    // belum pernah diterapkan pada guard ini. Fail-capable: guard dipersempit
    // atau dimatikan → assertion di bawah GAGAL.
    //
    // Bentuk-bentuknya diambil APA ADANYA dari komentar guard ("identifier
    // bertitik, camelCase, urutan terbalik, kutip ganda, dan `==`/`===`/`!=`/
    // `!==`"): ke-13 varian di bawah diverifikasi memang cocok pada regex asli
    // dengan menjalankannya di Node — tapi sebelum ini tak satu pun terassert,
    // jadi klaimnya jaga palsu.
    for (const [label, src] of [
      ['identifier bertitik', "if (error.code === '406')"],
      ['camelCase', "if (errorCode === '406')"],
      ['urutan terbalik', "if ('406' === error.code)"],
      ['kutip ganda', 'if (error.code === "406")'],
      ['== longgar', "if (error.code == '406')"],
      ['!= longgar', "if (error.code != '406')"],
      ['!== ketat', "if (error.code !== '406')"],
      ['=== ketat tanpa spasi', "if (error.code==='406')"],
      ['kutip template', 'if (error.code === `406`)'],
      ['kode polos', "if (code === '406')"],
      ['terbalik + kutip ganda', 'if ("406" == errorCode)'],
      ['titik berspasi', "if (error .code === '406')"],
      ['bentuk return', "return error.code === '406' ? 409 : 500;"],
    ] as const) {
      expect(
        src,
        `guard wajib mencocoki bentuk ${label} — tanpa assertion positif guard ini vakum: ${src}`
      ).toMatch(CODE_COMPARE_406);
    }
    // Kontrol negatif (klaim komentar: "Hanya '406' literal; bukan token 406
    // mentah"): ketiga bentuk ini WAJIB lolos agar guard tak melebar jadi
    // larangan angka 406 itu sendiri. Fail-capable arah sebaliknya: guard
    // dilebarkan jadi pencocokan angka `406` mentah → kontrol GAGAL.
    for (const src of ['const x = 406;', 'if (status === 406)', "if (err['code'] === '406')"]) {
      expect(src, `guard tak boleh mencocoki bentuk non-kode: ${src}`).not.toMatch(
        CODE_COMPARE_406
      );
    }
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

  it('scanSource: keyword-property dan ++/-- tetap pembagian (sisa review #190, assertion -- sisa review #227)', () => {
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
    // Klausa `--` dalam hal yang SAMA (sisa review #227): komentar loop simbol
    // menyebut `++` DAN `--` sebagai penyelesai ekspresi, tapi hanya `++` yang
    // pernah diassert — padahal `i-- / 2` adalah bentuk kode NYATA, bukan
    // eksotis. Tanpa assertion itu, mutasi yang membuang cabang `-` dari
    // daftar penyelesai ekspresi membuat '/' sesudah `--` dibaca pembuka
    // regex: komentar ekornya BERTAHAN di `code` (diverifikasi dengan
    // menjalankan scanner yang dimutasi) dan NOL assertion gagal — kelas "CI
    // merah palsu" yang dijaga berkas ini kembali SUNYI. Fail-capable: cabang
    // `-` dijadikan no-op → assertion di bawah GAGAL.
    const dec = `let i = 0;
const y = i-- / 2;
// komentar PGRST116 wajib dibuang`;
    expect(scanSource(dec).code).not.toContain('komentar');
    expect(scanSource(dec).code).toContain('i-- / 2');
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

  it('scanSource: batas dispatch .test( — spasi membuat argumen hilang TANPA JEJAK (sisa review #227)', () => {
    // Dispatch `.test(` di `walk` memakai `startsWith('.test(', i)` — RAPAT,
    // tanpa toleransi spasi. Bentuk berspasi kehilangan argumen `.test()`
    // DIAM-DIAM: `testInputs` → `[]`, sehingga loop `for (const input of
    // testArgs)` di loop SITES jadi nol iterasi yang LULUS — argumen DINAMIS
    // (persis kelas bahaya #179) tak terlihat tanpa satu jejak pun.
    //
    // "Perbaikan" DITOLAK (preseden #212/#214): melebarkan dispatch jadi
    // toleran-spasi adalah perubahan perilaku pemindai yang tak diminta satu
    // assertion pun, DAN bentuk-bentuk itu tak bisa bertahan di repo ini —
    // diverifikasi dengan menjalankan prettier, ketiga bentuk dinormalkan
    // (`re . test(x)` → `re.test(x)`, `re.test (x)` → `re.test(x)`,
    // `1.. test(x)` → `(1).test(x)`). Jadi yang ditutup adalah bagian
    // "senyap"-nya: batas ini TERDOKUMENTASI + TERASSERT, dengan kontrol rapat
    // yang WAJIB tetap tertangkap. Bentuk `1.. test(…)` lahir dari pengecualian
    // `..` + `test(` di `readDotSuffix`: pengecualian itu menutup bentuk RAPAT
    // saja, begitu ada spasi titik KEDUA ikut token angka dan `test(` kehilangan
    // titik depannya.
    for (const src of [
      're . test(msg + code);',
      're. test(msg + code);',
      're.test (msg + code);',
      'const r = 1.. test(msg + code);',
      'const r = 1..\t test(msg + code);',
      'const r = 1.. /* blok */ test(msg + code);',
    ] as const) {
      expect(
        testInputs(src),
        `dispatch .test( rapat menutupi argumen dinamis pada bentuk berspasi: ${src}`
      ).toEqual([]);
    }
    // Kontrol WAJIB, dengan input yang BELUM diassert di berkas ini (larangan
    // duplikasi #194): bentuk RAPAT dengan receiver angka DUA digit dan
    // newline SEBELUM titik TETAP tertangkap. Yang sudah dikunci assertion lain
    // TIDAK diulang di sini — `1..test(msg + code)` (akses member literal
    // angka) dan `testInputs('re.test(msg + code);')` (self-check
    // testInputs/dynamicTestInput, `.some(dynamicTestInput)` → true; capture
    // rusak SELURUHNYA membuatnya false). Fail-capable dua arah: capture
    // `.test(` dibuang SELURUHNYA → kontrol di bawah GAGAL; dispatch dilebarkan
    // jadi toleran-spasi → batas di atas GAGAL.
    expect(testInputs('const r = 10..test(msg + code);')).toEqual(['msg + code']);
    expect(testInputs('re\n.test(msg + code);')).toEqual(['msg + code']);
  });

  it('scanSource: literal angka adalah operand (sisa review #192)', () => {
    // Regresi yang diperkenalkan PR #192: angka jatuh ke cabang simbol
    // per-karakter, jadi '/' SESUDAH angka dibaca pembuka regex dan komentar
    // di span itu ikut tertelan (CI merah palsu) — `10 / 2`, `100 / total`.
    // Entri `1e5. / 2` (sisa review #208): titik trailing SESUDAH eksponen dulu
    // tak pernah dikonsumsi token (cabang pra-eksponen menguji posisi `j` yang
    // masih menunjuk `e`), jadi `1e5` + '.' + '/' → regex → komentar tertelan.
    // Bentuk ini lolos vakum selama loop hanya berisi `1e5 / 2` tanpa titik.
    // Entri `1e5.. / 2` (sisa review #209): `..` sesudah eksponen juga ikut
    // token terkonsolidasi (helper bersama) — tanpa itu kedua titik jatuh ke
    // loop simbol dan komentar ekornya BERTAHAN di `code`.
    for (const [src, code] of [
      ['const x = 10 / 2;', '10 / 2'],
      ['const v = -1 / 2;', '-1 / 2'],
      ['const r = 100 / total;', '100 / total'],
      ['const f = 1e5 / 2;', '1e5 / 2'],
      ['const g = .5 / 2;', '.5 / 2'],
      ['const w = 1e5. / 2;', '1e5. / 2'],
      ['const x2 = 1e5.. / 2;', '1e5.. / 2'],
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
    // Bentuk SESUDAH eksponen yang dulu hanya DIDOKUMENTASIKAN di komentar
    // `readNumber` tanpa assertion — klaim dokumentasi tanpa assertion = jaga
    // palsu (pelajaran sisa review #199). Ketiganya kini TERAMATI (sisa review
    // #209): `1e5.;` trailing-dot, `1e5.5` fraksional lanjutan SATU token (bukan
    // `1e5.` + `5` yang terpisah — kalau terpecah, '.' jatuh ke loop simbol dan
    // '/' sesudahnya menelan komentar), `1e5..toString()` akses member.
    const expTrailingSemi = scanSource('const i3 = 1e5.;\n// komentar 0 rows wajib dibuang');
    expect(expTrailingSemi.code).toContain('1e5.;');
    expect(expTrailingSemi.code).not.toContain('komentar');
    const expFraction = scanSource('const j3 = 1e5.5 / 2;\n// komentar PGRST116 wajib dibuang');
    expect(expFraction.code).toContain('1e5.5 / 2');
    expect(expFraction.code).not.toContain('komentar');
    const expMember = scanSource(
      'const k3 = 1e5..toString() / 2;\n// komentar 0 rows wajib dibuang'
    );
    expect(expMember.code).toContain('1e5..toString() / 2');
    expect(expMember.code).not.toContain('komentar');
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

    // `..` SESUDAH eksponen (sisa review #209). Review #209 mengklaim
    // `1e5..test(msg + code)` → `[]` karena pengecualian `test(` "hanya
    // mencakup posisi pra-eksponen" — KLAIM ITU SALAH: helper bersama kini
    // memberi perilaku SAMA di kedua posisi, dan bahkan SEBELUM helper, bentuk
    // itu sudah tertangkap (titik pertama jatuh ke loop simbol, titik KEDUA
    // mendarat tepat di dispatch `.test(`). Yang NYATA dan sebelumnya TAK
    // teramati assertion mana pun: `..` sesudah eksponen dulu TIDAK dikonsumsi
    // token, jadi `1e5.. / 2` + komentar ekor → kedua titik jatuh ke loop
    // simbol (operand-selesai=false), '/' dibaca pembuka regex yang menelan
    // slash pertama `//` — teks komentar BERTAHAN di `code` (keluaran
    // byte-identik dengan input). Padahal pra-eksponen `1.. /* blok */ / 2` di
    // atas sudah benar membuang komentarnya: asimetri kelas "CI merah palsu"
    // yang dijaga berkas ini. Dengan helper bersama, `1e5..` SATU token → '/'
    // PEMBAGIAN → komentar dibuang.
    const expMemberDiv = scanSource('const m2 = 1e5.. / 2;\n// komentar 0 rows wajib dibuang');
    expect(expMemberDiv.code).toContain('1e5.. / 2');
    expect(expMemberDiv.code).not.toContain('komentar');
    // Bentuk `.test(` sesudah eksponen terkunci eksplisit (jawaban atas klaim
    // review #209): argumen WAJIB tertangkap, `code` verbatim. FAIL-CAPABLE:
    // pengecualian `test(` dijadikan konsumsi penuh (`j += 2`) → `i` mendarat
    // di `test`, dispatch `.test(` tak pernah cocok, argumen hilang TANPA JEJAK.
    const expNumReceiver = 'const r2 = 1e5..test(msg + code);';
    expect(testInputs(expNumReceiver)).toEqual(['msg + code']);
    expect(codeOnly(expNumReceiver)).toContain('1e5..test(msg + code)');
  });

  it('scanSource: batas terdokumentasi — JSX closing tag buka regex fantom (issue #212)', () => {
    // Batas yang DISENGAJA dan kini TERDOKUMENTASI + TERASSERT, bukan lagi
    // senyap: `</tag>` sesudah `<` (simbol, ekspresi belum lengkap) memicu
    // `regexAhead()` sehingga '/' masuk `copyRegex()` dan menelan span sampai
    // '/' berikutnya. Perilaku pemindai TIDAK diubah di issue #212 — alasannya
    // assertion kunci anti-over-correction di baris terbawah: `</tag>` (JSX
    // close) dan `< /re/` (regex sesudah operator relasional) AMBIGU untuk
    // pemindai satu-lintasan tanpa grammar, jadi "memperbaikinya" berarti
    // menukar lubang senyap dengan regresi NYATA (persis kelas over-correct
    // yang dijaga `afterString` + `keyword-property` di berkas ini). Yang
    // ditutup issue #212 adalah bagian "senyap"-nya: batas ini + skop domain
    // di loop SITES.
    //
    // KONSEKUENSI 1 — komentar TERTELAN (kelas "CI merah palsu"): komentar
    // sesudah `</h1>` TIDAK dibuang sehingga kosakata terlarang di dalamnya bisa
    // memerahkan CI palsu. Terverifikasi pada berkas NYATA sebelum issue ini:
    // `src/app/admin/logs/page.tsx:74-75` (komentar `// Isu #69: …`) BERTAHAN di
    // keluaran `code`. Fail-capable: kedip bila pemindai berhenti menelan span.
    const jsx = scanSource('const x = <h1>hi</h1>;\n// komentar 0 rows TERTELAN — JSX closing tag');
    expect(jsx.code).toContain('komentar');
    expect(jsx.code).toBe('const x = <h1>hi</h1>;\n// komentar 0 rows TERTELAN — JSX closing tag');

    // KONSEKUENSI 2 — argumen `.test()` DINAMIS HILANG SENYAP: `copyRegex()` tak
    // punya dispatch `.test(`, jadi `.test(msg + code)` — PERSIS kelas bahaya
    // #179 — tak terlihat oleh guard input dinamis, dan loop
    // `for (const input of testArgs)` jadi nol iterasi yang LULUS. Panjaga
    // anti-vakum (pola #194): kontrol NON-JSX di bawah WAJIB tetap menangkapnya
    // — itu yang membuktikan kehilangan itu disebabkan `</tag>`, bukan capture
    // yang rusak. Fail-capable: kalau capture `.test(` dibuang SELURUHNYA,
    // kontrol ikut `[]` dan assertion ini GAGAL.
    const jsxDynamic = 'const x = <h1>hi</h1>;\nre.test(msg + code);';
    expect(testInputs(jsxDynamic)).toEqual([]);
    const controls = testInputs('const x = hi;\nre.test(msg + code);');
    expect(controls).toEqual(['msg + code']);
    expect(controls.some(dynamicTestInput)).toBe(true);

    // KUNCI ANTI-OVER-CORRECTION: "perbaikan" naif yang menolak '/' sesudah '<'
    // (abaikan spasi) MERUSAK bentuk ini — regex sesudah operator relasional.
    // Diverifikasi dengan mutasi pada commit sebelum issue #212: hasil naif itu
    // komentar TERTELAN kembali (CI merah palsu) DAN argumen `.test()` hilang:
    //   code "…/can'/.test(s);\n// komentar 0 rows wajib dibuang", testArgs []
    // versus BENAR: komentar dibuang + testArgs ['s']. Bentuk BUKAN `/ab/` polos
    // — itu SELAMAT bahkan di bawah "perbaikan" naif (tanpa kutip, `can` terbaca
    // kata lalu '/' jadi pembagian dan dispatch `.test(` tetap jalan), jadi klaim
    // anti-over-correction HARUS memakai regex yang memuat kutip supaya bisa
    // gagal. Inilah alasan perilaku pemindai TIDAK diubah di issue #212.
    const afterLtPlain = scanSource(
      'const z = count < /ab/.test(s);\n// komentar 0 rows wajib dibuang'
    );
    expect(afterLtPlain.code).not.toContain('komentar');
    expect(afterLtPlain.code).toContain('count < /ab/.test(s)');
    expect(testInputs('const z = count < /ab/.test(s);')).toEqual(['s']);
    const afterLtQuote = scanSource(
      "const z2 = count < /can'/.test(s);\n// komentar 0 rows wajib dibuang"
    );
    expect(afterLtQuote.code).not.toContain('komentar');
    expect(afterLtQuote.code).toContain("count < /can'/.test(s)");
    expect(testInputs("const z2 = count < /can'/.test(s);")).toEqual(['s']);
  });

  it('scanSource: batas domain — fragmen/self-closing ekspresi void + string/template literal tak memerah palsu (issue #214)', () => {
    // Temuan 1 (WARNING, sisa review #213): bentuk yang MEMICU regex fantom
    // yang sama dengan `</tag>` TAPI lolos guard lama (`/<\/[A-Za-z_$]/`) tanpa
    // jejak — jaminan berkas gugur SENYAP. Dua kelas:
    //   a. `</>` (fragmen): '/' tepat sesudah '<' (simbol, operand belum
    //      lengkap) → copyRegex() menelan sampai '/' berikutnya.
    //   b. `}` + `/>` (self-closing dengan atribut EKSPRESI): setiap atribut
    //      ekspresi berakhir '}' (simbol → operand-selesai=false), '/' sesudahnya
    //      pembuka regex fantom. Termasuk atribut bertingkat `{{...}}` dan
    //      berparentesis `{(x)}` — yang terakhir tetap berakhir '}'.
    // Konsekuensi identik issue #212: argumen `.test()` DINAMIS (kelas bahaya
    // #179) HILANG SENYAP → loop `for (const input of testArgs)` nol iterasi
    // yang LULUS. Panjaga anti-vakum (pola #194): kontrol non-JSX WAJIB tetap
    // menangkapnya — itu yang membuktikan kehilangan disebabkan JSX.
    const fragmentSrc = 'const x = <>hi</>;\nre.test(msg + code);';
    expect(testInputs(fragmentSrc)).toEqual([]);
    expect(testInputs('const x = hi;\nre.test(msg + code);')).toEqual(['msg + code']);
    // Guard HARUS mengenali kedua bentuk — fail-capable: guard dipersempit
    // kembali ke `/<\/[A-Za-z_$]/` → assertion ini GAGAL (lubang senyap balik).
    expect(domainCode(fragmentSrc)).toMatch(JSX_DOMAIN);
    for (const src of [
      'const x = <img src={u} />;',
      'const x = <a b={{c:1}} />;',
      'const x = <a b={(x)} />;',
    ]) {
      expect(testInputs(`${src}\nre.test(msg + code);`)).toEqual([]);
      expect(domainCode(src), `guard wajib mengenali bentuk void: ${src}`).toMatch(JSX_DOMAIN);
    }

    // KUNCI ANTI-OVER-CORRECTION: bentuk AMAN yang '/' sesudahnya = PEMBAGIAN
    // (kata/string → operand-lengkap) — jaminan UTUH, guard TIDAK boleh ikut
    // memerah. Pola `\/>/` polos akan memerah keduanya → assertion ini GAGAL.
    expect(testInputs('const x = <br/>;\nre.test(msg + code);')).toEqual(['msg + code']);
    expect(domainCode('const x = <br/>;')).not.toMatch(JSX_DOMAIN);
    expect(testInputs('const x = <img src="a" />;\nre.test(msg + code);')).toEqual(['msg + code']);
    expect(domainCode('const x = <img src="a" />;')).not.toMatch(JSX_DOMAIN);

    // Temuan 2 (SUGGESTION, sisa review #213): `</x>` di dalam string/template
    // literal memerah PALU guard lama (isi literal disalin VERBATIM ke `code`).
    // `domainCode` (mode 'space') mengosongkan ISI literal → tak ada merah
    // palsu untuk berkas non-JSX yang sah. Fail-capable: mode 'space' dibuang
    // dari cek domain → literal terlihat lagi → assertion ini MEMERAH.
    expect(domainCode('const s = "</div>";')).not.toMatch(JSX_DOMAIN);
    expect(domainCode("const s = '</x>';")).not.toMatch(JSX_DOMAIN);
    expect(domainCode('const s = `a</div>b`;')).not.toMatch(JSX_DOMAIN);
    // Batas yang DISENGAJA: interpolasi `${...}` tetap KODE — `</div>` di dalam
    // interpolasi (JSX nyata di .tsx) TETAP terlanggar guard. Template string
    // bersarang di dalam interpolasi tetap literal (dikosongkan).
    expect(domainCode('const s = `${<div>hi</div>}`;')).toMatch(JSX_DOMAIN);
    expect(domainCode('const s = `${`</b>`}`;')).not.toMatch(JSX_DOMAIN);
    // Kontrol: `</div>` di posisi KODE (bukan literal) TETAP terlanggar.
    expect(domainCode('const x = <h1>hi</h1>;')).toMatch(JSX_DOMAIN);
    // Batas terdokumentasi lain: regex literal TIDAK dikosongkan (mengosongkannya
    // akan menyembunyikan '/' pemicu fantom pada `}/>`), tapi regex TER-ESCAPE
    // (`<\/div>`) secara alamiah aman — backslash memutus kedekatan `</`.
    expect(domainCode('const re = /<\\/div>/;')).not.toMatch(JSX_DOMAIN);
    // Batas terdokumentasi KETIGA (sisa review #215): regex dengan `<` tepat
    // SESUDAH pembuka char-class — `/[</a]/`, `/[</abc]/` — TETAP memicu
    // `JSX_DOMAIN` pada berkas NON-JSX yang sah (kelas "CI merah palsu").
    // `copyRegex` memperlakukan `/` di dalam `[...]` sebagai ISI, bukan penutup,
    // dan isi regex sengaja tak dikosongkan, jadi `</a` utuh terbawa ke `code`
    // dan alternatif `<\/[A-Za-z_$>]` menyala. Dua jalan perbaikan DITOLAK:
    // mengosongkan isi regex akan menyembunyikan '/' pemicu fantom pada `}/>`
    // (persis lubang senyap yang ditutup isu #214), dan mempersempit alternatif
    // `<\/[A-Za-z_$>]` berarti menebak char-class dari string polos — ambigu
    // tanpa grammar (kelas over-correct yang sama seperti `</tag>`, lihat
    // `batas terdokumentasi — JSX closing tag`). Klaim LAMA di sini berbunyi
    // "memersempit alternatif `<\/[A-Za-z_$>]` menggagalkan assertion
    // `guard wajib mengenali bentuk void`" — itu SALAH (sisa review #217),
    // diverifikasi dengan menjalankan guard persempit atas ketiga bentuk void:
    // ketiganya TETAP cocok karena mereka lewat alternatif KEDUA
    // (`\}\s*\/>`), bukan yang pertama. Yang benar-benar patah ketika alternatif
    // pertama dipersempit (mis. `>` dibuang dari kelas tag) adalah assertion
    // fragmen `</>` di atas — dikutip APA ADANYA, bukan bentuk ringkas yang
    // tak ada di berkas ini (sisa review #219: kutipan lama
    // `expect(domainCode('const x = <>hi</>;'))` tidak verbatim sehingga
    // perbaikan berikutnya bisa menyalin bentuk yang inputnya berbeda):
    //   const fragmentSrc = 'const x = <>hi</>;\nre.test(msg + code);';
    //   expect(testInputs(fragmentSrc)).toEqual([]);
    //   expect(domainCode(fragmentSrc)).toMatch(JSX_DOMAIN);
    // Klaim guard WAJIB dinamai per-assertion (sisa review #223): versi
    // sebelumnya menulis "cocok pada guard asli, TIDAK cocok pada guard
    // persempit" tepat sesudah MENGUTIP keduanya, sehingga tak jelas itu
    // berlaku untuk yang mana. Yang HANYA sensitif guard adalah
    // `domainCode(fragmentSrc)` — diverifikasi di Node: cocok pada guard asli,
    // TIDAK cocok pada guard persempit. Sebaliknya `testInputs(fragmentSrc)`
    // tetap `[]` pada KETIGA varian guard (asli/dilebarkan/dipersempit) karena
    // `JSX_DOMAIN` hanya hidup di assertion, tak pernah dikonsultasi
    // `scanSource` — jadi saat HANYA guard diubah, `testInputs` memang tak
    // pernah ikut memerah. Lingkup nasihat itu HANYA guard (sisa review
    // #225): `testInputs` tak sensitif `JSX_DOMAIN`, tapi Ia SANGAT sensitif
    // `scanSource` — diverifikasi dengan mutasi scanner ('<' dianggap operand
    // lengkap): `testInputs(fragmentSrc)` berubah dari `[]` menjadi
    // `['msg + code']` dan assertion itu MEMERAH. Jadi bila `testInputs`
    // memerah SESUDAH `scanSource` diubah, itu SINYAL NYATA — scanner berhenti
    // menelan pemicu fantom `</>` dan seluruh jaminan berkas ini gugur; jangan
    // dianggap kebisingan.
    // DUA assertion di atas punya peran BERBEDA dan tak satu pun
    // redundan (sisa review #221: versi lama menempelkan "berperan ganda" pada
    // `domainCode` saja, seolah `testInputs` di baris 1100 bisa dihapus):
    // `testInputs(fragmentSrc) -> []` adalah bukti argumen `.test()` dinamis
    // HILANG (kelas bahaya #179), sedangkan `domainCode(fragmentSrc)` adalah
    // cek guard — menghapus yang pertama membuang bukti itu SUNYI. Klaim guard
    // di sini berlaku untuk input `fragmentSrc` tersebut (yang memuat baris
    // `re.test`), bukan untuk bentuk satu-barisnya. Alternatif
    // pertama hanya dipakai `</tag>`/`</>`; alternatif kedua dipakai bentuk
    // void dengan atribut-ekspresi — keduanya wajib tetap utuh, tapi yang
    // menjaga mana saja harus diklaim BENAR supaya perbaikan berikutnya tak
    // menyasar assertion yang salah. Karena itu batas ini DIDOKUMENTASIKAN +
    // DIASSERT alih-alih senyap: tak satu pun dari tiga berkas SITES memuat
    // bentuk itu (diverifikasi grep), dan assertion di bawah mati kalau
    // `copyRegex` berhenti menyalin `/` di dalam char-class.
    expect(domainCode('const r = /[</a]/;')).toMatch(JSX_DOMAIN);
    expect(domainCode('const r = /[</abc]/;')).toMatch(JSX_DOMAIN);
    // Kontrol presisi: yang memicu adalah KEDEKATAN `<` + `/`. `[a</]` sesudah
    // kedekatan itu berakhir `]` (bukan char tag). Kontrol KEDUA wajib memuat
    // `<` yang TIDAK berdekatan dengan `/` — sisa review #217: bentuk lama
    // `/[a/b]/` tak memuat `<` SAMA SEKALI, jadi hijau untuk SETIAP pelebaran
    // guard (diverifikasi: guard dilebarkan jadi `<[tag]`, kontrol itu tetap
    // hijau) alias tak menguji dimensi yang jadi subyek blok ini. Bentuk
    // `/[a<b/]/` menutupnya: `<b` bukan `</` (hijau pada guard asli) tapi
    // MERAH begitu syarat `/` dilepas dari alternatif pertama. Bersama `[a</]`
    // — yang MERAH saat guard jadi longgar-spasi — kedua kontrol ini mengunci
    // anti-over-correction agar batas ini tak dilebarkan tanpa sadar.
    expect(domainCode('const r = /[a</]/;')).not.toMatch(JSX_DOMAIN);
    expect(domainCode('const r = /[a<b/]/;')).not.toMatch(JSX_DOMAIN);

    // Mode 'verbatim' (default) WAJIB byte-identik dengan keluaran pra-isu:
    // mode 'space' hanya MENAMBAH jalur untuk cek domain, tak mengubah apa pun
    // yang diassert berkas lain di sini. Fail-capable: isi literal pada mode
    // default ikut dikosongkan → assertion ini GAGAL.
    expect(codeOnly('const s = "</div>";')).toBe('const s = "</div>";');
    expect(codeOnly('const s = `a${b}c`;')).toBe('const s = `a${b}c`;');
    // HANYA `codeOnly` di sini (sisa review #215): assertion berbasis
    // `testInputs('re.test(/x/ / 2 + code);')` yang dulu menutup blok ini adalah
    // DUPLIKAT byte-identik dari self-check #192 di atas — input dan harapan sama
    // persis — dan inputnya tak memuat string/template literal sehingga tak bisa
    // mendeteksi regresi mode 'space'. Tepat bentuk duplikasi yang sudah dilarang
    // konvensi berkas ini (lihat catatan #194 pada self-check #188): klaim
    // byte-identiknya sudah dikunci dua assertion `codeOnly` di atas.
    //
    // Kontrak "delimiter utuh" pada mode 'space': ISI literal dikosongkan tapi
    // KEDUA delimiter-nya wajib utuh. Fail-capable: mengembalikan push tanpa
    // pengecualian `ch !== quote` tetap menghijaukan dua assertion verbatim di
    // atas sambil membuat kutip penutup HILANG dari `domainCode` tanpa jejak.
    expect(domainCode('const s = "</div>";')).toBe('const s = "      ";');
    expect(domainCode('const t = `a</div>b`;')).toBe('const t = `        `;');
    // Kontrak yang sama WAJIB diassert untuk kutip TUNGGAL (sisa review #217):
    // versi lama hanya mengunci `"` dan backtick, jadi regresi yang khusus
    // merusak delimiter `'` — jalur `copyPlainString` yang paling sering
    // dipakai berkas SITES — tetap HIJAU. Bentuk kedua memuat DUA potongan
    // `</…>` supaya PANJANG isi ikut terkunci, bukan cuma jumlah delimiter.
    // Fail-capable: push tanpa `ch !== quote` membuat kutip penutup hilang →
    // assertion di bawah MEMERAH (diverifikasi dengan mutasi jalur itu).
    expect(domainCode("const s = '</x>';")).toBe("const s = '    ';");
    expect(domainCode("const v = '</a></b>';")).toBe("const v = '        ';");
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
