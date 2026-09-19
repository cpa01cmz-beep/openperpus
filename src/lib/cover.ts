const TRANSFORM_WIDTHS = [80, 400, 560, 640, 960] as const;

export function coverSrc(url: string | null | undefined, width = 400): string | null {
  if (!url) return null;
  const w = TRANSFORM_WIDTHS.includes(width as (typeof TRANSFORM_WIDTHS)[number]) ? width : 400;
  const marker = '/storage/v1/object/public/';
  if (!url.includes(marker)) return url;
  const [base, query] = url.split('?');
  const rendered = (base ?? url).replace(marker, '/storage/v1/render/image/public/');
  const params = new URLSearchParams(query ?? '');
  params.set('width', String(w));
  params.set('quality', '75');
  params.set('resize', 'cover');
  return `${rendered}?${params.toString()}`;
}
