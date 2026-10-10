# API Contract — `/api/*` (REST)

> Basis: Next.js Route Handlers + Supabase server client. Semua response JSON. Auth via Supabase session cookie. Lihat `docs/architecture.md §4` untuk roles. Spesifikasi mesin: `openapi.yaml` (dites bidireksional oleh `tests/openapi-conformance.test.ts`).

## Konvensi Global

- **Base:** `/api/<resource>` + `/api/<resource>/[id]`.
- **Auth header:** cookie session (browser). Non-browser pakai `Authorization: Bearer <supabase_jwt>`.
- **Format sukses:** `{ "data": <object|array> }` — endpoint list **selalu** membawa envelope pagination:
  `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 123, "totalPages": 7 } }`.
  Envelope `meta` (`page/per_page/total`) sudah **dihapus** (issue #61) — jangan tambal fallback ganda di klien.
- **Format error:** `{ "error": { "code":"FORBIDDEN", "message":"..." }, "details"?: {...} }` + HTTP status tepat (400/401/403/404/409/422/500).
- **Pagination:** `?page=1&per_page=20`. `per_page` 1–100 (`limit` alias kompatibilitas). Default per route:

  | Default | Route                                                                                                                                             |
  | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 10      | `/api/books`, `/api/loans`, `/api/members`, `/api/banners`, `/api/articles`                                                                       |
  | 20      | `/api/categories`, `/api/racks`, `/api/faqs`, `/api/services`, `/api/pages`, `/api/menus`, `/api/testimonials`, `/api/reservations`, `/api/fines` |

- **Nama field kanonis = bahasa Inggris** (`title`, `author`, `status`, `book_id`, ...). Beberapa route masih **menerima alias Indonesia** pada body (`judul|title`, `penulis|author`, `nama|name`, `batal|cancelled`) untuk kompatibilitas klien lama — alias ini tidak lagi didokumentasikan sebagai kontrak dan akan dibekukan (issue #71).
- **Transport ID:** `PUT/DELETE` memakai `?id=<uuid>` (boleh koma untuk bulk). `GET /api/<resource>/[id]` menerima id **atau** slug bila resource punya slug.
- **Cache:** GET publik `/api/books` kirim `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`; GET admin `no-store`. Mutasi memanggil `revalidateTag` (mis. `books`, `settings`, `max`).

---

## 1. Settings — identitas dinamis (KRITIS: tanpa hardcoded)

### `GET /api/settings` — publik (whitelist)

- Auth: anon boleh. Kembalikan field publik saja.
- Response `200`:

```json
{ "data": {
  "nama_perpus":"Perpustakaan Cahaya Ilmu","tagline":"...","logo_url":"...","favicon_url":"...",
  "alamat":"...","telepon":"...","email":"...","jam_operasional":[...],"sosmed":{...},
  "sambutan":"...","sambutan_nama":"...","visi":"...","misi":"...",
  "seo_title":"...","seo_description":"...","seo_keywords":"...","active_theme":"emerald","theme_overrides":null,
  "denda_per_hari":1000,"lama_pinjam_hari":7,"maks_pinjam":3 } }
```

- `active_theme`: satu dari `emerald|midnight|paper|brutalist|ocean|sketch`. `theme_overrides`: `null` (pakai bawaan `THEMES`) atau object layout-only `{layout:{headerVariant?,heroVariant?,footerVariant?,homepageSections?}}` — lihat `PUT /api/settings/theme`.

### `PUT /api/settings` — admin only

- Body: subset field di atas + upload dilakukan terpisah ke Storage lalu kirim URL. **Kunci tema (`active_theme`, `theme_overrides`) DITOLAK di sini** → `422 {error:{code:"HINT_USE_THEME_ENDPOINT"}}` dengan pesan "gunakan PUT /api/settings/theme".
- Validasi: `nama_perpus` min 3, `email` format, `jam_operasional` array `{hari,buka,tutup}`, `sosmed` object string URL/username.
- Efek: `revalidateTag('settings')` + `revalidatePath('/')`. Tulis `activity_logs`.

### `PUT /api/settings/theme` — admin only, layout-only (Fase 1: tema dikunci)

- Auth: hanya `admin`. Pustakawan → `403 {error:{code:"THEME_FORBIDDEN"}}`; non-staff → `403 FORBIDDEN` (via `requireStaff`).
- Body strict (kunci asing → `422 VALIDATION`): `{active_theme?, theme_overrides?, reset?}`.

```json
{
  "active_theme": "ocean",
  "theme_overrides": {
    "layout": {
      "headerVariant": "ocean-wave",
      "homepageSections": [{ "id": "hero", "enabled": true, "order": 0 }]
    }
  }
}
```

- Aturan: `active_theme` harus salah satu `emerald|midnight|paper|brutalist|ocean|sketch`; `theme_overrides=null` atau object yang hanya berisi `layout` (≤8000 char, `homepageSections` maks 7, `order` 0–50). Kunci `tokens|fonts|radius|shadow|spacing` → `422 VALIDATION` + "Tema dikunci, hanya layout yang dapat diubah." `reset:true` (tanpa `theme_overrides`) mengosongkan override → `null`. Body kosong/tanpa perubahan → `422`.
- Sukses `200 {data: settings}`. Efek: `revalidateTag('settings','max')` + `revalidatePath('/')` + `activity_logs` (`settings.theme.update`).

## 2. Books (OPAC + admin)

### `GET /api/books?page=&per_page=&q=&kategori=&rak=&tersedia=1&featured=1`

- Publik (RLS `is_active=true` menjaga; `Cache-Control: s-maxage=300`).
- `q` = full-text + trigram via RPC `search_books(p_q, p_limit=100)` (judul/penulis/penerbit/isbn).
- `tersedia=1` → filter kolom `stock_available > 0` (bukan view — `books_with_stock` sudah tidak ada).
- Urut `created_at desc`. Count `estimated` (bukan `exact`).
- Item (kolom kanonis EN + embed):

```json
{
  "id": "uuid",
  "title": "Laskar Pelangi",
  "slug": "laskar-pelangi",
  "author": "Andrea Hirata",
  "publisher": "Bentang Pustaka",
  "year": 2005,
  "isbn": "979-3062-79-9",
  "cover_url": "https://...",
  "pages": 534,
  "language": "id",
  "stock_total": 5,
  "stock_available": 2,
  "featured": false,
  "rating_avg": 4.8,
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z",
  "categories": { "id": "uuid", "name": "Fiksi", "slug": "fiksi" },
  "racks": { "code": "R-A1", "name": "Rak Fiksi", "location": "Lantai 1" }
}
```

- Hasil kosong (mis. `q` tidak match) tetap `200` dengan `pagination.total = 0`.

### `GET /api/books/{id|slug}` — publik

- Detail + embed `categories`, `racks`. `404` bila tidak ada / tidak aktif.

### `POST /api/books` — pustakawan+ (admin/librarian)

- Body kanonis (alias Indonesia di dalam kurung masih diterima):

```json
{
  "title": "...",
  "author": "...",
  "publisher": "...",
  "isbn": "...",
  "year": 2024,
  "category_id": "uuid",
  "rack_id": "uuid",
  "description": "...",
  "cover_url": "...",
  "pdf_url": "...",
  "pages": 120,
  "language": "id",
  "stock_total": 3,
  "stock_available": 3,
  "featured": true,
  "is_active": true
}
```

(`judul|title`, `penulis|author`, `penerbit|publisher`, `tahun|year`, `deskripsi|description`, `jumlah_halaman|pages`, `bahasa|language`, `category|category_id`, `shelf|rack_id`)

- Satu baris buku per panggilan (tidak ada pembuatan `copies` — tabel eksemplar tidak dipakai OPAC saat ini).
- `stock_available` default = `stock_total`. Bila keduanya dikirim: `0 <= stock_available <= stock_total`, integer.
- Efek: `revalidateTag('books','max')`, log `books.create`.
- `201 {data: book}` / `409` bila slug/ISBN bentrok (`CONFLICT`) / `422 VALIDATION`.

### `PUT /api/books/{id}` — pustakawan+

- Update sebagian kolom + guard silang `stock_available <= stock_total` (dibaca nilai lama DB).
- Efek: `revalidateTag('books','max')`, log `books.update`.

### `PUT /api/books` (tanpa id) — stock opname massal

- Body: `{ "action": "stock_opname", "items": [{ "id": "uuid", "stock_total": 5, "stock_available": 4 }] }` (maks 100 item).
- Buku dengan loan `borrowed|overdue` dan baris invalid (non-integer/negatif/available>total) **dilewati** dengan `reason`.
- `200 {data: {updated: string[], skipped: [{id, reason}]}}` + log `books.stock_opname`.

### `DELETE /api/books?id=<uuid>[,<uuid>...]` — pustakawan+ (admin/librarian)

- Bulk delete dengan koma. Buku yang punya loan `borrowed|overdue` **dilewati**.
- `200 {data: {deleted: string[], skipped: string[]}}` + log `books.delete`.

## 3. Categories & Racks

### `GET /api/categories` / `GET /api/racks` — publik (filter OPAC)

- Kolom penuh tabel (`select('*')`), urut `created_at desc`. `?all=1` memerlukan session staf (lihat baris non-aktif juga).
- categories: `{id, name, slug, description?, cover_url?, ...}`; racks: `{id, code, name, location?, ...}`.

### `POST /api/categories` / `POST /api/racks` — pustakawan+

- categories `{name (nama), description? (deskripsi), icon?/cover_url?}` → slug auto.
- racks `{code (kode), name (nama), location? (keterangan|lantai)}` → slug auto.

### `PUT/DELETE /api/categories/{id}` / `PUT/DELETE /api/racks/{id}` — pustakawan+/admin

- DELETE → `409 CONFLICT` bila masih dipakai buku.

## 4. Members

### `GET /api/members?page=&q=&status=&all=1` — pustakawan+

- `q` mencari di profil/`member_code`, `status` ∈ `active|suspended|expired|pending` (nilai lain → `422`). `?all=1` menyertakan non-aktif.
- Item: kolom `members.*` + embed `profiles(id, full_name)`; urut `created_at desc`.

### `GET /api/members/{id}` — pustakawan+; anggota hanya miliknya (`403` bila bukan).

### `POST /api/members` — pustakawan+

- Body: `{user_id (profiles.id), member_code? (no_anggota; auto `AG-YYYYMM-XXXX` bila kosong), phone? (telepon), address? (alamat), status? (default active)}`.
- `404` bila `profiles` tidak ada; `409 CONFLICT` bila `member_code`/`user_id` sudah dipakai; `422` status/format salah.

### `PUT /api/members?id=<uuid>` — pustakawan+ (role TIDAK di sini)

### `DELETE /api/members?id=<uuid>` — admin only

- `409 CONFLICT` bila anggota masih punya loan `borrowed|overdue`. (Retensi arsip loan/denda historis: lihat issue #75.)

### `PUT /api/members/{id}/role` — admin only `{role: admin|pustakawan|anggota}`.

## 5. Loans / Reservations / Fines (sirkulasi)

### `GET /api/loans?status=&member_id=&overdue=1&q=&page=&per_page=` — pustakawan+ (anggota: otomatis filter miliknya, `member_id` diabaikan).

**Status terlambat = turunan (definisi tunggal, issue #57).** `overdue` ⇔ `status IN ('borrowed','overdue') AND due_at < NOW()`. Aplikasi tidak pernah menulis kolom `loans.status='overdue'` (checkout selalu `borrowed`, return menulis `returned`/`lost`); nilai enum itu hanya kompatibilitas baris lama.

- `?status=` menerima `borrowed|returned|overdue|lost` (nilai lain → `422 VALIDATION`).
- `?status=overdue` dan `?overdue=1` adalah **satu** filter yang sama (definisi turunan) — keduanya tidak mungkin beda hasil dengan tombol "Terlambat saja" di admin.
- Setiap baris = kolom `loans.*` + embed `members(id,member_code)`, `books(id,title,slug)` + field turunan:
  - `is_overdue` (boolean),
  - `effective_status` (`overdue` bila turunan terlambat, selain itu nilai kolom `status`),
  - `fine_preview` (estimasi denda = hari telat × tarif `library_settings.fine_per_day`, fallback `FINE_PER_DAY`).
- Semua pembaca memakai `src/lib/loans-overdue.ts`; di sisi DB definisi yang sama dimakai `get_overdue_count` (migrasi 0012) dan `get_dashboard_stats` (0017).

### `POST /api/loans` (checkout) — pustakawan+

```json
{ "member_id": "uuid", "book_id": "uuid", "notes": "...", "borrowed_at": "...", "due_at": "..." }
```

- `book_id` (bukan `copy_id`); stok dipegang kolom `books.stock_available`.
- Gate kelayakan anggota (issue #56, fail-closed — gagal verifikasi → 500, bukan checkout lolos): status harus `active`; lalu
  `409 MEMBER_HAS_FINES` (tagihan belum lunas) / `409 MEMBER_OVERDUE` (pinjaman terlambat) / `409 MEMBER_LOAN_LIMIT` (batas pinjaman aktif `library_settings.max_active_loans`).
- Idempoten: satu pasangan (buku, anggota) hanya 1 loan aktif → retry aman (409 `CONFLICT` "sudah meminjam buku ini").
- Checkout atomik via RPC `checkout_loan` (migrasi 0005/0015: row lock + decrement stok + insert 1 transaksi). Stok habis / buku hilang → `409 CONFLICT`.
- Default `borrowed_at = now`, `due_at = borrowed_at + 14 hari` (masih hardcode — memakai `library_settings.lama_pinjam_hari` diissue #74).
- `201 {data: loan}` + log `loans.create`.

### `PUT /api/loans?id=<uuid>` — pustakawan+

- `{ "action": "extend", "days": 7 }` → perpanjang tempo. Limit perpanjangan dihitung dari `activity_logs` (`src/lib/extendLoan.ts`).
- `{ "action": "return", "returned_at": "..." }` → pengembalian sederhana (kondisi selalu `baik`).
- `200 {data: ...}` + log `loans.extend`/`loans.return`.

### `POST /api/loans/{id}/return` — pustakawan+ (kondisi eksplisit)

```json
{ "kondisi": "baik|rusak|hilang", "returned_at": "...", "notes": "..." }
```

- `kondisi` absen = simple return (sama seperti `PUT action=return`). Diteruskan ke RPC `return_loan(p_kondisi)` (migrasi 0011) yang menghitung denda telat, membuat row `fines` bila >0, dan menyesuaikan stok sesuai kondisi.
- Response: `{ data: {...}, meta: { fine, kondisi, book_id } }` + log `loans.return`.

### `DELETE /api/loans?id=<uuid>` — admin only (hanya loan `returned`/`lost`)

### `GET/POST /api/reservations` — anggota (miliknya) + pustakawan (semua)

- GET filter: `?status=&book_id=&member_id=` + pagination; embed `books(id,title,slug)`, `members(id,member_code)`. Status enum DB: `pending|ready|completed|cancelled|expired`.
- POST anggota: `{book_id, expires_at?, notes?}` → `pending`. `expires_at` opsional (harus di masa depan). Staff boleh menambah `member_id` (peminjaman atas nama anggota).
- `201 {data: reservation, revalidated: [...]}` + log `reservations.create`.

### `PUT /api/reservations?id=<uuid>` — pemilik reservasi / pustakawan+

- `{status: "batal"|"cancelled"}` (alias) untuk membatalkan; staf dapat `pending → ready` dan mengubah `expires_at`. Non-staf tidak boleh set `ready`.
- **Tidak lagi menerima `completed`** (422) — status itu hanya lewat endpoint checkout.

### `POST /api/reservations/{id}/checkout` — pustakawan+ (atomik, issue #73)

- Satu panggilan untuk menutup reservasi `ready` → `completed`: RPC `checkout_reservation_tx` (migrasi 0024) mengunci reservasi + buku (`FOR UPDATE`), menjalankan gate stok + kelayakan anggota (#56), insert loan, mengurangi stok, dan set `completed` + `loan_id` dalam **satu transaksi**.
- Gagal di titik mana pun = rollback penuh (tidak ada loan yatim / reservasi separuh selesai). Retry aman: panggilan ulang pada reservasi yang sudah `completed` + `loan_id` mengembalikan hasil lama.
- Body opsional: `{borrowed_at?, due_at?, notes?}` (default tempo +14 hari).
- `201` → `{ data: { loan, reservation } }`. `409` → stok habis / anggota sudah meminjam buku ini / tagihan denda belum lunas / pinjaman terlambat / batas pinjaman aktif / reservasi belum `ready`. `422` → anggota tidak aktif / parameter tanggal tidak valid. `404` → data tidak ditemukan.

### `DELETE /api/reservations?id=<uuid>` — pemilik / pustakawan+ (dengan guard status)

### `GET /api/fines?member_id=&status=&page=&per_page=` — anggota baca miliknya; staf baca semua.

- `?status=` ∈ `unpaid|partial|paid|waived` (nilai lain → `422`). Embed `loans(id,book_id,due_at,status)`, `members(id,member_code)`.
- Kolom: `loan_id, member_id, amount, paid_amount, status, notes, issued_at, ...`.

### `POST /api/fines` / `PUT /api/fines?id=<uuid>` — pustakawan+ (terbitkan/ubah denda manual)

### `POST /api/fines/{id}/pay` — pustakawan+

- Body: `{amount?, metode?: cash|transfer|... (alias: method|payment_method|nominal), notes?}`.
- Menyimpan `paid_amount` + status menjadi `paid`/`partial`. Pembayaran **belum** punya tabel receipts bernomor — lihat issue #72.
- `200 {data: fine}` + log `fines.pay`.

### `DELETE /api/fines?id=<uuid>` — admin only

## 6. Articles (artikel/berita/event)

### `GET /api/articles?q=&status=&tipe=&category=&page=` — publik hanya `published` (staf: `?status=draft|archived` melihat semua)

- Urut `published_at desc` (fallback `created_at`). Item: `{id, title, slug, excerpt, content_md, status, category, cover_url, author_id, published_at, views, created_at, updated_at}`.
- `status` enum: `draft|published|archived`.

### `GET /api/articles/{slug}` — publik (published) / staf (semua).

### `POST /api/articles` — pustakawan+

- Body kanonis: `{title, content_md, excerpt?, category?, cover_url?, status?, published_at?}` (alias: `judul`, `konten|content`, `ringkasan`, `gambar_url`).
- `201 {data: article}` / `409 CONFLICT` slug bentrok / `422 VALIDATION`. `status=published` otomatis mengisi `published_at`.

### `PUT/DELETE /api/articles?id=<uuid>` — pustakawan+/admin. DELETE = hapus baris + log.

## 7. Banners (+ pages/menus/services/testimonials/faqs — pola sama)

Semua list memakai envelope pagination tunggal (§Konvensi). Body kanonis (alias Indonesia di kurung tetap diterima):

- **banners** `{title (judul), subtitle (subjudul), image_url (gambar_url), link (link_url), sort_order (urutan), is_active, starts_at?, ends_at?}` → `{id, title, subtitle, image_url, link, sort_order, is_active, created_at}`.
- **pages** `{title (judul), content_md (konten|content|isi), slug?, excerpt (ringkasan), show_in_menu (tampil_di_menu), is_active (status|aktif)}`.
- **menus** `{label (nama), url (link), position (posisi), target, sort_order (urutan), parent_id}`.
- **services** `{title (nama), description (deskripsi), icon, sort_order (urutan)}`.
- **testimonials** `{name (nama), content (isi|testimoni|pesan), role (peran), avatar_url (foto|image_url|gambar_url), sort_order (urutan)}`. Publik boleh kirim (dibatasi rate-limit + validasi konten); `sort_order` hanya untuk staf.
- **faqs** `{question (pertanyaan), answer (jawaban), category (kategori), sort_order (urutan)}`.

- GET publik: hanya baris `published`/`is_active` (banners: aktif + dalam jadwal); `?all=1` memerlukan staf.
- Mutasi: admin (faqs + insert testimonials boleh pustakawan/anon-terbatas sesuai db-design).
- PUT/DELETE: `?id=<uuid>`.

## 8. Logs audit (BUKAN REST)

- **`/api/logs` tidak ada** (memanggilnya = `404`). Halaman `/admin/logs` adalah React Server Component (`force-dynamic`, `revalidate = 0`) yang membaca tabel `activity_logs` **langsung** via Supabase server client (Privileged by RLS staf), memfilter `?action=&entity=&page=` dengan `PER_PAGE = 20`.
- Menambah log hanya dari aplikasi (`writeLog` best-effort di server/lib). Jika logs perlu diekspos API, buat route baru + dokumentasikan di `openapi.yaml`.

---

## Contoh curl (worker wajib jadikan smoke test)

```bash
curl /api/settings
curl "/api/books?q=laskar&tersedia=1&per_page=5"
curl -X POST /api/loans -H 'Content-Type: application/json' \
  -d '{"member_id":"...","book_id":"..."}'
curl -X POST /api/loans/<id>/return -H 'Content-Type: application/json' \
  -d '{"kondisi":"rusak"}'
curl -X POST /api/reservations/<id>/checkout -H 'Content-Type: application/json' -d '{}'
```
