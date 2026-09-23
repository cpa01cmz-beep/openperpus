import { describe, it, expect } from 'vitest';
import { jsonError } from '@/lib/http-error';

describe('alias test direct', () => {
  it('works', () => {
    const res = jsonError('TEST', 'test', 400);
    expect(res).toBeDefined();
  });
});
