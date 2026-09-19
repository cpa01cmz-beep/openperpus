import { unstable_cache } from 'next/cache';

export const REVALIDATE_DEFAULT = 60;

export function cachedFetch<T>(
  fn: () => Promise<T>,
  key: string[],
  tag: string,
  revalidate = REVALIDATE_DEFAULT
): Promise<T> {
  return unstable_cache(fn, key, { tags: [tag], revalidate })();
}

export function taggedQuery(tag: string, revalidate = REVALIDATE_DEFAULT) {
  return function run<T>(fn: () => Promise<T>, key: string[]): Promise<T> {
    return cachedFetch(fn, key, tag, revalidate);
  };
}
