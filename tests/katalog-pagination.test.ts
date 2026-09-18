import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('T-S2 katalog server pagination', () => {
  it('drives server pagination, not limit(500) dump', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(public)/katalog/page.tsx'), 'utf8');
    expect(src.includes('limit(500)') || src.includes('limit: 500'), 'T-S2 RED: katalog still dumps limit(500) instead of server pagination (searchParams page/per_page)').toBe(false);
    expect(/searchParams|page.*per_page|per_page.*page/i.test(src), 'T-S2 RED: katalog page must read searchParams page/per_page for server pagination').toBe(true);
  });
});
