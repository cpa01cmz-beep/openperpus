# ADR-002 — Deploy: Cloudflare Workers → Vercel

> Status: **DITERIMA**. Menggantikan bagian "Deploy" pada ADR-001 (stack & data tetap sama).

## Konteks

Deploy Cloudflare Workers (via `@opennextjs/cloudflare`) produksi **gagal dengan error 1102
"Worker exceeded resource limits"** pada `openperpus.cmz.web.id`. Penyebab di repo ini:

- `isomorphic-dompurify` menarik **jsdom** ke server bundle → chunk `chunks/4173.js` dan
  `chunks/8725.js` masing-masing ~6 MB, di-load oleh `sitemap.xml` dan route admin buku.
  Beban parse chunk + `new JSDOM()` di top-level module (bom memori) vs batas isolate Workers.
- Workers free plan hanya memberi **10 ms CPU/request** dan **128 MB RAM** per isolate; SSR
  Next.js + middleware CSP nonce per-request sudah bisa lewat batas itu.

## Keputusan

- **Deploy:** Vercel (runtime Node penuh). Tidak ada batas 10 ms CPU / 128 MB isolate.
- **Sanitizer HTML konten:** ganti `isomorphic-dompurify` → `sanitize-html` (parser murni
  tanpa DOM, aman di Workers maupun Node) supaya bundle tidak membawa jsdom lagi.
- **Rollback:** worker Cloudflare tidak dihapus pada PR ini (`wrangler.toml`,
  `open-next.config.ts`, skrip `cf:*`, dan patch tetap ada). Cleanup jadi PR terpisah
  setelah Vercel stabil.

## Konsekuensi

- **Positif:** error 1102 hilang; bundle server turun drastis (jsdom out); build Vercel
  sederhana via `vercel.json` (`next build`), tanpa adaptor — sementara `build` di
  `package.json` tetap opennext agar check wajib "Workers Builds" (integrasi Git CF)
  tetap hijau dan jalur rollback worker tetap hidup.
- **Negatif / mitigasi:**
  - Batas CPU tak terbatas → ada biaya saat trafik naik. Mitigasi: Vercel cache + Supabase.
  - Domain `openperpus.cmz.web.id` butuh DNS record ke Vercel; Supabase Auth harus
    mendaftarkan redirect URL baru.
  - `.gitignore` sudah mengabaikan `.vercel` dan `NEXT_PUBLIC_*` tetap aman di-commit.

## Kepatuhan Worker

- Env production hanya di Vercel dashboard (`wrangler secret put` hanya untuk rollback worker).
- `NEXT_PUBLIC_SITE_URL` wajib diisi agar `getSiteUrl()` konsisten (SEO metadata + CSP).
