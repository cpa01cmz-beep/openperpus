import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALL_STATUS,
  ARTICLE_STATUS,
  FINE_STATUS,
  LOAN_STATUS,
  MEMBER_STATUS,
  RESERVATION_STATUS,
} from '@/lib/enums';
import { statusLabel, statusTone } from '@/components/ui/StatusBadge';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('issue-79 enums kanonis: value EN + label ID + tone', () => {
  it('LOAN_STATUS value EN + label ID + tone', () => {
    expect(LOAN_STATUS).toEqual([
      { value: 'borrowed', label: 'Dipinjam', tone: 'sky' },
      { value: 'overdue', label: 'Terlambat', tone: 'rose' },
      { value: 'returned', label: 'Dikembalikan', tone: 'emerald' },
      { value: 'lost', label: 'Hilang', tone: 'rose' },
    ]);
  });

  it('RESERVATION_STATUS value EN + label ID + tone', () => {
    expect(RESERVATION_STATUS).toEqual([
      { value: 'pending', label: 'Menunggu', tone: 'amber' },
      { value: 'ready', label: 'Siap diambil', tone: 'sky' },
      { value: 'completed', label: 'Selesai', tone: 'emerald' },
      { value: 'cancelled', label: 'Dibatalkan', tone: 'slate' },
      { value: 'expired', label: 'Kedaluwarsa', tone: 'rose' },
    ]);
  });

  it('FINE_STATUS value EN + label ID + tone', () => {
    expect(FINE_STATUS).toEqual([
      { value: 'unpaid', label: 'Belum lunas', tone: 'rose' },
      { value: 'partial', label: 'Sebagian', tone: 'amber' },
      { value: 'paid', label: 'Lunas', tone: 'emerald' },
      { value: 'waived', label: 'Dibebaskan', tone: 'slate' },
    ]);
  });

  it('MEMBER_STATUS value EN + label ID + tone', () => {
    expect(MEMBER_STATUS).toEqual([
      { value: 'active', label: 'Aktif', tone: 'emerald' },
      { value: 'suspended', label: 'Ditangguhkan', tone: 'amber' },
      { value: 'expired', label: 'Kedaluwarsa', tone: 'rose' },
      { value: 'pending', label: 'Menunggu', tone: 'amber' },
    ]);
  });

  it('label selalu Indonesia (beda dari value EN)', () => {
    for (const e of ALL_STATUS) {
      expect(e.label, `${e.value} label tidak boleh mentah EN`).not.toBe(e.value);
    }
  });

  it('value unik di dalam tiap daftar enum', () => {
    for (const list of [
      LOAN_STATUS,
      RESERVATION_STATUS,
      FINE_STATUS,
      MEMBER_STATUS,
      ARTICLE_STATUS,
    ]) {
      const values = list.map((e) => e.value);
      expect(new Set(values).size, `duplikat value di daftar`).toBe(values.length);
    }
  });

  it('value yang muncul di dua daftar (pending) punya label + tone identik', () => {
    // 'pending' ada di RESERVATION_STATUS dan MEMBER_STATUS — memang boleh,
    // tapi label/tone-nya harus konsisten supaya StatusBadge tak ambigu.
    const pending = ALL_STATUS.filter((e) => e.value === 'pending');
    expect(pending.length).toBeGreaterThan(1);
    for (const e of pending) {
      expect(e.label).toBe('Menunggu');
      expect(e.tone).toBe('amber');
    }
  });

  it('peminjaman page tanpa option mentah + pakai LOAN_STATUS', () => {
    const src = read('src/app/admin/peminjaman/page.tsx');
    expect(src).not.toContain('<option value="borrowed">borrowed</option>');
    expect(src).toContain('LOAN_STATUS');
  });

  // Issue #79: label/tone badge TIDAK lagi punya kamus lokal kedua —
  // StatusBadge membacanya dari enum yang sama dengan dropdown filter.
  it('StatusBadge membaca label + tone dari enum (satu sumber)', () => {
    for (const e of ALL_STATUS) {
      expect(statusLabel(e.value), `label ${e.value}`).toBe(e.label);
      expect(statusTone(e.value), `tone ${e.value}`).toBe(e.tone);
    }
  });

  it('StatusBadge fallback aman untuk enum tak dikenal', () => {
    expect(statusLabel('ngawur')).toBe('ngawur');
    expect(statusTone('ngawur')).toBe('slate');
  });

  it('StatusBadge.tsx tidak lagi mendefinisikan STATUS_MAP lokal', () => {
    const src = read('src/components/ui/StatusBadge.tsx');
    expect(src).toContain('ALL_STATUS');
    expect(src).not.toMatch(/borrowed:\s*\{\s*label:/);
  });

  it('dropdown filter denda/reservasi + kartu publik pakai enum yang sama', () => {
    expect(read('src/app/admin/denda/page.tsx')).toContain('FINE_STATUS');
    expect(read('src/app/admin/reservasi/page.tsx')).toContain('RESERVATION_STATUS');
    // Halaman publik denda: opsi filter ID + label status Indonesia (bukan raw EN).
    const pubDenda = read('src/app/(public)/denda/page.tsx');
    expect(pubDenda).toContain('FINE_STATUS');
    expect(pubDenda).toContain('statusLabel(r.status)');
    expect(pubDenda).not.toContain('<span className="font-semibold">{r.status}</span>');
    // Kartu reservasi milik sendiri: label dari sumber yang sama.
    expect(read('src/components/public/ReservationCard.tsx')).toContain('statusLabel');
  });

  it('ARTICLE_STATUS konsisten (label ID + tone)', () => {
    expect(ARTICLE_STATUS).toEqual([
      { value: 'draft', label: 'Draf', tone: 'slate' },
      { value: 'published', label: 'Terbit', tone: 'emerald' },
      { value: 'archived', label: 'Arsip', tone: 'slate' },
    ]);
  });
});
