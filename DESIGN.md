---
name: OpenPerpus
description: Sistem desain "Kartu Katalog" — satu tata bahasa visual, lima material tema.
colors:
  brand: '#1B5E4B'
  brand-soft: '#DCE6DE'
  brand-strong: '#0E3D30'
  accent: '#A63D2E'
  accent-soft: '#F2E4DE'
  surface: '#EBEDE6'
  ink: '#1C1A17'
  heading: '#0E3D30'
  rule: 'color-mix(in srgb, #1C1A17 16%, transparent)'
typography:
  display:
    fontFamily: 'Libre Caslon Display, Georgia, serif'
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: '-0.03em'
  body:
    fontFamily: 'Libre Franklin, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    lineHeight: 1.625
  label:
    fontFamily: 'Libre Franklin, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 600
    letterSpacing: '0.04em'
  data:
    fontFamily: 'Courier Prime, ui-monospace, monospace'
    fontSize: '0.75rem'
    letterSpacing: '0.04em'
rounded:
  sm: '0.125rem'
  md: '0.25rem'
  lg: '0.5rem'
spacing:
  container: '72rem'
  section: '4.5rem'
  card: '1.5rem'
components:
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.surface}'
    rounded: '{rounded.md}'
    padding: '10px 20px'
    typography: '{typography.label}'
  button-accent:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.md}'
    padding: '10px 20px'
    typography: '{typography.label}'
  card-kartu:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '16px'
    border: '1px solid {colors.rule}'
  input-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '12px'
    typography: '{typography.data}'
  nav-tab:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '10px 16px'
    typography: '{typography.data}'
  stamp-status:
    backgroundColor: 'transparent'
    textColor: '{colors.accent}'
    rounded: '2px'
    padding: '3px 7px'
    typography: '{typography.data}'
---

# Design System: OpenPerpus

## Overview

**Creative North Star: "Kartu Katalog"**

Sistem ini memperlakukan situs perpustakaan sebagai **laci kartu katalog yang berfungsi**: setiap kontainer adalah kartu potong, setiap daftar adalah tumpukan kartu yang ditusuk satu batang, dan setiap status dicap dengan stempel karet. Tata bahasanya tunggal dan mengikat kelima tema; yang berubah antar tema hanya materialnya — kayu jati dan manila di siang hari, kuningan dan lampu baca di malam hari, kartu bond polos, fotokopi toner di kertas koran, dan arsip maritim yang ter-bleach asin.

Kepadatannya tinggi dan informasional: angka diset bertik dengan angka tabular, baris entri memakai huruf mesin tik, dan hierarki dibangun dari garis rule serta ukuran — bukan dari bayangan tebal atau warna-warni. Dunia ini menolak default kategori: hero di atas gradasi dengan deret kartu rounded seragam, eyebrow di atas judul, kartu di dalam kartu, glassmorphism, dan bayangan offset keras di luar material Fotokopi.

**Key Characteristics:**

- Satu atom: kartu potong dengan kop bergaris ganda, lubang bor, dan baris entri bertik.
- Satu rangka: daftar ditusuk batang vertikal (`batang`), bukan grid kartu identik.
- Satu bahasa status: stempel karet miring ±4°, bukan pill badge.
- Satu warna rule per tema, diturunkan dari `--ink` — tidak pernah abu-abu hardcode.
- Lima material, satu tata bahasa; tema berbeda terasa beda material, bukan beda produk.

## Colors

Palet mengikuti peran (laci, tinta stempel, kertas, tinta tulis) dan diikat per tema lewat `[data-theme]`; nilai di bawah adalah material **emerald / Laci Jati**, tema default.

### Primary

- **Ledger Pine** (`#1B5E4B`): warna laci — tombol utama, link, chip kategori terpilih, kop tab aktif. Dipakai sebagai bidang besar (rail, footer), bukan sekadar aksen.
- **Pine Deep** (`#0E3D30`): bayangan tinta ledger — judul, hover tombol, latar scrim banner.
- **Manila Wash** (`#DCE6DE`): kartu bertekstur (sambutan, chip lembut, hover tab) — selalu bersama teks `Ledger Pine`.

### Secondary

- **Stamp Oxblood** (`#A63D2E`): tinta stempel — status ketersediaan, aksi sekunder, penanda seksi, ikon rating. Jarang dan tegas.
- **Oxblood Wash** (`#F2E4DE`): latar pengumuman dan pesan error — selalu bersama teks `heading`.

### Neutral

- **Sage Paper** (`#EBEDE6`): tanah halaman — kanvas seluruh rute publik dan admin.
- **Ink** (`#1C1A17`): teks isi, angka, garis rule (16% opacity lewat `color-mix`).
- **Rule** (`color-mix(in srgb, #1C1A17 16%, transparent)`): satu-satunya warna garis; turunan dari `--ink`, jadi mengikuti tema tanpa token tambahan.

### Named Rules

**The One Rule Rule.** Tidak ada warna abu-abu hardcode di mana pun. Setiap garis berasal dari `--rule`; setiap teks sekunder dari `--ink` dengan alpha. Menambahkan `slate-*` atau `border-gray-*` adalah pelanggaran sistem, bukan pengecualian.

**The Stamp Rule.** `accent` dipakai untuk status dan aksi yang menuntut perhatian; menempatkannya sebagai latar besar atau teks paragraf melanggar perannya.

### Lima material

| Tema      | Tanah     | Laci (`brand`) | Stempel (`accent`) | Karakter                      |
| --------- | --------- | -------------- | ------------------ | ----------------------------- |
| emerald   | `#EBEDE6` | `#1B5E4B`      | `#A63D2E`          | siang, kayu, manila           |
| midnight  | `#14110D` | `#C9A25A`      | `#E4573D`          | malam, kuningan, lampu        |
| paper     | `#FBFBFA` | `#4A5348`      | `#8E4B33`          | bond polos, grafit            |
| brutalist | `#E9E9E3` | `#111110`      | `#B83000`          | fotokopi, toner, oranye cetak |
| ocean     | `#ECEFED` | `#0B5E63`      | `#A9401F`          | arsip maritim, garam          |

Setiap pasangan teks/latar di kelima tema diukur ≥4.5:1 oleh `tests/theme-contrast.test.ts` — kontras adalah kontrak, bukan saran.

## Typography

**Display Font:** Libre Caslon Display (fallback Georgia, serif)
**Body Font:** Libre Franklin (fallback ui-sans-serif, system-ui)
**Data / Label Font:** Courier Prime (fallback ui-monospace, monospace)

**Character:** Caslon menempatkan judul pada tradisi buku dan kartu perpustakaan; Franklin menahan teks tetap kernet dan sipil; Courier memegang semua yang berupa _data_ — nomor panggil, tanggal, ISBN, statistik — sehingga angka selalu terbaca sebagai entri kartu, bukan dekorasi.

Pengantaran tema (di luar emerald): midnight → Bodoni Moda + Archivo; paper → Literata + Public Sans; brutalist → Archivo Black + Barlow; ocean → Bitter + Karla. **Courier Prime dipakai di kelima tema** untuk `.entri`.

### Hierarchy

- **Display** (400, `clamp`/`text-3xl`→`text-5xl`, line-height 1.08, tracking −0.03em): judul hero dan judul halaman.
- **Headline** (`font-heading`, 700, `text-2xl`→`text-3xl`): judul seksi di bawah garis rule.
- **Title** (700, `text-base`→`text-xl`): judul kartu, judul entri daftar.
- **Body** (400, `text-sm`→`text-base`, line-height 1.625, maks 68ch): paragraf, sambutan, deskripsi.
- **Label** (600, `text-xs`, tracking 0.04em): tombol, tab, kop pelat.
- **Data** (Courier, `text-xs`, angka tabular): nomor panggil, tanggal, statistik, kode.

### Named Rules

**The Typewriter Rule.** Yang berupa data ditulis Courier dengan `tabular-nums`. Yang berupa kalimat ditulis Franklin. Memakai Courier untuk paragraf, atau Franklin untuk nomor panggil, mengacaukan dua suara ini.

## Layout

Container mengikuti token tema (`72rem` emerald, `68–80rem` antar tema), dipusatkan dengan padding responsif. Irama vertikal memakai `--spacing-section` (`4.5rem` emerald, `3–5.5rem` antar tema) sebagai jarak antar seksi; di bawah judul selalu lebih rapat daripada di atasnya.

Struktur beranda: rail header (tab pembatas navigasi duduk di garis rail), pelat depan laci berisi kop + pencarian + tab kategori, lalu seksi berurutan sesuai `homepageSections` per tema — urutan tidak pernah alfabetis (kontrak).

Di 390px: nav membungkus (`flex-wrap`) alih-alih menggulir, sehingga sembilan tautan utama selalu terlihat; header boleh tumbuh dua baris; tab laci bergulir horizontal; semua kontrol sentuh ≥44×44px.

### Named Rules

**The Fold Rule.** Di 390px, pelat pencarian, kop, judul, dan aksi hero semuanya berada di atas garis lipatan (diukur `< innerHeight`). Konten baru boleh turun ke bawah lipatan setelah keempatnya aman.

## Elevation & Depth

Sistem ini bertumpuk seperti kertas, bukan melayang: bayangan pendek dan bertingkat, jarang dan lebar, selalu dengan tepi yang jelas. Frontmatter memakai border `--rule`; elevasi hanya muncul untuk elemen yang benar-benar terangkat (pelat pencarian, kartu yang di-hover).

### Shadow Vocabulary

- **Paper rest** (`0 1px 1px 0 rgb(28 26 23 / 0.07)`): kartu dan permukaan datar.
- **Paper lift** (`0 2px 4px -1px …, 0 8px 16px -8px …`): pelat pencarian, kartu aktif.
- **Paper high** (`0 4px 8px -2px …, 0 16px 32px -12px …`): hero, dialog.

Tema brutalist tidak memakai bayangan lembut sama sekali — hanya offset toner keras (`2px 2px 0 0 #111110`) sebagai cetakan fotokopi.

### Named Rules

**The Declare-Once Rule.** Elevation dinyatakan sekali: border _atau_ bayangan. Border 1px di bawah bayangan diffus lebar adalah ghost card dan dilarang.

## Shapes

Radius mengikuti **potongan kartu**: sangat kecil dan tegas (`0`–`0.5rem` emerald; `0` di brutalist; maks `0.25rem` di paper). Kartu tidak pernah memakai radius pil — pil hanya untuk kontrol kecil bulat seperti titik carousel dan avatar.

Bentuk berulang yang khas: tab pembatas laci (trapesium/rect dengan sudut atas membulat dan kaki menempel di rail), lubang bor di bawah-tengah kartu (`.lubang`), stempel miring ±4°, dan batang vertikal yang menembus setiap kartu dalam daftar.

## Components

### Buttons

- **Shape:** radius `--radius-md` (0.25rem emerald); tinggi minimal 44px.
- **Primary:** `bg-brand` + `text-surface` (bukan `text-white` — pasangan itu terukur AA di kelima tema), label `font-data` huruf kapital ber-tracking 0.04em.
- **Hover / Focus:** hover ke `bg-brand-strong` atau opacity 0.9; fokus `ring-2 ring-brand` — perilaku fokus tidak pernah dihapus.
- **Accent:** `bg-accent` + `text-surface` untuk aksi yang menuntut perhatian (stempel, aksi reservasi).
- **Secondary:** latar `surface`, border `--rule`, teks `brand`.

### Kartu (`.kartu`)

- **Corner Style:** `--radius-md`; **Background:** `surface`; **Border:** 1px `--rule`; **Shadow:** paper rest; **Padding:** `--spacing-card`.
- **Kop:** baris pertama ditutup garis ganda (`.kartu-kop`) — border 1px + bayangan 1px, meniru garis tercetak kartu indeks.
- **Lubang:** `.lubang` menambah lingkaran 8px di bawah-tengah; daftar memakai `.batang`.

### Stempel (`.stempel`)

Kotak bergaris 1.5px dengan warna `accent`, kapital Courier ber-tracking 0.1em, miring −4°, opasitas 0.92; menekan (rotate −1.5°, scale 1.08) saat kartu induk di-hover/fokus. `data-state="dipinjam"` meredupkannya. Ini pengganti satu-satunya badge status.

### Tab Laci (`.tab-laci`)

Kop navigasi/filter: latar `surface`, border `--rule` tanpa kaki bawah (menempel di rail), label Courier kapital. `aria-selected`/`aria-current` mengaktifkannya ke `bg-brand` + `text-surface`. Tinggi minimal 44px.

### Inputs / Fields

- **Style:** latar `surface`, border 1px `--rule`, radius `--radius-sm`, teks `--ink` dengan `.entri` (Courier, angka tabular).
- **Focus:** border ke `--ink` + `ring-2 ring-brand`.
- **Placeholder:** `color-mix(in srgb, var(--ink) 72%, var(--surface))` — dijamin ≥4.5:1; menambah `placeholder:opacity-*` melanggar ini.

### Navigation

Rail header: nama perpustakaan di kiri (boleh dua baris, tidak pernah dipotong elipsis), sembilan tautan sebagai tab pembatas yang **membungkus**, aksi utama sebagai stempel tercetak di kanan, tombol menu di bawah `md`. Panel mobile memakai `.batang` sebagai daftar berbatang.

### Signature: Pencarian Laci

Pelat label laci berisi satu `<form method="get" action="/katalog">` dengan `input[name="q"]` (≥44px) dan tiga tab pembatas kategori nyata (`/katalog?kategori=<id>`) yang membawa `q` yang sedang diketik. Ini aksi utama produk dan harus ada di viewport pertama.

## Do's and Don'ts

### Do:

- **Do** turunkan semua garis dari `--rule` / `--border` yang dihasilkan `color-mix` dari `--ink`, sehingga mengikuti tema otomatis.
- **Do** pasangkan `bg-brand`/`bg-accent`/`bg-ink` dengan `text-surface` — pasangan itu sudah diuji ≥4.5:1 di kelima tema oleh `tests/theme-contrast.test.ts`.
- **Do** setiap data (nomor panggil, tanggal, ISBN, statistik) memakai `.entri` + `tabular-nums`.
- **Do** pertahankan `min-h-[44px]`/`min-w-[44px]` pada setiap kontrol sentuh, `focus-visible:ring` pada setiap kontrol, dan satu `<h1>` per halaman dengan urutan heading tanpa lompatan.
- **Do** pakai `.riffle` (stagger dari `--i`) untuk masuknya daftar kartu — satu momen tanda tangan, bukan efek tersebar.

### Don't:

- **Don't** menulis `bg-white`, `text-white`, `text-slate-*`, `border-slate-*`, atau hex hardcode di komponen.
- **Don't** memakai `rounded-lg`/`rounded-xl` polos — selalu `rounded-[var(--radius-*)]`.
- **Don't** menaruh kicker/eyebrow di atas judul, nomor seksi (01/02), atau emoji sebagai ikon.
- **Don't** menaruh kartu di dalam kartu, gradien pada teks, glass/backdrop-blur sebagai dekorasi, atau border-left tebal berwarna.
- **Don't** memakai bayangan offset keras `4px 4px 0` di luar material tema brutalist.
- **Don't** memotong nama perpustakaan dengan elipsis; biarkan wrap maksimal dua baris.
