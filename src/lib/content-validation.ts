/**
 * src/lib/content-validation.ts — validasi konten ber-HTML untuk Fix4b (Security).
 * Dependency-free (tanpa zod): vitest node-safe, zero imports — mengikuti pola
 * src/lib/validation.ts. Dipakai oleh write route settings/pages/articles/testimonials.
 *
 * BUKAN pengganti validation.ts (skema entitas inti milik sana) — modul ini khusus
 * sanitasi HTML + batas panjang field konten bebas (stored-XSS surface).
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

export type ContentEntity = keyof typeof CONTENT_LIMITS;

/**
 * Sanitasi HTML ringan: hapus <script>/<style>/<iframe>/<object>/<embed> beserta isi,
 * hapus event-handler inline (on*), dan netralkan javascript:/data: URL.
 * Tag inline jinak (b/i/u/p/br/ul/ol/li/a/strong/em) dipertahankan.
 * Mengembalikan string kosong untuk input non-string.
 */
export function sanitizeHtmlContent(input: unknown): string {
  if (typeof input !== 'string') return '';
  let out = input;
  // Hapus elemen berbahaya beserta isinya (non-greedy, case-insensitive).
  out = out.replace(
    /<(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ''
  );
  // Hapus tag berbahaya yang self-closing / tanpa pasangan.
  out = out.replace(
    /<\/?(script|style|iframe|object|embed|form|input|button|link|meta)[^>]*>/gi,
    ''
  );
  // Hapus event handler inline: on*=... (quoted maupun unquoted).
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Netralkan javascript:/data:/vbscript: URL di href/src/action.
  out = out.replace(
    /\s(href|src|action)\s*=\s*("|\')\s*(javascript|data|vbscript)\s*:[^"']*("|\')/gi,
    ' $1="#"'
  );
  return out;
}

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
 * Sanitasi in-place untuk field HTML bebas pada payload yang sudah dinormalisasi.
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
  return payload;
}
