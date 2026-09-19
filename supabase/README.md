# Supabase — CMS Perpustakaan

> Folder kerja DB-ARCHITECT. Jangan taruh kredensial di repo.

## Isi folder

| File                                    | Fungsi                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `migrations/0001_core.sql`              | Extension + 17 tabel + index + trigger `updated_at`                                                       |
| `migrations/0002_rls.sql`               | `is_staff()/is_admin()` + enable RLS + policies                                                           |
| `migrations/0003_hardening.sql`         | Hardening RLS/policies                                                                                    |
| `migrations/0004_storage.sql`           | Bucket publik `library-assets` + policies `storage.objects`                                               |
| `migrations/0005_checkout.sql`          | Checkout reservasi → loan                                                                                 |
| `migrations/0006_content.sql`           | Tabel/polices konten (pages, FAQs, dsb.)                                                                  |
| `migrations/0007_storage_guard.sql`     | Guard tambahan storage                                                                                    |
| `migrations/0008_theme.sql`             | Tema/library settings                                                                                     |
| `migrations/0009_drop_legacy_theme.sql` | Drop kolom/fungsi tema legacy                                                                             |
| `seed.sql`                              | Data awal (settings#1, 6 kategori, 3 rak, 8 buku, 3 banner, 3 artikel, 4 FAQ, 3 halaman, testimoni, menu) |
| `config.toml` _(opsional)_              | Konfigurasi `supabase` CLI bila di-init                                                                   |

## Prasyarat

- Akun + project Supabase (mis. `webperpus-oc`).
- Supabase CLI: `npm i -g supabase` lalu `supabase --version`.
- `DATABASE_URL` (postgres, role `postgres`) — ambil dari
  Dashboard → Project Settings → Database → Connection string.
  Format: `postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres`

## 1. Link project

```powershell
cd C:\Users\marzoochi\Documents\webperpus-oc
supabase login
supabase link --project-ref <PROJECT_REF>
# PROJECT_REF = subdomain sebelum .supabase.co, mis. abcdefghijklm
supabase status
```

Alternatif tanpa CLI: buka SQL Editor di dashboard, paste isi migrasi
berurutan `0001 → 0009`, Run.

## 2. Jalankan migrasi (urutan WAJIB 0001 → 0009)

### Opsi A — Supabase CLI (disarankan, tercatat di `supabase/migrations`)

```powershell
# Dari root repo; file 0001..0009 sudah bernama versi + timestamp-friendly.
# Bila `supabase link` sudah dilakukan:
supabase db push
# Cek:
supabase migration list
```

> CLI resmi memakai nama `YYYYMMDDHHMMSS_nama.sql`. File `0001_*` di repo
> ini tetap valid sebagai SQL biasa; bila `db push` menolak prefix numerik,
> rename sekali saja, mis.:
> `0001_core.sql → 20260917000001_core.sql` (dst. `...02_rls`, `...03_hardening`,
> `...04_storage`, `...05_checkout`, `...06_content`, `...07_storage_guard`,
> `...08_theme`, `...09_drop_legacy_theme`)
> tanpa mengubah isi.

### Opsi B — psql langsung (tanpa CLI)

```powershell
$env:DATABASE_URL = "postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres"
psql $env:DATABASE_URL -f supabase/migrations/0001_core.sql
psql $env:DATABASE_URL -f supabase/migrations/0002_rls.sql
psql $env:DATABASE_URL -f supabase/migrations/0003_hardening.sql
psql $env:DATABASE_URL -f supabase/migrations/0004_storage.sql
psql $env:DATABASE_URL -f supabase/migrations/0005_checkout.sql
psql $env:DATABASE_URL -f supabase/migrations/0006_content.sql
psql $env:DATABASE_URL -f supabase/migrations/0007_storage_guard.sql
psql $env:DATABASE_URL -f supabase/migrations/0008_theme.sql
psql $env:DATABASE_URL -f supabase/migrations/0009_drop_legacy_theme.sql
```

### Opsi C — SQL Editor dashboard

Paste tiap file → Run, sesuai urutan. Perhatikan pesan sukses per file.

## 3. Seed data awal

```powershell
psql $env:DATABASE_URL -f supabase/seed.sql
# atau: supabase db execute --file supabase/seed.sql
```

Seed **idempotent** (aman dijalankan ulang): memakai
`ON CONFLICT ... DO UPDATE / DO NOTHING` + `WHERE NOT EXISTS`.
`profiles/members/loans` TIDAK di-seed — butuh user `auth.users` asli.
Buat user dulu via Dashboard → Authentication → Users, lalu:

```sql
-- Jadikan user pertama admin (ganti UID):
insert into public.profiles (id, role, full_name)
values ('<UID_ADMIN>', 'admin', 'Admin Perpus')
on conflict (id) do update set role='admin';
```

## 4. Verifikasi

```sql
-- Tabel terbuat:
select table_name from information_schema.tables
where table_schema='public' order by 1;

-- RLS aktif:
select tablename, rowsecurity from pg_tables
where schemaname='public' order by 1;

-- Bucket:
select id, name, public from storage.buckets where id='library-assets';

-- Seed masuk:
select count(*) from public.books;      -- harapan: 8
select count(*) from public.categories; -- harapan: 6
select * from public.library_settings where id=1;
```

Test jalur panas (pastikan pakai index):

```sql
explain analyse
select id, title, slug, author, cover_url
from public.books where is_active and category_id = (select id from public.categories where slug='fiksi' limit 1)
order by created_at desc limit 12;
-- Harapan: Index Scan memakai idx_books_category_id / idx_books_created_at
```

## 5. Rollback

- `0001`: destruktif — butuh konfirmasi mandor. Lihat blok ROLLBACK di
  bawah file (drop tabel urutan terbalik).
- `0002`: non-destruktif — drop policy + `DISABLE ROW LEVEL SECURITY`
  per tabel (lihat blok ROLLBACK di file).
- `0003`: hardening RLS — drop policy yang ditambah di file (lihat blok ROLLBACK di file).
- `0004`: hapus policy `storage.objects`, kosongkan objek, lalu hapus bucket
  (lihat blok ROLLBACK di file).
- `0005`–`0009`: non-destruktif — revert objek yang ditambah tiap file
  (lihat blok ROLLBACK di masing-masing file).
- `seed.sql`: data contoh — hapus manual per tabel bila perlu
  (`delete from public.books where slug in (...)`), jangan `truncate`
  di production.

## 6. Konvensi

- Semua ID UUID `gen_random_uuid()`, kecuali `library_settings.id = 1`.
- `updated_at` otomatis via trigger `handle_updated_at()`.
- Role tunggal di `profiles.role`: `admin | librarian | member`;
  cek staff di SQL via `public.is_staff()`, di app via tabel `profiles`.
- Storage publik hanya di bucket `library-assets` dengan folder
  `logo/ covers/ banners/ articles/ avatars/ ebooks/`.
  Butuh file privat → bucket baru `library-private` (jangan campur).
