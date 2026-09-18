import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('T-S1 book validation schema', () => {
  it('bookSchema accepts valid book and rejects title<3 chars', async () => {
    const p = join(process.cwd(), 'src/lib/validation.ts');
    expect(existsSync(p), 'T-S1 RED: src/lib/validation.ts missing — bookSchema not yet extracted from inline validateBook in src/app/api/books/route.ts').toBe(true);
    const mod = (await import('../../src/lib/validation')) as Record<string, any>;
    const schema = mod.bookSchema ?? mod.bookValidator ?? mod.validateBook;
    expect(schema, 'T-S1 RED: src/lib/validation.ts must export bookSchema (or validateBook equivalent)').toBeDefined();
    const valid = { title: 'Laskar Pelangi', author: 'Andrea Hirata' };
    const short = { title: 'AB', author: 'Andrea Hirata' };
    if (typeof schema.safeParse === 'function') {
      expect(schema.safeParse(valid).success, 'T-S1 RED: bookSchema must accept a valid book').toBe(true);
      expect(schema.safeParse(short).success, 'T-S1 RED: bookSchema must reject title<3 chars').toBe(false);
    } else if (typeof schema.parse === 'function') {
      expect(() => schema.parse(valid), 'T-S1 RED: bookSchema must accept a valid book').not.toThrow();
      expect(() => schema.parse(short), 'T-S1 RED: bookSchema must reject title<3 chars').toThrow();
    } else {
      expect(schema(valid, true), 'T-S1 RED: validateBook must accept a valid book').toBeNull();
      expect(schema(short, true), 'T-S1 RED: validateBook must reject title<3 chars').not.toBeNull();
    }
  });
});
