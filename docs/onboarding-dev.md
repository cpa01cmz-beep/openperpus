# Onboarding Dev — openperpus dalam 15 menit

> Untuk: developer baru yang belum pernah menyentuh repo ini.
> Pustakawan (non-dev)? Buka [runbook-pustakawan.md](./runbook-pustakawan.md).
> Arsitektur: [architecture.md](./architecture.md) · DB: [db-design.md](./db-design.md) ·
> API: [api-contract.md](./api-contract.md) + referensi interaktif di `/api/docs`.

Target: dari nol sampai `npm run dev` hijau dan smoke test lolos, **tanpa
googling**. Semua langkah sudah diverifikasi terhadap `package.json`,
`.env.example`, dan `supabase/migrations/` di repo ini.

## 0. Prasyarat

| Kebutuhan     | Versi/catatan                                                     |
| ------------- | ----------------------------------------------------------------- |
| Node.js       | **22** (`.nvmrc`; `engines >= 20.9.0`) — `nvm use` bila terpasang |
| npm           | 11 ( dikelola via `packageManager` di `package.json`)             |
| Akun Supabase | gratis; Dashboard → New project                                   |
| Git           | + akses push ke repo (untuk PR)                                   |
| SQL Editor    | bawaan Supabase Dashboard (tak perlu `psql`/CLI untuk onboarding) |

> `preinstall` di `package.json` sudah menyetel `legacy-peer-deps=true`
> otomatis — jangan jalankan `npm install --legacy-peer-deps` manual.

## 1. Jalur setup 15 menit

### Menit 0–3 — Clone & install

```bash
git clone <repo-url> openperpus && cd openperpus
nvm use            # Node 22
npm install        # jalankan patch-package otomatis (postinstall)
```

### Menit 3–6 — Environment

```bash
cp .env.example .env.local    # Windows: Copy-Item .env.example .env.local
```

Isi `.env.local` dari Supabase Dashboard → Project Settings → API:

| Variabel                        | Sumber                                             |
| ------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public                                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role — **server only, jangan expose**      |
| `NEXT_PUBLIC_SITE_URL`          | `http://localhost:3000`                            |
| `METRICS_TOKEN` _(opsional)_    | `openssl rand -hex 32` — melindungi `/api/metrics` |
| `SENTRY_DSN` _(opsional)_       | kosong = tracking nonaktif                         |

`.env.local` sudah di-`.gitignore` — jangan pernah commit.

### Menit 6–10 — Supabase: migrasi

Di Supabase Dashboard → **SQL Editor**, jalankan **berurutan** (nama persis):

```
supabase/migrations/0001_core.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_hardening.sql
supabase/migrations/0004_storage.sql        # bucket library-assets dibuat DI SINI (otomatis)
supabase/migrations/0005_checkout.sql
supabase/migrations/0006_content.sql
supabase/migrations/0007_storage_guard.sql
supabase/migrations/0008_theme.sql
supabase/migrations/0009_drop_legacy_theme.sql
supabase/migrations/0011_return_loan.sql    # 0010 dilewati, tidak dipakai
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

Alternatif CLI: `supabase db push` (butuh `supabase login` + `supabase link`) —
detail di [../supabase/README.md](../supabase/README.md).

### Menit 10–13 — Akun admin pertama

Pendaftaran publik (`/daftar`) selalu membuat role `member`, jadi admin pertama
dibuat manual:

1. Buka `http://localhost:3000/daftar`, daftar akun untuk diri Anda.
2. SQL Editor — satu transaksi (ganti email):

```sql
ALTER TABLE public.profiles DISABLE TRIGGER trg_strip_profiles_role;
UPDATE public.profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'email-kamu@contoh.com');
ALTER TABLE public.profiles ENABLE TRIGGER trg_strip_profiles_role;
```

Kenapa disable trigger: `trg_strip_profiles_role` (`0003_hardening.sql`)
diam-diam mengembalikan `role` lama untuk aktor non-staff — tanpa disable,
`UPDATE` tampak sukses tapi 0 baris berubah.

3. (Opsional) data contoh: paste `supabase/seed.sql` ke SQL Editor (idempotent).

### Menit 13–15 — Jalankan & verifikasi

```bash
npm run dev
# buka http://localhost:3000
```

Login di `/login` memakai akun admin dari langkah sebelumnya → `/admin` terbuka.

## 2. Smoke test checklist

Centang semua sebelum coding. Dengan `npm run dev` berjalan:

- [ ] `curl -s http://localhost:3000/api/settings` → `200` JSON whitelist
      (nama_perpus, active_theme, fine_per_day, …) — smoke test kanonik dari
      `docs/api-contract.md` §Contoh curl (baris ~175).
- [ ] `curl -s http://localhost:3000/api/health` → `{"status":"ok",…}`
- [ ] `curl -s http://localhost:3000/api/readyz` → `{"ready":true,"checks":{"supabase":"ok",…}}`
      (`503` = cek env/migrasi)
- [ ] `curl -s "http://localhost:3000/api/books?per_page=5"` → `200` + `data[]`
- [ ] `curl -s http://localhost:3000/api/docs` → halaman Scalar (kontrak OpenAPI) terbuka
- [ ] Home `/` tampil; `/login` → `/admin` berhasil; dashboard tanpa error
- [ ] Alur inti lewat UI: pinjam → kembalikan → denda → tandai lunas
      (10 langkah lengkap: [runbook-pustakawan.md](./runbook-pustakawan.md) §4)

Untuk cek lokal sebelum push: `npm run check` (typecheck + lint).
**Test suite lengkap (vitest + playwright) TIDAK dijalankan lokal** — gate
kualitas ada di GitHub Actions (typecheck, lint, unit+components,
playwright-list); pantau lewat `gh pr checks`.

## 3. Troubleshooting

| Gejala                                                      | Penyebab                                                | Fix                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Data baru hilang / insert senyap gagal (**RLS**)            | RLS default DENY; penulisan butuh role staf atau policy | Pakai akun `admin`/`pustakawan` (lihat §Akun admin pertama); cek `profiles.role` di SQL Editor    |
| Sudah login tapi `/admin` atau API balas `403`              | Role belum naik dari `member`                           | Jalankan SQL promot di §Akun admin pertama                                                        |
| Login berhasil tapi balik ke `/login` (loop)                | URL situs belum di Redirect URLs Supabase               | Dashboard → Authentication → URL Configuration → tambahkan `http://localhost:3000/**`             |
| `PUT /api/settings/theme` 500 / `theme_overrides` tidak ada | Migrasi `0022` belum jalan                              | Jalankan `0022_theme_overrides.sql`                                                               |
| Upload gambar gagal                                         | Bucket `library-assets` belum ada                       | Jalankan ulang `0004_storage.sql` (bucket dibuat otomatis di migrasi ini)                         |
| `/api/metrics` balas `401`                                  | `METRICS_TOKEN` terisi                                  | Kirim `Authorization: Bearer <METRICS_TOKEN>`                                                     |
| Deploy CF gagal **error 1102** (resource limit)             | Workers free plan                                       | Pakai Vercel (target utama, ADR-002); CF tetap alternatif (ADR-002)                               |
| `wrangler secret` / secret CF                               | Secret CF tak boleh di repo                             | `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (dst.); lokal cukup `.env.local` (gitignored) |
| Port 3000 dipakai                                           | Proses lain                                             | `npm run dev -- -p 3001`                                                                          |
| `npm install` gagal peer deps                               | Sudah ditangani otomatis                                | Jangan override; laporkan bila tetap gagal (jangan pakai `--force`)                               |

## 4. Peta repo & kamus perintah

```
src/app/admin/     halaman admin (lihat runbook §3.1)
src/app/api/       route handler REST (33 file route.ts)
src/lib/           logika: loans-return, finecalc, reservation-*, settings, themes…
src/middleware.ts  CSP nonce + proteksi rute
supabase/          migrations 0001→0022 + seed.sql + README operasional
openapi.yaml       kontrak OpenAPI (dilayani di /api/docs)
tests/             vitest (unit/components) + tests/e2e (playwright)
docs/              dokumen ini + ADR + api-contract + db-design + architecture
```

| Perintah               | Fungsi                                                    |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | server pengembangan (port 3000)                           |
| `npm run check`        | typecheck + lint (wajib sebelum push)                     |
| `npm run build`        | build Cloudflare Workers (OpenNext)                       |
| `npm run next:build`   | build Next.js (dipakai Vercel via `vercel.json`)          |
| `npm run cf:preview`   | preview lokal Workers                                     |
| `npm run deploy`       | build + `wrangler deploy`                                 |
| `npm test`             | vitest — **jalankan di CI**, bukan lokal (kebijakan repo) |
| `gh pr checks --watch` | pantau status CI pada PR Anda                             |

## 5. Aturan main di repo ini

1. **Jangan commit secret/`.env.local`.** Secret hanya di `.env.local` lokal atau
   `wrangler secret put` untuk CF.
2. **Jangan `npm install` ulang di worktree** yang `node_modules`-nya symlink
   dari repo utama (lingkungan Agent Manager) — pakai yang sudah ada.
3. **Satu PR satu tujuan**; draft sampai CI hijau + review approve.
4. **Tak pernah merge manual** — merge lewat auto-merge setelah hijau.
5. Selalu rebase/update ke default branch terbaru sebelum minta review.

## 6. Rujukan

- [runbook-pustakawan.md](./runbook-pustakawan.md) — alur harian + glosarium ID↔EN
- [api-contract.md](./api-contract.md) — kontrak REST + contoh curl (smoke test)
- [db-design.md](./db-design.md) — skema, RLS, trigger (denda otomatis, dll.)
- [architecture.md](./architecture.md) — role, request flow, cache
- [adr-001-stack.md](./adr-001-stack.md) / [adr-002-vercel.md](./adr-002-vercel.md) — keputusan stack & deploy
- [../supabase/README.md](../supabase/README.md) — operasional migrasi/seed/rollback
