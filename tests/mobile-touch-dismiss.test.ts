import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** T-M6: Dismiss/close controls min 44px + no truncated guidance on mobile.
 * RED first: OnboardingBanner close uses min-h/w-[32px]; guidance uses
 * single-line truncate; Modal close uses bare p-2 (~32-36px).
 */
describe('T-M6 onboarding + modal dismiss targets 44px', () => {
  it('OnboardingBanner close button meets 44px min size', () => {
    const src = read('src/components/public/OnboardingBanner.tsx');
    expect(src.includes('min-h-[44px]'), 'OnboardingBanner close must include min-h-[44px]').toBe(
      true
    );
    expect(src.includes('min-w-[44px]'), 'OnboardingBanner close must include min-w-[44px]').toBe(
      true
    );
  });

  it('OnboardingBanner close button has no sub-44px fixed min', () => {
    const src = read('src/components/public/OnboardingBanner.tsx');
    expect(
      src.includes('min-h-[32px]'),
      'OnboardingBanner close must not include min-h-[32px]'
    ).toBe(false);
    expect(
      src.includes('min-w-[32px]'),
      'OnboardingBanner close must not include min-w-[32px]'
    ).toBe(false);
  });

  it('OnboardingBanner guidance wraps on mobile (no single-line truncate)', () => {
    const src = read('src/components/public/OnboardingBanner.tsx');
    expect(
      src.includes('line-clamp-2'),
      'OnboardingBanner guidance must include line-clamp-2'
    ).toBe(true);
    expect(src.includes('truncate'), 'OnboardingBanner guidance must not use truncate').toBe(false);
    expect(
      src.includes('sm:whitespace-normal'),
      'OnboardingBanner guidance must keep sm:whitespace-normal'
    ).toBe(true);
  });

  it('OnboardingBanner keeps links intact', () => {
    const src = read('src/components/public/OnboardingBanner.tsx');
    expect(src.includes('href="/katalog"'), 'OnboardingBanner must keep /katalog link').toBe(true);
    expect(src.includes('href="/faq"'), 'OnboardingBanner must keep /faq link').toBe(true);
  });

  it('Modal close button meets 44px min size', () => {
    const src = read('src/components/ui/Modal.tsx');
    expect(src.includes('min-h-[44px]'), 'Modal close must include min-h-[44px]').toBe(true);
    expect(src.includes('min-w-[44px]'), 'Modal close must include min-w-[44px]').toBe(true);
  });

  it('Modal keeps focus-trap + bottom-sheet contract', () => {
    const src = read('src/components/ui/Modal.tsx');
    expect(src.includes('items-end'), 'Modal must keep bottom-sheet items-end').toBe(true);
    expect(src.includes('sm:items-center'), 'Modal must keep sm:items-center').toBe(true);
    expect(src.includes('max-h-[60dvh]'), 'Modal body must keep max-h-[60dvh]').toBe(true);
    expect(src.includes('flex-col-reverse'), 'Modal footer must keep flex-col-reverse').toBe(true);
    expect(src.includes('sm:flex-row'), 'Modal footer must keep sm:flex-row').toBe(true);
    expect(src.includes('document.addEventListener("keydown"'), 'Modal must keep focus-trap').toBe(
      true
    );
  });
});
