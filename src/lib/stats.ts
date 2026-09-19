import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';

export const STATS_TAG = 'stats';

export type LibraryStats = {
  totalBooks: number;
  totalCategories: number;
  totalArticles: number;
  totalCopies: number;
};

const EMPTY_STATS: LibraryStats = {
  totalBooks: 0,
  totalCategories: 0,
  totalArticles: 0,
  totalCopies: 0,
};

export async function fetchStats(): Promise<LibraryStats> {
  return cachedFetch(() => fetchStatsUncached(), ['stats'], STATS_TAG);
}

async function fetchStatsUncached(): Promise<LibraryStats> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_library_stats');
    if (error || !data || data.length === 0) return { ...EMPTY_STATS };
    const row = data[0] as {
      total_books: number;
      total_categories: number;
      total_articles: number;
      total_copies: number;
    };
    return {
      totalBooks: row.total_books ?? 0,
      totalCategories: row.total_categories ?? 0,
      totalArticles: row.total_articles ?? 0,
      totalCopies: row.total_copies ?? 0,
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}
