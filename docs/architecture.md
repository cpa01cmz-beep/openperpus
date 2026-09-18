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
│   ├── (public)/
  │   │   ├── layout.tsx              # baca settings (cached), pasang SEO dinamis, header/footer dinamis
│   │   ├── page.tsx                # home: banner slider + sambutan + buku terbaru/populer + artikel + testimoni
│   │   ├── katalog/page.tsx        # OPAC search + filter kategori/rak/ketersediaan (SSR, searchParams)
│   │   ├── buku/[slug]/page.tsx    # detail buku (generateMetadata dinamis) + salinan tersedia + reservasi
│   │   ├── artikel/page.tsx + [slug]/page.tsx
│   │   ├── halaman/[slug]/page.tsx # pages dinamis (visi-misi, dll — slug dari tabel pages)
│   │   ├── faq/page.tsx
│   │   └── kontak/page.tsx         # alamat/telepon/jam dari settings
│   ├── (admin)/
│   │   ├── layout.tsx              # guard session + role check (admin/pustakawan), sidebar dinamis
│   │   ├── admin/page.tsx          # dashboard: statistik loans, overdue, stok, grafik
│   │   ├── admin/settings/page.tsx
│   │   ├── admin/books/page.tsx + [id]/page.tsx
│   │   ├── admin/members/page.tsx
│   │   ├── admin/loans/page.tsx
│   │   ├── admin/reservations/page.tsx
│   │   ├── admin/contents/page.tsx # articles, banners, pages, testimonials, faqs, menus
│   │   └── admin/logs/page.tsx
│   ├── api/                        # REST contract (lihat docs/api-contract.md)
│   │   ├── settings/route.ts       # GET public (whitelist field) + PUT admin
│   │   ├── books/route.ts + [id]/route.ts
│   │   ├── categories/route.ts
│   │   ├── members/route.ts
│   │   ├── loans/route.ts + [id]/route.ts
│   │   ├── articles/route.ts
│   │   └── banners/route.ts
│   ├── login/page.tsx
│   └── layout.tsx                  # root: font, theme provider, viewport
├── components/
│   ├── public/   # Navbar (menu dinamis), Footer (settings), BookCard, BannerSlider, SearchBar
│   ├── admin/    # Sidebar, DataTable, Forms (BookForm, SettingsForm), StatCard
│   └── ui/       # Button, Input, Badge, Modal, Pagination (shadcn-style, Tailwind only)
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # browser client (@supabase/ssr createBrowserClient)
│   │   ├── server.ts               # server/RSC client (createServerClient + cookies)
│   │   └── middleware.ts           # refresh session (updateSession)
│   ├── settings.ts                 # getLibrarySettings() cached + helper (jam operasional, sosmed)
│   ├── auth.ts                     # getSessionUser(), requireRole(['admin','pustakawan'])
│   └── utils.ts                    # slugify, formatRupiah, due-date calc
├── middleware.ts                   # root: pakai lib/supabase/middleware.ts (auth refresh + redirect /login)
├── styles/globals.css              # Tailwind + CSS var tema dari settings (primary color)
├── types/database.ts               # tipe hasil `supabase gen types`
└── docs/                           # arsitektur, db-design, api-contract, adr
```

**Keputusan struktur:**
- Opsi A (dipilih): Route Groups `(public)` / `(admin)` satu app — sharing `lib/settings.ts`, satu deploy.
- Opsi B (ditolak): dua app terpisah (public + admin) — duplikasi auth/settings, 2x deploy cost, over-engineering untuk skala perpus.

---

## 3. Alur Ujung-ke-Ujung

### 3.1 Public OPAC (unauthenticated, SEO, edge-cached)

```
Browser → Cloudflare Edge → Next RSC (app/(public))
  → lib/settings.ts:getLibrarySettings()   [cache: 'force-cache', tag 'settings']
  → Supabase PostgREST (anon key, RLS SELECT public) : settings(id=1), books+stock view, articles published, banners active, menus, pages
  → HTML streaming (Suspense: BannerSlider, BookGrid skeleton)
```

- Katalog `/katalog?q=&kategori=&rak=&tersedia=1&page=`: Server Component baca `searchParams`, query Supabase langsung (bukan via /api) untuk SEO + 1 hop lebih sedikit. Form search = client component yang `router.push` dengan query baru.
- Detail `/buku/[slug]`: `generateStaticParams` untuk 100 buku populer + `dynamicParams=true` sisanya; `generateMetadata` ambil nama perpus + judul buku dari DB (bukan hardcoded).
- Reservasi buku: tombol "Reservasi" → jika belum login redirect `/login?next=/buku/[slug]` → POST `/api/reservations` (anggota).

### 3.2 Admin CMS (authenticated, dynamic, no-cache)

```
Browser → middleware.ts (refresh session) → app/(admin)/layout.tsx: requireRole()
  → Server Component fetch via supabase server client (service role TIDAK di client; RLS per role)
  → Mutasi via /api/* (route handler validasi role) atau Server Actions*
```

> *Rekomendasi: mutasi admin lewat **Route Handlers `/api/*`** (kontrak jelas untuk worker + gampang dites curl), bukan Server Actions yang tersebar. Server Actions hanya untuk form kecil non-kritis bila worker mau (tetap wajib validasi role di server).

### 3.3 Diagram Peran

| Aksi | Anon | Anggota | Pustakawan | Admin |
|---|---|---|---|---|
| Lihat OPAC/artikel/halaman | ✅ | ✅ | ✅ | ✅ |
| Reservasi + riwayat pinjaman sendiri | ❌ | ✅ | ✅ | ✅ |
| CRUD buku/kategori/rak/stok | ❌ | ❌ | ✅ | ✅ |
| Approve loans/returns/fines | ❌ | ❌ | ✅ | ✅ |
| Kelola members (non-role) | ❌ | ❌ | ✅ (tanpa ubah role) | ✅ |
| Ubah settings/menus/roles/logs | ❌ | ❌ | ❌ | ✅ |
| Hapus permanen | ❌ | ❌ | ❌ | ✅ |

---

## 4. Auth & Roles

- **Provider:** Supabase Auth (email+password). Tabel `profiles(id UUID PK → auth.users, role: admin|pustakawan|anggota, member_id nullable)`.
- **Alur:** trigger `handle_new_user` buat `profiles` default `anggota` + baris `members` (no_anggota auto). Admin ubah role manual via admin UI (hanya admin).
- **Enforcement 3 lapis:**
  1. `middleware.ts` refresh session + redirect `/admin/*` tanpa session → `/login`.
  2. `(admin)/layout.tsx` panggil `requireRole()` → tampil 403 bila role tak cukup.
  3. **RLS Supabase** sebagai sumber kebenaran (policies per tabel, lihat db-design). Jangan percaya guard UI saja.
- **Opsi ditolak:** NextAuth terpisah — duplikasi user store, menambah adapter + biaya integrasi tanpa manfaat (Supabase Auth sudah cukup + cocok dengan RLS).

---

## 5. Strategi Data-Fetching (SSR + RSC)

| Area | Pola | Contoh |
|---|---|---|
| Public SEO (home, detail) | RSC async + `fetch` cache / Supabase langsung, `revalidate` | `getLibrarySettings()` + query books |
| Katalog search/filter | RSC + `searchParams`, `dynamic='force-dynamic'` bila query ada; prefetch kategori statis | `/katalog` |
| Admin list | RSC `cache:'no-store'` + pagination server-side | `/admin/loans?page=` |
| Mutasi | Client → `fetch('/api/...')` → `router.refresh()` + toast | pinjam/kembali |
| Realtime ringan | Supabase Realtime hanya di dashboard admin (stok/loan baru); JANGAN di public | badge overdue |

**Aturan:**
- Public JANGAN pakai `cookies()`-dependent fetch yang memaksa dynamic — pisahkan komponen settings (cached) dari komponen user-specific.
- Semua query list wajib paginasi (`range()`) + `order()` eksplisit + `count:'exact'` untuk pagination.
- N+1 dilarang: pakai `select('*, categories(name), book_copies(count)')` / view `books_with_stock`.

---

## 6. Caching

| Layer | Kebijakan |
|---|---|
| `getLibrarySettings()` | `unstable_cache` / fetch `next:{tags:['settings']}`; `revalidateTime` 3600 dtk; admin PUT settings → `revalidateTag('settings')` |
| Home/artikel/banner | ISR `export const revalidate = 300` (5 mnt) |
| Detail buku | `revalidate = 600` + `generateStaticParams` top-100 |
| Katalog dengan `?q=` | `force-dynamic`, no cache (hasil personalisasi search) |
| Cloudflare | Page Rules/CDN cache asset `_next/static/*` + image Supabase (Cache-Control `public,max-age=31536000,immutable`) |
| Invalidasi | Tiap PUT/POST/DELETE konten → `revalidatePath` + `revalidateTag` yang relevan (worker wajib cantumkan di tiap route) |

- Opsi A (dipilih): Next fetch-cache + tag invalidation — sederhana, cocok 1 region DB.
- Opsi B (ditolak): Redis/Upstash layer — biaya + operasional tambahan, belum perlu di skala perpus (<100k row).

---

## 7. Storage (Supabase Buckets)

| Bucket | Public? | Isi | Aturan |
|---|---|---|---|
| `library-assets` | public read | cover buku (`books/{id}/cover.webp`), logo, favicon, banner slider, gambar artikel, foto anggota | anon SELECT; tulis hanya pustakawan+admin (foto anggota: user boleh tulis folder `auth.uid()` miliknya); batas 2MB, mimetype image/*; pakai transform `?width=400` untuk thumbnail |

- Upload via admin UI → Supabase Storage langsung (signed) lalu simpan `cover_url`/`logo_url` ke DB. Jangan proxy binary lewat Next route (boros Workers subrequest).
- Cleanup: hapus file lama saat cover/logo diganti (worker wajib implement di PUT).

---

## 8. Tema Premium Elegant, Mobile-First

- Token warna via CSS variables yang diisi dari `settings.theme` JSON (`{primary:'#1B4332', accent:'#C9A227', font:'Playfair Display+Inter'}`) — Tailwind `primary`/`accent` map ke `var()`. Default fallback bila settings kosong.
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

| Risiko | Mitigasi |
|---|---|
| Workers runtime tak support lib Node (sharp/fs) | resize via Supabase Image Transform; validasi file di client+route |
| RLS salah → bocor data member | RLS default DENY; test matrix anon/anggota/pustakawan/admin di CI (skrip curl) |
| Single-row settings race | `id=1` PK + CHECK; PUT pakai upsert + `revalidateTag` |
| Cloudflare + SSR cookie size | `@supabase/ssr` chunk cookie; jangan simpan state besar di cookie |
