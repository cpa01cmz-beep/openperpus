---
version: 1
slug: 'src-app-public-page-tsx'
primary_target: 'src/app/(public)/page.tsx'
related_targets: []
---

# Surface brief — OpenPerpus (seluruh tema)

## Scope & visitor mode

- **Scope:** redesain total dunia visual untuk kelima tema (`emerald`, `midnight`, `paper`, `brutalist`, `ocean`) di seluruh permukaan: OPAC publik (beranda, katalog, detail buku, berita, faq, kontak) dan admin CMS. Id tema, switcher, 8 token hex, seluruh fitur, rute, API, copy, dan aksesibilitas tidak berubah.
- **Mode:** **Persuade** di permukaan publik (arah ini di-roll dengan mode persuade); **Operate** di admin, yang mewarisi dunia yang sama tanpa menjadi permukaan baru.

## Audience, job, action, proof, constraints

- **Audiens:** pengunjung/anggota perpustakaan Indonesia (mobile-first, tanpa pelatihan) dan pustakawan yang mengoperasikan CMS harian.
- **Job:** menemukan buku dan menyelesaikan reservasi; staf mengoperasikan sirkulasi tanpa salah.
- **Action:** **mencari katalog** — aksi utama ada di viewport pertama, dalam bentuk kerja (input yang benar-benar mengirim ke `/katalog`), bukan tautan hias.
- **Proof:** katalog nyata, ketersediaan salinan yang jujur, pengumuman/berita yang hidup dari `settings`, statistik koleksi.
- **Constraints:** stack tetap; identitas perpustakaan hanya dari `settings`; 5 tema tetap dengan id yang sama; token tetap 8 hex; kontras AA; `min-h-[44px]` untuk kontrol sentuh; tanpa klaim komersial karangan.

## Direction contract

<!-- impeccable:direction-contract 1 -->

### THESIS

Wajah perpustakaan ini adalah **laci kartu katalog yang benar-benar berfungsi** — beranda setumpuk kartu bertik, dan kolom pencarian adalah pelat label laci. Yang ditolak: hero-di atas-gradasi dengan deret kartu rounded seragam di bawahnya, plus eyebrow-kicker di atas judul.

### OWN-WORLD

Dunia **Kartu Katalog**, lima material berbeda untuk satu tata bahasa yang sama:

- **Atom = kartu potong.** Setiap kontainer adalah kartu: garis ganda tercetak di bawah kop, baris entri bertik dengan _hanging indent_, angka tabular, lubang bor di bawah-tengah.
- **Batang (rod).** Daftar bertulang satu garis vertikal menembus lubang bor tiap kartu — bukan list, bukan grid kartu identik.
- **Stempel = state.** Ketersediaan dicap (kotak bergaris, kapital ber-tracking, miring ±4°, tinta tidak rata), bukan pill badge.
- **Tab pembatas.** Navigasi dan filter berbentuk tab laci (trapesium), bukan pil.
- **Satu garis rule** diturunkan dari `--ink` (`color-mix`), tanpa gradien, tanpa glass.
- **Radius potong-kertas** (0 → 0.5rem) — bukan 12–16px; dunia ini memilih potongan lurus.
- **Elevasi = tumpukan kertas**, kecuali `brutalist` (Fotokopi): garis toner 1–2px tanpa bayangan lembut.
- **Warna:** `brand` = warna laci/ledger, `accent` = tinta stempel.

Lima material: **emerald** laci jati + kartu manila (lampu siang); **midnight** laci malam + pelat kuningan (lampu baca); **paper** kartu bond polos grafit; **brutalist** fotokopi toner + oranye keselamatan; **ocean** arsip maritim, kartu ter-bleach asin.

### STORY

Pengunjung baru dalam hitungan detik paham: ini katalog perpustakaan yang bisa langsung dicari; pengumuman di atasnya adalah kabar terkini; kartu di bawahnya adalah holding nyata dengan ketersediaan jujur. Pustakawan paham sistem yang sama menjalankan dapur CRT-nya.

### FIRST VIEWPORT

**Desktop (1440):** pelat laci selebar halaman. Kop surat perpustakaan diketik di kartu indeks raksasa (nama + tagline sebagai baris entri, nomor panggil di kiri-atas). Di bawahnya **satu kolom pencarian kerja** duduk di pelat label laci (form GET → `/katalog?q=`, input ≥44px). Di atasnya tiga **tab pembatas kategori nyata** dari tabel `categories`, tiap tab mengarah ke `/katalog?kategori=<id>` sambil membawa `q` — pembatas laci yang benar-benar memisah, bukan label hias. Di 390, hero mengisi viewport: pelat pencarian, kop, judul, dan aksi semuanya di atas garis lipatan; kartu pertama isi laci dimulai tepat setelah lipatan sehingga guliran pertama langsung menemukan isi laci. **Mobile (390):** urutan sama, tab bergulir horizontal, kolom pencarian setinggi ≥44px, kontrol carousel tidak pernah menindih teks.

_Amandemen kedua (jujur terhadap produk): syarat "kartu pertama sudah menyembul di atas garis lipatan" dihapus — menekan hero agar muat di 844 akan mengecilkan huruf judul dan kolom pencarian di bawah ukuran baca. Yang diikat sekarang: seluruh ELEMEN AKSI tetap di atas lipatan.

_Amandemen sebelum kode (jujur terhadap produk): cakupan "Judul/Pengarang" tidak didukung RPC pencarian, jadi tab dipetakan ke parameter yang benar-benar ada (`kategori` + `q`) alih-alih jadi tombol fiktif._

### FORM

Dipilih: **kartu katalog** — posisi **1** dari daftar berurut saya, kartu `IMPECCABLE'S PICK` yang dikunci pengguna setelah roll. Seed key `6325fdd6`. Roll mengamanatkan kandidat ke-4 (Papan Pengumuman); pengguna memilih pick — keputusan pengguna mengalahkan roll.

### MOMENT (signature)

**Riffle:** kartu di dalam laci berpatahan naik satu per satu dari batangnya (transform berjenjang, sumbu rotasi di lubang bor) saat masuk viewport; dan **tekan stempel** — stempel ketersediaan menekan turun sedikit (scale + rotate) saat kartu di-hover/fokus. Dua momen ini yang di-orkestrasi sekali, bukan efek tersebar.

### FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

<!-- /impeccable:direction-contract -->

## Unresolved decisions

- Urutan `homepageSections` per tema: menyesuaikan ritme laci (laci dibuka → pengumuman → kartu unggulan); daftar tetap **non-alfabetis** (kontrak test).
- Apakah varian header/hero/footer tiap tema dipetakan ulang ke komponen berbeda — diputuskan per tema saat build, kunci variant tetap.
- Admin: hari ini memakai `slate`/`bg-white` hardcode dan tidak mengonsumsi token sama sekali; redesain membawanya ke token (`--surface`, `--ink`, rule) tanpa menyentuh perilaku/RBAC.
