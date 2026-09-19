import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import { type Testimonial } from '@/lib/types';

export const TESTIMONIALS_TAG = 'testimonials';

/** Testimoni aktif. */
export async function fetchTestimonials(limit = 6): Promise<Testimonial[]> {
  return cachedFetch(
    () => fetchTestimonialsUncached(limit),
    ['testimonials', String(limit)],
    TESTIMONIALS_TAG
  );
}

async function fetchTestimonialsUncached(limit = 6): Promise<Testimonial[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('testimonials')
      .select('id,name,role,content,avatar_url,rating')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Testimonial[];
  } catch {
    return [];
  }
}
