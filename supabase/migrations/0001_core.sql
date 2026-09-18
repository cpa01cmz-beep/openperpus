-- ============================================================================
-- 0001_core.sql — CMS Perpustakaan: schema inti
-- Stack: Supabase Postgres 15+
-- Urutan: extension -> helper trigger -> tabel (sesuai dependensi) -> index -> trigger
-- Rollback: DROP file ini = drop tabel dalam urutan terbalik (lihat catatan bawah).
-- Non-destruktif: hanya CREATE IF NOT EXISTS, aman dijalankan ulang.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Helper: auto updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. library_settings — single row (id = 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT NOT NULL DEFAULT 'Perpustakaan Digital',
  tagline           TEXT,
  logo_url          TEXT,
  favicon_url       TEXT,
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  operational_hours JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials           JSONB NOT NULL DEFAULT '{}'::jsonb,
  welcome_text      TEXT,
  vision            TEXT,
  mission           TEXT,
  about             TEXT,
  seo_title         TEXT,
  seo_desc          TEXT,
  theme_primary     TEXT NOT NULL DEFAULT '#1e40af',
  theme_accent      TEXT NOT NULL DEFAULT '#f59e0b',
  announcement      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.library_settings IS 'Satu baris konfigurasi CMS (id=1). Jangan insert baris kedua.';

-- ----------------------------------------------------------------------------
-- 3. profiles — 1:1 dengan auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'librarian', 'member')),
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.profiles IS 'Peran dipakai RLS via public.is_staff() / is_admin() (lihat 0002_rls.sql).';

-- ----------------------------------------------------------------------------
-- 4. categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. racks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.racks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  location   TEXT,
  capacity   INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. books
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  author          TEXT NOT NULL,
  publisher       TEXT,
  isbn            TEXT UNIQUE,
  year            INTEGER CHECK (year IS NULL OR year BETWEEN 1000 AND 2100),
  category_id     UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  rack_id         UUID REFERENCES public.racks (id) ON DELETE SET NULL,
  cover_url       TEXT,
  pdf_url         TEXT,
  description     TEXT,
  pages           INTEGER CHECK (pages IS NULL OR pages > 0),
  language        TEXT NOT NULL DEFAULT 'id',
  stock_total     INTEGER NOT NULL DEFAULT 1 CHECK (stock_total >= 0),
  stock_available INTEGER NOT NULL DEFAULT 1 CHECK (stock_available >= 0),
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg      NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (stock_available <= stock_total)
);
COMMENT ON TABLE public.books IS 'is_active=false = disembunyikan dari katalog publik.';

-- ----------------------------------------------------------------------------
-- 7. members — profil keanggotaan (1:1 ke profiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  member_code TEXT NOT NULL UNIQUE,
  address     TEXT,
  phone       TEXT,
  join_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'suspended', 'expired', 'pending')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. loans — peminjaman
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id      UUID NOT NULL REFERENCES public.books (id) ON DELETE RESTRICT,
  member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  borrowed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at       TIMESTAMPTZ NOT NULL,
  returned_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'borrowed'
               CHECK (status IN ('borrowed', 'returned', 'overdue', 'lost')),
  fine_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at > borrowed_at),
  CHECK (returned_at IS NULL OR returned_at >= borrowed_at)
);

-- ----------------------------------------------------------------------------
-- 9. reservations — antrean / booking buku
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     UUID NOT NULL REFERENCES public.books (id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'ready', 'completed', 'cancelled', 'expired')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > reserved_at)
);

-- ----------------------------------------------------------------------------
-- 10. fines — denda per loan
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id      UUID NOT NULL REFERENCES public.loans (id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  paid_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status       TEXT NOT NULL DEFAULT 'unpaid'
               CHECK (status IN ('unpaid', 'partial', 'paid', 'waived')),
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at      TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (paid_amount <= amount)
);

-- ----------------------------------------------------------------------------
-- 11. articles — berita / artikel perpustakaan
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  excerpt      TEXT,
  content_md   TEXT,
  cover_url    TEXT,
  category     TEXT,
  author_id    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'archived')),
  views        INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 12. banners — hero carousel
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  subtitle   TEXT,
  image_url  TEXT NOT NULL,
  link       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 13. pages — halaman statis (tentang, layanan, kontak, ...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  content_md TEXT,
  excerpt    TEXT,
  seo_title  TEXT,
  seo_desc   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 14. testimonials
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.testimonials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  role       TEXT,
  content    TEXT NOT NULL,
  avatar_url TEXT,
  rating     INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 15. faqs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faqs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 16. menus — navigasi header/footer
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  position   TEXT NOT NULL DEFAULT 'header'
             CHECK (position IN ('header', 'footer', 'sidebar')),
  parent_id  UUID REFERENCES public.menus (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  target     TEXT NOT NULL DEFAULT '_self' CHECK (target IN ('_self', '_blank')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 17. activity_logs — audit trail (append-only dari sisi aplikasi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEX — hanya kolom yang di-filter / di-join / di-sort di jalur panas
-- ============================================================================

-- books: katalog = filter category + featured + active, sort created_at; join rack
CREATE INDEX IF NOT EXISTS idx_books_category_id     ON public.books (category_id);
CREATE INDEX IF NOT EXISTS idx_books_rack_id         ON public.books (rack_id);
CREATE INDEX IF NOT EXISTS idx_books_is_active       ON public.books (is_active);
CREATE INDEX IF NOT EXISTS idx_books_featured        ON public.books (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_books_created_at      ON public.books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_title_trgm      ON public.books (title);
CREATE INDEX IF NOT EXISTS idx_books_author          ON public.books (author);

-- members / loans / reservations / fines: join + filter status + due date
CREATE INDEX IF NOT EXISTS idx_members_status        ON public.members (status);
CREATE INDEX IF NOT EXISTS idx_loans_book_id         ON public.loans (book_id);
CREATE INDEX IF NOT EXISTS idx_loans_member_id       ON public.loans (member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status          ON public.loans (status);
CREATE INDEX IF NOT EXISTS idx_loans_due_at          ON public.loans (due_at);
CREATE INDEX IF NOT EXISTS idx_loans_returned_at     ON public.loans (returned_at);
CREATE INDEX IF NOT EXISTS idx_reservations_book_id  ON public.reservations (book_id);
CREATE INDEX IF NOT EXISTS idx_reservations_member   ON public.reservations (member_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status   ON public.reservations (status);
CREATE INDEX IF NOT EXISTS idx_fines_loan_id         ON public.fines (loan_id);
CREATE INDEX IF NOT EXISTS idx_fines_member_id       ON public.fines (member_id);
CREATE INDEX IF NOT EXISTS idx_fines_status          ON public.fines (status);

-- articles: publik filter status+published_at, filter category
CREATE INDEX IF NOT EXISTS idx_articles_status_pub   ON public.articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category     ON public.articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_author       ON public.articles (author_id);

-- banners / pages / menus / testimonials / faqs: sort + filter active
CREATE INDEX IF NOT EXISTS idx_banners_active_sort   ON public.banners (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_testimonials_sort     ON public.testimonials (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_faqs_sort             ON public.faqs (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_menus_position_sort   ON public.menus (position, sort_order);
CREATE INDEX IF NOT EXISTS idx_menus_parent_id       ON public.menus (parent_id);

-- activity_logs: audit dibaca per user / entity / waktu
CREATE INDEX IF NOT EXISTS idx_activity_logs_user    ON public.activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON public.activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs (created_at DESC);

-- cegah double-booking aktif yang sama (satu member, satu buku, satu reservasi pending)
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_pending
  ON public.reservations (book_id, member_id)
  WHERE status = 'pending';

-- ============================================================================
-- TRIGGER updated_at (semua tabel yang punya kolom updated_at)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'library_settings','profiles','categories','racks','books','members',
    'loans','reservations','fines','articles','banners','pages',
    'testimonials','faqs','menus'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s; '
      'CREATE TRIGGER trg_%1$s_updated_at '
      'BEFORE UPDATE ON public.%1$s '
      'FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
      t
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- ROLLBACK (manual, butuh konfirmasi mandor — destruktif):
--   DROP TRIGGER ... (otomatis ikut drop table);
--   DROP TABLE IF EXISTS public.activity_logs, public.menus, public.faqs,
--     public.testimonials, public.pages, public.banners, public.articles,
--     public.fines, public.reservations, public.loans, public.members,
--     public.books, public.racks, public.categories, public.profiles,
--     public.library_settings CASCADE;
--   DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
-- Catatan: JANGAN drop extension pgcrypto/uuid-ossp bila dipakai extension lain.
-- ============================================================================
