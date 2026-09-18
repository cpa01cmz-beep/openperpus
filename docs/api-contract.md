# API Contract — `/api/*` (REST)

> Basis: Next.js Route Handlers + Supabase server client. Semua response JSON. Auth via Supabase session cookie. Lihat `docs/architecture.md §4` untuk roles.

## Konvensi Global

- **Base:** `/api/<resource>` + `/api/<resource>/[id]`.
- **Auth header:** cookie session (browser). Non-browser pakai `Authorization: Bearer <supabase_jwt>`.
- **Format sukses:** `{ "data": <object|array>, "meta"?: { "page":1,"per_page":20,"total":123 } }`
- **Format error:** `{ "error": { "code":"FORBIDDEN", "message":"..." } }` + HTTP status tepat (400/401/403/404/409/422/500).
- **Pagination:** `?page=1&per_page=20&q=&sort=&order=asc|desc`. Default `per_page=20`, maks 100.
- **Cache:** GET publik kirim `Cache-Control: s-maxage=300`; GET admin `no-store`. Mutasi balas dengan `revalidated: ["tag/path"]`.
- **Validasi:** Zod di tiap route; 422 + field errors bila gagal.

---

## 1. Settings — identitas dinamis (KRITIS: tanpa hardcoded)

### `GET /api/settings` — publik (whitelist)
- Auth: anon boleh. Kembalikan field publik SAJA (tanpa `updated_by` internal bila sensitif — di sini aman, tetap whitelist).
- Response `200`:
```json
{ "data": {
  "nama_perpus":"Perpustakaan Cahaya Ilmu","tagline":"...","logo_url":"...","favicon_url":"...",
  "alamat":"...","telepon":"...","email":"...","jam_operasional":[...],"sosmed":{...},
  "sambutan":"...","sambutan_nama":"...","visi":"...","misi":"...",
  "seo_title":"...","seo_description":"...","seo_keywords":"...","theme":{...},
  "denda_per_hari":1000,"lama_pinjam_hari":7,"maks_pinjam":3 } }
```

### `PUT /api/settings` — admin only
- Body: subset field di atas + upload dilakukan terpisah ke Storage lalu kirim URL.
- Validasi: `nama_perpus` min 3, `email` format, `jam_operasional` array `{hari,buka,tutup}`, `sosmed` object string URL/username.
- Efek: `revalidateTag('settings')` + `revalidatePath('/')`. Tulis `activity_logs`.
- Response: `{ "data": {...}, "revalidated":["settings","/"] }`

## 2. Books (OPAC + admin)

### `GET /api/books?page=&per_page=&q=&kategori=&rak=&tersedia=1&featured=1&sort=terbaru`
- Publik. `q` = FTS judul/penulis/penerbit/isbn. `tersedia=1` → hanya yang `tersedia>0` (via view `books_with_stock`).
- Item:
```json
{ "id":"uuid","judul":"...","slug":"...","penulis":"...","penerbit":"...","tahun":2023,
  "cover_url":"...","category":{"id":"...","nama":"..."},"rack":{"kode":"R-A1"},
  "total_copy":5,"tersedia":2,"is_featured":false }
```
### `GET /api/books/[id|slug]`
- Publik. Detail + `copies:[{kode_eksemplar,status}]` (hanya status, tanpa info member).
### `POST /api/books` — pustakawan+
- Body: `{judul, penulis, penerbit?, tahun?, isbn?, category_id?, rack_id?, deskripsi?, cover_url?, jumlah_halaman?, bahasa?, is_featured?, copies?: [{kode_eksemplar,kondisi}] }`
- Efek: buat book + copies (transaksi), `revalidateTag('books')`, log.
- `201 {data: book}` / `409` bila isbn/slug bentrok.
### `PUT /api/books/[id]` — pustakawan+ (hapus cover lama bila `cover_url` berubah)
### `DELETE /api/books/[id]` — admin only (tolak `409` bila ada loan aktif)

## 3. Categories & Racks

### `GET /api/categories` / `GET /api/racks` — publik (untuk filter OPAC)
- Response array `{id,nama,slug,kode,jumlah_buku?}`.
### `POST /api/categories` — pustakawan+ `{nama, deskripsi?, icon?}` → slug auto.
### `PUT/DELETE /api/categories/[id]` — pustakawan+/admin (DELETE → `409` bila dipakai buku).
- Racks pola identik: `{kode, nama, lantai?, keterangan?}`.

## 4. Members

### `GET /api/members?page=&q=&status=` — pustakawan+ (`q` = nama/no_anggota).
### `GET /api/members/[id]` — pustakawan+; anggota hanya miliknya (`403` bila bukan).
- Sertakan ringkasan: `{pinjaman_aktif: n, denda_belum_bayar: rp, riwayat: [...]}`.
### `POST /api/members` — pustakawan+ `{nama, email?, telepon?, alamat?, foto_url?}` → `no_anggota` auto.
### `PUT /api/members/[id]` — pustakawan+ (role TIDAK di sini).
### `PUT /api/members/[id]/role` — admin only `{role: admin|pustakawan|anggota}`.

## 5. Loans / Reservations / Fines (sirkulasi)

### `GET /api/loans?status=&member_id=&overdue=1&page=` — pustakawan+ (anggota: otomatis filter miliknya, `member_id` diabaikan).
### `POST /api/loans` (checkout) — pustakawan+
```json
{ "member_id":"uuid", "copy_id":"uuid" }
```
- Server hitung `tanggal_jatuh_tempo = today + lama_pinjam_hari`. Tolak `422` bila: member blokir / cap tercapai / copy tak tersedia / sudah dipinjam.
- `201 {data: loan}` + copy→`dipinjam`.
### `POST /api/loans/[id]/return` — pustakawan+
```json
{ "tanggal_kembali":"2026-09-16", "kondisi":"baik|rusak|hilang" }
```
- Server hitung denda, buat row `fines` bila >0, copy→`tersedia` (atau `rusak/hilang`).
### `GET/POST /api/reservations` — anggota (miliknya) + pustakawan+
- POST anggota: `{book_id}` → `menunggu`. Cancel: `PATCH /api/reservations/[id] {status:"batal"}`.
### `GET /api/fines?member_id=&status=` + `POST /api/fines/[id]/pay {metode}` — anggota baca miliknya; bayar hanya pustakawan+.

## 6. Articles (artikel/berita/event)

### `GET /api/articles?tipe=&q=&page=` — publik hanya `published` (admin: `?status=draft` perlu role).
### `GET /api/articles/[slug]` — publik (published) / staff (semua).
### `POST /api/articles` — pustakawan+ `{judul, tipe, ringkasan?, konten, gambar_url?, status?, published_at?}` → slug auto + unik.
### `PUT/DELETE /api/articles/[id]` — pustakawan+/admin. DELETE → arsip dulu (soft) kecuali admin hard-delete.

## 7. Banners (+ pages/menus/testimonials/faqs — pola sama)

### `GET /api/banners` — publik hanya `is_active` + dalam jadwal; admin `?all=1`.
### `POST /api/banners` — admin only `{judul?, subjudul?, gambar_url, link_url?, urutan?, is_active?, mulai_at?, selesai_at?}`.
### `PUT/DELETE /api/banners/[id]` — admin only. Hapus file Storage lama bila gambar diganti.
- `pages/menus/testimonials/faqs`: GET publik (published/active), mutasi admin (faqs + testimonials-insert boleh pustakawan/anon-terbatas sesuai db-design).

---

## Contoh curl (worker wajib jadikan smoke test)

```bash
curl /api/settings
curl "/api/books?q=laskar&tersedia=1&per_page=5"
curl -X POST /api/loans -H 'Content-Type: application/json' -d '{"member_id":"...","copy_id":"..."}'
```
