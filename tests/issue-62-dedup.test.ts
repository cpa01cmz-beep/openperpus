import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #62 [P1] Duplikasi fine_rate/calcFine/fmtRp + per_page tak standar.
 *
 * Acceptance criteria:
 *  1. 1 hook list + 1 hook fine_rate dipakai semua halaman
 *  2. Nol duplikasi fmtRp/calcFine
 *  3. PER_PAGE tunggal
 *
 * Test ini grep-kontrak seperti kebiasaan repo: ia gagal begitu ada
 * halaman yang kembali menyalin formatter, menulis fetch daftarnya
 * sendiri, atau memakai literal per_page.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Sumber tanpa komentar baris — agar pola "kode" tak salah kena teks penjelas. */
const readCode = (p: string) =>
  read(p)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

/** Halaman admin/klien yang menampilkan tabel daftar ber-paginasi. */
const LIST_PAGES = [
  'src/app/admin/anggota/page.tsx',
  'src/app/admin/artikel/page.tsx',
  'src/app/admin/banner/page.tsx',
  'src/app/admin/buku/page.tsx',
  'src/app/admin/denda/page.tsx',
  'src/app/admin/kategori/page.tsx',
  'src/app/admin/konten/page.tsx',
  'src/app/admin/layanan/page.tsx',
  'src/app/admin/menu/page.tsx',
  'src/app/admin/peminjaman/page.tsx',
  'src/app/admin/rak/page.tsx',
  'src/app/admin/reservasi/page.tsx',
  'src/app/(public)/denda/page.tsx',
];

/** Halaman yang butuh tarif denda / kebijakan pinjam dari settings. */
const SETTINGS_PAGES = [
  'src/app/admin/peminjaman/page.tsx',
  'src/app/admin/denda/page.tsx',
  'src/app/(public)/denda/page.tsx',
];

describe('#62 modul bersama ada', () => {
  it('src/lib/format.ts satu sumber formatter rupiah/angka', () => {
    expect(existsSync(join(ROOT, 'src/lib/format.ts')), 'src/lib/format.ts wajib ada').toBe(true);
    const fmt = read('src/lib/format.ts');
    expect(fmt).toContain('export function formatRp');
    expect(fmt).toContain('export function num');
  });

  it('src/lib/pagination.ts satu konstanta ukuran halaman', () => {
    const p = read('src/lib/pagination.ts');
    expect(p).toContain('export const PER_PAGE');
  });

  it('src/hooks/useAdminList.ts + useFineRate.ts ada', () => {
    expect(existsSync(join(ROOT, 'src/hooks/useAdminList.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/hooks/useFineRate.ts'))).toBe(true);
  });
});

describe('#62 AC2: nol duplikasi fmtRp/num', () => {
  it('tidak ada definisi inline formatter rupiah di src (hanya src/lib/format.ts)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = read(rel);
        for (const line of src.split('\n')) {
          // Definisinya sendiri (bukan pemakaian), dan bukan file kanonis.
          if (
            rel !== 'src/lib/format.ts' &&
            /(const|function|let|var)\s+(fmtRp|formatRp|num)\b/.test(line) &&
            !/^const fmtRp = formatRp;/.test(line.trim()) &&
            !/= formatRp;/.test(line)
          ) {
            offenders.push(`${rel}: ${line.trim()}`);
          }
        }
      }
    };
    walk('src');
    expect(
      offenders,
      `formatter rupiah/angka seharusnya mengimpor src/lib/format.ts: ${offenders.join(' | ')}`
    ).toEqual([]);
  });

  it('wa-dunning & loan-eligibility tetap mengekspor formatRp (konsumen lama aman)', async () => {
    const wa = await import('@/lib/wa-dunning');
    const elig = await import('@/lib/loan-eligibility');
    expect(wa.formatRp, 'wa-dunning.formatRp harus tetap ada').toBeTypeOf('function');
    expect(elig.formatRp, 'loan-eligibility.formatRp harus tetap ada').toBeTypeOf('function');
    // Nilai tetap bergaya id-ID.
    expect(wa.formatRp(15000)).toBe('Rp15.000');
  });
});

describe('#62 AC1: satu hook list + satu hook tarif', () => {
  it('setiap halaman daftar memakai useAdminList (bukan fetch daftarnya sendiri)', () => {
    for (const f of LIST_PAGES) {
      const s = read(f);
      expect(s, `${f} harus memakai useAdminList`).toContain('useAdminList');
    }
  });

  it('halaman daftar tidak lagi menulis blok fetch+pagination sendiri', () => {
    for (const f of LIST_PAGES) {
      const s = readCode(f);
      expect(s, `${f}: tanpa URLSearchParams({ ... per_page ...)`).not.toMatch(
        /per_page:\s*['"]\d+['"]/
      );
    }
  });

  it('halaman bertarif memakai useFineRate, tanpa fetch /api/settings sendiri', () => {
    for (const f of SETTINGS_PAGES) {
      const s = read(f);
      const code = readCode(f);
      expect(s, `${f} harus memakai useFineRate`).toContain('useFineRate');
      expect(code, `${f} tidak boleh fetch /api/settings langsung`).not.toMatch(
        /fetch\('\/api\/settings'\)/
      );
    }
  });
});

describe('#62 kontrak hook daftar', () => {
  it('reload() menembus debounce (aksi tulis tak menjadikan daftar basi)', () => {
    // Regresi: reload() yang ikut tertunda 300 ms membuat baris baru tidak
    // muncul setelah mutasi (dulu ini ditangkap coverage-interactions).
    const hook = read('src/hooks/useAdminList.ts');
    expect(hook, 'reload harus tandai panggilan sebagai segera').toContain('immediateRef');
    expect(hook, 'debounce hanya untuk perubahan params').toMatch(
      /if \(immediate \|\| debounceMs <= 0\)/
    );
  });

  it('hanya membaca envelope pagination — bukan json.meta (kontrak #61)', () => {
    const hook = read('src/hooks/useAdminList.ts');
    expect(hook).not.toContain('json.meta');
    expect(hook).toContain('json.pagination?.totalPages ?? 1');
  });
});

describe('#62 AC3: PER_PAGE tunggal', () => {
  it('src tidak lagi memakai literal per_page 10/20/50 di luar pagination.ts', () => {
    const offenders: string[] = [];
    for (const f of [
      ...LIST_PAGES,
      'src/lib/konten-api.ts',
      'src/components/admin/SearchCombobox.tsx',
    ]) {
      const s = readCode(f);
      for (const m of s.matchAll(/per_page['"]?\s*[:=]\s*['"](\d+)['"]/g)) {
        offenders.push(`${f}: per_page=${m[1]}`);
      }
    }
    expect(
      offenders,
      `ukuran halaman harus dari src/lib/pagination.ts: ${offenders.join(' | ')}`
    ).toEqual([]);
  });

  it('SearchCombobox pakai SEARCH_PER_PAGE (saran dropdown, tetap 10)', () => {
    const s = read('src/components/admin/SearchCombobox.tsx');
    expect(s).toContain('SEARCH_PER_PAGE');
    const pag = read('src/lib/pagination.ts');
    expect(pag).toContain('export const SEARCH_PER_PAGE = 10');
  });
});

describe('#62 AC: window.location.search diganti searchParams Next', () => {
  it('admin/peminjaman memakai useSearchParams untuk ?overdue=1', () => {
    const s = readCode('src/app/admin/peminjaman/page.tsx');
    expect(s, 'harus pakai useSearchParams').toContain('useSearchParams');
    expect(s).not.toMatch(/window\.location\.search/);
    expect(s, '?overdue=1 masih terbaca').toContain("'overdue'");
  });
});
