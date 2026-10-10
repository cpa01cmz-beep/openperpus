import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// I-54: SATU transport ID untuk single-resource write.
// Sebelum: dua pola berjalan paralel — REST path `DELETE /api/books/:id`
// vs query `PUT /api/loans?id=`, `DELETE /api/categories?id=` — sehingga
// route `[id]` (loans/fines) nyaris tak dipakai admin dan validasi UUID
// tidak konsisten.
//
// AC yang dijaga file ini:
//   1. Tidak ada lagi fetch dengan ?id= untuk single resource di klien.
//   2. Semua route [id] tervalidasi UUID — 400 bila invalid.
//   3. CRUD kategori/loan via REST hijau.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import { resetMockDb, installMockSupabase, setTable, req, jsonReq } from './helpers/supabase-mock';

import { POST as CAT_POST } from '@/app/api/categories/route';
import { PUT as CAT_ID_PUT, DELETE as CAT_ID_DEL } from '@/app/api/categories/[id]/route';
import { PUT as LOAN_ID_PUT } from '@/app/api/loans/[id]/route';
import { PUT as RES_ID_PUT } from '@/app/api/reservations/[id]/route';

const UUID = '11111111-1111-4111-8111-111111111111';
const ctx = { params: { id: UUID } };
const badCtx = { params: { id: 'bukan-uuid' } };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const CLIENT_FILES = [
  ...walk(join(process.cwd(), 'src/app/admin')),
  ...walk(join(process.cwd(), 'src/lib')),
  ...walk(join(process.cwd(), 'src/components')),
];

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('AC1: klien tidak lagi fetch ?id= untuk single resource', () => {
  it('nol fetch PUT/DELETE dengan ?id= di src (admin/lib/components)', () => {
    const offenders: string[] = [];
    for (const f of CLIENT_FILES) {
      const src = readFileSync(f, 'utf8');
      // hanya baris kode fetch, bukan komentar/dokumentasi.
      for (const line of src.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) continue;
        const isWrite = /method:\s*'(PUT|PATCH|DELETE)'/.test(t) || /fetch\([^)]*DELETE/.test(t);
        const hasIdQuery = /`[^`]*\?id=\$\{|'[^']*\?id=/.test(t);
        // Bulk delete buku (?id=a,b,c) adalah multi-resource dan TETAP boleh.
        const isBulk = /join\(','\)/.test(line);
        if (hasIdQuery && (isWrite || /fetch\(/.test(t)) && !isBulk) {
          offenders.push(`${f.replace(process.cwd() + '/', '')}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('route koleksi tak lagi mengekspor PUT/DELETE tulis (?id= dihapus)', () => {
    const collections = [
      'categories',
      'racks',
      'menus',
      'pages',
      'faqs',
      'banners',
      'articles',
      'members',
      'testimonials',
      'services',
      'loans',
      'reservations',
    ];
    for (const c of collections) {
      const src = readFileSync(join(process.cwd(), `src/app/api/${c}/route.ts`), 'utf8');
      expect(src, `${c}/route.ts masih ekspor PUT/DELETE`).not.toMatch(
        /export\s+async\s+function\s+(PUT|PATCH|DELETE)\b/
      );
    }
    // books bulk delete (?id= comma-separated) justru dipertahankan.
    const books = readFileSync(join(process.cwd(), 'src/app/api/books/route.ts'), 'utf8');
    expect(books).toMatch(/export\s+async\s+function\s+DELETE\b/);
    expect(books).toContain("searchParams.get('id')");
  });
});

describe('AC2: route [id] menolak non-UUID dengan 400', () => {
  it('kategori & loans & reservations [id] PUT/DELETE -> 400 VALIDATION', async () => {
    expect((await CAT_ID_PUT(jsonReq('PUT', '/api/x', { name: 'X' }), badCtx)).status).toBe(400);
    expect((await CAT_ID_DEL(req('/api/x', { method: 'DELETE' }), badCtx)).status).toBe(400);
    expect((await LOAN_ID_PUT(jsonReq('PUT', '/api/x', { action: 'return' }), badCtx)).status).toBe(
      400
    );
    expect(
      (await RES_ID_PUT(jsonReq('PUT', '/api/x', { status: 'cancelled' }), badCtx)).status
    ).toBe(400);
  });
});

describe('AC3: CRUD via REST [id] hijau', () => {
  it('kategori: POST koleksi -> PUT [id] -> DELETE [id] (tanpa ?id=)', async () => {
    setTable('categories', {
      insert: { data: { id: UUID, name: 'Sastra' }, error: null },
      update: { data: { id: UUID, name: 'Sastra Baru' }, error: null },
      delete: { data: null, error: null },
    });
    setTable('books', { count: 0 });

    const created = await CAT_POST(jsonReq('POST', '/api/categories', { name: 'Sastra' }));
    expect(created.status).toBe(201);

    const updated = await CAT_ID_PUT(
      jsonReq('PUT', `/api/categories/${UUID}`, { nama: 'Sastra Baru', is_active: false }),
      ctx
    );
    expect(updated.status).toBe(200);

    const deleted = await CAT_ID_DEL(req(`/api/categories/${UUID}`, { method: 'DELETE' }), ctx);
    expect(deleted.status).toBe(200);
  });

  it('loans: return via PUT /api/loans/[id] {action:return}', async () => {
    setTable('loans', {
      single: { data: { id: UUID, status: 'borrowed', fine_amount: 0 }, error: null },
      update: { data: { id: UUID, status: 'returned', fine_amount: 0 }, error: null },
    });
    setTable('books', { update: { data: { id: 'b1' }, error: null } });
    setTable('fines', { insert: { data: null, error: null } });
    setTable('activity_logs', { insert: { data: null, error: null } });

    const res = await LOAN_ID_PUT(jsonReq('PUT', `/api/loans/${UUID}`, { action: 'return' }), ctx);
    expect(res.status).toBe(200);
  });
});
