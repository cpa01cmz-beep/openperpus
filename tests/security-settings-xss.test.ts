/**
 * tests/security-settings-xss.test.ts — #52 (Stored-XSS via PUT /api/settings).
 * RED-first: konten settings harus tersanitasi sebelum disimpan, dan sink
 * JSON-LD publik yang membawa data dinamis harus meng-escape '<' sehingga
 * breakout `</script>` tidak mungkin terjadi.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { installMockSupabase, jsonReq, resetMockDb } from './helpers/supabase-mock';
import { PUT as SET_PUT } from '@/app/api/settings/route';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('PUT /api/settings menyimpan konten tersanitasi (#52)', () => {
  it('welcome_text/vision/mission/about: <script> & onerror ter-strip', async () => {
    const res = await SET_PUT(
      jsonReq('PUT', '/api/settings', {
        name: 'Perpus Aman',
        welcome_text: '<img src=x onerror=alert(1)>Selamat datang',
        vision: '<script>alert(1)</script>Visi kami',
        mission: '<script>alert(2)</script>\n- baris satu',
        about: 'Aman<script>alert(3)</script> bersih',
        announcement: '<b>Info</b><script>alert(4)</script>',
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: Record<string, string> };
    const stored = JSON.stringify(j.data);
    expect(stored).not.toContain('<script');
    expect(stored).not.toContain('onerror');
    expect(stored).not.toContain('alert(');
    expect(j.data.welcome_text).toContain('Selamat datang');
    expect(j.data.vision).toContain('Visi kami');
    expect(j.data.mission).toContain('baris satu');
    expect(j.data.about).toContain('bersih');
    expect(j.data.announcement).toContain('<b>Info</b>');
  });

  it('konten melebihi CONTENT_LIMITS.settings ditolak 422', async () => {
    const res = await SET_PUT(
      jsonReq('PUT', '/api/settings', {
        name: 'Perpus Aman',
        welcome_text: 'x'.repeat(2001),
      })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toContain('welcome_text');
  });
});

describe('PUT /api/settings socials URL scheme guard (#52 review #1)', () => {
  it('menolak socials dengan skema javascript:/data: (422)', async () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>', '//evil.com']) {
      const res = await SET_PUT(
        jsonReq('PUT', '/api/settings', {
          name: 'Perpus Aman',
          socials: { facebook: bad },
        })
      );
      expect(res.status, `socials=${bad} must be 422`).toBe(422);
      const j = (await res.json()) as { error: { code: string; message: string } };
      expect(j.error.code).toBe('VALIDATION');
      expect(j.error.message).toContain('socials.facebook');
    }
  });

  it('menolak socials non-object', async () => {
    const res = await SET_PUT(
      jsonReq('PUT', '/api/settings', { name: 'Perpus Aman', socials: 'https://x.com' })
    );
    expect(res.status).toBe(422);
  });

  it('menerima https/mailto dan nomor telepon tanpa skema', async () => {
    const res = await SET_PUT(
      jsonReq('PUT', '/api/settings', {
        name: 'Perpus Aman',
        socials: {
          facebook: 'https://facebook.com/x',
          email: 'mailto:info@perpus.id',
          whatsapp: '081234567890',
          instagram: '',
        },
      })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { socials: Record<string, string> } };
    expect(j.data.socials.facebook).toBe('https://facebook.com/x');
    expect(j.data.socials.whatsapp).toBe('081234567890');
  });

  it('isAllowedLinkUrl: bypass tab/newline + protocol-relative ditolak', async () => {
    const { isAllowedLinkUrl } = await import('@/lib/validation');
    expect(isAllowedLinkUrl('java\tscript:alert(1)')).toBe(false);
    expect(isAllowedLinkUrl('java\nscript:alert(1)')).toBe(false);
    expect(isAllowedLinkUrl('vbscript:msgbox')).toBe(false);
    expect(isAllowedLinkUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedLinkUrl('https://ok.example')).toBe(true);
    expect(isAllowedLinkUrl('081234567890')).toBe(true);
    expect(isAllowedLinkUrl('')).toBe(true);
    expect(isAllowedLinkUrl(123)).toBe(false);
  });

  it('sink render memakai getSocials (strip skema berbahaya data lama)', () => {
    const sinks = [
      'src/components/layout/variants/footers/ClassicFooter.tsx',
      'src/components/layout/variants/footers/StackedFooter.tsx',
      'src/components/layout/variants/footers/SketchFooter.tsx',
      'src/app/(public)/kontak/page.tsx',
    ];
    for (const file of sinks) {
      expect(read(file), `${file} must read socials via getSocials`).toContain('getSocials(');
    }
  });
});

describe('audit sink JSON-LD publik (#52)', () => {
  it('sink JSON-LD dengan data dinamis meng-escape <', () => {
    const dynamicSinks = [
      'src/app/(public)/layout.tsx',
      'src/app/(public)/faq/page.tsx',
      'src/app/(public)/berita/[slug]/page.tsx',
      'src/app/(public)/katalog/[slug]/page.tsx',
      'src/app/(public)/katalog/page.tsx',
    ];
    for (const file of dynamicSinks) {
      expect(read(file), `${file} must escape < in JSON-LD`).toContain('.replace(/</g');
    }
  });

  it('sink JSON-LD statis (breadcrumb murni) tetap tanpa data pengguna', () => {
    const staticSinks = [
      'src/app/(public)/tentang/page.tsx',
      'src/app/(public)/kontak/page.tsx',
      'src/app/(public)/layanan/page.tsx',
      'src/app/(public)/berita/page.tsx',
    ];
    for (const file of staticSinks) {
      const src = read(file);
      const ldStart = src.indexOf('type="application/ld+json"');
      // JSX self-closed <script ... /> — blok berakhir di "/>".
      const ldEnd = src.indexOf('/>', ldStart);
      const ldBlock = ldStart >= 0 && ldEnd > ldStart ? src.slice(ldStart, ldEnd) : '';
      expect(ldBlock, `${file} JSON-LD must be static BreadcrumbList`).toContain('BreadcrumbList');
      expect(ldBlock, `${file} JSON-LD must not interpolate settings`).not.toContain('settings.');
    }
  });
});
