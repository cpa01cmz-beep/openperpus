import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import { type Article } from '@/lib/types';

export const ARTICLES_TAG = 'articles';

/** Artikel published terbaru. */
export async function fetchArticles(limit = 3): Promise<Article[]> {
  return cachedFetch(() => fetchArticlesUncached(limit), ['articles', String(limit)], ARTICLES_TAG);
}

async function fetchArticlesUncached(limit = 3): Promise<Article[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,excerpt,content_md,cover_url,category,published_at,views')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Article[];
  } catch {
    return [];
  }
}

export async function fetchArticleBySlug(slug: string): Promise<Article | null> {
  return cachedFetch(() => fetchArticleBySlugUncached(slug), ['article-slug', slug], ARTICLES_TAG);
}

async function fetchArticleBySlugUncached(slug: string): Promise<Article | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,excerpt,content_md,cover_url,category,published_at,views')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error || !data) return null;
    return data as Article;
  } catch {
    return null;
  }
}
