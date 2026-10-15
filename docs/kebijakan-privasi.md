# Kebijakan Privasi — openperpus

> Status: skeleton v1 ( ringkasan operasional, bukan nasihat hukum ).
> Cakupan: aplikasi katalog + sirkulasi perpustakaan untuk anggota terdaftar.

## 1. Dasar hukum

- UU Pelindungan Data Pribadi No. 27 Tahun 2022 (UU PDP).
- Pengolahan data dilakukan atas dasar: persetujuan anggota saat
  pendaftaran, kewajiban kontrak layanan perpustakaan, dan kepentingan
  sah pengelola (keamanan + penagihan denda).
- Prinsip yang dipegang: batasan tujuan, minimalisasi data, akurasi,
  keamanan, dan akuntabilitas.

## 2. Kategori data yang dikumpulkan

| Kategori       | Contoh field                                              | Sumber                       |
| -------------- | --------------------------------------------------------- | ---------------------------- |
| Identitas akun | `profiles.full_name`                                      | Form daftar `/daftar`        |
| Keanggotaan    | `members.member_code`, `phone`, `address`                 | Form `/admin/anggota`        |
| Sirkulasi      | Keterkaitan `loans` / `fines` / `reservations` ke anggota | Otomatis saat pinjam/kembali |
| Jejak audit    | `activity_logs` (aksi, entitas, IP, metadata)             | Otomatis tiap aksi tulis     |

## 3. Tujuan penggunaan

- Verifikasi identitas anggota dan pengelolaan sirkulasi (pinjam,
  perpanjang, kembali, reservasi, denda).
- Penagihan keterlambatan via pengingat (termasuk template WA).
- Keamanan: deteksi penyalahgunaan dan jejak audit (`/admin/logs`).
- Anda tidak menjual data anggota untuk iklan pihak ketiga.

## 4. Hak subjek data

- Anda berhak meminta **akses, koreksi, penghapusan, dan portabilitas**
  atas data Anda sesuai UU PDP.
- Cara mengajukan: hubungi pengelola perpustakaan melalui kontak resmi
  di halaman Kontak, sebutkan kode anggota (`AG-…`) dan permintaan Anda.
- Status implementasi: **ekspor data mandiri (DSAR export) bertahap** —
  saat ini permintaan dilayani manual oleh admin; tombol unduh mandiri
  belum tersedia dan tidak diklaim ada.

## 5. Retensi dan cookie/log

- Masa simpan mengikuti [retensi-data.md](./retensi-data.md).
- Cookie sesi dipakai untuk login; log teknis (IP, user-agent) dipakai
  untuk keamanan dan batas laju (rate limit) — bukan pelacakan iklan.
- Kebijakan ini direview tiap ada fitur data baru; perubahan diumumkan
  di halaman ini sebelum berlaku.
