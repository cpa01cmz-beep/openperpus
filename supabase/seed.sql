-- ============================================================================
-- seed.sql — Data awal CMS Perpustakaan (idempotent, aman dijalankan ulang)
-- Cara pakai: psql "$DATABASE_URL" -f supabase/seed.sql
--   atau: supabase db execute --file supabase/seed.sql
--   atau: paste ke SQL Editor dashboard (service_role / postgres).
-- Isi: library_settings#1, 6 categories, 3 racks, 8 books, 3 banners,
--      3 articles, 4 faqs, 3 pages, sample testimonials + menus.
-- NOTE: profiles/members/loans TIDAK di-seed (butuh auth.users asli).
-- ============================================================================

-- ---- 1. library_settings id=1 ----
INSERT INTO public.library_settings (
  id, name, tagline, logo_url, favicon_url, address, phone, email,
  operational_hours, socials, welcome_text, vision, mission, about,
  seo_title, seo_desc, announcement
) VALUES (
  1,
  'Perpustakaan Cendekia Digital',
  'Membaca Membuka Dunia',
  'https://example.supabase.co/storage/v1/object/public/library-assets/logo/logo.png',
  'https://example.supabase.co/storage/v1/object/public/library-assets/logo/favicon.ico',
  'Jl. Merdeka No. 10, Yogyakarta 55165',
  '(0274) 555-0100',
  'info@percendekia.id',
  '[{"day": "Senin-Jumat", "open": "08:00", "close": "20:00"}, {"day": "Sabtu", "open": "09:00", "close": "15:00"}, {"day": "Minggu", "open": null, "close": null, "note": "Tutup"}]'::jsonb,
  '{"instagram": "https://instagram.com/percendekia", "facebook": "https://facebook.com/percendekia", "youtube": "https://youtube.com/@percendekia", "tiktok": "https://tiktok.com/@percendekia"}'::jsonb,
  'Selamat datang di Perpustakaan Cendekia Digital — pinjam buku fisik, baca e-book, ikuti agenda literasi, semua dalam satu akun.',
  'Menjadi pusat literasi digital terdepan yang inklusif dan berkelanjutan.',
  '1. Menyediakan koleksi berkualitas. 2. Memberdayakan pustakawan. 3. Menghubungkan komunitas lewat literasi.',
  'Perpustakaan Cendekia Digital melayani 12.000+ anggota dengan 25.000+ eksemplar, ruang baca anak, dan layanan pinjam antar-jemput.',
  'Perpustakaan Cendekia Digital — Pinjam Buku & Baca E-book Online',
  'Katalog buku, e-book, agenda literasi, dan layanan anggota Perpustakaan Cendekia Digital.',
  'Pelayanan tutup pada hari libur nasional. Denda keterlambatan Rp1.000/hari/buku.'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, tagline = EXCLUDED.tagline,
  logo_url = EXCLUDED.logo_url, favicon_url = EXCLUDED.favicon_url,
  address = EXCLUDED.address, phone = EXCLUDED.phone, email = EXCLUDED.email,
  operational_hours = EXCLUDED.operational_hours, socials = EXCLUDED.socials,
  welcome_text = EXCLUDED.welcome_text, vision = EXCLUDED.vision,
  mission = EXCLUDED.mission, about = EXCLUDED.about,
  seo_title = EXCLUDED.seo_title, seo_desc = EXCLUDED.seo_desc,
  announcement = EXCLUDED.announcement, updated_at = NOW();

-- ---- 2. categories (6) ----
INSERT INTO public.categories (name, slug, description, sort_order, is_active) VALUES
  ('Fiksi',           'fiksi',            'Novel, cerpen, dan karya sastra imajinatif.',            1, TRUE),
  ('Non-Fiksi',       'non-fiksi',        'Biografi, esai, dan pengetahuan populer.',              2, TRUE),
  ('Sains & Teknologi','sains-teknologi', 'Sains populer, komputer, dan rekayasa.',                3, TRUE),
  ('Sejarah',         'sejarah',          'Sejarah Indonesia dan dunia.',                          4, TRUE),
  ('Anak',            'anak',             'Buku bergambar dan dongeng untuk pembaca muda.',        5, TRUE),
  ('Agama & Filsafat','agama-filsafat',   'Spiritualitas, etika, dan filsafat.',                   6, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order, is_active = TRUE, updated_at = NOW();

-- ---- 3. racks (3) ----
INSERT INTO public.racks (code, name, location, capacity, is_active) VALUES
  ('R-01', 'Rak Fiksi',  'Lantai 1 — Aula A', 500, TRUE),
  ('R-02', 'Rak Sains',  'Lantai 2 — Aula B', 400, TRUE),
  ('R-03', 'Rak Anak',   'Lantai 1 — Ruang Anak', 300, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, location = EXCLUDED.location,
  capacity = EXCLUDED.capacity, is_active = TRUE, updated_at = NOW();

-- ---- 4. books (8 dummy, FK via lookup slug/code) ----
-- Pola: INSERT ... SELECT id dari categories/racks agar seed tidak hardcode UUID.
INSERT INTO public.books
  (title, slug, author, publisher, isbn, year, category_id, rack_id,
   cover_url, description, pages, language, stock_total, stock_available, featured, rating_avg, is_active)
SELECT
  v.title, v.slug, v.author, v.publisher, v.isbn, v.year, c.id, r.id,
  v.cover, v.descr, v.pages, v.lang, v.st, v.sa, v.feat, v.rating, v.active
FROM (VALUES
  ('Laut Bercerita', 'laut-bercerita', 'Leila S. Chudori', 'Gramedia Pustaka Utama', '9786020331826', 2017,
   'fiksi', 'R-01', 'covers/laut-bercerita.jpg',
   'Novel berlatar pergerakan mahasiswa dan kehilangan di era Orde Baru.', 379, 'id', 12, 8, TRUE, 4.8, TRUE),
  ('Bumi Manusia', 'bumi-manusia', 'Pramoedya Ananta Toer', 'Lentera Dipantara', '9789799731234', 1980,
   'fiksi', 'R-01', 'covers/bumi-manusia.jpg',
   'Roman pertama Tetralogi Buru: kisah Minke di Hindia Belanda.', 535, 'id', 10, 6, TRUE, 4.9, TRUE),
  ('Sapiens: Riwayat Singkat Umat Manusia', 'sapiens', 'Yuval Noah Harari', 'Gramedia', '9786020622999', 2017,
   'non-fiksi', 'R-01', 'covers/sapiens.jpg',
   'Terjemahan Indonesia: bagaimana Homo sapiens menguasai dunia.', 512, 'id', 8, 5, TRUE, 4.7, TRUE),
  ('Brief Answers to the Big Questions', 'brief-answers-big-questions', 'Stephen Hawking', 'Bantam', '9781984819192', 2018,
   'sains-teknologi', 'R-02', 'covers/brief-answers.jpg',
   'Jawaban Hawking atas pertanyaan besar: alam semesta, AI, dan masa depan.', 256, 'en', 6, 4, FALSE, 4.6, TRUE),
  ('Clean Code (Edisi Bahasa Indonesia)', 'clean-code-id', 'Robert C. Martin', 'Informatika', '9780132350884', 2019,
   'sains-teknologi', 'R-02', 'covers/clean-code.jpg',
   'Panduan menulis kode bersih untuk pengembang perangkat lunak.', 464, 'id', 7, 7, FALSE, 4.5, TRUE),
  ('Sejarah Indonesia Modern', 'sejarah-indonesia-modern', 'M.C. Ricklefs', 'Gadjah Mada University Press', '9789794201873', 2008,
   'sejarah', 'R-02', 'covers/sejarah-indonesia.jpg',
   'Rujukan klasik sejarah Indonesia dari era kerajaan hingga reformasi.', 700, 'id', 5, 3, FALSE, 4.4, TRUE),
  ('Si Kancil dan Buaya', 'si-kancil-dan-buaya', 'D. Hardjono', 'Balai Pustaka', '9789796661234', 2020,
   'anak', 'R-03', 'covers/si-kancil.jpg',
   'Dongeng bergambar Si Kancil yang cerdik untuk pembaca usia 4-8 tahun.', 32, 'id', 20, 15, FALSE, 4.8, TRUE),
  ('Tasawuf Modern', 'tasawuf-modern', 'Hamka', 'Republika', '9789793837455', 2015,
   'agama-filsafat', 'R-01', 'covers/tasawuf-modern.jpg',
   'Klasik Hamka tentang kebahagiaan, kesabaran, dan makna hidup.', 300, 'id', 9, 9, FALSE, 4.7, TRUE)
) AS v(title, slug, author, publisher, isbn, year, cat_slug, rack_code,
       cover, descr, pages, lang, st, sa, feat, rating, active)
JOIN public.categories c ON c.slug = v.cat_slug
JOIN public.racks r       ON r.code = v.rack_code
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, author = EXCLUDED.author, publisher = EXCLUDED.publisher,
  isbn = EXCLUDED.isbn, year = EXCLUDED.year,
  category_id = EXCLUDED.category_id, rack_id = EXCLUDED.rack_id,
  cover_url = EXCLUDED.cover_url, description = EXCLUDED.description,
  pages = EXCLUDED.pages, language = EXCLUDED.language,
  stock_total = EXCLUDED.stock_total, stock_available = EXCLUDED.stock_available,
  featured = EXCLUDED.featured, rating_avg = EXCLUDED.rating_avg,
  is_active = EXCLUDED.is_active, updated_at = NOW();

-- ---- 5. banners (3) ----
INSERT INTO public.banners (title, subtitle, image_url, link, sort_order, is_active)
SELECT * FROM (VALUES
  ('Festival Literasi 2026', 'Bazar buku, bedah karya, dan lomba mendongeng — 20-22 Oktober.',
   'banners/festival-literasi.jpg', '/artikel/festival-literasi-2026', 1, TRUE),
  ('E-Book Kini Bisa Dibaca Online', '400+ e-book sudah tersedia. Login lalu buka koleksi digital.',
   'banners/ebook-online.jpg', '/katalog?format=ebook', 2, TRUE),
  ('Jadi Anggota? Gratis!', 'Daftar online, verifikasi 1x24 jam, langsung bisa pinjam 3 buku.',
   'banners/daftar-anggota.jpg', '/daftar', 3, TRUE)
) AS v(title, subtitle, image_url, link, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.banners b WHERE b.title = v.title
);

-- ---- 6. articles (3, published) ----
INSERT INTO public.articles (title, slug, excerpt, content_md, cover_url, category, published_at, status) VALUES
  ('Festival Literasi 2026: Tiga Hari Penuh Buku', 'festival-literasi-2026',
   'Bazar, bedah karya, dan lomba mendongeng — catat tanggalnya.',
   '# Festival Literasi 2026\n\nPerpustakaan Cendekia menggelar festival tahunan ...\n\n- Bazar 30 penerbit\n- Bedah novel *Laut Bercerita*\n- Lomba mendongeng anak',
   'articles/festival.jpg', 'Agenda', NOW() - INTERVAL '2 days', 'published'),
  ('400+ E-book Kini Bisa Dibaca Online', 'ebook-bisa-dibaca-online',
   'Koleksi digital bertambah — cara aksesnya mudah.',
   '# E-book Online\n\nLogin > Katalog > filter *E-book* > Baca. Unduhan PDF tersedia untuk anggota aktif.',
   'articles/ebook.jpg', 'Layanan', NOW() - INTERVAL '5 days', 'published'),
  ('5 Tips Merawat Buku Pinjaman', 'tips-merawat-buku',
   'Buku awet, denda lewat — tips sederhana dari pustakawan.',
   '# Merawat Buku\n\n1. Gunakan pembatas, jangan lipat. 2. Jauhkan dari air. 3. Kembalikan tepat waktu.',
   'articles/tips.jpg', 'Tips', NOW() - INTERVAL '9 days', 'published')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, content_md = EXCLUDED.content_md,
  cover_url = EXCLUDED.cover_url, category = EXCLUDED.category,
  published_at = EXCLUDED.published_at, status = 'published', updated_at = NOW();

-- ---- 7. faqs (4) ----
INSERT INTO public.faqs (question, answer, category, sort_order, is_active)
SELECT * FROM (VALUES
  ('Bagaimana cara menjadi anggota?', 'Klik Daftar, isi formulir, verifikasi email, lalu datang 1x untuk aktivasi kartu. Layanan gratis untuk warga DIY.',
   'Keanggotaan', 1, TRUE),
  ('Berapa buku yang boleh dipinjam?', 'Maksimal 3 buku selama 14 hari, dapat diperpanjang 1x7 hari bila tidak ada antrean.',
   'Peminjaman', 2, TRUE),
  ('Berapa denda keterlambatan?', 'Rp1.000 per hari per buku. Denda dapat dibayar tunai di meja sirkulasi atau via transfer.',
   'Denda', 3, TRUE),
  ('Apakah e-book bisa diunduh?', 'Anggota aktif bisa membaca online dan mengunduh PDF bertanda air untuk penggunaan pribadi.',
   'E-book', 4, TRUE)
) AS v(question, answer, category, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.faqs f WHERE f.question = v.question
);

-- ---- 8. pages (tentang, layanan, kontak) ----
INSERT INTO public.pages (slug, title, content_md, excerpt, is_active) VALUES
  ('tentang', 'Tentang Kami',
   '# Tentang Perpustakaan Cendekia\n\nDidirikan 1998, kami melayani ...\n\n## Visi\n\nMenjadi pusat literasi digital terdepan.\n\n## Layanan\n\n- Sirkulasi\n- Ruang baca anak\n- Kelas literasi',
   'Profil, visi, dan layanan perpustakaan.', TRUE),
  ('layanan', 'Layanan',
   '# Layanan\n\n## Sirkulasi\nPinjam max 3 buku / 14 hari.\n\n## E-book\nBaca online 400+ judul.\n\n## Antar-Jemput\nGratis radius 5 km, min. 2 buku.',
   'Jam, sirkulasi, e-book, antar-jemput.', TRUE),
  ('kontak', 'Kontak',
   '# Kontak\n\nJl. Merdeka No. 10, Yogyakarta\n\nTelp (0274) 555-0100\n\nEmail info@percendekia.id\n\nJam: Senin-Jumat 08.00-20.00, Sabtu 09.00-15.00.',
   'Alamat, telepon, dan jam layanan.', TRUE)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, content_md = EXCLUDED.content_md,
  excerpt = EXCLUDED.excerpt, is_active = TRUE, updated_at = NOW();

-- ---- 9. testimonials (sample, idempotent via name+content check) ----
INSERT INTO public.testimonials (name, role, content, rating, sort_order, is_active)
SELECT * FROM (VALUES
  ('Anisa Rahma', 'Mahasiswa UGM', 'Koleksi e-book-nya lengkap, pinjam fisik juga cepat. Petugas ramah!', 5, 1, TRUE),
  ('Budi Santoso', 'Guru SD', 'Ruang anak nyaman, anak saya betah ikut story telling tiap Sabtu.', 5, 2, TRUE)
) AS v(name, role, content, rating, sort_order, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.testimonials t WHERE t.name = v.name AND t.content = v.content
);

-- ---- 10. menus (header + footer, idempotent) ----
INSERT INTO public.menus (label, url, position, sort_order, is_active, target)
SELECT * FROM (VALUES
  ('Beranda',  '/',        'header', 1, TRUE, '_self'),
  ('Katalog',  '/katalog', 'header', 2, TRUE, '_self'),
  ('Artikel',  '/artikel', 'header', 3, TRUE, '_self'),
  ('Tentang',  '/tentang', 'header', 4, TRUE, '_self'),
  ('Kontak',   '/kontak',  'header', 5, TRUE, '_self'),
  ('Tentang',  '/tentang', 'footer', 1, TRUE, '_self'),
  ('Layanan',  '/layanan', 'footer', 2, TRUE, '_self'),
  ('Kontak',   '/kontak',  'footer', 3, TRUE, '_self')
) AS v(label, url, position, sort_order, is_active, target)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menus m
  WHERE m.label = v.label AND m.url = v.url AND m.position = v.position
);
