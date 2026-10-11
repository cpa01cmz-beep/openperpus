DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND ((c.conrelid = 'public.loans'::regclass AND a.attname = 'member_id')
         OR (c.conrelid = 'public.reservations'::regclass AND a.attname IN ('book_id', 'member_id'))
         OR (c.conrelid = 'public.fines'::regclass AND a.attname IN ('loan_id', 'member_id'))
         OR (c.conrelid = 'public.books'::regclass AND a.attname IN ('category_id', 'rack_id')))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END
$$;

ALTER TABLE public.loans
  ADD CONSTRAINT loans_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members (id) ON DELETE RESTRICT;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_book_id_fkey
  FOREIGN KEY (book_id) REFERENCES public.books (id) ON DELETE RESTRICT;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members (id) ON DELETE RESTRICT;

ALTER TABLE public.fines
  ADD CONSTRAINT fines_loan_id_fkey
  FOREIGN KEY (loan_id) REFERENCES public.loans (id) ON DELETE RESTRICT;

ALTER TABLE public.fines
  ADD CONSTRAINT fines_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.members (id) ON DELETE RESTRICT;

ALTER TABLE public.books
  ADD CONSTRAINT books_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories (id) ON DELETE RESTRICT;

ALTER TABLE public.books
  ADD CONSTRAINT books_rack_id_fkey
  FOREIGN KEY (rack_id) REFERENCES public.racks (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.loans
     WHERE status IN ('borrowed', 'overdue')
     GROUP BY book_id, member_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'uq_loans_active skipped: duplicate active loans exist, clean up first';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_active
      ON public.loans (book_id, member_id)
      WHERE status IN ('borrowed', 'overdue');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_loan_fine_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.loans l
       SET fine_amount = COALESCE((SELECT SUM(f.amount) FROM public.fines f WHERE f.loan_id = OLD.loan_id), 0),
           updated_at = now()
     WHERE l.id = OLD.loan_id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.loan_id IS DISTINCT FROM NEW.loan_id THEN
    UPDATE public.loans l
       SET fine_amount = COALESCE((SELECT SUM(f.amount) FROM public.fines f WHERE f.loan_id = OLD.loan_id), 0),
           updated_at = now()
     WHERE l.id = OLD.loan_id;
  END IF;
  UPDATE public.loans l
     SET fine_amount = COALESCE((SELECT SUM(f.amount) FROM public.fines f WHERE f.loan_id = NEW.loan_id), 0),
         updated_at = now()
   WHERE l.id = NEW.loan_id;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_sync_loan_fine ON public.fines;
CREATE TRIGGER trg_sync_loan_fine
  AFTER INSERT OR UPDATE OF amount, loan_id OR DELETE ON public.fines
  FOR EACH ROW EXECUTE FUNCTION public.sync_loan_fine_amount();

UPDATE public.loans l
   SET fine_amount = COALESCE((SELECT SUM(f.amount) FROM public.fines f WHERE f.loan_id = l.id), 0),
       updated_at = now()
 WHERE l.fine_amount <> COALESCE((SELECT SUM(f.amount) FROM public.fines f WHERE f.loan_id = l.id), 0);
