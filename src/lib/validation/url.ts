/**
 * src/lib/validation/url.ts — allowlist URL gambar & link (pure, zero-dep).
 *
 * Dipisah dari validation/content.ts (issue #68): content.ts mengimpor
 * `sanitize-html` sananya dan hanya boleh dimuat server-side. Helper di
 * berkas ini dipakai komponen client (mis. UploadInput) sehingga harus bebas
 * dependency berat supaya sanitize-html TIDAK ikut ke bundle first-load.
 */

/**
 * Allowlist URL gambar tempel (client + server berbagi fungsi ini).
 * - Relative "/..." (single-slash) -> boleh (mis. /og-default.jpg).
 * - Absolute -> wajib https: + hostname *.supabase.co.
 * - Tolak javascript:/data:/blob:/vbscript:/file: dan http polos.
 * - String kosong -> true (field opsional; kosong berarti "tanpa gambar").
 */
export function isAllowedImageUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return true;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return false;
  }
  // Relative single-slash (tolak protocol-relative "//evil").
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host.endsWith('.supabase.co');
}

export function isAllowedLinkUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  // Browser membuang tab/newline di mana pun + C0 control/spasi di kedua ujung
  // saat parse URL — fail-closed: tolak bila masih ada C0/DEL agar
  // "<C0>javascript:..." tak lolos guard tapi jadi javascript: saat render.
  const noTabNl = url.replace(/[\t\n\r]/g, '');
  if (/[\x00-\x1F\x7F]/.test(noTabNl)) return false;
  const cleaned = noTabNl.replace(/^[\x20]+|[\x20]+$/g, '');
  if (cleaned === '') return true;
  if (cleaned.startsWith('//')) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase();
  if (!scheme) return true; // tanpa skema — bukan vektor skema-XSS
  return (
    scheme === 'https' ||
    scheme === 'http' ||
    scheme === 'mailto' ||
    scheme === 'tel' ||
    scheme === 'sms'
  );
}
