import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// #124 — parity inventaris migrasi di docs.
// Gejala yang diperbaiki: README berhenti di 0027, supabase/README + onboarding
// berhenti lebih jauh (0024/0022), padahal repo sudah punya 0001..0033 — operator
// yang mengikuti docs tidak pernah menjalankan skema opname (0032/0033),
// soft-delete (0030), search 1-RTT (0031), FK RESTRICT (#67) & expiry reservasi
// (0028). Sejak 0028 ada DUA file ber-prefix 0028, jadi urutan kanonis = urut nama
// file (lexicographic, sama seperti `supabase db push`). Test ini detektor drift:
// menambah file migrasi tanpa mendaftarkannya di docs = CI merah.

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Urutan kanonis = urut nama file (identik dengan `supabase db push`). */
const MIGRATIONS = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const MAX_PREFIX = MIGRATIONS.reduce((max, f) => Math.max(max, Number(f.slice(0, 4))), 0);

/** Section dokumen yang tugasnya memuat inventaris migrasi (urut). */
const INVENTORY: [doc: string, heading: string][] = [
  ['README.md', '## Migrasi Supabase'],
  ['supabase/README.md', '## Isi folder'],
  ['docs/onboarding-dev.md', 'Menit 6–10'],
];

/** Nama file migrasi yang dikutip sebuah section, urut kemunculan. */
function cited(rel: string, heading: string): string[] {
  const text = read(rel);
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const rest = text.slice(start);
  // berhenti di heading markdown berikutnya supaya tidak menyerap seksi lain
  const next = /\n#{1,6}\s/.exec(rest.slice(heading.length));
  const body = next ? rest.slice(0, heading.length + next.index) : rest;
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const m = /migrations\/(\d{4}_[^\s#]+\.sql)/.exec(line);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

/** Klaim batas urutan ("dari awal → N") — harus mengikuti migrasi terbaru. */
function sequenceEnds(rel: string): { claim: string; end: number }[] {
  const text = read(rel);
  const rules: [string, RegExp][] = [
    ['0001 → N', /0001\s*→\s*(\d{4})/g],
    ['0001..N', /0001\.\.(\d{4})/g],
    ['0011–N', /`?0011`?\s*[–-]\s*`?(\d{4})/g],
    ['...11 s/d ...N', /`\.\.\.11`\s*s\/d\s*`\.\.\.(\d{2})`/g],
  ];
  const out: { claim: string; end: number }[] = [];
  for (const [claim, re] of rules) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ claim, end: Number(String(m[1]).padStart(4, '0')) });
    }
  }
  return out;
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkRouteFiles(p));
    else if (e.name === 'route.ts') out.push(p);
  }
  return out.sort();
}

describe('#124 folder migrasi (dasar semua klaim docs)', () => {
  it('memuat seluruh 0001..0036 termasuk dua file 0028_*', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(30);
    expect(MIGRATIONS[0]).toBe('0001_core.sql');
    expect(MIGRATIONS[MIGRATIONS.length - 1]).toBe('0036_p0_hardening.sql');
    expect(MAX_PREFIX).toBe(36);
    // tie-break deterministik untuk dua file 0028_*: lexicographic (FK dulu).
    expect(MIGRATIONS.filter((f) => f.startsWith('0028_'))).toEqual([
      '0028_issue67_fk_stock_fine.sql',
      '0028_reservation_expiry.sql',
    ]);
  });
});

describe('#124 inventaris migrasi di docs lengkap + urut nama file', () => {
  for (const [doc, heading] of INVENTORY) {
    it(`${doc} §${heading.trim()} mendaftar semua file supabase/migrations/*.sql`, () => {
      expect(cited(doc, heading), `${doc}: section inventaris kirinya kurang / tidak urut`).toEqual(
        MIGRATIONS
      );
    });
  }

  it('README tidak lagi mengklaim penomoran unik + menulis tie-break 0028', () => {
    const readme = read('README.md');
    expect(readme).not.toContain('penomoran unik');
    expect(readme).toContain('urut nama');
    expect(readme).toContain('0028_issue67_fk_stock_fine.sql');
    expect(readme).toContain('0028_reservation_expiry.sql');
  });

  it('klaim batas urutan migrasi mengikuti file terbaru', () => {
    for (const doc of ['supabase/README.md', 'docs/onboarding-dev.md', 'docs/architecture.md']) {
      const claims = sequenceEnds(doc);
      expect(claims.length, `${doc} harus tetap punya klaim batas urutan`).toBeGreaterThan(0);
      for (const c of claims) {
        expect(
          c.end,
          `${doc}: klaim "${c.claim}" basi (${c.end}; migrasi terbaru ${MAX_PREFIX})`
        ).toBe(MAX_PREFIX);
      }
    }
  });
});

describe('#124 jumlah route handler di docs = kenyataan', () => {
  it('README "API (N route handler" = file src/app/api/**/route.ts', () => {
    const files = walkRouteFiles(join(ROOT, 'src/app/api'));
    const m = /API \((\d+) route handler/.exec(read('README.md'));
    expect(m, 'README harus menyebut "API (N route handler"').not.toBeNull();
    expect(Number(m?.[1])).toBe(files.length);
  });

  it('onboarding "(N file route.ts" = jumlah yang sama', () => {
    const files = walkRouteFiles(join(ROOT, 'src/app/api'));
    const m = /\((\d+) file route\.ts/.exec(read('docs/onboarding-dev.md'));
    expect(m, 'onboarding harus menyebut "(N file route.ts"').not.toBeNull();
    expect(Number(m?.[1])).toBe(files.length);
  });
});
