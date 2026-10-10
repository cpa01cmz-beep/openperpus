import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';

export const SERVICES_TAG = 'services';

export type ServiceItem = {
  id: string;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
};

export async function fetchServices(): Promise<ServiceItem[]> {
  return cachedFetch(() => fetchServicesUncached(), ['services'], SERVICES_TAG);
}

async function fetchServicesUncached(): Promise<ServiceItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('services')
      .select('id,title,description,icon,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) return [];
    return (data ?? []) as ServiceItem[];
  } catch {
    return [];
  }
}
