// @vitest-environment jsdom
// US-01 a11y: opsi combobox harus bisa dipilih dengan keyboard.
// Kontrak pola combobox ARIA kanonik: satu tab stop di input, navigasi
// ArrowUp/ArrowDown + Enter + Escape, aria-activedescendant, dan listbox
// tidak boleh mati sendiri lewat timer saat focus pindah (review #242).
//
// CATATAN lokasi: file sengaja di root tests/ (project unit + docblock
// jsdom), BUKAN di tests/components/ — tests/setup.tsx mem-mock global
// '@/components/admin/SearchCombobox' untuk project components, sehingga
// komponen asli tak bisa dirender di sana. Pola sama dipakai
// tests/coverage-interactions.test.tsx.
import { describe, expect, it, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SearchCombobox from '@/components/admin/SearchCombobox';

(globalThis as unknown as { React: unknown }).React = React;

const MEMBERS = [
  { id: 'm1', member_code: 'AG-001-ANI', profiles: { full_name: 'Ani' } },
  { id: 'm2', member_code: 'AG-002-BUDI', profiles: { full_name: 'Budi' } },
];

function stubFetch(rows: unknown[]) {
  const fn = vi.fn(async () => ({ ok: true, json: async () => ({ data: rows }) }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function openCombobox() {
  const onPick = vi.fn();
  render(
    <SearchCombobox
      kind="members"
      label="Anggota"
      placeholder="Cari anggota"
      value=""
      onPick={onPick}
    />
  );
  const input = screen.getByRole('combobox', { name: /anggota/i });
  fireEvent.change(input, { target: { value: 'a' } });
  await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument(), {
    timeout: 2500,
  });
  return { input, onPick };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SearchCombobox keyboard a11y', () => {
  it('ArrowDown + Enter memilih opsi aktif lewat input (bukan lewat tab per opsi)', async () => {
    stubFetch(MEMBERS);
    const { input, onPick } = await openCombobox();

    // Pola kanonik: satu tab stop di input — opsi TIDAK punya tabIndex={0}.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    for (const li of options) expect(li).not.toHaveAttribute('tabindex');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const first = options[0] as HTMLElement;
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('m1', expect.objectContaining({ id: 'm1', label: 'Ani' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ArrowUp dari keadaan belum ada aktif membungkus ke opsi terakhir', async () => {
    stubFetch(MEMBERS);
    const { input, onPick } = await openCombobox();
    const options = screen.getAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const last = options[1] as HTMLElement;
    expect(input).toHaveAttribute('aria-activedescendant', last.id);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('m2', expect.objectContaining({ id: 'm2' }));
  });

  it('Enter tanpa opsi aktif tidak memilih; Escape menutup listbox', async () => {
    stubFetch(MEMBERS);
    const { input, onPick } = await openCombobox();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('focus yang pindah ke dalam combobox tidak menutup listbox; focus keluar menutup', async () => {
    stubFetch(MEMBERS);
    const { input } = await openCombobox();
    const listbox = screen.getByRole('listbox');

    // Fokus pindah ke elemen di dalam combobox (mis. klik ul) -> tetap terbuka.
    fireEvent.focusOut(input, { relatedTarget: listbox });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Fokus benar-benar keluar -> tertutup tanpa timer 120 ms.
    fireEvent.focusOut(input, { relatedTarget: document.body });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('klik mouse pada opsi tetap memilih (tanpa regresi)', async () => {
    stubFetch(MEMBERS);
    const { onPick } = await openCombobox();
    fireEvent.mouseDown(screen.getByText(/Ani/i));
    expect(onPick).toHaveBeenCalledWith('m1', expect.objectContaining({ id: 'm1' }));
  });
});
