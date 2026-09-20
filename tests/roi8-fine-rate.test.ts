import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi8 Tarif denda configurable — RED first.
// Rate column on settings surface (fine_per_day), single source consumed by
// calcFine, return_loan SQL, UI copy. Validate >0 else 422.

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

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setSettingsMock(opts: {
  role?: string;
  userId?: string | null;
  current?: Record<string, unknown>;
  capture?: { payload: Record<string, unknown> | null };
}) {
  const { capture } = opts;
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { role: opts.role ?? 'admin' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'library_settings') {
      const chain: Record<string, unknown> = {};
      let isUpdate = false;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: opts.current ?? { id: 1 }, error: null });
      chain.update = (p: Record<string, unknown>) => {
        isUpdate = true;
        if (capture) capture.payload = p;
        return chain;
      };
      chain.single = async () => {
        if (isUpdate)
          return { data: { ...(opts.current ?? {}), ...(capture?.payload ?? {}) }, error: null };
        return { data: opts.current ?? null, error: null };
      };
      return chain;
    }
    if (table === 'activity_logs') return { insert: async () => ({ error: null }) };
    return {};
  });
  setGlobal({
    auth: {
      getUser: async () =>
        opts.userId === null
          ? { data: { user: null }, error: { message: 'no session' } }
          : { data: { user: { id: opts.userId ?? 'U-ADMIN' } }, error: null },
    },
    from,
  });
}

describe('S-roi8 configurable fine rate', () => {
  it('RATE-01 settings PUT menerima fine_per_day + GET mengembalikannya', async () => {
    const { PUT, GET } = (await import('@/app/api/settings/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
      GET: (req: Request) => Promise<Response>;
    };
    const capture: { payload: Record<string, unknown> | null } = { payload: null };
    setSettingsMock({ current: { id: 1, fine_per_day: 1000 }, capture });
    const res = await PUT(putReq('http://localhost/api/settings', { fine_per_day: 2500 }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { fine_per_day: number } };
    expect(j.data.fine_per_day, 'RED: PUT must persist fine_per_day').toBe(2500);

    const resGet = await GET(new Request('http://localhost/api/settings'));
    expect(resGet.status).toBe(200);
    const jg = (await resGet.json()) as { data: { fine_per_day: number } };
    expect(jg.data.fine_per_day, 'RED: GET must return fine_per_day').toBeDefined();
  });

  it('RATE-02 late return memakai configured rate (bukan hardcode 1000)', async () => {
    // Kanonis di finecalc.ts (auth.ts shim re-export).
    const auth = read('src/lib/finecalc.ts');
    expect(auth, 'RED: calcFine must accept rate as 3rd param').toMatch(
      /export function calcFine\(\s*dueDate[^=]*=\s*new Date\(\)[\s\S]*?rate/
    );
    const mig = read('supabase/migrations/0014_fine_rate.sql');
    expect(mig, 'RED: migration must add fine_per_day column').toMatch(/fine_per_day/);
    expect(mig, 'RED: return_loan must accept optional rate param').toMatch(/p_fine_per_day/);
  });

  it('RATE-03 UI menampilkan tarif di mana-mana (Modal peminjaman + denda + admin dashboard)', () => {
    const modal = read('src/app/admin/peminjaman/page.tsx');
    expect(modal, 'RED: peminjaman Modal copy must show configured rate').toMatch(
      /fine_per_day|tarif|Tarif/
    );
    const denda = read('src/app/admin/denda/page.tsx');
    expect(denda, 'RED: denda page must show configured rate').toMatch(/fine_per_day|tarif|Tarif/);
    const form = read('src/components/admin/SettingsForm.tsx');
    expect(form, 'RED: SettingsForm must have rate field').toMatch(/fine_per_day|denda_per_hari/i);
  });

  it('RATE-04 0/negatif → 422', async () => {
    const { PUT } = (await import('@/app/api/settings/route')) as unknown as {
      PUT: (req: Request) => Promise<Response>;
    };
    for (const bad of [0, -500, -1]) {
      setSettingsMock({ current: { id: 1, fine_per_day: 1000 } });
      const res = await PUT(putReq('http://localhost/api/settings', { fine_per_day: bad }));
      expect(res.status, `RED: fine_per_day=${bad} must be 422`).toBe(422);
      const j = (await res.json()) as { error: { code: string } };
      expect(j.error.code).toBe('VALIDATION');
    }
  });
});
