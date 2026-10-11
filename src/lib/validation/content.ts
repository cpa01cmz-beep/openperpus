/**
 * src/lib/validation/content.ts — content validation & HTML sanitization (Fix4b).
 * Extracted from content-validation.ts (barrel shim at index.ts).
 * Dependency-free except sanitize-html at runtime.
 */

/** Batas panjang per entitas per field (karakter). */
export const CONTENT_LIMITS = {
  settings: {
    welcome_text: 2000,
    vision: 2000,
    mission: 5000,
    about: 10000,
    announcement: 1000,
  },
  pages: {
    title: 300,
    content_md: 50000,
    excerpt: 500,
    seo_title: 200,
    seo_desc: 500,
  },
  articles: {
    title: 300,
    content_md: 50000,
    excerpt: 500,
  },
  testimonials: {
    name: 200,
    content: 2000,
    role: 200,
  },
} as const;

import sanitizeHtml from 'sanitize-html';
// Issue #68: helper URL pure dipindah ke ./url agar komponen client bisa
// memakannya tanpa menarik sanitize-html ke bundle. isAllowedLinkUrl masih
// dipakai di berkas ini (sanitizeContentPayload).
import { isAllowedLinkUrl } from './url';

// Re-export kompatibilitas: import lama `from './validation/content'` tetap
// jalan. Konsumen CLIENT wajib impor langsung dari '@/lib/validation/url'.
export { isAllowedImageUrl, isAllowedLinkUrl } from './url';

export type ContentEntity = keyof typeof CONTENT_LIMITS;

/**
 * Sanitasi HTML via sanitize-html (allowlist ketat, parser murni tanpa DOM)
 * + jaring regex sebagai lapis akhir.
 * Tag inline jinak (b/i/u/p/br/ul/ol/li/a/strong/em) dipertahankan; elemen
 * berbahaya (script/style/iframe/object/embed/form/svg/math/dll), event-handler
 * inline, srcdoc/xlink:href/formaction, style-expression, dan URL
 * javascript:/data:/vbscript: dibuang/dinetralkan.
 * Mengembalikan string kosong untuk input non-string.
 */
export function sanitizeHtmlContent(input: unknown): string {
  if (typeof input !== 'string') return '';
  try {
    const clean = sanitizeHtml(input, {
      allowedTags: ['b', 'i', 'u', 'p', 'br', 'ul', 'ol', 'li', 'a', 'strong', 'em'],
      allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowProtocolRelative: false,
      disallowedTagsMode: 'discard',
    });
    return regexStrip(clean);
  } catch {
    return regexStrip(input);
  }
}

function regexStrip(input: string): string {
  let out = input;
  // Hapus komentar HTML (bypass via <!-- -->).
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // Hapus elemen berbahaya beserta isinya (non-greedy, case-insensitive).
  // Ditambah svg/math/base (stored-XSS vector) + srcdoc carrier (iframe).
  out = out.replace(
    /<(script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ''
  );
  // Hapus tag berbahaya yang self-closing / tanpa pasangan.
  out = out.replace(
    /<\/?(script|style|iframe|object|embed|form|input|button|link|meta|base)[^>]*>/gi,
    ''
  );
  // Hapus event handler inline: on*=... (quoted maupun unquoted).
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Hapus atribut carrier eksplisit: srcdoc / xlink:href / formaction.
  out = out.replace(/\s+srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/\s+xlink:href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/\s+formaction\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Hapus atribut style yang memuat expression()/javascript:/vbscript:/behaviour
  // (css-expression XSS); style jinak tanpa pola itu dipertahankan.
  out = out.replace(
    /\s+style\s*=\s*("[^"]*(?:expression\s*\(|javascript\s*:|vbscript\s*:|behaviour|binding)[^"]*"|'[^']*(?:expression\s*\(|javascript\s*:|vbscript\s*:|behaviour|binding)[^']*')/gi,
    ''
  );
  // Netralkan javascript:/data:/vbscript: URL di href/src/action (quoted).
  out = out.replace(
    /\s(href|src|action)\s*=\s*("|\')\s*(javascript|data|vbscript)\s*:[^"']*("|\')/gi,
    ' $1="#"'
  );
  // Varian unquoted: href=javascript:... / src=data:... tanpa quotes.
  out = out.replace(/\s(href|src|action)\s*=\s*(javascript|data|vbscript)\s*:[^\s>]+/gi, ' $1="#"');
  // Sapuan akhir: sisa skema berbahaya dalam nilai atribut (mis. <math href> lolos
  // karena svg/math sudah dibuang di atas, ini jaring pengaman).
  out = out.replace(/\s(href|src)\s*=\s*javascript\s*:[^\s>]+/gi, ' $1="#"');
  return out;
}

/**
 * Allowlist URL gambar tempel — implementasi tinggal di ./url (pure).
 * Dipakai content.ts ini via import di atas dan client via '@/lib/validation/url'.
 */

type FieldMap = Record<string, unknown>;

/**
 * Validasi batas panjang per field untuk entitas konten.
 * Mengembalikan pesan error, atau null bila valid. Field tak dikenal diabaikan
 * (allowlist kolom tetap milik masing-masing route via ALLOWED/normalize).
 */
export function validateContentFields(entity: ContentEntity, fields: FieldMap): string | null {
  const limits = CONTENT_LIMITS[entity] as Readonly<Record<string, number>>;
  for (const [field, value] of Object.entries(fields)) {
    const max = limits[field];
    if (max === undefined) continue;
    if (value === null || value === undefined || value === '') continue;
    const str = String(value);
    if (str.length > max) {
      return `${field} maksimal ${max} karakter (diterima ${str.length}).`;
    }
  }
  return null;
}

/**
 * Escape `<` untuk payload JSON-LD di `dangerouslySetInnerHTML` — satu-satunya
 * penahan breakout `</script>` dari data dinamis (settings/buku). Satu helper
 * agar grep/refactor menemukan semua sink; jangan inline `.replace` per file.
 */
export function escapeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(/</g, '\\u003c');
}

/**
 * Guard skema URL untuk field link (mis. socials settings) yang dirender
 * sebagai `href` — implementasi tinggal di ./url (pure, dipakai berkas ini
 * lewat import di atas). Kontrak: nilai berskema wajib
 * https:/http:/mailto:/tel:/sms:; javascript:, data:, vbscript:, file:, dan
 * skema tak dikenal ditolak; nilai tanpa skema (nomor telepon mis.
 * socials.whatsapp, path relatif) dibiarkan; protocol-relative (//evil),
 * tab/newline antar karakter skema, dan C0 control/DEL di mana pun (browser
 * membuangnya saat parse URL — WHATWG — sehingga guard lolos tapi render jadi
 * `javascript:`) ditolak fail-closed; string kosong = true.
 */

/**
 * Sanitasi in-place untuk field HTML bebas pada payload yang sudah dinormalisasi.
 * Untuk entity 'settings' juga memfilter nilai socials ber-skema berbahaya.
 * Mengembalikan payload yang sama (mutasi dangkal) demi call-site minimal.
 */
export function sanitizeContentPayload(entity: ContentEntity, payload: FieldMap): FieldMap {
  const htmlFields: Record<ContentEntity, string[]> = {
    settings: ['welcome_text', 'vision', 'mission', 'about', 'announcement'],
    pages: ['content_md', 'excerpt'],
    articles: ['content_md', 'excerpt'],
    testimonials: ['content'],
  };
  for (const field of htmlFields[entity]) {
    if (typeof payload[field] === 'string') {
      payload[field] = sanitizeHtmlContent(payload[field]);
    }
  }
  if (entity === 'settings' && payload.socials && typeof payload.socials === 'object') {
    const soc = payload.socials as Record<string, unknown>;
    payload.socials = Object.fromEntries(
      Object.entries(soc).filter(
        ([, v]) => v == null || (typeof v === 'string' && isAllowedLinkUrl(v))
      )
    );
  }
  return payload;
}
