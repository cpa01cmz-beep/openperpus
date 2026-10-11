# Runbook Pustakawan — Alur Harian openperpus

> Untuk: pustakawan/admin baru yang mengoperasikan openperpus harian.
> Dev yang baru setup lingkungan? Buka [onboarding-dev.md](./onboarding-dev.md).
> Kontrak API lengkap: [api-contract.md](./api-contract.md) · referensi interaktif: `/api/docs` (Scalar).

Dokumen ini dituangkan dari implementasi nyata di `src/app/admin/**` +
`src/app/api/**` — bukan dari desain. Bila ada beda, **kode adalah kebenaran**;
laporkan lewat issue baru.

---

## 1. Konsep 60 detik

- **Peran (role):** `admin` (semua hak), `pustakawan` (operasional harian),
  `anggota` (hanya lihat pinjaman/denda miliknya). Kolom DB menyimpan
  `admin|librarian|member`; aplikasi menampilkannya sebagai
  `admin|pustakawan|anggota`.
- **Sirkulasi inti:** pinjam (loan) → tempo (due) → kembali (return) → denda
  (fine) → bayar (pay). Reservasi (reservation) adalah antrean di depan alur itu.
- **Stok dua angka:** `stock_total` (total eksemplar) dan `stock_available`
  (siap dipinjam). Keduanya dikoreksi lewat **opname stok**.
- **Aturan emas:** denda, tempo, dan status **dihitung server** — jangan hitung
  manual. UI hanya mengirim niat ("kembalikan", "perpanjang", "tandai lunas").

## 2. Alur harian

### 2.1 Pinjam (checkout) — `/admin/peminjaman`

1. Buka **Peminjaman** → formulir di atas tabel.
2. Pilih **anggota** (ketik nama atau kode `AG-…`) dan **buku** (stok tampil
   pada opsi; stok 0 = tidak bisa dipilih).
3. Opsional isi catatan. Kirim.
4. Server membuat loan `borrowed`, stok buku −1, tempo otomatis
   **+14 hari** dari hari pinjam (`src/app/api/loans/route.ts`).
5. Bila anggota sedang meminjam sampai batas atau statusnya tidak aktif,
   server menolak dengan pesan merah — tampilkan pesan itu kepada anggota,
   jangan akali.

> API: `POST /api/loans {member_id, book_id, notes?}` → `201` + loan.

### 2.2 Kembalikan (return) — termasuk terlambat

1. Di tabel Peminjaman, baris berstatus `borrowed`/`overdue` punya tombol
   **Kembalikan** dan **Perpanjang**.
2. Klik **Kembalikan** → modal konfirmasi menampilkan tarif
   (`fine_per_day` dari Pengaturan, default Rp1.000/hari).
3. Setelah dikonfirmasi, server (satu transaksi DB via RPC `return_loan`):
   menutup loan, mengembalikan stok, menghitung denda
   `hari_telat × fine_per_day`, membuat row denda `unpaid` bila > 0.
4. Notifikasi hijau menampilkan nominal denda yang terbentuk.
5. Baris berubah menjadi `returned`; kini alihkan ke alur **Bayar denda**.

> API: `PUT /api/loans/{id} {action:"return"}`.
> Sudah `returned`/`lost` → `409` (idempoten secara alami).

### 2.3 Perpanjang pinjaman

Tombol **Perpanjang** → pilih 3/7/14/30 hari → tempo mundur sejauh itu.
Hanya untuk status `borrowed`/`overdue`; yang sudah dikembalikan → `409`.

> API: `PUT /api/loans/{id} {action:"extend", days}`.

### 2.4 Bayar denda — `/admin/denda`

1. Buka **Denda**: kartu atas menampilkan total tagihan (RPC `get_fines_total`).
2. Filter status bila perlu: `unpaid` / `partial` / `paid` / `waived`.
3. Pilih **metode** (`tunai` / `transfer` / `qris`) → klik **Tandai lunas** →
   konfirmasi.
4. Server menandai `paid` (+ `paid_at`, `received_by`).
5. Pembayaran ganda pada denda yang sama → `409` (aman untuk double-click).

> API: `POST /api/fines/<uuid>/pay {metode, method}` → `200`.

### 2.5 Reservasi — `/admin/reservasi`

Status: `pending` (menunggu) → `ready` (siap diambil) → `completed` (selesai),
plus `cancelled` (batal) dan `expired` (kedaluwarsa).

1. Anggota membuat reservasi dari katalog publik (status `pending`).
2. Saat buku tersedia, klik **Setujui (siap diambil)** → `ready`.
3. Anggota datang mengambil: klik **Pinjamkan** — endpoint checkout atomik
   `POST /api/reservations/[id]/checkout` (RPC `checkout_reservation_tx`,
   migrasi 0024) membuat loan **dan** menutup reservasi `completed` dalam satu
   transaksi DB. Gagal di titik mana pun = rollback penuh; klik ganda/retry
   aman (idempoten). Tombol "Selesaikan" tanpa loan sudah dihapus.
4. Batal: **Batalkan** → `cancelled`. Kedaluwarsa → `expired`.

> API: `PUT /api/reservations/{id} {status}` (state-machine dijaga server:
> hanya `pending→ready`, `*→cancelled/expired`). `completed` **tidak** bisa
> lewat PUT — hanya via checkout atomik di atas (issue #73).
>
> Sweep otomatis (isu #76): reservasi `pending`/`ready` yang lewat `expires_at`
> (+3 hari sejak dibuat, migrasi 0026) ditandai `expired` sendiri tiap malam
> oleh Vercel Cron `GET /api/cron/sweep-reservations`. Tombol sweep manual di
> halaman ini tetap ada sebagai cadangan. Verifikasi: `select count(*) from
> public.reservations where status in ('pending','ready') and expires_at < now();`
> harus 0 tak lama setelah jadwal cron.

### 2.6 Opname stok — `/admin/buku`

1. Centang buku yang fisiknya baru dihitung.
2. Klik **Stok opname** → masukkan `stock_total` baru, lalu `stock_available`
   (0…total; kosong = samakan dengan total).
3. Konfirmasi → `PUT /api/books {action:"stock_opname", items:[…]}`.
4. Buku yang dilewati (mis. sedang dipinjam) dilaporkan pada dialog hasil —
   catat dan proses manual bila perlu.

### 2.7 Tambah anggota — `/admin/anggota`

1. Isi form: **pilih pengguna** (cari nama/email — terhubung ke akun login),
   kode anggota (otomatis `AG-YYYYMM-XXXX` bila dikosongkan), telepon, alamat.
2. Simpan → `POST /api/members` → `201`.
3. Kode ganda → `409`. Anggota tanpa akun login tidak bisa dibuat dari sini —
   minta orangnya daftar dulu di `/daftar` atau buat user di
   Supabase Dashboard → Authentication → Users.

> API: `POST /api/members {user_id, member_code?, phone?, address?}`.

### 2.8 Tambah/edit buku — `/admin/buku/tambah`, `/admin/buku/edit`

Formulir Buku: judul, penulis, penerbit, tahun, ISBN, kategori, rak, sampul,
stok awal, dan deskripsi. Buku yang masih dipinjam **tidak** bisa dihapus
(`409`) — arsipkan sebagai gantinya.

> API: `POST /api/books` / `PUT /api/books/<uuid>` (menerima alias ID:
> `judul`=title, `penulis`=author, `penerbit`=publisher).

### 2.9 Menagih keterlambatan (dunning WA)

Pada baris terlambat (`overdue`) di Peminjaman, tombol **WA** membuka
`wa.me` dengan pesan siap kirim: judul buku, tanggal tempo, nominal denda,
kode anggota. Kirim dari WA resmi perpustakaan.

### 2.10 Jejak audit — `/admin/logs`

Setiap aksi tulis (pinjam, kembali, bayar, ubah pengaturan, …) tercatat di
`activity_logs` (aksi, entitas, aktor, waktu). Halaman ini hanya untuk admin —
pustakawan menerima `403`.

---

## 3. Tabel istilah ID ↔ EN

Antarmuka dan API memakai **alias bahasa Inggris**, sementara desain/dokumen
lama memakai istilah **Indonesia**. Pemetaan lengkap:

### 3.1 Halaman admin (14(+1))

| #   | Halaman admin    | Path                         | Entitas API/DB (EN)                                             | Istilah ID (docs lama)                                                  |
| --- | ---------------- | ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Dashboard        | `/admin`                     | stats agregat (`get_dashboard_stats`)                           | ringkasan/statistik                                                     |
| 2   | Buku             | `/admin/buku` (+tambah/edit) | `books` (`title`, `stock_total`, `stock_available`)             | buku (`judul`, `total_copy`, `tersedia`)                                |
| 3   | Anggota          | `/admin/anggota`             | `members` (`member_code`, `status`)                             | anggota (`no_anggota`, `status aktif/nonaktif/blokir`)                  |
| 4   | Peminjaman       | `/admin/peminjaman`          | `loans` (`borrowed_at`, `due_at`, `returned_at`)                | peminjaman (`tanggal_pinjam`, `tanggal_jatuh_tempo`, `tanggal_kembali`) |
| 5   | Reservasi        | `/admin/reservasi`           | `reservations` (`pending/ready/completed/cancelled/expired`)    | reservasi (`menunggu/siap_diambil/selesai/batal`)                       |
| 6   | Denda            | `/admin/denda`               | `fines` (`amount`, `paid_amount`, `unpaid/partial/paid/waived`) | denda (`jumlah`, `belum_bayar/lunas/dihapus`)                           |
| 7   | Kategori         | `/admin/kategori`            | `categories` (`name`)                                           | kategori (`nama`)                                                       |
| 8   | Rak              | `/admin/rak`                 | `racks` (`code`, `location`)                                    | rak (`kode`, `lantai`)                                                  |
| 9   | Menu             | `/admin/menu`                | `menus` (`label`, `url`, `position`)                            | menu navigasi (`posisi`)                                                |
| 10  | Konten           | `/admin/konten`              | `pages` / `faqs` / `testimonials`                               | halaman dinamis / FAQ / testimoni                                       |
| 11  | Artikel          | `/admin/artikel` (+edit)     | `articles` (`tipe`: article/news/event)                         | artikel/berita/event                                                    |
| 12  | Banner           | `/admin/banner` (+edit)      | `banners` (`is_active`, `order`)                                | banner/slider (`urutan`)                                                |
| 13  | Logs             | `/admin/logs`                | `activity_logs` (`aksi`, `entitas`)                             | log aktivitas                                                           |
| 14  | Pengaturan       | `/admin/pengaturan`          | `settings` (`fine_per_day`, `active_theme`)                     | pengaturan (`denda_per_hari`, `active_theme`)                           |
| +1  | Layanan _(baru)_ | `/admin/layanan`             | `services`                                                      | kartu layanan (migrasi `0021`)                                          |

Status pinjaman: `borrowed`=dipinjam · `overdue`=terlambat · `returned`=kembali ·
`lost`=hilang. Role: `librarian`=pustakawan · `member`=anggota.

### 3.2 Modul API (kontrak `docs/api-contract.md` ↔ implementasi)

| Modul (ID)           | Route                                                                                           | Field/status EN (implementasi)                                                          | Padanan ID (kontrak lama)                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pengaturan           | `GET/PUT /api/settings`, `PUT /api/settings/theme`                                              | `fine_per_day`, `active_theme`, `theme_overrides`                                       | `denda_per_hari`, `active_theme`, `theme_overrides`                                                      |
| Buku                 | `GET/POST/PUT/DELETE /api/books`, `GET/PUT/DELETE /api/books/[id]`                              | `title`, `author`, `publisher`, `stock_total`, `stock_available`                        | `judul`, `penulis`, `penerbit`, `total_copy`, `tersedia`                                                 |
| Kategori             | `GET/POST /api/categories`, `PUT/DELETE …/[id]`                                                 | `name`, `description`, `icon`                                                           | `nama`, `deskripsi`, `icon`                                                                              |
| Rak                  | `GET/POST /api/racks`, `PUT/DELETE …/[id]`                                                      | `code`, `location`, `description`                                                       | `kode`, `lantai`, `keterangan`                                                                           |
| Anggota              | `GET/POST /api/members`, `GET/PUT/DELETE /api/members/[id]`                                     | `member_code`, `phone`, `address`, `status active/suspended/expired/pending`            | `no_anggota`, `telepon`, `alamat`, `aktif/nonaktif/blokir`                                               |
| Peminjaman           | `GET/POST /api/loans`, `GET/PUT/DELETE /api/loans/[id]`, `POST /api/loans/[id]/return`          | `borrowed_at`, `due_at`, `returned_at`, `fine_amount`, `borrowed/overdue/returned/lost` | `tanggal_pinjam`, `tanggal_jatuh_tempo`, `tanggal_kembali`, `denda`, `dipinjam/terlambat/kembali/hilang` |
| Reservasi            | `GET/POST /api/reservations`, `PUT/DELETE …/[id]`                                               | `pending/ready/completed/cancelled/expired`, `reserved_at`, `expires_at`                | `menunggu/siap_diambil/selesai/batal`, `tanggal_reservasi`, `tanggal_kadaluarsa`                         |
| Denda                | `GET/POST /api/fines`, `GET …/[id]`, `POST …/[id]/pay`                                          | `amount`, `paid_amount`, `unpaid/partial/paid/waived`, `paid_at`, `metode`              | `jumlah`, `belum_bayar/lunas/dihapus`, `dibayar_at`                                                      |
| Artikel              | `GET/POST /api/articles`, `PUT/DELETE …/[id]`                                                   | `title`, `type`, `excerpt`, `content`, `status draft/published/archived`                | `judul`, `tipe`, `ringkasan`, `konten`, `draft/published/arsip`                                          |
| Banner               | `GET/POST /api/banners`, `PUT/DELETE …/[id]`                                                    | `image_url`, `link_url`, `order`, `is_active`                                           | `gambar_url`, `link_url`, `urutan`, `is_active`                                                          |
| Halaman              | `GET/POST /api/pages`, `PUT/DELETE …/[id]`                                                      | `title`, `slug`, `content`, `show_in_menu`                                              | `judul`, `slug`, `konten`, `show_in_menu`                                                                |
| FAQ                  | `GET/POST /api/faqs`, `PUT/DELETE …/[id]`                                                       | `question`, `answer`, `order`                                                           | `pertanyaan`, `jawaban`, `urutan`                                                                        |
| Testimoni            | `GET/POST /api/testimonials`, `PUT/DELETE …/[id]`                                               | `name`, `role`, `content`, `rating`, `is_active`                                        | `nama`, `peran`, `isi`, `rating`, `is_active`                                                            |
| Menu                 | `GET/POST /api/menus`, `PUT/DELETE …/[id]`                                                      | `label`, `url`, `position header/footer/both`, `parent_id`                              | `label`, `url`, `posisi header/footer/keduanya`                                                          |
| Layanan              | `GET/POST /api/services`, `PUT/DELETE …/[id]`                                                   | `title`, `description`, `icon`, `order`, `is_active`                                    | layanan (`judul`, `deskripsi`, `urutan`)                                                                 |
| Ops (bukan resource) | `GET /api/health`, `GET /api/readyz`, `GET /api/metrics`, `GET /api/docs`, `POST /api/register` | —                                                                                       | health/readyz/metrics/docs/register                                                                      |

Catatan jumlah: desain lama menyebut "26 rute"; implementasi kini punya **33
route handler** (15 modul resource + registrasi + health/readyz/metrics/docs).
Peta otoritatif: `find src/app/api -name route.ts`.

**Input bilingual:** endpoint sirkulasi masih menerima alias ID untuk status —
`menunggu`→`pending`, `batal`/`cancel`→`cancelled`, `selesai`→`completed`
(`src/app/api/reservations/route.ts`). Untuk data baru, pakai istilah EN.

---

## 4. Checklist 10 langkah (hari pertama pustakawan)

Centang berurutan; tanpa mentor pun alur inti selesai:

- [ ] **1.** Login di `/login` memakai akun petugas; buka `/admin` — dashboard tampil tanpa error.
- [ ] **2.** Buka **Anggota** → cari 1 anggota uji (atau buat baru via form).
- [ ] **3.** Buka **Peminjaman** → pinjamkan 1 buku untuk anggota tersebut (stok buku turun 1).
- [ ] **4.** Verifikasi baris baru berstatus `borrowed` dengan tempo +14 hari.
- [ ] **5.** Klik **Perpanjang** 7 hari → tempo bergeser 7 hari.
- [ ] **6.** Klik **Kembalikan** pada baris yang sama → pesan denda muncul (atau Rp0 bila tidak telat).
- [ ] **7.** Buka **Denda** → temukan denda dari langkah 6 (status `unpaid`).
- [ ] **8.** Tandai lunas dengan metode `tunai` → status berubah `paid`; halaman memuat ulang.
- [ ] **9.** Buka **Reservasi** → setujui 1 reservasi `pending` menjadi `ready`, lalu selesaikan lewat **Pinjamkan**.
- [ ] **10.** Buka **Buku** → jalankan **Stok opname** pada 1 buku (total 5, available 4) dan cek angkanya tersimpan.

Jika satu langkah gagal, catat **pesan error persis** + langkah ke berapa, lalu
serahkan ke dev (lihat [onboarding-dev.md](./onboarding-dev.md) untuk daftar
error umum).

---

## 5. Error umum & artinya

| Gejala di UI                  | Artinya                                       | Tindakan pustakawan                                   |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `401`/`403` + "Akses ditolak" | Sesi habis atau akun bukan petugas            | Login ulang sebagai pustakawan/admin                  |
| `409` saat kembali            | Pinjaman sudah dikembalikan/dihapus           | Muat ulang tabel — jangan klik dua kali               |
| `409` saat pinjam             | Anggota kena batas pinjam/blokir, atau stok 0 | Tampilkan pesan ke anggota; cek status anggota        |
| `409` kode anggota ganda      | Kode `AG-…` sudah dipakai                     | Kosongkan field kode (auto-generate) lalu simpan lagi |
| `409` hapus buku              | Buku masih dipinjam                           | Tunggu dikembalikan; jangan paksa hapus               |
| Pesan merah saat bayar denda  | Denda sudah lunas/waive                       | Muat ulang; kasus jarang bila double-submit           |

## 6. Tangkapan layar (rencana)

Folder tujuan: `docs/assets/runbook/` (PNG, lebar maks ~1200px, kompres dulu).
Ambil pada lingkungan demo (`npm run dev` + `supabase/seed.sql`):

| Berkas                    | Isi                                    |
| ------------------------- | -------------------------------------- |
| `01-peminjaman-form.png`  | Form pinjam + tabel dengan tombol aksi |
| `02-kembalikan-modal.png` | Modal konfirmasi pengembalian + tarif  |
| `03-denda-pay.png`        | Halaman Denda + tombol tandai lunas    |
| `04-reservasi.png`        | Tabel reservasi + state machine        |
| `05-opname-stok.png`      | Seleksi buku + dialog opname           |
| `06-admin-logs.png`       | Halaman log aktivitas                  |

Screenshot otomatis & skenario uji: `tests/e2e/loans.spec.ts`,
`tests/e2e/fines.spec.ts`, `tests/e2e/smoke.spec.ts`.
