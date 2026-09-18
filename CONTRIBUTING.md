# Berkontribusi ke openperpus

## Setup

```bash
npm install
cp .env.example .env.local   # isi kredensial Supabase
```

Jalankan migrasi Supabase sesuai urutan di `README.md` (bagian Migrasi Supabase),
lalu:

```bash
npm run dev   # http://localhost:3000
```

## Alur kerja

1. Buat branch `feature/<nama>` atau `fix/<nama>` dari `main`.
2. Buka PR ke `main` mengikuti template (isi cara test + checklist).
3. Tunggu review + CI hijau sebelum merge.

## Checks wajib sebelum PR

```bash
npm run check   # typecheck + lint
npm test        # vitest
npm run build   # build Next.js
```

## Aturan

- Jangan commit secret: `.env.local` dan kredensial apa pun dilarang masuk repo.
- Satu PR satu tujuan; refactor besar dipisah dari bugfix.
- Perubahan UI/theme wajib lampirkan screenshot.
