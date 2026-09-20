import { describe, expect, it } from 'vitest';
import * as books from '@/lib/books';

describe('books shim re-exports', () => {
  it('exposes all names used by the 13 importers', () => {
    const names = [
      'fetchArticles',
      'fetchArticleBySlug',
      'fetchBanners',
      'fetchBooks',
      'fetchBooksPaged',
      'fetchBookBySlug',
      'fetchCategories',
      'fetchPage',
      'fetchPages',
      'fetchSettings',
      'fetchStats',
      'fetchTestimonials',
      'ratingNumber',
      'stockState',
    ] as const;
    for (const n of names) {
      expect((books as Record<string, unknown>)[n], n).toBeDefined();
    }
  });
});
