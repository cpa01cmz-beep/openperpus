import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi2 Denda receipt cetak/unduh (lanjutkan Salin bukti PR #8).
// UI: reuse `receipt` dari pay response, tanpa ubah API.

const pageSrc = () => readFileSync(join(process.cwd(), 'src/app/(public)/denda/page.tsx'), 'utf8');

function buttonTag(src: string, label: string): string {
  const idx = src.indexOf(label);
  if (idx < 0) return '';
  const openIdx = src.lastIndexOf('<button', idx);
  if (openIdx < 0) return '';
  return src.slice(openIdx, idx + 200);
}

function fnSlice(src: string, fnName: string): string {
  const start = src.indexOf(`function ${fnName}`);
  if (start >= 0) {
    const nextFn = src.indexOf('\n  function ', start + 1);
    const ret = src.indexOf('\n  return (', start);
    const end = [nextFn, ret].filter((v) => v > start).sort((a, b) => a - b)[0];
    return src.slice(start, end !== undefined && end > start ? end : start + 2000);
  }
  const arrow = src.indexOf(fnName);
  if (arrow < 0) return '';
  return src.slice(Math.max(0, arrow - 200), arrow + 1500);
}

describe('S-roi2 denda receipt cetak/unduh', () => {
  it('RECEIPT-PRINT-01 tombol Cetak membuka dialog print hanya struk', () => {
    const src = pageSrc();
    expect(src.includes('Cetak'), 'struk butuh tombol berlabel "Cetak"').toBe(true);
    const prints = src.match(/window\.print\(\)/g) ?? [];
    expect(prints.length, 'handler harus memanggil window.print() tepat satu kali').toBe(1);
    expect(src.includes('print:block'), 'butuh container print-only (class "print:block")').toBe(
      true
    );
    const pi = src.indexOf('print:block');
    const win = src.slice(Math.max(0, pi - 400), pi + 1800);
    expect(win.includes('receipt.id') || win.includes('.id'), 'struk print memuat id').toBe(true);
    expect(
      win.includes('Nominal') || win.includes('receipt.amount'),
      'struk print memuat nominal'
    ).toBe(true);
    expect(
      win.includes('Dibayar') || win.includes('paid_amount'),
      'struk print memuat dibayar'
    ).toBe(true);
    expect(win.includes('Sisa') && win.includes('fmtRp(0)'), 'struk print memuat sisa Rp0').toBe(
      true
    );
    expect(win.includes('methodUsed') || win.includes('Metode'), 'struk print memuat method').toBe(
      true
    );
    expect(win.includes('paid_at'), 'struk print memuat paid_at').toBe(true);
  });

  it('RECEIPT-PRINT-02 tombol Unduh mengunduh .txt berisi field struk', () => {
    const src = pageSrc();
    expect(src.includes('Unduh'), 'struk butuh tombol berlabel "Unduh"').toBe(true);
    expect(src.includes('new Blob('), 'unduh harus membuat Blob').toBe(true);
    expect(
      src.includes("'text/plain'") || src.includes('"text/plain"'),
      'Blob harus bertipe text/plain'
    ).toBe(true);
    const urls = src.match(/URL\.createObjectURL/g) ?? [];
    expect(urls.length, 'harus memanggil URL.createObjectURL satu kali').toBe(1);
    const dl = fnSlice(src, 'downloadReceipt');
    expect(dl.length, 'handler downloadReceipt harus ada').toBeGreaterThan(0);
    expect(dl.includes('F-1') || dl.includes('receipt.id'), 'teks Blob mengandung id').toBe(true);
    expect(dl.includes('qris') || dl.includes('methodUsed'), 'teks Blob mengandung method').toBe(
      true
    );
    expect(dl.includes('paid_at'), 'teks Blob mengandung paid_at').toBe(true);
    expect(dl.includes('Rp') || dl.includes('fmtRp'), 'teks Blob mengandung Rp').toBe(true);
  });

  it('RECEIPT-PRINT-03 struk memakai data pay response tanpa fetch tambahan', () => {
    const src = pageSrc();
    expect(src.includes('Sisa'), 'struk harus menampilkan Sisa').toBe(true);
    expect(src.includes('fmtRp(0)') || src.includes('Rp0'), 'pelunasan menampilkan Sisa Rp0').toBe(
      true
    );
    const printH = fnSlice(src, 'printReceipt');
    const dlH = fnSlice(src, 'downloadReceipt');
    expect(printH.length + dlH.length, 'handler cetak/unduh harus ada').toBeGreaterThan(0);
    expect(
      printH.includes('/api/fines') || dlH.includes('/api/fines'),
      'handler cetak/unduh tidak boleh fetch tambahan'
    ).toBe(false);
    expect(printH.includes('fetch(') || dlH.includes('fetch('), 'tanpa fetch di handler').toBe(
      false
    );
  });

  it('RECEIPT-PRINT-04 tombol 44px dan fokus terlihat, gagal unduh ada alert', () => {
    const src = pageSrc();
    for (const label of ['Cetak', 'Unduh', 'Tutup']) {
      const tag = buttonTag(src, label);
      expect(tag.includes('<button'), `tombol "${label}" harus ada`).toBe(true);
      expect(tag.includes('min-h-[44px]'), `tombol "${label}" wajib min-h-[44px]"`).toBe(true);
      expect(tag.includes('focus-visible:ring'), `tombol "${label}" wajib focus-visible:ring`).toBe(
        true
      );
    }
    expect(
      src.includes('Gagal mengunduh bukti.'),
      'gagal Blob harus tampilkan teks "Gagal mengunduh bukti."'
    ).toBe(true);
    const ai = src.lastIndexOf('Gagal mengunduh bukti.');
    const win = src.slice(Math.max(0, ai - 400), ai + 200);
    expect(
      win.includes('role="alert"') || win.includes("role='alert'"),
      'gagal unduh role=alert'
    ).toBe(true);
  });
});
