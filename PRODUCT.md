# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Pengunjung & anggota perpustakaan Indonesia** — mencari/menelusuri katalog (OPAC), melihat ketersediaan salinan, mereservasi buku, membaca artikel/berita/FAQ, menghubungi perpustakaan. Dipakai mobile-first, jaringan biasa, tanpa pelatihan.
- **Pustakawan & admin** — mengoperasikan CMS: settings, buku+stok, kategori/rak, anggota, sirkulasi (loans/reservations/fines), konten, dan log. Dipakai harian, layar lebar, kecepatan dan kejelasan di atas ekspresi.

## Product Purpose

CMS perpustakaan + OPAC publik dalam satu codebase. Sukses = pengunjung menemukan buku dan menyelesaikan reservasi tanpa hambatan, dan staf mengoperasikan sirkulasi tanpa kesalahan. Seluruh identitas perpustakaan (nama, logo, alamat, jam, sosmed, sambutan, SEO) dibaca dari tabel `settings`, tanpa hardcode di JSX/metadata.

## Positioning

CMS 100% dinamis tanpa hardcoded, dua area dalam satu codebase (`(public)` dan `(admin)`), ter-deploy di edge (Cloudflare Workers via OpenNext, dengan Vercel sebagai target kedua yang didukung penuh), plus sistem lima tema yang bisa ditukar oleh admin dan berlaku untuk seluruh permukaan.

## Operating Context

- Next.js 14 App Router + TypeScript + TailwindCSS + Supabase (`@supabase/ssr`), RBAC admin/pustakawan.
- Deploy: Cloudflare Workers via OpenNext (`npm run deploy`, `npm run cf:preview`) atau Vercel — flip DNS saja (ADR-002).
- Kontrak REST di `openapi.yaml` / `docs/api-contract.md`; migrasi SQL di `supabase/migrations/`.
- Ritual kerja: gerbang kualitas wajib lulus sebelum rilis — `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build` (lihat `SCORE.md`).
- Keputusan arsitektur tercatat di `docs/adr-*.md`; batasan: jangan ganti stack, jangan intro Kafka/microservices/Express terpisah, hindari API Node-only di runtime request.

## Capabilities and Constraints

- Fitur yang ada dan harus tetap berfungsi: OPAC search+filter, detail buku+reservasi, wishlist, artikel/berita/halaman dinamis/FAQ/kontak, sirkulasi pinjam-kembali-denda (termasuk kompensasi & race concurrency), CSV export, dinding notifikasi WA, sweep kadaluarsa, admin dashboard statistik, log, RLS.
- Sistem tema: registry `src/lib/themes.ts` berisi **tepat 5 theme** dengan id `emerald`, `midnight`, `paper`, `brutalist`, `ocean`; tiap theme membawa 8 token warna hex, skala font/radius/shadow/spacing, varian `headerVariant`/`heroVariant`/`footerVariant`, dan urutan `homepageSections` yang bisa di-toggle admin. `emerald` adalah fallback default.
- Satu permukaan kontrol theme: `ThemeSwitcher` → kolom `active_theme`; field legacy `theme_primary`/`theme_accent` sudah dihapus dan API menolaknya.
- Nilai token adalah hex; `:root` tidak boleh menyalin blok emerald (single source = `themes.ts` + blok `[data-theme]` + inline style `layout.tsx`).
- Aksesibilitas & mobile diuji test (`a11y-*`, `mobile-*`): skip link, skiplink accordion, dialog, touch dismiss, pagination sentuh, tabel anti-overflow.
- Stack tetap; tidak boleh diganti. Tanpa `npm install` penuh pun `package.json` harus valid JSON.

## Evidence on Hand

- `SCORE.md` — skor QA 98/100 dengan gerbang lulus penuh.
- `tests/` — ~140 file termasuk 14 file kontrak tema (`theme-*.test.ts`, 1443 baris) yang mengunci nilai token, font, varian header/hero, dan susunan section saat ini.
- `docs/architecture.md`, `docs/api-contract.md`, `docs/db-design.md`, `docs/adr-001-stack.md`, `docs/adr-002-vercel.md`.
- `.agent_memory/eval_*.json` — hasil evaluasi berkala.
- Tidak ada aset gambar buatan/stock yang dikunci; tidak ada `PRODUCT.md`/`DESIGN.md` sebelum dokumen ini. Klaim komersial (harga, pelanggan, benchmark) tidak ada dan tidak boleh dikarang.

## Product Principles

1. Data satu sumber: identitas dan tema dibaca dari `settings`/registry, tidak pernah diduplikasi di JSX atau CSS.
2. Edge-first dan cepat: keputusan diukur dengan lighthouse/gate yang sudah ada, bukan dengan fitur tambahan.
3. Mobile-first dan aksesibel: sentuhan, kontras, skip link, dan semantik adalah syarat, bukan polesan.
4. Stabilitas kontrak: API, RLS, dan perilaku fitur tidak berubah karena alasan visual.
5. Sistem theme adalah produk, bukan aksesori: satu kendali, lima identitas, konsisten di public dan admin.

## Accessibility & Inclusion

Wajib lulus suite a11y/mobile yang sudah ada (skip link, accordion, dialog, sentuh, anti-overflow tabel) dan menjaga kontras teks terbaca di kelima tema — termasuk tema gelap. Tidak ada kebutuhan pengguna khusus yang dinyatakan di luar itu.
