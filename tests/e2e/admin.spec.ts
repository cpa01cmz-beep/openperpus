import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Issue #63: 5 journey admin minimum (API-seed + UI-assert, satu login UI di beforeAll,
// tag unik acak per-run agar aman paralel 3 proyek Playwright).
// Butuh backend Supabase + akun admin: tanpa E2E_ADMIN_EMAIL/PASSWORD,
// test ber-auth di-skip aman (suite tetap hijau). Journey (2) tanpa
// kredensial (self-seed via /api/register publik + fallback anonim).
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const HAS_ADMIN = ADMIN_EMAIL.length > 0 && ADMIN_PASSWORD.length > 0;
// ponytail: baseURL di-mirror dari playwright.config.ts (konteks manual
// browser.newContext tidak mewarisi `use`). Upgrade path: auth project
// + storageState file bila suite e2e tumbuh.
const BASE_URL = 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

function unique(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const target = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await page.request.fetch(target, {
    method,
    ...(body === undefined ? {} : { data: body }),
  });
  const json = (await res.json().catch(() => ({ data: null }))) as { data: T };
  return { status: res.status(), data: json.data };
}

async function ensureActiveMember(
  page: Page,
  tag: string
): Promise<{ id: string; member_code: string }> {
  const reg = await api<{ id: string; member_code: string }>(page, 'POST', '/api/register', {
    nama: 'E2E Aktif',
    email: `e2e-aktif-${tag}@example.com`,
    password: 'E2eAktif123!',
  });
  expect(reg.status).toBe(201);
  const upd = await api<unknown>(page, 'PUT', `/api/members/${reg.data.id}`, {
    status: 'active',
  });
  expect(upd.status).toBe(200);
  return { id: reg.data.id, member_code: reg.data.member_code };
}

test.describe('Admin journeys (issue #63)', () => {
  test.skip(!HAS_ADMIN, 'butuh E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (kredensial Supabase)');

  let adminCtx: BrowserContext | null = null;

  test.beforeAll(async ({ browser }) => {
    if (!HAS_ADMIN) return;
    adminCtx = await browser.newContext({ baseURL: BASE_URL });
    const login = await adminCtx.newPage();
    await login.goto('/login');
    await login.fill('#login-email', ADMIN_EMAIL);
    await login.fill('#login-password', ADMIN_PASSWORD);
    await login.click('button[type="submit"]');
    await expect(login).not.toHaveURL(/.*login/, { timeout: 15000 });
    await login.close();
  });

  test.afterAll(async () => {
    await adminCtx?.close();
    adminCtx = null;
  });

  async function adminPage(): Promise<Page> {
    if (!adminCtx) throw new Error('konteks admin belum login (beforeAll gagal)');
    return adminCtx.newPage();
  }

  test('(1) admin buat buku via API → terlihat di /katalog', async () => {
    const page = await adminPage();
    try {
      const tag = unique('E2E');
      const cat = await api<{ id: string }>(page, 'POST', '/api/categories', {
        name: `E2E Kategori ${tag}`,
      });
      expect(cat.status).toBe(201);
      const rack = await api<{ id: string }>(page, 'POST', '/api/racks', {
        code: `E${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`,
        name: `E2E Rak ${tag}`,
      });
      expect(rack.status).toBe(201);
      const title = `E2E Buku Hijau ${tag}`;
      const book = await api<{ id: string }>(page, 'POST', '/api/books', {
        title,
        author: 'Tim E2E',
        category_id: cat.data.id,
        rack_id: rack.data.id,
        stock_total: 3,
        stock_available: 3,
      });
      expect(book.status).toBe(201);
      // Taxonomy round-trip: edit kategori + rak → baca balik.
      const catUpd = await api<{ name: string }>(page, 'PUT', `/api/categories/${cat.data.id}`, {
        name: `E2E Kategori ${tag} Revisi`,
      });
      expect(catUpd.status).toBe(200);
      expect(catUpd.data.name).toContain('Revisi');
      const rackUpd = await api<{ name: string }>(page, 'PUT', `/api/racks/${rack.data.id}`, {
        name: `E2E Rak ${tag} Revisi`,
      });
      expect(rackUpd.status).toBe(200);
      expect(rackUpd.data.name).toContain('Revisi');
      await page.goto(`/katalog?q=${encodeURIComponent(title)}`);
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });

  test('(3) admin approve reservasi → checkout → loan + stok berkurang', async () => {
    const page = await adminPage();
    try {
      const tag = unique('E2E');
      const member = await ensureActiveMember(page, `${tag}r`);
      const bookTitle = `E2E Reservasi ${tag}`;
      const book = await api<{ id: string }>(page, 'POST', '/api/books', {
        title: bookTitle,
        author: 'Tim E2E',
        stock_total: 2,
        stock_available: 2,
      });
      expect(book.status).toBe(201);
      const before = await api<{ stock_available: number }>(
        page,
        'GET',
        `/api/books/${book.data.id}`
      );
      const resv = await api<{ id: string }>(page, 'POST', '/api/reservations', {
        book_id: book.data.id,
        member_id: member.id,
      });
      expect(resv.status).toBe(201);
      const ready = await api<unknown>(page, 'PATCH', `/api/reservations/${resv.data.id}`, {
        status: 'ready',
      });
      expect(ready.status).toBe(200);
      const co = await api<unknown>(
        page,
        'POST',
        `/api/reservations/${resv.data.id}/checkout`,
        {}
      );
      expect(co.status).toBe(201);
      const after = await api<{ stock_available: number }>(
        page,
        'GET',
        `/api/books/${book.data.id}`
      );
      expect(after.data.stock_available).toBe(before.data.stock_available - 1);
      await page.goto('/admin/peminjaman');
      await page.fill('#peminjaman-search', member.member_code);
      await expect(page.getByText(bookTitle).first()).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });

  test('(4) admin return overdue bad-condition → denda di /admin/denda', async () => {
    const page = await adminPage();
    try {
      const tag = unique('E2E');
      const member = await ensureActiveMember(page, `${tag}d`);
      const bookTitle = `E2E Telat ${tag}`;
      const book = await api<{ id: string }>(page, 'POST', '/api/books', {
        title: bookTitle,
        author: 'Tim E2E',
        stock_total: 2,
        stock_available: 2,
      });
      expect(book.status).toBe(201);
      const loan = await api<{ id: string }>(page, 'POST', '/api/loans', {
        member_id: member.id,
        book_id: book.data.id,
        borrowed_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        due_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      });
      expect(loan.status).toBe(201);
      const ret = await api<{ fine_amount: number }>(page, 'PUT', `/api/loans/${loan.data.id}`, {
        action: 'return',
        kondisi: 'rusak',
      });
      expect(ret.status).toBe(200);
      expect(Number(ret.data.fine_amount)).toBeGreaterThan(0);
      const fines = await api<unknown[]>(
        page,
        'GET',
        `/api/fines?member_id=${member.id}`
      );
      expect(fines.status).toBe(200);
      expect(fines.data.length).toBeGreaterThan(0);
      await page.goto('/admin/denda');
      await page.fill('#denda-search', member.member_code);
      await expect(page.getByText(member.member_code).first()).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });

  test('(5) artikel+banner draft → publish → homepage + edit round-trip', async () => {
    const page = await adminPage();
    try {
      const tag = unique('E2E');
      const artTitle = `E2E Berita ${tag}`;
      const art = await api<{ id: string; slug: string }>(page, 'POST', '/api/articles', {
        title: artTitle,
        content_md: 'Draf awal E2E.',
        status: 'draft',
      });
      expect(art.status).toBe(201);
      const pub = await api<unknown>(page, 'PUT', `/api/articles/${art.data.id}`, {
        status: 'published',
      });
      expect(pub.status).toBe(200);
      const bannerTitle = `E2E Banner ${tag}`;
      const ban = await api<unknown>(page, 'POST', '/api/banners', {
        title: bannerTitle,
        image_url: '/og-default.jpg',
        is_active: true,
      });
      expect(ban.status).toBe(201);
      await page.goto('/');
      await expect(page.getByText(artTitle).first()).toBeVisible({ timeout: 20000 });
      const bannerTab = page.getByRole('tab', { name: bannerTitle });
      const bannerHeading = page.getByRole('heading', { name: bannerTitle });
      await expect(bannerTab.or(bannerHeading).first()).toBeVisible({ timeout: 20000 });
      const revised = `${artTitle} Revisi`;
      const upd = await api<{ slug: string }>(page, 'PUT', `/api/articles/${art.data.id}`, {
        title: revised,
      });
      expect(upd.status).toBe(200);
      await page.goto(`/berita/${upd.data.slug}`);
      await expect(page.getByRole('heading', { name: revised }).first()).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await page.close();
    }
  });
});

test.describe('Admin guard non-staff (issue #63)', () => {
  test('(2a) anonim buka /admin/peminjaman → redirect /login', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const p = await ctx.newPage();
    try {
      await p.goto('/admin/peminjaman');
      await expect(p).toHaveURL(/\/login/, { timeout: 15000 });
    } finally {
      await ctx.close();
    }
  });

  test('(2b) member buka /admin/peminjaman → ditolak (redirect /)', async ({
    browser,
    request,
  }) => {
    const tag = unique('member');
    const email = `e2e-member-${tag}@example.com`;
    const password = 'E2eMember123!';
    const reg = await request.post(`${BASE_URL}/api/register`, {
      data: { nama: 'E2E Member', email, password },
    });
    expect(reg.status()).toBe(201);
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const p = await ctx.newPage();
    try {
      await p.goto('/login');
      await p.fill('#login-email', email);
      await p.fill('#login-password', password);
      await p.click('button[type="submit"]');
      await expect(p).not.toHaveURL(/.*login/, { timeout: 15000 });
      await p.goto('/admin/peminjaman');
      await expect(p).toHaveURL(/\/$/, { timeout: 15000 });
    } finally {
      await ctx.close();
    }
  });
});
