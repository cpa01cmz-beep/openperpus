# Retensi Data — openperpus (usulan operasional)

> Status: usulan v1 — belum ada purge otomatis. Jangan hapus manual
> tanpa tiket + persetujuan. Lihat kebijakan di [kebijakan-privasi.md](./kebijakan-privasi.md).

## 1. Tabel retensi usulan

| Data                           | Retensi                     | Tindakan setelah lewat                                | Alasan                                  |
| ------------------------------ | --------------------------- | ----------------------------------------------------- | --------------------------------------- |
| `loans` (riwayat pinjam)       | 5 tahun                     | Arsip, lalu hapus/anonymisasi                         | Arsip keuangan + sengketa denda         |
| `fines` / `payments`           | 5 tahun                     | Arsip, lalu hapus/anonymisasi                         | Bukti transaksi keuangan                |
| `reservations` (selesai/batal) | 2 tahun                     | Hapus                                                 | Antrean operasional, nilai audit rendah |
| `activity_logs`                | 2 tahun                     | Hapus bergilir (rolling)                              | Jejak audit keamanan                    |
| `members` nonaktif             | 1 tahun pasif → anonimisasi | Samarkan `phone`/`address`, pertahankan `member_code` | Minimalisasi UU PDP                     |
| Backup DB (Supabase/PITR)      | Mengikuti window provider   | Rotasi otomatis provider                              | Pemulihan bencana                       |

## 2. Larangan hapus manual

- **Dilarang** `DELETE` langsung ke DB tanpa tiket tercatat dan
  persetujuan admin penanggung jawab.
- Setiap penghapusan/anonimisasi **wajib** tercatat di `activity_logs`
  (aksi, entitas, aktor, waktu) dan bisa diverifikasi di `/admin/logs`.
- Pengecualian darurat (kebocoran/keamanan) tetap butuh tiket susulan
  maksimal 1×24 jam.

## 3. Follow-up: purge terjadwal

- Skrip purge terjadwal **belum diimplementasikan** (follow-up, bukan
  klaim selesai): cron + RPC `purge_expired_*` dengan dry-run dulu.
- Estimasi urutan: `reservations` → `activity_logs` → anonimisasi
  `members` → arsip `loans`/`fines`.
- Setiap run purge harus lapor: jumlah baris, rentang tanggal, dan id
  tiket — tanpa laporan = dianggap gagal.

## 4. Pengecualian legal

- Data yang sedang sengketa hukum, audit keuangan, atau diminta aparat
  penegak hukum **ditahan** (legal hold) sampai ada izin tertulis.
- Permintaan penghapusan subjek data (UU PDP) ditolak/ditunda bila
  bertentangan dengan kewajiban simpan 5 tahun di atas — jawab tertulis.
- Review tabel ini minimal 1× setahun atau tiap ada migrasi skema baru.
