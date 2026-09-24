/**
 * tests/security-content-validation.test.ts — Fix4b (Security: uniform content validation).
 * RED-first: asserts sanitizeHtmlContent strips XSS vectors and validateContentFields
 * enforces length caps on settings/pages/articles/testimonials fields.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { CONTENT_LIMITS, sanitizeHtmlContent, validateContentFields } from '@/lib/validation';

// Warm jsdom-backed sanitizer (~3-5s cold require) so per-test 5s timeout isn't flaky under full-suite load.
beforeAll(async () => {
  await import('isomorphic-dompurify');
});

describe('sanitizeHtmlContent strips XSS vectors', () => {
  it('menghapus <script> beserta isinya', () => {
    const out = sanitizeHtmlContent('halo<script>alert(1)</script>dunia');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('halo');
    expect(out).toContain('dunia');
  });

  it('menghapus event handler inline (onerror/onclick)', () => {
    const out = sanitizeHtmlContent('<img src="x" onerror="alert(1)">teks');
    expect(out).not.toContain('onerror');
    expect(out).toContain('teks');
  });

  it('menolak javascript: URL', () => {
    const out = sanitizeHtmlContent('<a href="javascript:alert(1)">klik</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('klik');
  });

  it('mempertahankan teks aman + tag inline jinak (b/i/p/br)', () => {
    const out = sanitizeHtmlContent('<p>Selamat <b>datang</b> di <i>perpus</i></p>');
    expect(out).toContain('Selamat');
    expect(out).toContain('datang');
  });

  it('mengembalikan string kosong untuk input non-string', () => {
    expect(sanitizeHtmlContent(null)).toBe('');
    expect(sanitizeHtmlContent(undefined)).toBe('');
    expect(sanitizeHtmlContent(123)).toBe('');
  });
});

describe('validateContentFields enforces length caps', () => {
  it('menolak settings.welcome_text melebihi batas', () => {
    const long = 'x'.repeat(CONTENT_LIMITS.settings.welcome_text + 1);
    const err = validateContentFields('settings', { welcome_text: long });
    expect(err).not.toBeNull();
    expect(err as string).toContain('welcome_text');
  });

  it('menerima settings dalam batas + menyanitasi HTML', () => {
    const res = validateContentFields('settings', {
      welcome_text: 'Selamat datang<script>alert(1)</script>',
      vision: 'Visi <b>kami</b>',
    });
    expect(res).toBeNull();
  });

  it('menolak pages.content_md melebihi batas', () => {
    const long = 'y'.repeat(CONTENT_LIMITS.pages.content_md + 1);
    expect(validateContentFields('pages', { content_md: long })).not.toBeNull();
  });

  it('menolak articles.title melebihi batas', () => {
    const long = 'z'.repeat(CONTENT_LIMITS.articles.title + 1);
    expect(validateContentFields('articles', { title: long })).not.toBeNull();
  });

  it('menolak testimonials.content melebihi batas', () => {
    const long = 'w'.repeat(CONTENT_LIMITS.testimonials.content + 1);
    expect(validateContentFields('testimonials', { content: long })).not.toBeNull();
  });

  it('mengabaikan field tak dikenal (null = valid)', () => {
    expect(validateContentFields('settings', { unknown_field: 'x' })).toBeNull();
    expect(validateContentFields('pages', {})).toBeNull();
  });
});
