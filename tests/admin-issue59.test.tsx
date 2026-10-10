// @vitest-environment jsdom
/**
 * #59 [P0] Silent fetch failure + bulk DELETE N+1 di admin.
 * - Fetch gagal (500 / network) tampilkan role=alert, bukan diam.
 * - Bulk delete anggota pakai Promise.allSettled (paralel + ringkasan).
 * - BookForm guard: stock_total bulat >=0, year 1000..tahun ini, pages >=1, UUID manual.
 * - UploadInput tolak PDF ke folder cover; tombol ekspor jelas + bertanggal.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

(globalThis as unknown as { React: unknown }).React = React;

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement(
      'a',
      { href: typeof href === 'string' ? href : '#', ...rest },
      children as React.ReactNode
    ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) =>
    React.createElement('img', { src: String(src), alt: String(alt ?? '') }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => ({})) }));

import BookForm from '@/components/admin/BookForm';
import BukuAdminPage from '@/app/admin/buku/page';
import AnggotaPage from '@/app/admin/anggota/page';
import { ALLOWED_MIME_BY_FOLDER } from '@/components/admin/UploadInput';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

type FetchJson = Record<string, unknown>;
function jsonResponse(status: number, body: FetchJson) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const fetchMock = vi.fn(async () => jsonResponse(200, { data: [], pagination: { totalPages: 1 } }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    jsonResponse(200, { data: [], pagination: { totalPages: 1 } })
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  vi.stubGlobal('alert', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('#59 BookForm guard (ditolak sebelum fetch)', () => {
  const set = (view: ReturnType<typeof render>, id: string, v: string) => {
    const el = view.container.querySelector(`#${id}`) as HTMLInputElement | null;
    expect(el, `input #${id} exists`).toBeTruthy();
    fireEvent.change(el!, { target: { value: v } });
  };
  const submit = async (view: ReturnType<typeof render>, msg: RegExp) => {
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(msg)).toBeTruthy(), { timeout: 2000 });
  };
  const hitsBooksPost = () =>
    fetchMock.mock.calls.some(
      (c) =>
        String(c[0]).includes('/api/books') && (c[1] as RequestInit | undefined)?.method === 'POST'
    );

  it('stock_total -1 / year 3000 / pages 0 / kategori non-UUID ditolak, fetch tak dipanggil', async () => {
    const view = render(<BookForm mode="create" />);
    set(view, 'book-title', 'Judul Uji');
    set(view, 'book-author', 'Penulis Uji');
    set(view, 'book-stock-total', '-1');
    await submit(view, /stock_total harus bilangan bulat/);
    expect(hitsBooksPost()).toBe(false);

    set(view, 'book-stock-total', '1');
    set(view, 'book-year', '3000');
    await submit(view, /Tahun harus 1000/);
    expect(hitsBooksPost()).toBe(false);

    set(view, 'book-year', '2020');
    set(view, 'book-pages', '0');
    await submit(view, /halaman minimal 1/);
    expect(hitsBooksPost()).toBe(false);

    set(view, 'book-pages', '100');
    set(view, 'book-category', 'bukan-uuid');
    await submit(view, /Kategori tidak valid/);
    expect(hitsBooksPost()).toBe(false);
  });

  it('form valid tetap terkirim (regresi guard terlalu ketat)', async () => {
    const view = render(<BookForm mode="create" />);
    set(view, 'book-title', 'Judul Valid');
    set(view, 'book-author', 'Penulis Valid');
    set(view, 'book-year', '2020');
    set(view, 'book-stock-total', '2');
    set(view, 'book-stock-available', '2');
    set(view, 'book-pages', '120');
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(hitsBooksPost()).toBe(true), { timeout: 2500 });
    expect(screen.queryByText(/harus|tidak boleh|minimal/)).toBeNull();
  });
});

describe('#59 fetch gagal tampil di UI (buku)', () => {
  it('network error -> role=alert, bukan diam', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('Network down');
    });
    render(<BukuAdminPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText('Network down')).toBeTruthy();
  });

  it('HTTP 500 -> pesan server lewat role=alert', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(500, { error: { code: 'FETCH_FAILED', message: 'DB down' } })
    );
    render(<BukuAdminPage />);
    await waitFor(() => expect(screen.getByText('DB down')).toBeTruthy(), { timeout: 3000 });
  });
});

describe('#59 bulk delete anggota', () => {
  it('Promise.allSettled: satu klik -> DELETE paralel per id + tak error diam', async () => {
    const rows = [
      { id: '11111111-1111-4111-8111-111111111111', member_code: 'AG-1', status: 'active' },
      { id: '22222222-2222-4222-8222-222222222222', member_code: 'AG-2', status: 'active' },
    ];
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') return jsonResponse(200, { message: 'Anggota dihapus.' });
      return jsonResponse(200, { data: rows, pagination: { totalPages: 1 } });
    });
    const view = render(<AnggotaPage />);
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /hapus anggota/i }).length).toBe(2),
      { timeout: 3000 }
    );
    const selectAll = view.container.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement | null;
    expect(selectAll).toBeTruthy();
    fireEvent.click(selectAll!);
    const bulkBtn = await screen.findByRole('button', { name: /hapus terpilih \(2\)/i });
    fireEvent.click(bulkBtn);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
            .length
        ).toBe(2),
      { timeout: 2500 }
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('salah satu id 409 -> ringkasan dilewati tampil (bukan alert diam)', async () => {
    const rows = [
      { id: '11111111-1111-4111-8111-111111111111', member_code: 'AG-1', status: 'active' },
      { id: '22222222-2222-4222-8222-222222222222', member_code: 'AG-2', status: 'active' },
    ];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE')
        return url.includes(rows[1].id)
          ? jsonResponse(409, { error: { message: 'Anggota masih punya pinjaman berjalan.' } })
          : jsonResponse(200, { message: 'Anggota dihapus.' });
      return jsonResponse(200, { data: rows, pagination: { totalPages: 1 } });
    });
    const view = render(<AnggotaPage />);
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /hapus anggota/i }).length).toBe(2),
      { timeout: 3000 }
    );
    const selectAll = view.container.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement | null;
    fireEvent.click(selectAll!);
    fireEvent.click(await screen.findByRole('button', { name: /hapus terpilih \(2\)/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/dilewati/), {
      timeout: 2500,
    });
  });
});

describe('#59 kontrak sumber (cover upload + ekspor + 3 halaman)', () => {
  it('UploadInput: folder cover hanya gambar, ebooks hanya pdf', () => {
    expect(ALLOWED_MIME_BY_FOLDER.covers).not.toContain('application/pdf');
    expect(ALLOWED_MIME_BY_FOLDER.covers).toContain('image/jpeg');
    expect(ALLOWED_MIME_BY_FOLDER.ebooks).toEqual(['application/pdf']);
    const src = read('src/components/admin/UploadInput.tsx');
    expect(src, 'nama file non-gambar ditampilkan').toMatch(/File terpilih/);
  });

  it('tombol ekspor beri label jelas + filename bertanggal', () => {
    const src = read('src/components/admin/ExportCsvButton.tsx');
    expect(src).toMatch(/Ekspor halaman ini/);
    expect(src).not.toMatch(/Ekspor CSV/);
    expect(src, 'filename pakai tanggal ISO').toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });

  it('buku/anggota/peminjaman: load punya catch + error state role=alert', () => {
    for (const f of [
      'src/app/admin/buku/page.tsx',
      'src/app/admin/anggota/page.tsx',
      'src/app/admin/peminjaman/page.tsx',
    ]) {
      const s = read(f);
      expect(s, `${f}: load harus catch`).toMatch(/catch \(/);
      expect(s, `${f}: pesan via state`).toMatch(/set(Error|LoadError)\(/);
      expect(s, `${f}: tampil role=alert`).toContain('role="alert"');
      expect(s, `${f}: !res.ok di-load melempar pesan`).toMatch(
        /if \(!res\.ok\) throw new Error\(errMsg\(json, 'Gagal/
      );
    }
  });

  it('anggota bulk pakai Promise.allSettled (bukan loop await sekuensial)', () => {
    const s = read('src/app/admin/anggota/page.tsx');
    expect(s).toContain('Promise.allSettled');
    expect(s, 'tanpa loop delete sekuensial per id').not.toMatch(
      /for \(const id of ids\) \{\s*\n\s*const res = await fetch/
    );
  });
});
