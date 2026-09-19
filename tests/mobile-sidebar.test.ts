import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/components/admin/Sidebar.tsx'), 'utf8');

describe('T-M3 sidebar toggle+nav 44px', () => {
  it('has >=2 min-h-[44px] hits (toggle + nav links)', () => {
    const hits = (src.match(/min-h-\[44px\]/g) ?? []).length;
    expect(hits, `expected >=2 min-h-[44px] hits, got ${hits}`).toBeGreaterThanOrEqual(2);
  });

  it('toggle meets 44px min size', () => {
    expect(src.includes('min-h-[44px]')).toBe(true);
    expect(src.includes('min-w-[44px]')).toBe(true);
  });

  it('nav links are flex items-center with min height', () => {
    expect(src.includes('flex items-center')).toBe(true);
  });

  it('keeps usePathname + drawer behavior', () => {
    expect(src.includes('usePathname')).toBe(true);
    expect(src.includes('setOpen')).toBe(true);
  });
});
