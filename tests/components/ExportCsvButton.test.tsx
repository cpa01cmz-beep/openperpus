import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
// Mock lokal meng-override setup.tsx: satu objek router yang bisa di-assert.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/buku',
}));

function exportAllButton() {
  return screen.getByText('Ekspor seluruh data');
}

/** Respons ekspor palsu: ok + blob + header opsional. */
function okExport(headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    blob: async () => new Blob(['ID,Judul\r\nb1,Laskar\r\n'], { type: 'text/csv' }),
  } as unknown as Response;
}

/** Respons error endpoint (401/422/500) dengan envelope {error:{code,message}}. */
function errExport(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ error: { code, message } }),
  } as unknown as Response;
}

describe('ExportCsvButton (#78/#133)', () => {
  beforeEach(() => {
    push.mockReset();
    // jsdom tidak punya createObjectURL — stub untuk uji jalur unduhan.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => 'blob:mock'
    );
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('tombol seluruh data adalah BUTTON fetch-based, bukan anchor download', () => {
    render(
      <ExportCsvButton
        filename="buku.csv"
        headers={['ID', 'Judul']}
        rows={[['b1', 'Laskar']]}
        scope="books"
      />
    );
    const all = exportAllButton();
    expect(all.tagName).toBe('BUTTON');
    // Anchor + atribut download adalah akar masalah #133: respons error
    // ikut tersimpan sebagai berkas. Tidak boleh ada lagi.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('klik seluruh data: fetch same-origin lalu unduh dengan nama dari Content-Disposition', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okExport({ 'content-disposition': 'attachment; filename="buku-2026-10-11.csv"' })
      );
    vi.stubGlobal('fetch', fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <ExportCsvButton
        filename="buku.csv"
        headers={['ID', 'Judul']}
        rows={[['b1', 'Laskar']]}
        scope="books"
      />
    );
    fireEvent.click(exportAllButton());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/reports/export?scope=books', {
        credentials: 'same-origin',
      })
    );
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    // Nama berkas mengikuti stempel WIB server — konsisten dengan endpoint.
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('buku-2026-10-11.csv');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tanpa Content-Disposition: nama berkas jatuh ke stempel lokal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okExport());
    vi.stubGlobal('fetch', fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportCsvButton filename="denda.csv" headers={['ID']} rows={[['f1']]} scope="fines" />);
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^denda-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('Content-Disposition RFC 5987 filename* dipakai (di-decode UTF-8)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okExport({
        'content-disposition':
          'attachment; filename="fallback.csv"; filename*=UTF-8\'\'laporan%20pustakawan.csv',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'laporan pustakawan.csv'
    );
  });

  it('percent-encoding rusak di filename*: ekspor sukses tetap jalan (jatuh ke filename="…")', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okExport({
        'content-disposition': 'attachment; filename="buku-2026-10-11.csv"; filename*=UTF-8\'\'%E0',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect((clickSpy.mock.instances[0] as HTMLAnchorElement).download).toBe('buku-2026-10-11.csv');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('401 sesi habis: dialihkan ke login?next=… tanpa mengunduh apa pun', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errExport(401, 'UNAUTHORIZED', 'Silakan login.'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ExportCsvButton
        filename="buku.csv"
        headers={['ID', 'Judul']}
        rows={[['b1', 'Laskar']]}
        scope="books"
      />
    );
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?next=%2Fadmin%2Fbuku'));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('422 scope tak dikenal: pesan error tampil, tidak ada berkas yang diunduh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errExport(422, 'VALIDATION', 'scope harus: books|loans|fines.'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('scope harus'));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('500 gagal ekspor: pesan error tampil, tidak ada berkas yang diunduh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(errExport(500, 'FETCH_FAILED', 'Gagal mengekspor data.'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Gagal mengekspor data.')
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('error dengan body non-JSON: pesan fallback tampil, bukan JSON mentah', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => {
        throw new Error('bukan JSON');
      },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Gagal mengekspor seluruh data.')
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('jaringan gagal melempar: pesan error tetap tampil', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ExportCsvButton filename="buku.csv" headers={['ID']} rows={[['b1']]} scope="books" />);
    fireEvent.click(exportAllButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('klik "Ekspor halaman ini" tetap mengunduh CSV baris halaman aktif', () => {
    render(<ExportCsvButton filename="denda.csv" headers={['ID']} rows={[['f1']]} scope="fines" />);
    fireEvent.click(screen.getByText('Ekspor halaman ini'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
