import { render, screen, fireEvent } from '@testing-library/react';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ExportCsvButton (#78)', () => {
  beforeEach(() => {
    // jsdom tidak punya createObjectURL — stub untuk uji jalur halaman-aktif.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => 'blob:mock'
    );
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  it('menawarkan ekspor seluruh data (anchor server) + halaman ini (client)', () => {
    render(
      <ExportCsvButton
        filename="buku.csv"
        headers={['ID', 'Judul']}
        rows={[['b1', 'Laskar']]}
        scope="books"
      />
    );
    const all = screen.getByText('Ekspor seluruh data');
    expect(all.tagName).toBe('A');
    expect(all).toHaveAttribute('href', '/api/reports/export?scope=books');
    expect(all).toHaveAttribute('download');

    const page = screen.getByText('Ekspor halaman ini');
    expect(page.tagName).toBe('BUTTON');
  });

  it('klik "Ekspor halaman ini" tetap mengunduh CSV baris halaman aktif', () => {
    render(<ExportCsvButton filename="denda.csv" headers={['ID']} rows={[['f1']]} scope="fines" />);
    fireEvent.click(screen.getByText('Ekspor halaman ini'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
