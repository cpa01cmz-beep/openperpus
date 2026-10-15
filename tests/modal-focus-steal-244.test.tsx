// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

(globalThis as unknown as { React: unknown }).React = React;

import Modal from '@/components/ui/Modal';

/**
 * Issue #244: Modal focus-trap pernah masuk `onClose` ke daftar dependensi efek.
 *
 * Semua call site memakai arrow inline (`onClose={() => setX(null)}`), identitasnya
 * berubah tiap render induk, sehingga efek focus-trap di-cleanup + dijalankan ulang
 * pada SETIAP render — termasuk setiap keystroke di dalam modal. Akibatnya fokus
 * dicuri ke tombol tutup setelah satu perubahan, dan kontrol wajib (alasan bebas
 * denda, catatan keputusan, radio kondisi buku, opname stok) tak bisa diisi.
 *
 * Test di bawah mereproduksi alur nyata itu lewat harness berstate (pola sama
 * dengan halaman admin), lalu mengunci perilaku yang harus tetap ada: fokus pindah
 * ke tombol tutup saat dibuka, Escape menutup, overlay menutup, fokus balik ke
 * pemicu saat ditutup.
 */
afterEach(() => {
  cleanup();
});

/** Pola admin/denda: Modal + onClose inline + textarea terkendali. */
function WaiveModalHarness() {
  const [open, setOpen] = React.useState(true);
  const [reason, setReason] = React.useState('');
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Bebaskan denda"
      description="Pengajuan pembebasan wajib berisi alasan dan disetujui admin lain."
    >
      <label htmlFor="waive-reason">Alasan pembebasan</label>
      <textarea
        id="waive-reason"
        value={reason}
        rows={3}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

/** Pola admin/buku & admin/peminjaman: buka dari pemicu, tutup dengan Escape. */
function OpenCloseHarness() {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Buka dialog
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Konfirmasi">
        <label htmlFor="h-reason">Alasan</label>
        <textarea id="h-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}

/** Modal yang selalu terbuka; `onClose` inline berubah tiap render (pola call site nyata). */
function LatestCallbackHarness({ onClose }: { onClose: (tag: string) => void }) {
  const [note, setNote] = React.useState('');
  return (
    // Arrow inline: identitasnya baru tiap render DAN menangkap state render
    // terkini. Listener keydown harus memanggil yang TERBARU, bukan yang basi.
    <Modal open onClose={() => onClose(note)} title="Konfirmasi" description="Body">
      <label htmlFor="lc-note">Catatan</label>
      <textarea id="lc-note" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

/** Pola admin/peminjaman: radio grup kondisi buku di dalam Modal. */
function ReturnModalHarness() {
  const [open, setOpen] = React.useState(true);
  const [kondisi, setKondisi] = React.useState('baik');
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Proses pengembalian"
      description="Kondisi buku dipilih sebelum submit."
    >
      <fieldset>
        <legend>Kondisi buku</legend>
        {[
          { value: 'baik', label: 'Baik — stok kembali tersedia' },
          { value: 'rusak', label: 'Rusak — stok berkurang' },
        ].map((opt) => (
          <label key={opt.value}>
            <input
              type="radio"
              name="return-kondisi"
              value={opt.value}
              checked={kondisi === opt.value}
              onChange={() => setKondisi(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}

describe('#244 Modal — fokus tidak dicuri saat state di dalam modal berubah', () => {
  it('textarea alasan pembebasan bisa diketik lebih dari satu karakter (fokus tetap di textarea)', () => {
    render(<WaiveModalHarness />);
    const textarea = screen.getByLabelText('Alasan pembebasan') as HTMLTextAreaElement;
    act(() => textarea.focus());
    expect(document.activeElement).toBe(textarea);

    // Tiap potongan memicu re-render induk → prop onClose baru (identitas beda).
    for (const chunk of ['salah ', 'input ', 'tarif ']) {
      fireEvent.change(textarea, { target: { value: `${textarea.value}${chunk}` } });
      expect(document.activeElement, 'fokus dicuri ke tombol tutup — ketik lagi mustahil').toBe(
        textarea
      );
    }

    expect(textarea.value).toBe('salah input tarif ');
  });

  it('radio kondisi buku tetap terfokus setelah dipilih (navigasi panah tidak rusak)', () => {
    render(<ReturnModalHarness />);
    const rusak = screen.getByLabelText(/Rusak — stok berkurang/) as HTMLInputElement;
    act(() => rusak.focus());
    fireEvent.click(rusak);

    expect(rusak.checked).toBe(true);
    expect(document.activeElement, 'fokus dicuri ke tombol tutup — pilihan radio sulit diubah').toBe(
      rusak
    );
  });
});

describe('#244 Modal — kontrak a11y yang harus tetap terjaga', () => {
  it('fokus pindah ke tombol tutup saat dibuka dan balik ke pemicu saat ditutup', () => {
    render(<OpenCloseHarness />);
    const opener = screen.getByRole('button', { name: 'Buka dialog' }) as HTMLButtonElement;

    act(() => opener.focus());
    fireEvent.click(opener);

    // Fokus masuk dialog ke tombol tutup (autofocus).
    const closeBtn = screen.getByRole('button', { name: /Tutup dialog/i }) as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    // Scroll lock aktif selama modal terbuka.
    expect(document.body.style.overflow).toBe('hidden');

    // Mengetik TIDAK menggeser fokus, lalu Escape menutup memakai callback terbaru.
    const reason = screen.getByLabelText('Alasan') as HTMLTextAreaElement;
    act(() => reason.focus());
    fireEvent.change(reason, { target: { value: 'abc' } });
    expect(document.activeElement).toBe(reason);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Fokus kembali ke pemicu dan scroll lock dilepas.
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape, tombol tutup, dan overlay semua memanggil callback render TERKINI', () => {
    // Tag berupa state modal: closure 'x' hanya ada pada render SESUDAH perubahan
    // di bawah. Kalau listener memakai closure render pertama, tag-nya ''. Ini
    // yang menjaga ref onCloseRef — tanpa dia assertion ini merah.
    const seen: string[] = [];
    const onClose = (tag: string) => seen.push(tag);
    const view = render(<LatestCallbackHarness onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Catatan'), { target: { value: 'x' } });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Tutup dialog/i }));
    fireEvent.mouseDown(view.container.firstChild as Element);

    expect(seen).toEqual(['x', 'x', 'x']);
  });
});
