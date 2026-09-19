import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import { type Banner } from '@/lib/types';

export const BANNERS_TAG = 'banners';

/** Banner hero aktif, urut sort_order. */
export async function fetchBanners(): Promise<Banner[]> {
  return cachedFetch(() => fetchBannersUncached(), ['banners'], BANNERS_TAG);
}

async function fetchBannersUncached(): Promise<Banner[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('banners')
      .select('id,title,subtitle,image_url,link,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(6);
    if (error) return [];
    return (data ?? []) as Banner[];
  } catch {
    return [];
  }
}
