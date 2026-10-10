import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

// Render harness #58 — suite coverage-rsc gagal import `server-only` (pre-existing
// sejak baseline), jadi asersi render dashboard hidup di file ini (runnable di CI).
(globalThis as unknown as { React: unknown }).React = React;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children),
}));

import { resetMockDb, installMockSupabase, setRpc } from './helpers/supabase-mock';
import AdminDashboard from '@/app/admin/page';

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

// S-admin-perf: dashboard 1-RTT (#58) + checkout rollback + banner revalidate.
describe('S-admin-perf', () => {
  it('(a) dashboard aggregates via get_dashboard_stats, bounded, no limit(500) fallback', () => {
    const src = read('src/app/admin/page.tsx');
    // #58: agregat pindah ke RPC get_dashboard_stats (1 RTT); fallback bucket
    // .limit(500) dihapus; sisa 2 list query dibatasi top-8 (≤3 query total).
    expect(src, 'RED: dashboard must call rpc get_dashboard_stats').toMatch(
      /\.rpc\(\s*['"]get_dashboard_stats['"]/
    );
    expect(src, 'RED: fallback .limit(500) fetch must be removed').not.toMatch(
      /\.limit\(\s*500\s*\)/
    );
    const rpcs = src.match(/\.rpc\(/g) ?? [];
    const lists = src.match(/\.from\('loans'\)/g) ?? [];
    expect(rpcs.length, 'RED: dashboard must have exactly 1 rpc (get_dashboard_stats)').toBe(1);
    expect(lists.length, 'RED: dashboard must have exactly 2 bounded loans lists').toBe(2);
    expect(src, 'RED: list queries must stay bounded top-8').toMatch(/\.limit\(\s*8\s*\)/);
    // Regresi pola lama yang dilarang isu #58: serial getFineRate + count-head apa pun.
    expect(src, 'RED: serial getFineRate must stay out of the dashboard page').not.toMatch(
      /getFineRate\(/
    );
    expect(src, 'RED: count-head exact (books/members/loans) must stay out').not.toMatch(
      /count:\s*['"]exact['"]/
    );
    // totalBooks dari RPC (WHERE is_active), bukan count-head tanpa filter.
    expect(src, 'RED: dashboard must not count books without is_active filter').not.toMatch(
      /\.from\('books'\)\.select\('id',\s*\{\s*count/
    );
  });

  it('(d) migration 0025 keeps chart sargable + supporting indexes', () => {
    const mig = read('supabase/migrations/0025_dashboard_stats_rtt.sql');
    expect(mig, 'RED: chart bucket must use sargable borrowed_at range').toMatch(
      /borrowed_at\s*>=\s*\(d\.day::timestamp\)/
    );
    expect(mig, 'RED: non-sargable borrowed_at::date = predicate must be gone').not.toMatch(
      /borrowed_at::date\s*=/
    );
    expect(mig, 'RED: missing index for recent ORDER BY borrowed_at DESC').toMatch(
      /CREATE INDEX IF NOT EXISTS idx_loans_borrowed_at[\s\S]*borrowed_at DESC/
    );
    expect(mig, 'RED: missing partial index for overdue queue (status + due_at)').toMatch(
      /CREATE INDEX IF NOT EXISTS idx_loans_active_due[\s\S]*WHERE status IN \('borrowed', 'overdue'\)/
    );
  });

  it('(e) RPC contract: RETURNS TABLE 0025 ⊇ StatsRow keys (rename kolom ketahuan)', () => {
    const mig = read('supabase/migrations/0025_dashboard_stats_rtt.sql');
    const src = read('src/app/admin/page.tsx');
    // Parse blok RETURNS TABLE (...) — terima tipe apa pun agar kolom baru
    // bertipe lain (TEXT/TIMESTAMPTZ/INT8) tetap terdeteksi, bukan lolos diam-diam.
    const retBlock = mig.match(/RETURNS TABLE \(([\s\S]*?)^\)/m)?.[1] ?? '';
    const cols = [...retBlock.matchAll(/^\s+(\w+)\s+[\w."]+(\([^)]*\))?/gm)].map(
      (m) => m[1]
    );
    const statsBlock = src.match(/type StatsRow = \{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
    const keys = [...statsBlock.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    expect(cols.length, 'RED: parse RETURNS TABLE dari 0025 gagal').toBeGreaterThanOrEqual(7);
    expect(keys.length, 'RED: parse StatsRow dari page gagal').toBeGreaterThanOrEqual(7);
    expect(
      cols,
      'RED: StatsRow key tak ada di RETURNS TABLE — page akan render 0/Rp0 senyap'
    ).toEqual(expect.arrayContaining(keys));
  });

  it('(f) dashboard renders tarif + tagihan terbuka dari RPC v2', async () => {
    setRpc('get_dashboard_stats', {
      data: [
        {
          total_books: 1,
          total_members: 2,
          active_loans: 3,
          overdue_count: 0,
          loans_per_day: [{ day: '2026-09-01', total: 4 }],
          fine_per_day: 1000,
          fines_open: 2000,
        },
      ],
    });
    const markup = renderToStaticMarkup((await AdminDashboard()) as React.ReactElement);
    expect(markup).toContain('Total Buku');
    expect(markup).toContain('Judul aktif');
    expect(markup).toContain('Perlu dikembalikan');
    expect(markup).toContain('Belum ada keterlambatan.');
    // #58: tarif + tagihan terbuka datang dari RPC (tanpa serial getFineRate).
    expect(markup).toContain('Denda Rp1.000/hari');
    expect(markup).toContain('tagihan terbuka Rp2.000');
  });

  it('(g) deploy guard: signature v1 tanpa fines_open → tanpa tagihan + log', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Migrasi 0025 belum jalan → PostgREST tetap balas v1 (5 kolom) tanpa error.
    setRpc('get_dashboard_stats', {
      data: [
        {
          total_books: 1,
          total_members: 2,
          active_loans: 3,
          overdue_count: 0,
          loans_per_day: [{ day: '2026-09-01', total: 4 }],
        },
      ],
    });
    const markup = renderToStaticMarkup((await AdminDashboard()) as React.ReactElement);
    expect(markup).toContain('Denda Rp1.000/hari'); // fallback + warn
    expect(markup, 'tagihan terbuka disembunyikan bila kolom v2 absen').not.toContain(
      'tagihan terbuka'
    );
    expect(
      err.mock.calls.some((c) => String(c[0]).includes('get_dashboard_stats v1'))
    ).toBe(true);
    expect(warn, 'fineRate fallback wajib warn').toHaveBeenCalled();
    err.mockRestore();
    warn.mockRestore();
  });

  it('(h) RPC error → console.error + zero-fill 7 bar + fineRate fallback warn', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setRpc('get_dashboard_stats', { data: null, error: { message: 'db down' } });
    const markup = renderToStaticMarkup((await AdminDashboard()) as React.ReactElement);
    expect(markup).toContain('Total Buku'); // kartu render, nol tidak lagi senyap
    // Zero-fill = 7 elemen bar (satu per hari), bukan hitungan substring teks title.
    expect(markup.match(/title="[^"]*"/g)?.length ?? 0, 'chart harus zero-fill 7 bar').toBe(7);
    expect(markup).not.toContain('tagihan terbuka');
    expect(markup).toContain('Denda Rp1.000/hari'); // fallback tarif tetap
    expect(
      err.mock.calls.some((c) => String(c[0]).includes('get_dashboard_stats gagal'))
    ).toBe(true);
    expect(warn, 'fineRate fallback wajib warn').toHaveBeenCalled();
    err.mockRestore();
    warn.mockRestore();
  });

  it('(b) checkout fallback path rolls back stock on insert fail', () => {
    const src = read('src/app/api/loans/route.ts');
    // Fallback: after loans insert error, stock must be restored (rollback to avail).
    expect(src, 'RED: fallback insert-fail path does not roll back stock').toMatch(/stock_available:\s*avail/);
    // PRESERVE: exact-match rpcCode fix must not be reverted.
    for (const code of ["rpcCode === '25000'", "rpcCode === '02000'", "rpcCode === '22000'", "rpcCode === '42501'"]) {
      expect(src, `rpcCode exact-match fix missing: ${code}`).toContain(code);
    }
  });

  it('(c) banner edit calls correct revalidate target', () => {
    const src = read('src/app/api/banners/route.ts');
    // Public hero caches under tag "banners" (src/lib/books.ts) with revalidate 60 on "/".
    expect(src, 'RED: banners API never revalidates banners tag').toMatch(/revalidateTag\(["']banners["']\s*(?:,\s*["']max["'])?\)/);
    expect(src, 'RED: banners API never revalidates "/"').toMatch(/revalidatePath\(["']\/["']\)/);
  });
});
