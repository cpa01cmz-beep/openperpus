import { createPublicClient as createClient } from '@/lib/supabase/public';
import { cachedFetch } from '@/lib/fetch-cache';
import { fetchMenuPages } from '@/lib/pages';
import type { NavItem } from '@/lib/types';

export type { NavItem };
import { LINKS, FOOTER_LINKS } from '@/components/layout/variants/shared';

/** Baris menus dari DB (subset yang dipakai publik). */
export type MenuRow = {
  id: string;
  label: string;
  url: string;
  position: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  target: string | null;
};

export const MENUS_TAG = 'menus';

/** Ubah baris DB -> NavItem (abaikan yang tanpa label/url). */
export function toNavItems(rows: MenuRow[]): NavItem[] {
  return (rows ?? [])
    .filter((r) => r.label?.trim() && r.url?.trim())
    .map((r) => ({
      href: r.url.trim(),
      label: r.label.trim(),
      target: r.target === '_blank' ? '_blank' : '_self',
    }));
}

/** Normalisasi href untuk dedup: lowercase + tanpa trailing slash (kecuali root). */
function normHref(href: string): string {
  const h = href.trim().toLowerCase();
  return h.length > 1 ? h.replace(/\/+$/, '') : h;
}

/** Gabung halaman show_in_menu sebagai NavItem bila href-nya belum ada (header & footer). */
async function appendMenuPages(items: NavItem[]): Promise<NavItem[]> {
  try {
    const pages = await fetchMenuPages();
    if (!pages || pages.length === 0) return items;
    const seen = new Set(items.map((i) => normHref(i.href)));
    const extra: NavItem[] = [];
    for (const p of pages) {
      const slug = p.slug?.trim();
      const title = p.title?.trim();
      if (!slug || !title) continue;
      const href = `/halaman/${slug}`;
      if (seen.has(normHref(href))) continue;
      seen.add(normHref(href));
      extra.push({ href, label: title });
    }
    return [...items, ...extra];
  } catch {
    return items;
  }
}

async function fetchMenusUncached(position: 'header' | 'footer'): Promise<NavItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('menus')
      .select('id,label,url,position,parent_id,sort_order,is_active,target')
      .eq('is_active', true)
      .eq('position', position)
      .order('sort_order', { ascending: true });
    const base =
      error || !data || data.length === 0
        ? position === 'header'
          ? [...LINKS]
          : [...FOOTER_LINKS]
        : (() => {
            const items = toNavItems(data as MenuRow[]);
            return items.length > 0
              ? items
              : position === 'header'
                ? [...LINKS]
                : [...FOOTER_LINKS];
          })();
    return appendMenuPages(base);
  } catch {
    const base = position === 'header' ? [...LINKS] : [...FOOTER_LINKS];
    return appendMenuPages(base);
  }
}

/** Menu header aktif (CMS -> fallback LINKS bila kosong/error, + halaman show_in_menu). */
export async function fetchHeaderMenus(): Promise<NavItem[]> {
  return cachedFetch(() => fetchMenusUncached('header'), ['menus', 'header'], MENUS_TAG);
}

/** Menu footer aktif (CMS -> fallback FOOTER_LINKS bila kosong/error, + halaman show_in_menu). */
export async function fetchFooterMenus(): Promise<NavItem[]> {
  return cachedFetch(() => fetchMenusUncached('footer'), ['menus', 'footer'], MENUS_TAG);
}
