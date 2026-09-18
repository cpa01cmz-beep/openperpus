# ADR-001 — Stack: Next.js 14 + Supabase + Cloudflare Pages

> Status: **DITERIMA** (tetap, jangan diubah worker tanpa ADR baru).

## Konteks

Greenfield CMS Perpustakaan: OPAC publik SEO + admin sirkulasi + konten dinamis. Tim kecil (worker swarm), satu repo, deploy murah/edge, data relasional (buku, eksemplar, loans, denda). Kosong: tanpa legacy.

## Keputusan

- **Frontend+Backend:** Next.js 14 App Router + TypeScript + TailwindCSS.
- **Data+Auth+Storage:** Supabase (Postgres + RLS + Auth + Storage + Realtime ringan) via `@supabase/ssr`.
- **Deploy:** Cloudflare Pages via `@opennextjs/cloudflare` (Workers runtime).

## Opsi yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Vonis |
|---|---|---|---|
| **A. Next.js + Supabase + Cloudflare (dipilih)** | 1 repo SSR/RSC SEO; RLS = otorisasi di DB (aman walau bug UI); Auth+Storage bawaan; edge murah & cepat di ID; openNext adaptor matang | Workers runtime batas Node API; keluar Cloudflare bila perlu workload berat | ✅ paling sederhana yang cukup |
| B. Next.js + Prisma + VPS Postgres | kontrol penuh SQL/ORM | kelola VPS, backup, auth (NextAuth), storage (S3) sendiri — beban ops besar untuk tim kecil | ❌ over-ops |
| C. Laravel + MySQL + shared hosting | CRUD admin cepat | SSR/SEO modern + realtime lemah; 2 paradigma bila ingin edge; DX Tailwind/React lebih lemah | ❌ mundur dari target UX premium |
| D. Microservices (api-gateway + Kafka + K8s) | skala raksasa | biaya/kompleksitas 10x untuk <100k baris — klasik over-engineering | ❌ ditolak tegas |

Perbandingan ringkas: kompleksitas A<B<C<D; biaya A terendah (free-tier Supabase+CF); risiko A terendah (managed); kecepatan delivery A tercepat (1 deploy, RLS gantikan middleware auth custom).

## Konsekuensi

- **Positif:** worker fokus fitur (bukan infra); keamanan berlapis (middleware + layout guard + RLS); SEO dari RSC; cache edge murah.
- **Negatif / mitigasi:**
  - Batas Workers (no `fs`/`sharp`, 10ms CPU wajar) → resize via Supabase Image Transform; logika berat (laporan) jadi query DB + CSV di route, bukan worker image.
  - Vendor lock ringan ke Supabase/Cloudflare → mitigasi: SQL migrasi standar Postgres (mudah pindah), tipe di `types/database.ts` terpisah.
  - Realtime CF-WS: pakai polling ringan/SSE untuk dashboard bila Realtime terhambat — bukan blocker OPAC.

## Kepatuhan Worker

- Pakai `@supabase/ssr` (bukan `@supabase/supabase-js` mentah di server).
- Jangan tambah ORM/queue/K8s tanpa ADR baru + persetujuan mandor.
- Semua identitas dari `library_settings` — pelanggaran = rework.
