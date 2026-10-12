import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Review PR #105 — ekspor yang TIDAK lengkap tidak boleh tampak seperti CSV
// rapi berstatus 200. Kasus yang ditutup di sini:
//   1. batas chunk tercapai + masih ada sisa -> baris penanda + log.warn
//      (dan chunk penentu TIDAK lagi dibuang diam-diam),
//   2. kegagalan baca di tengah stream -> baris penanda (header respons sudah
//      terkirim, jadi penandanya masuk ke badan stream),
//   3. scope books memakai filter is_active selaras aplikasi,
//   4. audit ekspor lewat helper kanonis (metadata.requestId terlacak).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

// Chunk kecil (2 baris, maksimal 2 chunk) supaya kasus batas bisa diuji tanpa
// 50.000 baris di memori. `chunkRange` ikut di-mock: kalau tidak, helper asli
// tetap memakai EXPORT_CHUNK asli (1000) untuk menghitung range() sementara
// route memakai nilai mock (2) untuk logika break — hasilnya tak konsisten.
vi.mock('@/lib/report-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/report-export')>();
  return {
    ...actual,
    EXPORT_CHUNK: 2,
    EXPORT_MAX_CHUNKS: 2,
    chunkRange: (chunkIndex: number) => {
      const from = Math.max(0, chunkIndex) * 2;
      return [from, from + 1] as [number, number];
    },
  };
});

import { GET as EXPORT_GET } from '@/app/api/reports/export/route';
import { EXPORT_CHUNK } from '@/lib/report-export';

type Row = Record<string, unknown>;

let eqCalls: { col: string; val: unknown }[] = [];
let auditRows: Row[] = [];

function installMock(rows: Row[], opts: { failChunk?: number } = {}) {
  eqCalls = [];
  auditRows = [];
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        // requireStaff: satu kali baca profil staf.
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
          }),
        };
      }
      const chain: Record<string, unknown> = {};
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = (col: string, val: unknown) => {
        eqCalls.push({ col, val });
        return chain;
      };
      chain.insert = (row: Row) => {
        auditRows.push(row);
        return Promise.resolve({ data: null, error: null });
      };
      chain.range = (f: number, t: number) => {
        from = f;
        to = t;
        return chain;
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) => {
        const idx = from / EXPORT_CHUNK;
        if (opts.failChunk === idx) {
          return Promise.resolve({ data: null, error: { message: 'db down' }, count: null }).then(
            res
          );
        }
        // Urutan deterministik (ORDER BY id DESC) supaya hasil chunk bisa
        // diprediksi di assert.
        const sorted = [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        return Promise.resolve({
          data: sorted.slice(from, to + 1),
          error: null,
          count: rows.length,
        }).then(res);
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

const bookRows = (ids: string[]): Row[] =>
  ids.map((id) => ({
    id,
    title: `Judul ${id}`,
    author: `Penulis ${id}`,
    categories: { name: 'Fiksi' },
    stock_available: 1,
    stock_total: 1,
  }));

const csvLines = async (res: Response): Promise<string[]> =>
  (await res.text())
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((l) => l.length > 0);

describe('#105 ekspor: kegagalan/truncation tidak menyamar jadi sukses', () => {
  it('batas chunk tercapai + masih ada sisa -> baris penanda TIDAK LENGKAP', async () => {
    // 5 baris, chunk 2 -> chunk0+b1, chunk1+b2, lalu chunk penentu masih
    // mengembalikan 1 baris (b1) -> ekspor ditandai tidak lengkap.
    installMock(bookRows(['b1', 'b2', 'b3', 'b4', 'b5']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(res.status).toBe(200);
    const lines = await csvLines(res);
    expect(lines.length, 'header + 4 baris + penanda').toBe(6);
    const ids = lines.slice(1, 5).map((l) => l.split(',')[0]);
    expect(ids, 'hanya 2 chunk pertama yang ditulis').toEqual(['b5', 'b4', 'b3', 'b2']);
    expect(lines[5]).toMatch(/ekspor TIDAK LENGKAP/);
    expect(lines[5]).toContain('batas 4'); // EXPORT_MAX_CHUNKS * EXPORT_CHUNK
    expect(lines[5]).toContain('terunduh 4');
    expect(lines.join('\n')).not.toContain('b1,'); // baris sisa tidak ditulis diam-diam
  });

  it('kegagalan baca di tengah stream -> baris penanda TIDAK LENGKAP', async () => {
    installMock(bookRows(['b1', 'b2', 'b3']), { failChunk: 1 });
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(res.status).toBe(200); // header sudah terkirim; penandanya di badan
    const lines = await csvLines(res);
    expect(lines.length, 'header + 2 baris + penanda').toBe(4);
    expect(lines.slice(1, 3).map((l) => l.split(',')[0])).toEqual(['b3', 'b2']);
    expect(lines[3]).toMatch(/pembacaan data gagal di tengah proses/);
  });

  it('tabel habis sebelum batas -> TIDAK ada penanda (tanpa false alarm)', async () => {
    installMock(bookRows(['b1', 'b2', 'b3']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    const lines = await csvLines(res);
    expect(lines.length).toBe(4); // header + 3 baris, tanpa penanda
    expect(lines.some((l) => l.startsWith('#'))).toBe(false);
  });

  it('chunk penentu hanya diambil saat chunk terakhir PENUH (tanpa fetch sia-sia)', async () => {
    // 4 baris = tepat 2 chunk penuh, chunk penentu kosong -> tidak ada
    // penanda, tapi query penentu memang dijalankan (bukan chunk yang dibuang).
    installMock(bookRows(['b1', 'b2', 'b3', 'b4']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    const lines = await csvLines(res);
    expect(lines.length, 'header + 4 baris').toBe(5);
    expect(lines.some((l) => l.startsWith('#'))).toBe(false);
  });

  it('scope books menyaring is_active=true; loans/fines tidak', async () => {
    installMock(bookRows(['b1']));
    await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(eqCalls, 'books wajib selaras dengan tampilan aplikasi').toContainEqual({
      col: 'is_active',
      val: true,
    });

    eqCalls = [];
    installMock([]);
    await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=loans'));
    expect(eqCalls.filter((e) => e.col === 'is_active')).toEqual([]);
  });

  it('audit ekspor lewat helper kanonis + metadata.requestId terlacak', async () => {
    installMock(bookRows(['b1']));
    const res = await EXPORT_GET(
      new Request('http://localhost/api/reports/export?scope=books', {
        headers: { 'x-request-id': 'req-123' },
      })
    );
    expect(res.status).toBe(200);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      user_id: 'user-1',
      action: 'reports.export',
      entity_type: 'reports',
      entity_id: 'books',
    });
    expect((auditRows[0] as { metadata: { requestId?: string } }).metadata.requestId).toBe(
      'req-123'
    );
  });
});

// ---------------------------------------------------------------------------
// Helper guard backpressure (dipakai dua suite di bawah; jalur gagalnya
// sendiri punya test — sisa review #134/#146/#147).
// ---------------------------------------------------------------------------

/** Heuristik pembuka literal regex: '/' yang TIDAK didahului operand
 *  (angka/huruf/_/$/`)`/`]`/`}`/tanda kutip) — sisanya dianggap pembagi.
 *  Heuristik sederhana: kegagalan hanya membuat literal regex tertentu ikut
 *  ter-scan seperti kode, tidak menjatuhkan guard. Komentar (`//`, `/*`) SELALU
 *  diperiksa lebih dulu, jadi `/*` tidak pernah terbaca sebagai pembuka regex. */
function opensRegex(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j]!)) j--;
  if (j < 0) return true;
  return !/[A-Za-z0-9_$)\]}"'`]/.test(src[j]!);
}

/** Lewati literal string/regex dari posisi pembuka; kembalikan indeks SETELAH
 *  penutup (atau akhir berkas bila literal tak pernah tutup). */
function skipLiteral(src: string, i: number): number {
  const quote = src[i]!;
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] === quote) return j + 1;
    // string & regex literal taklintas baris; hanya template boleh.
    if (src[j] === '\n' && quote !== '`') return j;
    j++;
  }
  return src.length;
}

/** Indeks setelah komentar bila komentar mulai di sini (`//` atau `/*`), else null. */
function skipComment(src: string, i: number): number | null {
  if (src[i] !== '/') return null;
  if (src[i + 1] === '/') {
    let j = i;
    while (j < src.length && src[j] !== '\n') j++;
    return j;
  }
  if (src[i + 1] === '*') {
    let j = i + 2;
    while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
    return Math.min(j + 2, src.length);
  }
  return null;
}

/** Buang komentar TANPA menyentuh literal string/regex: pemotong `//` naif ikut
 *  memotong isi literal (mis. URL "https://…") dan bisa membuat brace tidak
 *  seimbang; komentar DI DALAM underlying source juga tidak boleh ikut
 *  diassert — komentar yang membahas `start()` akan memerahkan guard secara
 *  palsu (sisa review #134). */
function stripCommentsKeepStrings(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    // Urutan: string literal -> KOMENTAR -> heuristik regex. Komentar lebih
    // dulu supaya `/*` tidak salah dibaca sebagai pembuka regex literal.
    if (c === "'" || c === '"' || c === '`') {
      const j = skipLiteral(src, i);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    const afterComment = skipComment(src, i);
    if (afterComment !== null) {
      i = afterComment;
      continue;
    }
    if (c === '/' && opensRegex(src, i)) {
      const j = skipLiteral(src, i);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Isi objek literal underlying source `new ReadableStream<Generic?>({...})` —
 * asersi menilai IMPLEMENTASI stream, bukan teks mana pun di berkas (sisa
 * review #134: toContain/not.toContain mentah terlalu longgar — cocok substring
 * di tempat tak relevan — sekaligus terlalu ketat — komentar yang membahas
 * start() membuat test merah). Scanner sadar literal + komentar (sisa review
 * #146/#147): penanda hanya dicocokkan di KODE, bukan di dalam string/regex
 * literal; blok diambil setelah `(` terdekat sehingga parameter generik
 * berbasis objek (`new ReadableStream<{...}>({...})`) tidak mengecoh; brace di
 * dalam literal tidak dihitung. Penanda yang HILANG menghasilkan '' — bukan
 * blok `{...}` lain (indexOf fromIndex -1 clamp ke 0) — supaya guard "harus
 * ada" benar-benar bisa gagal.
 */
function readableStreamUnderlyingSource(src: string): string {
  const marker = 'new ReadableStream';
  let at = -1;
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "'" || c === '"' || c === '`') {
      i = skipLiteral(src, i);
      continue;
    }
    const afterComment = skipComment(src, i);
    if (afterComment !== null) {
      i = afterComment;
      continue;
    }
    if (c === '/' && opensRegex(src, i)) {
      i = skipLiteral(src, i);
      continue;
    }
    if (src.startsWith(marker, i)) {
      at = i;
      break;
    }
    i++;
  }
  if (at === -1) return '';
  // Lewati spasi + parameter generik <...> bila ada, lalu minta '(' — jangan
  // '{' pertama: itu bisa brace dari tipe generik, bukan objek literal.
  let j = at + marker.length;
  while (j < src.length && /\s/.test(src[j]!)) j++;
  if (src[j] === '<') {
    let depth = 0;
    while (j < src.length) {
      if (src[j] === '<') depth++;
      else if (src[j] === '>' && --depth === 0) {
        j++;
        break;
      }
      j++;
    }
    while (j < src.length && /\s/.test(src[j]!)) j++;
  }
  if (src[j] !== '(') return '';
  const open = src.indexOf('{', j);
  if (open === -1) return '';
  // Sama: brace-balance sadar literal + komentar. Hasil akhir dibersihkan dari
  // komentar (literal dipertahankan) supaya catatan DI DALAM underlying source
  // yang menyebut `start()` tidak memerahkan guard palsu (sisa review #134).
  let depth = 0;
  let end = -1;
  let k = open;
  while (k < src.length) {
    const c = src[k]!;
    if (c === "'" || c === '"' || c === '`') {
      k = skipLiteral(src, k);
      continue;
    }
    const afterComment = skipComment(src, k);
    if (afterComment !== null) {
      k = afterComment;
      continue;
    }
    if (c === '/' && opensRegex(src, k)) {
      k = skipLiteral(src, k);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      end = k;
      break;
    }
    k++;
  }
  if (end === -1) return '';
  return stripCommentsKeepStrings(src.slice(open + 1, end));
}

describe('#133 backpressure: loop ekspor di pull(), bukan start()', () => {
  it('chunk hanya ditarik saat konsumen meminta (tidak di-enqueue penuh di start)', () => {
    // Guard struktural: perilaku backpressure sulit diassert tanpa consumer
    // sungguhan, tapi regresi ke `start()` (seluruh CSV di-enqueue sekaligus,
    // menumpuk di memori worker untuk klien lambat) harus ketahuan.
    const src = readFileSync(join(process.cwd(), 'src/app/api/reports/export/route.ts'), 'utf8');
    const source = readableStreamUnderlyingSource(src);
    expect(source, 'new ReadableStream dengan underlying source inline harus ada').not.toBe('');
    expect(source, 'loop stream wajib di pull(), bukan start()').toMatch(/\bpull\s*\(/);
    expect(source, 'regresi ke start() = tanpa backpressure').not.toMatch(/\bstart\s*\(/);
  });
});

// Nilai guard backpressure justru terletak di jalur GAGAL scanner — kasus
// negatif di bawah dulu hanya diklaim di deskripsi PR, kini terkunci test
// (sisa review #147).
describe('#133 guard helper: jalur gagal scanner underlying source', () => {
  it('penanda hilang -> string kosong, bukan blok {...} lain di berkas', () => {
    expect(readableStreamUnderlyingSource('const a = { pull() {} };')).toBe('');
    expect(readableStreamUnderlyingSource('')).toBe('');
  });

  it('penanda di dalam string literal (pesan log) tidak mengecoh', () => {
    const src =
      "const log = 'jangan new ReadableStream { start(controller) }'; " +
      'new ReadableStream({ pull(controller) {} });';
    const out = readableStreamUnderlyingSource(src);
    expect(out).toMatch(/\bpull\s*\(/);
    expect(out).not.toMatch(/\bstart\s*\(/);
  });

  it('string dengan URL + brace tak seimbang tidak menggeser slice', () => {
    const src = "const u = 'https://contoh/{ belum-tutup'; new ReadableStream({ pull() {} });";
    expect(readableStreamUnderlyingSource(src)).toMatch(/\bpull\s*\(/);
  });

  it('komentar yang menyebut start() tidak membuat guard merah', () => {
    const src =
      '// catatan: jangan kembali ke start(controller)\nnew ReadableStream({ pull() {} });';
    const out = readableStreamUnderlyingSource(src);
    expect(out).toMatch(/\bpull\s*\(/);
    expect(out).not.toMatch(/\bstart\s*\(/);
  });

  it('komentar DI DALAM underlying source yang menyebut start() juga tidak memerahkan', () => {
    const src =
      'new ReadableStream({ /* catatan: kembali ke start(controller) = buruk */ pull() {} });';
    const out = readableStreamUnderlyingSource(src);
    expect(out).toMatch(/\bpull\s*\(/);
    expect(out).not.toMatch(/\bstart\s*\(/);
    const src2 = 'new ReadableStream({ // catatan: kembali ke start(controller)\n  pull() {} });';
    const out2 = readableStreamUnderlyingSource(src2);
    expect(out2).toMatch(/\bpull\s*\(/);
    expect(out2).not.toMatch(/\bstart\s*\(/);
  });

  it('regex literal dengan brace tak seimbang tidak menggeser hitungan', () => {
    const src = 'const re = /}/{ \d{2,3}/; new ReadableStream({ pull() {} });';
    expect(readableStreamUnderlyingSource(src)).toMatch(/\bpull\s*\(/);
  });

  it('parameter generik berbasis objek tidak mengecoh: blok setelah ( yang diambil', () => {
    const src = 'new ReadableStream<{ controller: X }>({ pull(controller) {} });';
    expect(readableStreamUnderlyingSource(src)).toMatch(/\bpull\s*\(/);
  });

  it('tanpa tanda ( setelah penanda -> string kosong', () => {
    expect(readableStreamUnderlyingSource('new ReadableStream<{ a: X }>')).toBe('');
  });
});
