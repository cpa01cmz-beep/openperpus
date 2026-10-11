import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Isu #55 — reservasi buku stok 0 WAJIB ditolak API (bukan cuma disembunyikan
// di UI). AC #55 lain sudah dipenuhi migrasi 0024: jalur ready->completed hanya
// lewat checkout atomik (loan_id wajib, RPC checkout_reservation_tx) dan PUT
// status=completed langsung ditolak 422. Sisa lubang: POST /api/reservations
// cuma cek is_active — hold buku stok 0 bisa terbentuk padahal checkout
// kelak mustahil lulus gate stok. Guard stock_available menutup lubang itu.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST as RESERVATIONS_POST } from '@/app/api/reservations/route';
import {
  installMockSupabase,
  resetMockDb,
  setTable,
  setRpc,
  setProfileRole,
  jsonReq,
  errCode,
} from './helpers/supabase-mock';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MID = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';

const post = (body: Record<string, unknown>) =>
  RESERVATIONS_POST(jsonReq('POST', '/api/reservations', body));

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  setProfileRole('admin');
});

describe('POST /api/reservations — gate stok (#55)', () => {
  function seedBook(stockAvailable: number | null | undefined, extra?: Record<string, unknown>) {
    setTable('books', {
      single: {
        data: {
          id: BID,
          is_active: true,
          ...(stockAvailable !== undefined ? { stock_available: stockAvailable } : {}),
          ...extra,
        },
      },
    });
    setTable('members', { single: { data: { id: MID, status: 'active' } } });
    setTable('loans', { list: { data: [] } });
    setRpc('get_fines_total', { data: 0, error: null });
  }

  it('RES-STK-01 stok 0 -> 409 CONFLICT (tak ada hold buku)', async () => {
    seedBook(0);
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('CONFLICT');
    expect(j.error.message).toMatch(/stok/i);
  });

  it('RES-STK-02 stok 1 -> 201 (jalur normal tak berubah)', async () => {
    seedBook(1);
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(201);
  });

  it('RES-STK-03 stok negatif (baris korup) -> 409', async () => {
    seedBook(-2);
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(409);
  });

  it('RES-STK-04 stok NULL (baris legacy) -> tetap 201 (back-compat)', async () => {
    seedBook(null);
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(201);
  });

  it('RES-STK-05 buku nonaktif tetap 410 GONE (guard lain tak tergeser)', async () => {
    seedBook(3, { is_active: false });
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(410);
    expect(await errCode(res)).toBe('GONE');
  });

  it('RES-STK-06 buku tidak ditemukan -> 404', async () => {
    setTable('books', { single: { data: null, error: null } });
    const res = await post({ book_id: BID, member_id: MID });
    expect(res.status).toBe(404);
    expect(await errCode(res)).toBe('NOT_FOUND');
  });
});

describe('penyimpanan & dokumentasi #55', () => {
  it('DOC-01 route: select stock_available + guard <=0 -> 409 CONFLICT', () => {
    const src = read('src/app/api/reservations/route.ts');
    expect(src).toMatch(/select\('id,is_active,stock_available'\)/);
    expect(src).toMatch(/stockAvailable <= 0/);
    expect(src).toMatch(/Stok buku habis, tidak bisa direservasi\./);
  });

  it('DOC-02 openapi: 409 POST /api/reservations menyebut stok habis', () => {
    const spec = read('openapi.yaml');
    expect(spec).toMatch(/stok buku habis/);
  });

  it('DOC-03 UI: katalog detail tak lagi menawarkan 1-klik antrean saat stok 0', () => {
    const src = read('src/app/(public)/katalog/[slug]/page.tsx');
    expect(src.includes('variant="queue"')).toBe(false);
    expect(src.includes('Masuk Antrean')).toBe(false);
  });

  it('DOC-04 invariant checkout (migrasi 0024): completed wajib loan_id + gate stok', () => {
    const m = read('supabase/migrations/0024_checkout_reservation_tx.sql');
    expect(m).toMatch(/reservations_completed_needs_loan/);
    expect(m).toMatch(/stock_available <= 0/);
  });
});
