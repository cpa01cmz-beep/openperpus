import { describe, it, expect } from 'vitest';
import { jsonError } from '../src/lib/http-error';

describe('relative import test', () => {
  it('works', () => {
    const res = jsonError('TEST', 'test', 400);
    expect(res).toBeDefined();
  });
});
