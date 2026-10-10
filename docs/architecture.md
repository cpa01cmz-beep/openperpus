# Architecture — CMS Perpustakaan (Greenfield)

> Stack tetap: Next.js 14 App Router + TypeScript + TailwindCSS + Supabase (`@supabase/ssr`) + Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)
> Prinsip: **CMS 100% dinamis, tanpa hardcoded**. Seluruh identitas perpustakaan (nama, logo, alamat, telepon, email, jam operasional JSON, sosmed JSON, sambutan, visi-misi, SEO) WAJIB dibaca dari tabel `settings` (single-row). Tema: premium elegant, mobile-first.

---

## 1. Tujuan & Batasan

**Tujuan:**

- OPAC publik (katalog, detail buku, artikel/berita/event, halaman dinamis, testimoni, FAQ, banner) yang cepat (edge) dan SEO-friendly.
- Admin CMS (kelola settings, buku+stok, kategori, rak, anggota, sirkulasi loans/reservations/fines, konten, menu, banner) dengan RBAC.
- Satu codebase, dua area: `(public)` dan `(admin)`.

**Batasan (jangan dilanggar worker):**

- Jangan ganti stack. Jangan intro Kafka/microservices/Express terpisah.
- Jangan hardcode identitas perpus di JSX/metadata. Semua via `settings`.
- Deploy target = Cloudflare Workers via OpenNext (Workers runtime = edge, Node API terbatas). Hindari API Node-only (`fs`, `sharp` custom) di runtime request.

---

## 2. Struktur Folder Usulan

```
/
├── app/
│   ├── (public)/                    # route group OPAC (layout.tsx baca settings cached)
│   │   ├── page.tsx                # home: banner slider + sambutan + buku terbaru/populer + artikel + testimoni
│   │   ├── katalog/page.tsx        # OPAC search + filter kategori/rak/ketersediaan (SSR, searchParams)
│   │   ├── katalog/[slug]/page.tsx # detail buku (generateMetadata dinamis) + reservasi
│   │   ├── buku/[slug]/page.tsx    # permanen redirect -> /katalog/[slug]
│   │   ├── berita/page.tsx + [slug]/page.tsx
│   │   ├── halaman/[slug]/page.tsx # pages dinamis (visi-misi, dll — slug dari tabel pages)
│   │   ├── faq/page.tsx
│   │   ├── kontak/page.tsx         # alamat/telepon/jam dari settings
│   │   ├── layanan/page.tsx
│   │   ├── tentang/page.tsx
│   │   ├── reservasi-saya/page.tsx # anggota: reservasi miliknya (login)
│   │   ├── denda/page.tsx          # anggota: denda miliknya (login)
│   │   └── error.tsx / loading.tsx
│   ├── admin/                      # panel staf (flat, TANPA route group — guard di layout.tsx)
│   │   ├── layout.tsx              # guard session + role check (admin/pustakawan), sidebar dinamis
│   │   ├── page.tsx                # dashboard: RPC get_dashboard_stats (migrasi 0017)
│   │   ├── pengaturan/page.tsx     # settings (identitas + tema)
│   │   ├── buku/page.tsx + tambah + edit/[id]
│   │   ├── anggota/page.tsx
│   │   ├── peminjaman/page.tsx     # loans: list + LoanForm + aksi extend/return/kondisi
│   │   ├── denda/page.tsx
│   │   ├── reservasi/page.tsx
│   │   ├── kategori/page.tsx / rak/page.tsx / layanan/page.tsx
│   │   ├── artikel/page.tsx + edit/[id]
│   │   ├── banner/page.tsx + edit/[id]
│   │   ├── konten/page.tsx + FaqsTab/PagesTab/TestimonialsTab
│   │   ├── menu/page.tsx
│   │   └── logs/page.tsx           # RSC force-dynamic, baca activity_logs LANGSUNG (bukan /api/logs — 404)
│   ├── daftar/page.tsx             # registrasi anggota (publik)
│   ├── login/{page,layout}.tsx
│   ├── api/                        # REST contract (lihat docs/api-contract.md + openapi.yaml)
│   │   ├── settings/route.ts       # GET public (whitelist field) + PUT admin
│   │   ├── settings/theme/route.ts # admin only, layout-only
│   │   ├── books/route.ts + [id]/route.ts
│   │   ├── categories/route.ts + racks/route.ts
│   │   ├── members/route.ts
│   │   ├── loans/route.ts + [id]/route.ts + [id]/return/route.ts
│   │   ├── reservations/route.ts + [id]/route.ts + [id]/checkout/route.ts
│   │   ├── fines/route.ts + [id]/route.ts + [id]/pay/route.ts
│   │   ├── articles/route.ts
│   │   ├── banners/route.ts
│   │   ├── pages/route.ts, menus/route.ts, services/route.ts, testimonials/route.ts, faqs/route.ts
│   │   └── health/, readyz/, metrics/, register/, docs/
│   ├── layout.tsx                  # root: font, theme provider, viewport
│   ├── globals.css                 # Tailwind v4 + token tema
│   ├── error.tsx / global-error.tsx / not-found.tsx
│   └── manifest.ts / robots.ts / sitemap.ts
├── components/
│   ├── public/   # Navbar (menu dinamis), Footer (settings), BookCard, CatalogExplorer, dll
│   ├── admin/    # Sidebar, DataTable, Forms (BookForm, LoanForm, SettingsForm), StatCard, Modal, dll
│   ├── hero/ + layout/ # varian tema (per family: classic, sketch, editorial, dll)
│   └── ui/       # Button, Input, Badge, Modal, Pagination (Tailwind only, tanpa komponen UI library)
├── lib/
│   ├── supabase/                   # client.ts (browser) | server.ts (RSC/route) | middleware.ts (refresh)
│   ├── settings.ts                 # getLibrarySettings() cached + helper (jam operasional, sosmed, fine rate)
│   ├── supabase/auth.ts            # guard kanonis: requireStaff/getSession + jsonError + slugify
│   ├── paging.ts                   # parsePaging (page/per_page|limit, maks 100) — SATU kontrak pagination
│   ├── loans-overdue.ts            # definisi tunggal status terlambat (issue #57)
│   ├── loan-eligibility.ts         # gate kelayakan pinjam (issue #56)
│   ├── returnLoan.ts / loans-return.ts # pengembalian (kondisi RPC 0011)
│   ├── reservation-checkout.ts / reservation-sweep.ts
│   ├── validation/ + validation.ts # validasi per-entitas (bukan Zod per route)
│   └── ... (per-domain: books/, articles, banners, konten-api, stats, themes, dll)
├── middleware.ts                   # auth refresh + proteksi /admin
├── supabase/migrations/            # 0001..0024 (SQL lineal, RPC + RLS + index)
├── tests/                          # vitest (unit/components) + e2e playwright + integration
└── docs/                           # arsitektur, db-design, api-contract, adr, runbook, onboarding
```

**Keputusan struktur:**

- Opsi A (dipilih): route group `(public)` untuk OPAC + folder flat `admin/` (tanpa `(admin)` — guard cukup di `admin/layout.tsx`), satu app — sharing `lib/settings.ts`, satu deploy.
- Opsi B (ditolak): dua app terpisah (public + admin) — duplikasi auth/settings, 2x deploy cost, over-engineering untuk skala perpus.

---

## 3. Alur Ujung-ke-Ujung

### 3.1 Public OPAC (unauthenticated, SEO, edge-cached)

```
Browser → Cloudflare Edge → Next RSC (app/(public))
  → lib/settings.ts:getLibrarySettings()   [cache: 'force-cache', tag 'settings']
   → Supabase PostgREST (anon key, RLS SELECT public) : settings(id=1), books (kolom stock_total/stock_available), articles published, banners active, menus, pages
  → HTML streaming (Suspense: BannerSlider, BookGrid skeleton)
```

- Katalog `/katalog?q=&kategori=&rak=&tersedia=1&page=`: Server Component baca `searchParams`, query Supabase langsung (bukan via /api) untuk SEO + 1 hop lebih sedikit. Form search = client component yang `router.push` dengan query baru.
- Detail `/buku/[slug]`: `generateStaticParams` untuk 100 buku populer + `dynamicParams=true` sisanya; `generateMetadata` ambil nama perpus + judul buku dari DB (bukan hardcoded).
- Reservasi buku: tombol "Reservasi" → jika belum login redirect `/login?next=/buku/[slug]` → POST `/api/reservations` (anggota).

### 3.2 Admin CMS (authenticated, dynamic, no-cache)

```
Browser → middleware.ts (refresh session + role gate staff) → admin/layout.tsx (cek profiles.role admin|librarian)
  → Server Component fetch via supabase server client (service role TIDAK di client; RLS per role)
  → Mutasi via /api/* (route handler validasi role) atau Server Actions*
```

> *Rekomendasi: mutasi admin lewat **Route Handlers `/api/*`** (kontrak jelas untuk worker + gampang dites curl), bukan Server Actions yang tersebar. Server Actions hanya untuk form kecil non-kritis bila worker mau (tetap wajib validasi role di server).

### 3.3 Diagram Peran

| Aksi                                 | Anon | Anggota | Pustakawan           | Admin |
| ------------------------------------ | ---- | ------- | -------------------- | ----- |
| Lihat OPAC/artikel/halaman           | ✅   | ✅      | ✅                   | ✅    |
| Reservasi + riwayat pinjaman sendiri | ❌   | ✅      | ✅                   | ✅    |
| CRUD buku/kategori/rak/stok          | ❌   | ❌      | ✅                   | ✅    |
| Approve loans/returns/fines          | ❌   | ❌      | ✅                   | ✅    |
| Kelola members (non-role)            | ❌   | ❌      | ✅ (tanpa ubah role) | ✅    |
| Ubah settings/menus/roles/logs       | ❌   | ❌      | ❌                   | ✅    |
| Hapus permanen                       | ❌   | ❌      | ❌                   | ✅    |

---

## 4. Auth & Roles

- **Provider:** Supabase Auth (email+password). Tabel `profiles(id UUID PK → auth.users, role: admin|pustakawan|anggota, member_id nullable)`.
- **Alur:** trigger `handle_new_user` buat `profiles` default `anggota` + baris `members` (no_anggota auto). Admin ubah role manual via admin UI (hanya admin).
- **Enforcement 3 lapis:**
  1. `middleware.ts` refresh session + redirect `/admin/*` tanpa session → `/login`; non-staff (role bukan admin|librarian) → `/` (fail-closed).
  2. `admin/layout.tsx` cek `profiles.role` + guard API `requireStaff()` (kanonis, berbasis `normalizeRole`) → 403 bila role tak cukup.
  3. **RLS Supabase** sebagai sumber kebenaran (policies per tabel, plus trigger 0019 `guard_profiles_role_change` untuk `profiles.role`) — jangan percaya guard UI saja.
- **Opsi ditolak:** NextAuth terpisah — duplikasi user store, menambah adapter + biaya integrasi tanpa manfaat (Supabase Auth sudah cukup + cocok dengan RLS).

---

## 5. Strategi Data-Fetching (SSR + RSC)

| Area                      | Pola                                                                                                                             | Contoh                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Public SEO (home, detail) | RSC async + `fetch` cache / Supabase langsung, `revalidate`                                                                      | `getLibrarySettings()` + query books |
| Katalog search/filter     | RSC + `searchParams`, query Supabase langsung (bukan via /api) untuk SEO + 1 hop lebih sedikit; pencarian via RPC `search_books` | `/katalog`                           |
| Admin list                | Client component → `fetch('/api/...')` `no-store`; pagination `?page=` (envelope `pagination`, lihat docs/api-contract.md)       | `/admin/peminjaman?page=2`           |
| Mutasi                    | Client → `fetch('/api/...')` → `router.refresh()` + toast                                                                        | pinjam/kembali                       |
| Logs audit                | RSC `force-dynamic` baca `activity_logs` langsung (TIDAK ada `/api/logs`)                                                        | `/admin/logs`                        |

**Aturan:**

- Public JANGAN pakai `cookies()`-dependent fetch yang memaksa dynamic — pisahkan komponen settings (cached) dari komponen user-specific.
- Semua query list wajib paginasi (`range()`) + `order()` eksplisit. Count: `estimated` untuk `/api/books`, `exact` untuk list staf ber-total (loans/members/fines/reservations) — satu envelope `pagination` untuk semua (issue #61).
- N+1 dilarang: pakai embed PostgREST (mis. `select('*, categories(id,name,slug), racks(code,name,location)')`) atau RPC agregat (`get_dashboard_stats`, `search_books`) — view `books_with_stock` sudah tidak ada.

---

## 6. Caching

| Layer                  | Kebijakan                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `getLibrarySettings()` | `unstable_cache` / fetch `next:{tags:['settings']}`; `revalidateTime` 3600 dtk; admin PUT settings → `revalidateTag('settings')` |
| Home/artikel/banner    | ISR `export const revalidate = 300` (5 mnt)                                                                                      |
| Detail buku            | `revalidate = 600` + `generateStaticParams` top-100                                                                              |
| Katalog dengan `?q=`   | `force-dynamic`, no cache (hasil personalisasi search)                                                                           |
| Cloudflare             | Page Rules/CDN cache asset `_next/static/*` + image Supabase (Cache-Control `public,max-age=31536000,immutable`)                 |
| Invalidasi             | Tiap PUT/POST/DELETE konten → `revalidatePath` + `revalidateTag` yang relevan (worker wajib cantumkan di tiap route)             |

- Opsi A (dipilih): Next fetch-cache + tag invalidation — sederhana, cocok 1 region DB.
- Opsi B (ditolak): Redis/Upstash layer — biaya + operasional tambahan, belum perlu di skala perpus (<100k row).

---

## 7. Storage (Supabase Buckets)

| Bucket           | Public?     | Isi                                                                                              | Aturan                                                                                                                                                                             |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library-assets` | public read | cover buku (`books/{id}/cover.webp`), logo, favicon, banner slider, gambar artikel, foto anggota | anon SELECT; tulis hanya pustakawan+admin (foto anggota: user boleh tulis folder `auth.uid()` miliknya); batas 2MB, mimetype image/*; pakai transform `?width=400` untuk thumbnail |

- Upload via admin UI → Supabase Storage langsung (signed) lalu simpan `cover_url`/`logo_url` ke DB. Jangan proxy binary lewat Next route (boros Workers subrequest).
- Cleanup: hapus file lama saat cover/logo diganti (worker wajib implement di PUT).

---

## 8. Tema Premium Elegant, Mobile-First

- Registry `src/lib/themes.ts`: 6 preset `THEMES` (`emerald`, `midnight`, `paper`, `brutalist`, `ocean`, `sketch`). Tiap `ThemeDef` = `tokens` (8 hex: `brand`, `brand-soft`, `brand-strong`, `accent`, `accent-soft`, `surface`, `ink`, `heading`) + `fonts` + `radius` + `shadow` + `spacing` + `layout` (`headerVariant`/`heroVariant`/`footerVariant`/`homepageSections`) + `ornament` (`none`|`ruled-paper`) + `version: 1`. Default/fallback `emerald` via `getTheme()`; `DEFAULT_THEME='emerald'`.
- Famili `src/lib/theme-compat.ts` (`THEME_FAMILIES`): `formal` (emerald/ocean/midnight/paper), `hard` (brutalist), `hand` (sketch). Matriks `ALLOWED_LAYOUT` membatasi variant header/hero/footer yang kompatibel per famili; `isCompatible()` fail-closed, `fallbackVariant()` kembali ke variant bawaan tema. Famili tak dikenal → `formal`.
- Fase 1 — tema dikunci, hanya layout: `tokens`/`fonts`/`radius`/`shadow`/`spacing` ditolak API dengan 422. Override valid hanya `{layout:{headerVariant?,heroVariant?,footerVariant?,homepageSections?}}` (maks 7 section, `order` int 0–50, ≤8000 char) — validasi strict di `src/lib/theme-overrides.ts` (`ThemeOverridesLayoutSchema`), sanitasi lenient di jalur render (`sanitizeLayoutOverrides`).
- Render: `getEffectiveTheme(baseId, rawOverrides)` / `getEffectiveThemeFromSettings(settings)` = clone base + terapkan override layout yang kompatibel (inkompatibel → fallback bawaan; tak pernah mutasi `THEMES`; `NULL` → clone base). `layout.tsx` (`app/` + `app/(public)/`) menambahkan class `ornament-ruled-paper` bila `effective.ornament==='ruled-paper'` (saat ini hanya `sketch`).
- Invalidasi tema: `PUT /api/settings/theme` (admin-only) → `revalidateTag('settings','max')` + `revalidatePath('/')` agar tema baru langsung ter-render.
- Layout: navbar sticky blur + drawer mobile; hero slider 16:9 → kartu buku grid 2 kolom (mobile) → 5 kolom (desktop); footer kaya (alamat, jam operasional JSON dirender, sosmed JSON icons).
- Aksesibilitas: kontras ≥4.5, focus ring, alt cover = judul buku. Lighthouse target ≥90 mobile.

---

## 9. Rencana Eksekusi per Worker (urutan wajib)

1. **Worker-DB:** migrasi SQL semua tabel + RLS + buckets + seed `settings` + admin awal. Verifikasi: `supabase db push` sukses + SELECT anon vs admin sesuai RLS.
2. **Worker-Settings/Core:** `lib/supabase/*`, `lib/settings.ts`, `(public)/layout.tsx` dinamis + `api/settings`. Verifikasi: ganti nama perpus di admin → seluruh halaman berubah tanpa edit kode.
3. **Worker-OPAC:** home, katalog, detail buku, artikel, halaman dinamis. Verifikasi: Lighthouse + `view-source` metadata berisi nama perpus dari DB.
4. **Worker-Sirkulasi:** loans/reservations/fines + trigger stok. Verifikasi: pinjam→stok berkurang, kembali telat→denda otomatis.
5. **Worker-Admin Konten:** banners/menus/pages/testimonials/faqs + upload storage. Verifikasi: CRUD tanpa redeploy.
6. **Worker-Polish:** PWA ringan + 404 + empty states + audit hardcoded (`grep` nama perpus di `app/` harus nol hasil di luar seed).

## 10. Risiko & Mitigasi

| Risiko                                          | Mitigasi                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Workers runtime tak support lib Node (sharp/fs) | resize via Supabase Image Transform; validasi file di client+route             |
| RLS salah → bocor data member                   | RLS default DENY; test matrix anon/anggota/pustakawan/admin di CI (skrip curl) |
| Single-row settings race                        | `id=1` PK + CHECK; PUT pakai upsert + `revalidateTag`                          |
| Cloudflare + SSR cookie size                    | `@supabase/ssr` chunk cookie; jangan simpan state besar di cookie              |
