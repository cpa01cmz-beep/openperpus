import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi10 Daftar anggota mandiri — RED first.
// PUBLIC POST /api/register: validasi -> 422 VALIDATION, duplikat -> 409 CONFLICT,
// sukses -> 201 {data} status pending + member_code auto AG-YYYYMM-xxxx.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function postReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type RegisterMockOpts = {
  existingProfile?: { id: string } | null;
  existingMember?: { id: string } | null;
  signUpUser?: { id: string; email: string } | null;
  signUpError?: { message: string } | null;
  profileInsertError?: { code?: string; message: string } | null;
  memberInsertError?: { code?: string; message: string } | null;
};

function setRegisterMock(opts: RegisterMockOpts = {}) {
  const inserted: { table: string; payload: unknown }[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      const chain: Record<string, unknown> = {};
      let lastEq: { col: string; val: unknown } | null = null;
      let insertPayload: unknown = null;
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        lastEq = { col, val };
        return chain;
      };
      chain.insert = (p: unknown) => {
        insertPayload = p;
        inserted.push({ table, payload: p });
        return chain;
      };
      chain.single = async () => {
        if (insertPayload !== null) {
          if (opts.profileInsertError) return { data: null, error: opts.profileInsertError };
          const row = insertPayload as Record<string, unknown>;
          return {
            data: { id: (row.id as string) ?? 'new-user-id', ...(row as object) },
            error: null,
          };
        }
        // duplicate lookup by email
        if (lastEq?.col === 'email') return { data: opts.existingProfile ?? null, error: null };
        return { data: null, error: null };
      };
      return chain;
    }
    if (table === 'members') {
      const chain: Record<string, unknown> = {};
      let lastEq: { col: string; val: unknown } | null = null;
      let insertPayload: unknown = null;
      chain.select = () => chain;
      chain.eq = (col: string, val: unknown) => {
        lastEq = { col, val };
        return chain;
      };
      chain.insert = (p: unknown) => {
        insertPayload = p;
        inserted.push({ table, payload: p });
        return chain;
      };
      chain.single = async () => {
        if (insertPayload !== null) {
          if (opts.memberInsertError) return { data: null, error: opts.memberInsertError };
          return { data: { ...(insertPayload as object) }, error: null };
        }
        if (lastEq?.col === 'member_code')
          return { data: opts.existingMember ?? null, error: null };
        return { data: null, error: null };
      };
      return chain;
    }
    if (table === 'activity_logs') {
      return {
        insert: async (p: unknown) => {
          inserted.push({ table, payload: p });
          return { error: null };
        },
      };
    }
    return {};
  });
  setGlobal({
    auth: {
      signUp: async () => {
        if (opts.signUpError) return { data: { user: null }, error: opts.signUpError };
        return {
          data: { user: opts.signUpUser ?? { id: 'new-user-id', email: 'a@b.id' } },
          error: null,
        };
      },
    },
    from,
  });
  return { inserted };
}

async function getPOST() {
  const mod = (await import('@/app/api/register/route')) as unknown as {
    POST: (req: Request) => Promise<Response>;
  };
  return mod.POST;
}

const validBody = {
  nama: 'Budi Santoso',
  email: 'budi@example.id',
  password: 'rahasia123',
  phone: '08123456789',
  address: 'Jl. Merdeka 1',
};

describe('S-roi10 daftar anggota mandiri', () => {
  it('REGISTER-01 payload invalid -> 422 VALIDATION', async () => {
    const POST = await getPOST();
    setRegisterMock({});
    const res = await POST(
      postReq('http://localhost/api/register', { nama: '', email: 'bukan-email' })
    );
    expect(res.status, 'RED: invalid payload must be 422').toBe(422);
    const j = (await res.json()) as { code?: string; error?: { code?: string } };
    expect(j.code ?? j.error?.code, 'RED: code must be VALIDATION').toMatch(/VALIDATION/);
  });

  it('REGISTER-02 email duplikat -> 409 CONFLICT', async () => {
    const POST = await getPOST();
    setRegisterMock({ existingProfile: { id: 'existing-id' } });
    const res = await POST(postReq('http://localhost/api/register', validBody));
    expect(res.status, 'RED: duplicate email must be 409').toBe(409);
    const j = (await res.json()) as { code?: string; error?: { code?: string } };
    expect(j.code ?? j.error?.code, 'RED: code must be CONFLICT').toMatch(/CONFLICT/);
  });

  it('REGISTER-03 member_code duplikat -> 409 CONFLICT', async () => {
    const POST = await getPOST();
    setRegisterMock({ existingMember: { id: 'm-1' } });
    const res = await POST(
      postReq('http://localhost/api/register', { ...validBody, member_code: 'AG-202501-0001' })
    );
    expect(res.status, 'RED: duplicate member_code must be 409').toBe(409);
    const j = (await res.json()) as { code?: string; error?: { code?: string } };
    expect(j.code ?? j.error?.code, 'RED: code must be CONFLICT').toMatch(/CONFLICT/);
  });

  it('REGISTER-04 valid -> 201 {data} status pending', async () => {
    const POST = await getPOST();
    setRegisterMock({ signUpUser: { id: 'u-baru', email: validBody.email } });
    const res = await POST(postReq('http://localhost/api/register', validBody));
    expect(res.status, 'RED: valid register must be 201').toBe(201);
    const j = (await res.json()) as { data: { status?: string } };
    expect(j.data, 'RED: 201 must carry {data}').toBeDefined();
    expect(j.data.status, 'RED: new member must be pending').toBe('pending');
  });

  it('REGISTER-05 member_code auto AG-YYYYMM-xxxx bila absen', async () => {
    const POST = await getPOST();
    const { inserted } = setRegisterMock({ signUpUser: { id: 'u-baru', email: validBody.email } });
    const res = await POST(postReq('http://localhost/api/register', validBody));
    expect(res.status).toBe(201);
    const row = inserted.find((r) => r.table === 'members')?.payload as {
      member_code?: string;
    };
    expect(row?.member_code, 'RED: member_code must auto-generate').toMatch(/^AG-\d{6}-\d{4}$/);
  });

  it('REGISTER-06 halaman daftar: form + notice pending', () => {
    const ui = read('src/app/daftar/page.tsx');
    expect(ui, 'RED: daftar page must post to /api/register').toMatch(/\/api\/register/);
    expect(ui, 'RED: daftar page must show pending notice').toMatch(
      /menunggu aktivasi pustakawan/i
    );
  });
});
