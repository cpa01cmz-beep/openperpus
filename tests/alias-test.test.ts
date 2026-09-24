import { describe, it, expect, vi } from 'vitest';

// server.ts calls react's cache() at module scope; react 18 has no cache
// outside the Next runtime, so the import must be stubbed for this alias probe.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { jsonError } from '@/lib/supabase/auth';

describe('alias test', () => {
  it('works', () => {
    const res = jsonError('TEST', 'test', 400);
    expect(res).toBeDefined();
  });
});
