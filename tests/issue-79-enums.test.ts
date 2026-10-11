import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FINE_STATUS, LOAN_STATUS, MEMBER_STATUS, RESERVATION_STATUS } from '@/lib/enums';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('issue-79 enums kanonis: value EN + label ID', () => {
  it('LOAN_STATUS value EN + label ID', () => {
    expect(LOAN_STATUS).toEqual([
      { value: 'borrowed', label: 'Dipinjam' },
      { value: 'overdue', label: 'Terlambat' },
      { value: 'returned', label: 'Dikembalikan' },
      { value: 'lost', label: 'Hilang' },
    ]);
  });

  it('RESERVATION_STATUS value EN + label ID', () => {
    expect(RESERVATION_STATUS).toEqual([
      { value: 'pending', label: 'Menunggu' },
      { value: 'ready', label: 'Siap diambil' },
      { value: 'completed', label: 'Selesai' },
      { value: 'cancelled', label: 'Dibatalkan' },
      { value: 'expired', label: 'Kedaluwarsa' },
    ]);
  });

  it('FINE_STATUS value EN + label ID', () => {
    expect(FINE_STATUS).toEqual([
      { value: 'unpaid', label: 'Belum lunas' },
      { value: 'partial', label: 'Sebagian' },
      { value: 'paid', label: 'Lunas' },
      { value: 'waived', label: 'Dibebaskan' },
    ]);
  });

  it('MEMBER_STATUS value EN + label ID', () => {
    expect(MEMBER_STATUS).toEqual([
      { value: 'active', label: 'Aktif' },
      { value: 'suspended', label: 'Ditangguhkan' },
      { value: 'expired', label: 'Kedaluwarsa' },
      { value: 'pending', label: 'Menunggu' },
    ]);
  });

  it('label selalu Indonesia (beda dari value EN)', () => {
    for (const e of [...LOAN_STATUS, ...RESERVATION_STATUS, ...FINE_STATUS, ...MEMBER_STATUS]) {
      expect(e.label).not.toBe(e.value);
    }
  });

  it('peminjaman page tanpa option mentah + pakai LOAN_STATUS', () => {
    const src = read('src/app/admin/peminjaman/page.tsx');
    expect(src).not.toContain('<option value="borrowed">borrowed</option>');
    expect(src).toContain('LOAN_STATUS');
  });
});
