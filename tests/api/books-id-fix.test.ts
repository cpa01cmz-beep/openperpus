import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// GAP-1 RED: PUT books/[id] must call validateBook(payload, true) before update.
describe('books/[id] PUT validation', () => {
  it('calls validateBook(payload, true) before update', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/books/[id]/route.ts'), 'utf8');
    expect(src.includes('validateBook'), 'RED: PUT missing validateBook call').toBe(true);
    expect(
      src.includes('validateBook(payload, true)') || src.includes('validateBook(payload,true)'),
      'RED: PUT must call validateBook(payload, true) (partial mode, match POST pattern)'
    ).toBe(true);
  });
});
