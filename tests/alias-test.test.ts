import { describe, it, expect } from 'vitest';
import { jsonError } from '@/lib/supabase/auth';

describe('alias test', () => {
  it('works', () => {
    const res = jsonError('TEST', 'test', 400);
    expect(res).toBeDefined();
  });
});
