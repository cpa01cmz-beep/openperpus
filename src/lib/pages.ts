import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import { type PageDoc } from '@/lib/types';

export const PAGES_TAG = 'pages';

export async function fetchPages(limit = 100): Promise<PageDoc[]> {
  return cachedFetch(() => fetchPagesUncached(limit), ['pages', String(limit)], PAGES_TAG);
}

async function fetchPagesUncached(limit = 100): Promise<PageDoc[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pages')
      .select('id,slug,title,content_md,excerpt,updated_at')
      .eq('is_active', true)
      .order('title', { ascending: true })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as PageDoc[];
  } catch {
    return [];
  }
}

export async function fetchPage(slug: string): Promise<PageDoc | null> {
  return cachedFetch(() => fetchPageUncached(slug), ['page-slug', slug], PAGES_TAG);
}

async function fetchPageUncached(slug: string): Promise<PageDoc | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pages')
      .select('id,slug,title,content_md,excerpt,updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return null;
    return data as PageDoc;
  } catch {
    return null;
  }
}
