# openperpus — CMS Perpustakaan

Next.js 16 + Supabase + Tailwind 4, deploy ke Vercel **atau** Cloudflare Workers (keduanya didukung, lihat ADR-002).

## 1. Install

```bash
npm install
```

> Node >= 20.9.0 (`engines` di package.json; `.nvmrc` memakai Node 22). Tanpa `npm install` penuh pun `package.json` sudah tervalidasi JSON.

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

> Baru pertama kali? Selesaikan dulu **Migrasi Supabase** dan **Akun admin pertama** (bagian bawah) — tanpa skema + admin, aplikasi belum bisa dipakai.

## 4. Deploy Vercel

Deploy utama: **Vercel** (ADR-002 — Workers free plan kena error 1102 resource limit).

1. Import repo di Vercel (Git integration → auto deploy per PR).
2. Set env di dashboard (Settings → Environment Variables):

   | Variable                        | Nilai                           |
   | ------------------------------- | ------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Project URL Supabase            |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key                 |
   | `SUPABASE_SERVICE_ROLE_KEY`     | service_role (server only)      |
   | `NEXT_PUBLIC_SITE_URL`          | `https://openperpus.cmz.web.id` |
   | `METRICS_TOKEN`                 | token acak untuk `/api/metrics` (opsional; mis. `openssl rand -hex 32`) |
   | `SENTRY_DSN`                    | DSN Sentry (opsional; kosong = tracking nonaktif) |

3. Tambah custom domain `openperpus.cmz.web.id` + DNS record di zone Cloudflare.
4. Supabase Dashboard → Authentication → URL Configuration: tambahkan domain Vercel ke
   Redirect URLs.

Build Vercel memakai `vercel.json` (`buildCommand` → `npm run next:build`); `build` di
`package.json` tetap opennext untuk check wajib "Workers Builds" + build CF.
`next.config.mjs` headers + `src/middleware.ts` (CSP nonce) jalan native di Vercel.

### Alternatif deploy: Cloudflare Workers

Target kedua yang didukung penuh — bukan sekadar rollback. Integrasi Git CF (Workers
Builds) menjalankan build di setiap push/PR; `main` di-deploy otomatis ke worker.

```bash
npm run deploy          # opennext build + wrangler deploy manual
npm run cf:preview      # preview lokal Workers
```

**Ganti target (flip):** cukup pindahkan DNS record `openperpus.cmz.web.id` antara
record Vercel dan worker CF — domain & Supabase redirect URL tetap sama, tidak ada
konfigurasi lain yang berubah.

Secret CF tetap via `wrangler secret put` (jangan taruh di repo): `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.

Konfigurasi CF: `wrangler.toml` (`compatibility_date = "2025-01-01"`) + `open-next.config.ts` minimal.

## Arsitektur

Sistem CMS penuh, bukan fondasi saja.

Admin (19 halaman di `src/app/admin/`, flat — tanpa Route Group): dashboard, buku (list/tambah/edit), anggota, peminjaman, reservasi, denda, kategori, rak, menu, konten, artikel (list/edit), banner (list/edit), layanan, logs, pengaturan.

API (34 route handler, kontrak dua arah di `openapi.yaml` + `docs/api-contract.md`): 15 modul resource — books, categories, racks, members, loans (+return), reservations, fines (+pay), pages, faqs, testimonials, articles, banners, menus, services, settings (+`/settings/theme`) — plus health, readyz, docs, metrics, register.

Publik (15 halaman): home, katalog (+detail), buku, berita (+detail), halaman dinamis, faq, layanan, tentang, kontak, denda, reservasi-saya (di `src/app/(public)/`), plus `login` dan `daftar`, serta `sitemap.ts`/`robots.ts`/`manifest.ts`.

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
supabase/migrations/0016_articles_trgm.sql
supabase/migrations/0017_dashboard_stats.sql
supabase/migrations/0018_perf_fixes.sql
supabase/migrations/0019_role_guard.sql
supabase/migrations/0020_sketch_theme.sql
supabase/migrations/0021_services.sql
supabase/migrations/0022_theme_overrides.sql
```

Alternatif (tanpa paste manual): jalankan `supabase db push` dari root repo —
migrasi terdeteksi otomatis dari folder `supabase/migrations` (lihat `supabase/README.md`).

Catatan: penomoran unik dan berurutan (0010 dilewati, tidak dipakai). Jalankan semua sesuai urutan di atas.

## Akun admin pertama

Pendaftaran publik (`/daftar` → `POST /api/register`) selalu membuat profile dengan role `member`,
jadi akun admin pertama dibuat manual setelah signup:

1. Daftar di `http://localhost:3000/daftar` (konfirmasi email bila diaktifkan di
   Supabase Dashboard → Authentication → Providers → Email), lalu login.
2. Buka Supabase Dashboard → SQL Editor, jalankan (ganti email):

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'email-kamu@contoh.com');
```

3. (Opsional) isi data awal perpus — nama, kategori, rak, buku contoh — dengan menjalankan
   `supabase/seed.sql` (paste ke SQL Editor, atau `supabase db execute --file supabase/seed.sql`).

Kenapa SQL dan bukan lewat aplikasi: trigger `0019_role_guard.sql` menolak perubahan
`profiles.role` oleh user ber-sesi yang bukan admin; jalur SQL Editor/psql/`service_role`
(tanpa `auth.uid()`) dikecualikan — itu jalur seed/admin manual yang tepercaya.
Setelah admin pertama ada, perubahan role berikutnya cukup lewat SQL serupa.

## Storage bucket

Upload sampul/gambar memakai bucket `library-assets` yang **dibuat otomatis** oleh
`supabase/migrations/0004_storage.sql` (public read, tulis hanya staf, batas 2 MB image/*,
policies di `0007_storage_guard.sql`). Tidak perlu membuat bucket manual di dashboard.
Bila bucket terlanjur dihapus, jalankan ulang `0004_storage.sql`.

## Verifikasi (smoke test)

Dengan `npm run dev` berjalan dan env terisi:

```bash
curl -s http://localhost:3000/api/health
# → {"status":"ok","uptime":...,...}

curl -s http://localhost:3000/api/readyz
# → {"ready":true,"checks":{"supabase":"ok","latencyMs":...}}
# balas 503 {"ready":false,...} bila Supabase tak terjangkau (cek env/migrasi)
```

Lanjut manual: buka `http://localhost:3000` (katalog terisi bila `seed.sql` dijalankan),
login di `/login`, lalu cek halaman `/admin` memakai akun admin dari §Akun admin pertama.

## Troubleshooting

| Gejala | Penyebab / fix |
| ------ | -------------- |
| `/api/metrics` balas 401 | Set env `METRICS_TOKEN` lalu kirim header `Authorization: Bearer <token>` (token kosong = route terbuka tanpa auth) |
| `PUT /api/settings/theme` 500 / kolom `theme_overrides` tidak ada | Migrasi `0022_theme_overrides.sql` belum jalan — lihat §Migrasi Supabase |
| Login langsung kembali ke `/login` | Tambahkan URL situs ke Supabase Dashboard → Authentication → URL Configuration → Redirect URLs |
| Sudah login tapi 403 di `/admin` atau API admin | Role belum `admin` — jalankan §Akun admin pertama |
| Upload gambar gagal | Bucket `library-assets` belum ada — jalankan `0004_storage.sql` |
| Deploy CF error 1102 resource limit | Pakai Vercel sebagai target utama (ADR-002); worker CF tetap alternatif — cek juga `wrangler secret put` (§Alternatif deploy) |

## Keamanan

RLS aktif plus hardening di `0003_hardening.sql`. `next` di-pin eksak di `package.json` (saat ini 16.4.0) — perbarui saat ada rilis keamanan. Input pencarian disanitasi sebelum dipakai di query `ilike`. `service_role` hanya dipakai di server, jangan taruh di kode klien.

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

> Gate kualitas ada di GitHub Actions (typecheck, lint, unit+components, playwright-list) — jangan jalankan test suite penuh di lokal; cukup `npm run check` (typecheck + lint) sebelum push, lalu pantau `gh pr checks`.

### Panduan onboarding

- [`docs/onboarding-dev.md`](docs/onboarding-dev.md) — setup dev 15 menit, akun admin pertama, troubleshooting (RLS 403, redirect URL, wrangler secret), dan smoke test checklist (mulai dari `curl /api/settings` di `docs/api-contract.md`).
- [`docs/runbook-pustakawan.md`](docs/runbook-pustakawan.md) — alur harian pustakawan (pinjam, kembali+denda, bayar, reservasi, opname, anggota/buku) + tabel istilah ID↔EN lengkap + checklist 10 langkah.

# Cloudflare build trigger
