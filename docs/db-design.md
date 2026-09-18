# DB Design — CMS Perpustakaan

> DB: Supabase Postgres 15. Semua tabel pakai `id uuid default gen_random_uuid() PK` kecuali disebut lain. `created_at timestamptz default now()`, `updated_at` via trigger. RLS **ON** di semua tabel, default DENY.

## 0. library_settings (single-row — SUMBER KEBENARAN identitas)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | int PK CHECK(id=1) | selalu 1 |
| `nama_perpus` | text NOT NULL | ex "Perpustakaan Cahaya Ilmu" |
| `tagline` | text | |
| `logo_url` | text | path bucket `assets` |
| `favicon_url` | text | |
| `alamat` | text | |
| `telepon` | text | |
| `email` | text | |
| `jam_operasional` | jsonb NOT NULL DEFAULT | `[{"hari":"Senin-Jumat","buka":"08:00","tutup":"16:00"},...]` |
| `sosmed` | jsonb DEFAULT | `{"facebook":"","instagram":"","youtube":"","tiktok":"","whatsapp":""}` |
| `sambutan` | text | sambutan kepala perpus (homepage) |
| `sambutan_nama` | text | nama pemberi sambutan |
| `visi` | text | |
| `misi` | text | (markdown/plain, render list) |
| `seo_title` | text | fallback `<title>` |
| `seo_description` | text | meta description |
| `seo_keywords` | text | |
| `theme` | jsonb DEFAULT | `{"primary":"#1B4332","accent":"#C9A227","font_heading":"Playfair Display","font_body":"Inter"}` |
| `denda_per_hari` | int DEFAULT 1000 | dipakai trigger denda |
| `lama_pinjam_hari` | int DEFAULT 7 | |
| `maks_pinjam` | int DEFAULT 3 | batas aktif per anggota |
| `updated_by` | uuid → profiles | audit ringan |

- Index: PK saja. RLS: anon/authenticated SELECT; UPDATE hanya `admin`.
- Seed awal 1 baris (nama generik — admin wajib ganti via CMS, bukan via kode).

## 1. profiles (role + jembatan auth)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK → `auth.users(id)` ON DELETE CASCADE |
| `role` | text CHECK IN ('admin','pustakawan','anggota') DEFAULT 'anggota' |
| `member_id` | uuid NULL → members(id) |
| `nama` | text |
| `avatar_url` | text |
| `created_at` / `updated_at` | timestamptz |

- Index: `role`, `member_id` unique partial.
- RLS: user baca/update miliknya; pustakawan+admin baca semua; ubah `role` hanya admin (via function `is_admin()`).
- Trigger `handle_new_user`: insert profiles + members otomatis.

## 2. categories

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `nama` | text UNIQUE NOT NULL |
| `slug` | text UNIQUE NOT NULL |
| `deskripsi` | text |
| `icon` | text (nama icon lucide) |

- Index: `slug`. RLS: public SELECT; tulis pustakawan+admin.

## 3. racks (lokasi fisik)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `kode` | text UNIQUE NOT NULL (ex "R-A1") |
| `nama` | text (ex "Rak Fiksi Lantai 2") |
| `lantai` | text |
| `keterangan` | text |

- RLS: public SELECT; tulis pustakawan+admin.

## 4. books (katalog)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `judul` | text NOT NULL |
| `slug` | text UNIQUE NOT NULL |
| `penulis` | text NOT NULL |
| `penerbit` | text |
| `tahun` | int CHECK(1400–2100) |
| `isbn` | text UNIQUE NULL |
| `category_id` | uuid → categories(id) SET NULL |
| `rack_id` | uuid → racks(id) SET NULL |
| `deskripsi` | text |
| `cover_url` | text (bucket `covers`) |
| `jumlah_halaman` | int |
| `bahasa` | text DEFAULT 'Indonesia' |
| `status` | text DEFAULT 'tersedia' CHECK('tersedia','dipinjam_semua','arsip') — *derived, update via trigger* |
| `is_featured` | bool DEFAULT false |
| `views` | int DEFAULT 0 |

- Index: `slug`, `category_id`, `rack_id`, FTS `to_tsvector('indonesian', judul||' '||penulis||' '||penerbit)` (GIN) untuk OPAC search; trigram `pg_trgm` pada judul/penulis bila perlu fuzzy.
- RLS: public SELECT; tulis pustakawan+admin.
- View `books_with_stock`: `books.* + total_copy, tersedia = count(status='tersedia')` — dipakai OPAC agar tanpa N+1.

## 5. book_copies / stock (eksemplar)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `book_id` | uuid → books(id) CASCADE NOT NULL |
| `kode_eksemplar` | text UNIQUE NOT NULL (ex "B-000123") |
| `status` | text CHECK('tersedia','dipinjam','dipesan','rusak','hilang') DEFAULT 'tersedia' |
| `kondisi` | text |
| `tanggal_masuk` | date DEFAULT CURRENT_DATE |

- Index: `(book_id, status)`, `kode_eksemplar`.
- RLS: public SELECT (batas: hanya id/book_id/status untuk anon via view); tulis pustakawan+admin.
- Trigger: tiap INSERT/UPDATE/DELETE → recompute `books.status`.

## 6. members (anggota perpus)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `no_anggota` | text UNIQUE NOT NULL (auto `AG-YYYY-0001` via sequence/function) |
| `nama` | text NOT NULL |
| `email` | text |
| `telepon` | text |
| `alamat` | text |
| `tanggal_daftar` | date DEFAULT CURRENT_DATE |
| `status` | text CHECK('aktif','nonaktif','blokir') DEFAULT 'aktif' |
| `foto_url` | text (bucket avatars) |

- Index: `no_anggota`, `nama` trigram.
- RLS: anggota baca miliknya (`profiles.member_id = members.id`); tulis pustakawan+admin; anon DENY.

## 7. loans (peminjaman/sirkulasi)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `member_id` | uuid → members NOT NULL |
| `copy_id` | uuid → book_copies NOT NULL |
| `tanggal_pinjam` | date DEFAULT CURRENT_DATE |
| `tanggal_jatuh_tempo` | date NOT NULL (default pinjam + `lama_pinjam_hari`) |
| `tanggal_kembali` | date NULL |
| `status` | text CHECK('dipinjam','kembali','terlambat','hilang') DEFAULT 'dipinjam' |
| `denda` | int DEFAULT 0 |
| `processed_by` | uuid → profiles |

- Index: `(member_id, status)`, `(status, tanggal_jatuh_tempo)` untuk overdue job, `copy_id`.
- Constraint: satu copy hanya 1 loan aktif (`UNIQUE(copy_id) WHERE tanggal_kembali IS NULL` partial).
- RLS: anggota SELECT miliknya; pustakawan+admin full.
- Trigger `loan_checkout`: tolak bila member cap `maks_pinjam` tercapai / status blokir / copy tak tersedia; set copy `dipinjam`. Trigger `loan_return`: set copy `tersedia`, hitung `denda = max(0, kembali - tempo) * denda_per_hari`, insert ke `fines`.

## 8. reservations (antrean)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `member_id` | uuid → members NOT NULL |
| `book_id` | uuid → books NOT NULL |
| `status` | text CHECK('menunggu','siap_diambil','batal','selesai') DEFAULT 'menunggu' |
| `tanggal_reservasi` | timestamptz DEFAULT now() |
| `tanggal_kadaluarsa` | date |

- Index: `(book_id, status)`, `(member_id, status)`.
- RLS: anggota CRUD miliknya (status terbatas); pustakawan+admin full.

## 9. fines / payments (denda & pembayaran)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `loan_id` | uuid → loans NOT NULL |
| `member_id` | uuid → members NOT NULL |
| `jumlah` | int NOT NULL CHECK(>0) |
| `status` | text CHECK('belum_bayar','lunas','dihapus') DEFAULT 'belum_bayar' |
| `metode` | text (tunai/transfer/qris) |
| `dibayar_at` | timestamptz NULL |
| `received_by` | uuid → profiles |

- Index: `(member_id, status)`.
- RLS: anggota SELECT miliknya; tulis pustakawan+admin.

## 10. articles (+ news/events satu tabel via `tipe`)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `judul` | text NOT NULL |
| `slug` | text UNIQUE NOT NULL |
| `tipe` | text CHECK('artikel','berita','event') DEFAULT 'artikel' |
| `ringkasan` | text |
| `konten` | text (markdown) |
| `gambar_url` | text (bucket assets) |
| `status` | text CHECK('draft','published','arsip') DEFAULT 'draft' |
| `published_at` | timestamptz |
| `author_id` | uuid → profiles |
| `views` | int DEFAULT 0 |

- Index: `slug`, `(tipe, status, published_at DESC)`, FTS judul+konten.
- RLS: public SELECT hanya `published`; tulis pustakawan+admin (event boleh pustakawan).

## 11. banners / sliders

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `judul` | text |
| `subjudul` | text |
| `gambar_url` | text NOT NULL (bucket assets, 1600×900) |
| `link_url` | text |
| `urutan` | int DEFAULT 0 |
| `is_active` | bool DEFAULT true |
| `mulai_at` / `selesai_at` | timestamptz NULL (jadwal tayang) |

- Index: `(is_active, urutan)`. RLS: public SELECT active+jadwal; tulis admin (pustakawan read-only).

## 12. pages (halaman dinamis: profil, visi-misi, layanan, dll)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `judul` | text NOT NULL |
| `slug` | text UNIQUE NOT NULL |
| `konten` | text (markdown) |
| `status` | text CHECK('draft','published') DEFAULT 'draft' |
| `show_in_menu` | bool DEFAULT false |

- Index: `slug`. RLS: public SELECT published; tulis admin.

## 13. testimonials

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `nama` | text NOT NULL |
| `peran` | text (ex "Mahasiswa") |
| `isi` | text NOT NULL |
| `foto_url` | text |
| `rating` | int CHECK(1–5) DEFAULT 5 |
| `is_active` | bool DEFAULT false (moderasi) |

- RLS: public SELECT active; INSERT anon allowed (moderasi) dengan rate-limit; approve admin.

## 14. faqs

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `pertanyaan` | text NOT NULL |
| `jawaban` | text NOT NULL |
| `urutan` | int DEFAULT 0 |
| `is_active` | bool DEFAULT true |

- RLS: public SELECT active; tulis pustakawan+admin.

## 15. menus (navigasi dinamis)

| Kolom | Tipe |
|---|---|
| `id` | uuid PK |
| `label` | text NOT NULL |
| `url` | text NOT NULL (ex "/katalog", "/halaman/visi-misi") |
| `posisi` | text CHECK('header','footer','keduanya') DEFAULT 'header' |
| `parent_id` | uuid → menus(id) NULL (dropdown 1 level) |
| `urutan` | int DEFAULT 0 |
| `is_active` | bool DEFAULT true |

- Index: `(posisi, urutan)`. RLS: public SELECT active; tulis admin.

## 16. activity_logs

| Kolom | Tipe |
|---|---|
| `id` | bigint GENERATED ALWAYS AS IDENTITY PK |
| `actor_id` | uuid → profiles |
| `aksi` | text (ex "books.update", "loans.return") |
| `entitas` | text |
| `entitas_id` | text |
| `meta` | jsonb |
| `created_at` | timestamptz DEFAULT now() |

- Index: `(entitas, entitas_id)`, `created_at DESC`. RLS: hanya admin SELECT; INSERT via trigger/function (bypass RLS dengan security definer).
- Retensi: cron hapus >180 hari (scheduled job Supabase pg_cron — pola integrasi paling sederhana yang cukup).

---

## Relasi (ER ringkas)

```
auth.users 1—1 profiles ──? members
profiles 1—n articles(author) | loans(processed) | fines(received)
categories 1—n books n—1 racks
books 1—n book_copies 1—n loans ─1 fines
members 1—n loans/reservations/fines
menus self-parent | settings 1 baris standalone
```

## Index Wajib (ringkas untuk worker-DB)

```sql
create index books_slug_idx on books(slug);
create index books_cat_idx on books(category_id);
create index books_fts on books using gin(to_tsvector('indonesian', judul||' '||penulis));
create index copies_book_status on book_copies(book_id, status);
create index loans_member_status on loans(member_id, status);
create index loans_overdue on loans(status, tanggal_jatuh_tempo) where tanggal_kembali is null;
create unique index loans_one_active on loans(copy_id) where tanggal_kembali is null;
create index articles_pub on articles(tipe, status, published_at desc);
```

## RLS Helper

```sql
create or replace function is_admin() returns bool language sql security definer as
$$ select exists(select 1 from profiles where id = auth.uid() and role='admin') $$;
-- + is_staff() untuk admin/pustakawan
```
