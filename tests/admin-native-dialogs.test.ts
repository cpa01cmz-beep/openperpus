import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// S-issue-60: nol alert()/confirm()/prompt() di panel admin + pencarian
// sirkulasi lintas relasi (member_code/judul) + Badge/EmptyState konsisten.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function collectTsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...collectTsx(full));
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(full);
  }
  return out;
}

const NATIVE_CONFIRM = /\bconfirm\s*\(/;
const NATIVE_ALERT = /\balert\s*\(/;
const NATIVE_PROMPT = /\bprompt\s*\(/;

function offenders(dir: string, re: RegExp): string[] {
  return collectTsx(dir)
    .filter((f) => re.test(readFileSync(f, 'utf8')))
    .map((f) => f.slice(ROOT.length + 1));
}

describe('S-issue-60 zero native dialogs di admin', () => {
  for (const [dir, label] of [
    ['src/app/admin', 'src/app/admin'],
    ['src/components/admin', 'src/components/admin'],
  ] as const) {
    it(`${label}: nol window.confirm()`, () => {
      expect(offenders(join(ROOT, dir), NATIVE_CONFIRM), 'native confirm()').toEqual([]);
    });
    it(`${label}: nol alert()`, () => {
      expect(offenders(join(ROOT, dir), NATIVE_ALERT), 'native alert()').toEqual([]);
    });
    it(`${label}: nol prompt()`, () => {
      expect(offenders(join(ROOT, dir), NATIVE_PROMPT), 'native prompt()').toEqual([]);
    });
  }

  it('semua halaman daftar admin memakai ConfirmModal', () => {
    for (const f of [
      'src/app/admin/kategori/page.tsx',
      'src/app/admin/rak/page.tsx',
      'src/app/admin/menu/page.tsx',
      'src/app/admin/layanan/page.tsx',
      'src/app/admin/banner/page.tsx',
      'src/app/admin/artikel/page.tsx',
      'src/app/admin/buku/page.tsx',
      'src/app/admin/anggota/page.tsx',
      'src/app/admin/reservasi/page.tsx',
      'src/app/admin/denda/page.tsx',
    ]) {
      expect(read(f), `${f} harus impor ConfirmModal`).toContain(
        "import ConfirmModal from '@/components/admin/ConfirmModal'"
      );
    }
  });
});

describe('S-issue-60 pencarian sirkulasi (overdue via member_code)', () => {
  for (const [file, api, searchLabel] of [
    ['src/app/admin/peminjaman/page.tsx', '/api/loans', 'peminjaman-search'],
    ['src/app/admin/reservasi/page.tsx', '/api/reservations', 'reservasi-search'],
    ['src/app/admin/denda/page.tsx', '/api/fines', 'denda-search'],
  ] as const) {
    it(`${file}: kotak pencarian ${searchLabel} mengirim q ke ${api}`, () => {
      const src = read(file);
      expect(src, `${file} harus punya input pencarian ${searchLabel}`).toContain(searchLabel);
      expect(src, `${file} harus mengirim parameter q`).toMatch(/q: search/);
      expect(src, `${file} harus fetch ${api}`).toContain(api);
    });
  }

  it('peminjaman/reservasi/denda memakai FilterBar standar + per_page 20', () => {
    for (const f of [
      'src/app/admin/peminjaman/page.tsx',
      'src/app/admin/reservasi/page.tsx',
      'src/app/admin/denda/page.tsx',
    ]) {
      const src = read(f);
      expect(src, `${f} harus memakai FilterBar`).toContain('<FilterBar');
      expect(src, `${f} harus pakai per_page 20`).toContain("per_page: '20'");
    }
  });

  it('tabel sirkulasi merender status via StatusBadge + EmptyState', () => {
    for (const f of [
      'src/app/admin/peminjaman/page.tsx',
      'src/app/admin/reservasi/page.tsx',
      'src/app/admin/denda/page.tsx',
    ]) {
      const src = read(f);
      expect(src, `${f} harus pakai StatusBadge`).toContain('<StatusBadge');
      expect(src, `${f} harus pakai emptyState`).toContain('emptyState=');
    }
  });
});

// ---------------------------------------------------------------------------
// API: pencarian lintas relasi + sort server-side (dengan mock supabase).
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { GET as LOANS_GET } from '@/app/api/loans/route';
import { GET as RESERVATIONS_GET } from '@/app/api/reservations/route';
import { GET as FINES_GET } from '@/app/api/fines/route';
import { GET as MEMBERS_GET } from '@/app/api/members/route';

type Seen = { or: string[]; order: { col: string; opts?: unknown }[] };

/**
 * Mock supabase untuk GET route. `session: true` untuk route berbasis
 * getSession (reservations/fines) yang mencari members milik user; false untuk
 * requireStaff (loans/members) yang query tabel itu sebagai daftar.
 */
function setStaffMock(seen: Seen, opts?: { session?: boolean }): void {
  const maybeSingleish = (data: unknown) => ({ maybeSingle: async () => ({ data, error: null }) });
  const bothish = (data: unknown) => ({
    single: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
  });
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => bothish({ role: 'admin' }) }) };
    }
    if (table === 'members' && opts?.session) {
      return { select: () => ({ eq: () => maybeSingleish({ id: 'M-1' }) }) };
    }
    const c: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'lt', 'gt', 'gte', 'range', 'ilike']) c[m] = () => c;
    c.select = () => c;
    c.order = (col: string, o?: unknown) => {
      seen.order.push({ col, opts: o });
      return c;
    };
    c.or = (expr: string) => {
      seen.or.push(expr);
      return c;
    };
    (c as { then?: unknown }).then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(res);
    return c;
  });
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'U-1' } }, error: null }) },
    from,
  };
}

let seen: Seen;
beforeEach(() => {
  seen = { or: [], order: [] };
  setStaffMock(seen);
});

describe('S-issue-60 API q lintas relasi', () => {
  it('GET /api/loans?q= mencari member_code + judul buku + catatan', async () => {
    const res = await LOANS_GET(new Request('http://localhost/api/loans?q=AG-1'));
    expect(res.status).toBe(200);
    expect(seen.or.join(' ')).toContain('members.member_code.ilike.%AG-1%');
    expect(seen.or.join(' ')).toContain('books.title.ilike.%AG-1%');
    expect(seen.or.join(' ')).toContain('notes.ilike.%AG-1%');
  });

  it('GET /api/loans tanpa q tidak memfilter or()', async () => {
    const res = await LOANS_GET(new Request('http://localhost/api/loans'));
    expect(res.status).toBe(200);
    expect(seen.or).toEqual([]);
  });

  it('GET /api/reservations?q= mencari member_code + judul buku', async () => {
    setStaffMock(seen, { session: true });
    const res = await RESERVATIONS_GET(new Request('http://localhost/api/reservations?q=budi'));
    expect(res.status).toBe(200);
    expect(seen.or.join(' ')).toContain('members.member_code.ilike.%budi%');
    expect(seen.or.join(' ')).toContain('books.title.ilike.%budi%');
  });

  it('GET /api/fines?q= mencari member_code', async () => {
    setStaffMock(seen, { session: true });
    const res = await FINES_GET(new Request('http://localhost/api/fines?q=AG-9'));
    expect(res.status).toBe(200);
    expect(seen.or.join(' ')).toContain('members.member_code.ilike.%AG-9%');
  });

  it('q dengan karakter PostgREST berbahaya disanitasi (sanitizeIlike)', async () => {
    setStaffMock(seen, { session: true });
    await FINES_GET(new Request('http://localhost/api/fines?q=%25%2C%28 hack'));
    // % , ( dihilangkan sanitizeIlike -> hanya "hack" yang tersisa
    expect(seen.or.join(' ')).toContain('members.member_code.ilike.%hack%');
  });
});

describe('S-issue-60 API sort server-side /api/members', () => {
  it('sort=member_code&order=asc -> order kolom sendiri', async () => {
    const res = await MEMBERS_GET(
      new Request('http://localhost/api/members?sort=member_code&order=asc')
    );
    expect(res.status).toBe(200);
    expect(seen.order[0]).toEqual({ col: 'member_code', opts: { ascending: true } });
  });

  it('sort=full_name -> order kolom embedded profiles (inner join aman: FK NOT NULL)', async () => {
    const res = await MEMBERS_GET(new Request('http://localhost/api/members?sort=full_name'));
    expect(res.status).toBe(200);
    expect(seen.order[0]).toEqual({
      col: 'full_name',
      opts: { referencedTable: 'profiles', ascending: true },
    });
  });

  it('sort ngawur -> fallback created_at desc (perilaku lama)', async () => {
    const res = await MEMBERS_GET(new Request('http://localhost/api/members?sort=hacked'));
    expect(res.status).toBe(200);
    expect(seen.order[0]).toEqual({ col: 'created_at', opts: { ascending: false } });
  });

  it('q mencari juga profiles.full_name', async () => {
    const res = await MEMBERS_GET(new Request('http://localhost/api/members?q=budi'));
    expect(res.status).toBe(200);
    expect(seen.or.join(' ')).toContain('profiles.full_name.ilike.%budi%');
  });
});
