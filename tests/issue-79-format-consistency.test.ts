import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  formatNum,
  formatRp,
  formatStamp,
  formatTanggal,
  formatTanggalPanjang,
  formatTanggalRingkas,
  formatWaktu,
  formatHariUtc,
  num,
} from '@/lib/format';
import { onDelete } from '@/lib/konten-api';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Kumpulkan semua berkas .ts/.tsx di sebuah direktori (rekursif). */
function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Buang komentar agar grep test tidak salah tuduh dokumentasi. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const SRC_FILES = collectTs(join(ROOT, 'src')).map((f) => f.slice(ROOT.length + 1));

const NATIVE_DIALOG = /\b(alert|confirm|prompt)\s*\(/;
const INLINE_FORMAT = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(/;

// ---------------------------------------------------------------------------
// 1. Helper format tunggal ( perilaku )
// ---------------------------------------------------------------------------

describe('issue-79: src/lib/format.ts satu sumber format', () => {
  it('formatRp Rp + ribuan id-ID tanpa desimal', () => {
    expect(formatRp(15000)).toBe('Rp15.000');
    expect(formatRp('15000')).toBe('Rp15.000');
    expect(formatRp(15000.6)).toBe('Rp15.001');
    expect(formatRp(null)).toBe('Rp0');
  });

  it('num aman untuk input sampah', () => {
    expect(num('x')).toBe(0);
    expect(num('x', 7)).toBe(7);
  });

  it('formatTanggal numerik id-ID (11/10/2026)', () => {
    expect(formatTanggal('2026-10-11')).toBe('11/10/2026');
    expect(formatTanggal('2026-10-11T23:30:00Z')).toBe('11/10/2026');
    expect(formatTanggal(new Date(2026, 9, 11))).toBe('11/10/2026');
  });

  it('varian tanggal: panjang & ringkas', () => {
    expect(formatTanggalPanjang('2026-10-11')).toBe('11 Oktober 2026');
    expect(formatTanggalRingkas('2026-10-11')).toBe('11 Okt 2026');
  });

  it('formatWaktu jam id-ID (lokal, tak bergantung TZ)', () => {
    expect(formatWaktu(new Date(2026, 9, 11, 14, 30, 0))).toMatch(/^14[.,]30/);
  });

  it('formatHariUtc deterministik lintas TZ runtime', () => {
    // 2026-10-11 = hari Minggu (UTC) -> label singkat id-ID "Min".
    expect(formatHariUtc('2026-10-11T00:00:00Z')).toBe('Min');
    // Malam hari UTC TETAP hari UTC yang sama — label tak geser sehari
    // seperti yang terjadi pada formatter berlokal runtime non-UTC.
    expect(formatHariUtc('2026-10-11T23:30:00Z')).toBe('Min');
    expect(formatHariUtc('2026-10-12T00:00:00Z')).toBe('Sen'); // hari berikutnya
  });

  it('formatNum ribuan id-ID + fallback', () => {
    expect(formatNum(15000)).toBe('15.000');
    expect(formatNum(null)).toBe('0');
    expect(formatNum('bukan')).toBe('0');
  });

  it('formatStamp YYYY-MM-DD deterministik (nama berkas ekspor)', () => {
    expect(formatStamp(new Date(2026, 9, 11))).toBe('2026-10-11');
    expect(formatStamp('2026-01-05T00:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('kosong/invalid -> "-" untuk semua helper tanggal', () => {
    for (const v of [null, undefined, '', 'bukan-tanggal']) {
      expect(formatTanggal(v)).toBe('-');
      expect(formatTanggalPanjang(v)).toBe('-');
      expect(formatTanggalRingkas(v)).toBe('-');
      expect(formatWaktu(v)).toBe('-');
      expect(formatHariUtc(v)).toBe('-');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Nol toLocale* inline di src (di luar implementasi helper)
// ---------------------------------------------------------------------------

describe('issue-79 AC: nol format inline di src', () => {
  it('tidak ada .toLocaleDateString/.toLocaleTimeString/.toLocaleString di src (kecuali format.ts)', () => {
    const offenders = SRC_FILES.filter(
      (f) => f !== 'src/lib/format.ts' && INLINE_FORMAT.test(stripComments(read(f)))
    );
    expect(offenders, `format inline tersisa di: ${offenders.join(', ')}`).toEqual([]);
  });

  it('semua pemakai format mengimpor dari @/lib/format', () => {
    // Berkas yang dulu menempel toLocale* inline kini memakai helper bersama.
    for (const f of [
      'src/app/admin/logs/page.tsx',
      'src/app/admin/denda/page.tsx',
      'src/app/admin/peminjaman/page.tsx',
      'src/app/admin/page.tsx',
      'src/app/admin/reservasi/page.tsx',
      'src/app/(public)/denda/page.tsx',
      'src/app/(public)/berita/page.tsx',
      'src/app/(public)/berita/[slug]/page.tsx',
      'src/components/admin/LogsTable.tsx',
      'src/components/admin/LoanForm.tsx',
      'src/components/admin/ExportCsvButton.tsx',
      'src/components/public/StatsBar.tsx',
      'src/components/public/ReservationCard.tsx',
    ]) {
      // halaman logs (RSC) memakai tabel klien yang memakai helper.
      const src = read(f);
      const usesHelper =
        /format(Tanggal|TanggalPanjang|TanggalRingkas|Waktu|Num|Rp|Stamp|HariUtc)/.test(src);
      if (f === 'src/app/admin/logs/page.tsx') {
        expect(read('src/components/admin/LogsTable.tsx')).toContain("from '@/lib/format'");
      } else {
        expect(usesHelper, `${f} harus memakai helper @/lib/format`).toBe(true);
        expect(src, `${f} harus mengimpor helper`).toContain("from '@/lib/format'");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Nol dialog native (alert/confirm/prompt) di seluruh src
// ---------------------------------------------------------------------------

describe('issue-79 AC: nol alert() di admin (termasuk jalur lib)', () => {
  it('src/lib/konten-api.ts tidak memunculkan dialog native', () => {
    expect(stripComments(read('src/lib/konten-api.ts'))).not.toMatch(NATIVE_DIALOG);
    // Kegagalan mengalir lewat callback, bukan alert.
    expect(read('src/lib/konten-api.ts')).toContain('opts?.onError?.(');
    expect(read('src/lib/konten-api.ts')).toContain('opts?.onMissing?.(');
  });

  it('keseluruhan src nol alert/confirm/prompt (komentar dibuang)', () => {
    const offenders = SRC_FILES.filter((f) => NATIVE_DIALOG.test(stripComments(read(f))));
    expect(offenders, `dialog native tersisa di: ${offenders.join(', ')}`).toEqual([]);
  });

  it('ketiga tab konten memakai ConfirmModal (bukan confirm native)', () => {
    for (const f of [
      'src/app/admin/konten/PagesTab.tsx',
      'src/app/admin/konten/FaqsTab.tsx',
      'src/app/admin/konten/TestimonialsTab.tsx',
    ]) {
      const src = read(f);
      expect(src, `${f} harus impor ConfirmModal`).toContain(
        "import ConfirmModal from '@/components/admin/ConfirmModal'"
      );
      expect(src, `${f} harus merender ConfirmModal`).toContain('<ConfirmModal');
    }
  });

  it('konten-api: 404 -> onMissing, gagal -> onError, sukses -> onSuccess (tanpa dialog native)', async () => {
    const originalFetch = globalThis.fetch;
    const fake = (status: number) =>
      (async () =>
        new Response(JSON.stringify({ error: { message: 'pesan-x' } }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch;
    try {
      // 404: endpoint belum ada -> onMissing, false.
      globalThis.fetch = fake(404);
      let missing = 0;
      expect(await onDelete('faqs', 'id-1', { onMissing: () => missing++ })).toBe(false);
      expect(missing).toBe(1);

      // 500: pesan dari respons mengalir ke onError (bukan alert).
      globalThis.fetch = fake(500);
      const errors: string[] = [];
      expect(await onDelete('faqs', 'id-1', { onError: (m) => errors.push(m) })).toBe(false);
      expect(errors).toEqual(['pesan-x']);

      // 200: sukses -> onSuccess, true.
      globalThis.fetch = fake(200);
      let success = 0;
      expect(await onDelete('faqs', 'id-1', { onSuccess: () => success++ })).toBe(true);
      expect(success).toBe(1);

      // Tanpa callback pun tidak melempar (cukup false) — dan tetap tanpa alert.
      globalThis.fetch = fake(500);
      expect(await onDelete('faqs', 'id-1')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Gate lint: aturan menegakkan aturan di atas, bukan hanya grep test
// ---------------------------------------------------------------------------

describe('issue-79 AC: ESLint gate menegakkan aturan', () => {
  it('eslint.config.mjs memuat no-alert + no-inline-format untuk src', () => {
    const cfg = read('eslint.config.mjs');
    expect(cfg).toContain("'no-alert': 'error'");
    expect(cfg).toContain("'openperpus/no-inline-format': 'error'");
    // Implementasi helper satu-satunya pengecualian.
    expect(cfg).toMatch(/src\/lib\/format\.ts/);
  });
});

// ---------------------------------------------------------------------------
// 5. Pola list admin: satu hook (useAdminList); logs = pengecualian RSC
//    terdokumentasi (rekomendasi fix #1)
// ---------------------------------------------------------------------------

describe('issue-79 AC: satu pola fetch + logs sebagai pengecualian terdokumentasi', () => {
  it('halaman daftar admin memakai useAdminList', () => {
    for (const f of [
      'src/app/admin/peminjaman/page.tsx',
      'src/app/admin/denda/page.tsx',
      'src/app/admin/reservasi/page.tsx',
      'src/app/admin/anggota/page.tsx',
      'src/app/admin/buku/page.tsx',
      'src/app/admin/kategori/page.tsx',
      'src/app/admin/rak/page.tsx',
      'src/app/admin/menu/page.tsx',
      'src/app/admin/layanan/page.tsx',
      'src/app/admin/banner/page.tsx',
      'src/app/admin/artikel/page.tsx',
      'src/app/admin/konten/page.tsx',
    ]) {
      expect(read(f), `${f} harus pakai useAdminList`).toContain('useAdminList');
    }
  });

  it('logs adalah RSC force-dynamic — pengecualian terdokumentasi di architecture.md', () => {
    const logs = read('src/app/admin/logs/page.tsx');
    expect(logs).toContain("export const dynamic = 'force-dynamic'");
    const arch = read('docs/architecture.md');
    expect(arch).toMatch(/logs\/page\.tsx/);
    expect(arch).toMatch(/force-dynamic/);
  });

  it('no-store terpusat di opsi hook (bukan cache "no-store" berserakan)', () => {
    const hook = read('src/hooks/useAdminList.ts');
    expect(hook).toContain('noStore ? { cache:');
    // Halaman operasional memakai opsi itu, bukan fetch mentah.
    for (const f of ['src/app/admin/denda/page.tsx', 'src/app/admin/reservasi/page.tsx']) {
      expect(read(f), `${f} operasional -> noStore`).toContain('noStore: true');
    }
  });
});
