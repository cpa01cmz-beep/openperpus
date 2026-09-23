# webperpus-oc — CMS Perpustakaan

Next.js 14 + Supabase + Tailwind 3, deploy ke Cloudflare Workers via `@opennextjs/cloudflare`.

## 1. Install

```bash
npm install
```

> Node >= 20.9.0. Tanpa `npm install` penuh pun `package.json` sudah tervalidasi JSON.

## 2. Setup Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Buka **Project Settings > API**, salin:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (HANYA server, jangan expose) → `SUPABASE_SERVICE_ROLE_KEY`
3. Salin env:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env.local
# Linux/macOS
cp .env.example .env.local
```

4. Isi `.env.local`, contoh:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... (server only)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 3. Jalankan lokal

```bash
npm run dev
# buka http://localhost:3000
```

## 4. Deploy Cloudflare

```bash
npx @opennextjs/cloudflare build
wrangler deploy
```

Atau sekaligus:

```bash
npm run deploy
```

Preview lokal Workers:

```bash
npm run cf:build
npm run cf:preview
```

Konfigurasi CF: `wrangler.toml` (`compatibility_date = "2025-01-01"`) + `open-next.config.ts` minimal.

### Secret di Cloudflare (jangan taruh di repo)

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
wrangler secret put NEXT_PUBLIC_SUPABASE_URL
```

## Arsitektur

Sistem CMS penuh, bukan fondasi saja.

Admin (14 rute di `src/app/admin/`): dashboard, buku, anggota, peminjaman, reservasi, denda, kategori, rak, menu, konten, artikel, banner, logs, pengaturan. Halaman edit tersedia untuk artikel (`artikel/edit`) dan banner (`banner/edit`).

API (26 rute, lihat `.omo/baseline/routes.json`): books, categories, racks, members, loans (+return), reservations, fines (+pay), pages, faqs, testimonials, articles, banners, menus, settings.

Publik (11 rute): katalog (paginasi server), buku, berita, halaman dinamis, faq, layanan, tentang, kontak, home, login, plus `sitemap.ts`/`robots.ts`/`manifest.ts`.

## Fitur

Koleksi: CRUD buku, kategori, rak. Sirkulasi: pinjam/kembali, reservasi, denda (+bayar). Konten: pages, faqs, testimoni, artikel, banner, menu navigasi. Upload sampul/gambar ke bucket `library-assets`. Katalog publik pakai paginasi server dan `next/image`. Pengaturan situs tersimpan di tabel settings.

## Migrasi Supabase

Jalankan urut di SQL Editor (nama file persis):

```
supabase/migrations/0001_core.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_hardening.sql
supabase/migrations/0004_storage.sql
supabase/migrations/0005_checkout.sql
supabase/migrations/0006_content.sql
supabase/migrations/0007_storage_guard.sql
supabase/migrations/0008_theme.sql
supabase/migrations/0009_drop_legacy_theme.sql
supabase/migrations/0011_return_loan.sql
supabase/migrations/0012_perf.sql
supabase/migrations/0013_pay_own_fine.sql
supabase/migrations/0014_fine_rate.sql
supabase/migrations/0015_checkout_active_guard.sql
```

Catatan: penomoran unik dan berurutan (0010 dilewati, tidak dipakai). Jalankan semua sesuai urutan di atas.

## Keamanan

RLS aktif plus hardening di `0003_hardening.sql`. Next.js dipin ke `14.2.35` (memenuhi syarat `>=14.2.25` untuk CVE). Input pencarian disanitasi sebelum dipakai di query `ilike`. `service_role` hanya dipakai di server, jangan taruh di kode klien.

### Cloudflare Rate Limiting Rules (Recommended)

Tambahkan Rate Limiting Rules di Cloudflare Dashboard untuk perlindungan DDoS terdistribusi (in-memory limiter di `src/lib/rate-limit.ts` bersifat per-isolate):

| Rule                 | Expression                                                                                                 | Action                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| API Write Protection | `(http.request.method in {"POST" "PUT" "PATCH" "DELETE"}) and (http.request.uri.path matches "^/api/.*$")` | Block / Challenge (60 req/min per IP) |
| Auth Endpoints       | `http.request.uri.path matches "^/api/(auth                                                                | register                              | login)"` | Block (10 req/min per IP) |
| Admin Routes         | `http.request.uri.path matches "^/admin/.*$" and not cf.edge.server_port eq 443`                           | Managed Challenge                     |

Atau gunakan Terraform / Cloudflare API untuk otomatisasi.

## Tes

```bash
npm test
# vitest run
```

Suite utama (T-S1..T-S4): `tests/api/books-crud.test.ts`, `tests/katalog-pagination.test.ts`, `tests/loans-stock-fine.test.ts`, `tests/rls-escalation.test.ts`. Suite admin: `admin-bookform`, `admin-taxonomy`, `admin-edits`. Ada juga `placeholder.test.ts` sebagai smoke test.
