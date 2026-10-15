'use client';

import { useCallback, useState } from 'react';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import { useAdminList } from '@/hooks/useAdminList';
import { PagesTab } from './PagesTab';
import { FaqsTab } from './FaqsTab';
import { TestimonialsTab } from './TestimonialsTab';
import { onAdd, onToggle, onDelete } from '@/lib/konten-api';

type Tab = 'pages' | 'faqs' | 'testimonials';

type PageItem = {
  id: string;
  slug: string;
  title: string;
  is_active: boolean;
  show_in_menu?: boolean;
};
type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  is_active: boolean;
};
type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  content: string;
  rating: number;
  is_active: boolean;
};

export default function KontenPage() {
  const [tab, setTab] = useState<Tab>('pages');
  const [page, setPage] = useState(1);
  // State aksi tulis (bukan pemuatan): 404 per-tab + pesan error mutasi.
  const [actionError, setActionError] = useState('');
  const [tabMissing, setTabMissing] = useState<Partial<Record<Tab, boolean>>>({});

  // #62: satu hook daftar dipakai ketiga tab — tidak lagi fetch tiga endpoint
  // sendiri-sendiri. Halaman ini memang butuh tiga resource sekaligus, jadi
  // hook-nya dipanggial tiga kali dengan `path` berbeda.
  const pagesList = useAdminList<PageItem>({
    path: '/api/pages',
    params: { page: String(page) },
    noStore: true,
    errorMessage: 'Gagal memuat halaman.',
  });
  const faqsList = useAdminList<Faq>({
    path: '/api/faqs',
    params: { page: String(page) },
    noStore: true,
    errorMessage: 'Gagal memuat FAQ.',
  });
  const testisList = useAdminList<Testimonial>({
    path: '/api/testimonials',
    params: { page: String(page) },
    noStore: true,
    errorMessage: 'Gagal memuat testimoni.',
  });

  const { rows: pages } = pagesList;
  const { rows: faqs } = faqsList;
  const { rows: testis } = testisList;
  const loading = pagesList.loading || faqsList.loading || testisList.loading;
  const missing: Record<Tab, boolean> = {
    pages: pagesList.missing || tabMissing.pages === true,
    faqs: faqsList.missing || tabMissing.faqs === true,
    testimonials: testisList.missing || tabMissing.testimonials === true,
  };
  // Halaman ini sudah punya banner 404 amber per-tab, jadi pesan generic
  // hook TIDAK ditampilkan untuk tab yang sedang ber-404 (sama seperti
  // admin/denda, admin/reservasi, admin/peminjaman, dan (public)/denda).
  // Sebaliknya ketiga daftar bisa gagal sendiri-sendiri, jadi pesan yang
  // bukan 404 tetap ditampilkan semuanya — bukan cuma satu yang tersaring.
  const listErrors = [
    { key: 'pages', label: 'Halaman', msg: pagesList.missing ? '' : pagesList.error },
    { key: 'faqs', label: 'FAQ', msg: faqsList.missing ? '' : faqsList.error },
    { key: 'testimonials', label: 'Testimoni', msg: testisList.missing ? '' : testisList.error },
  ].filter((x) => x.msg !== '');
  const totalPages = Math.max(pagesList.totalPages, faqsList.totalPages, testisList.totalPages);

  const { reload: reloadPages } = pagesList;
  const { reload: reloadFaqs } = faqsList;
  const { reload: reloadTestis } = testisList;

  // Muat ulang ketiga tab sekaligus (dipakai setelah aksi tambah/ubah/hapus).
  const load = useCallback(() => {
    reloadPages();
    reloadFaqs();
    reloadTestis();
    // Muat ulang yang sukses membuat banner 404 per-tab bisa hilang lagi —
    // meniru setMissing({...}) yang dulu dihitung ulang tiap load().
    setTabMissing({});
    setActionError('');
  }, [reloadPages, reloadFaqs, reloadTestis]);

  // Berganti halaman juga memuat ulang daftar: buang pesan aksi lama.
  // Render-phase adjustment (bukan effect) agar lolos react-hooks/set-state-in-effect.
  const [prevPage, setPrevPage] = useState(page);
  if (prevPage !== page) {
    setPrevPage(page);
    setActionError('');
  }

  const handleAdd = useCallback(
    (kind: Tab, body: Record<string, unknown>) =>
      onAdd(kind, body, {
        onMissing: (k) => setTabMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => setActionError(m),
        onSuccess: load,
      }),
    [load]
  );

  const handleToggle = useCallback(
    (kind: Tab, id: string, is_active: boolean) =>
      onToggle(kind, id, is_active, {
        onMissing: (k) => setTabMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => setActionError(m),
        onSuccess: load,
      }),
    [load]
  );

  const handleDelete = useCallback(
    (kind: Tab, id: string) =>
      onDelete(kind, id, {
        onMissing: (k) => setTabMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => setActionError(m),
        onSuccess: load,
      }),
    [load]
  );

  const missingPaths = [
    missing.pages && '/api/pages',
    missing.faqs && '/api/faqs',
    missing.testimonials && '/api/testimonials',
  ].filter((v): v is string => typeof v === 'string');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pages', label: 'Halaman' },
    { key: 'faqs', label: 'FAQ' },
    { key: 'testimonials', label: 'Testimoni' },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Konten</h1>
        <p className="text-sm text-ink/60">
          Kelola halaman dinamis, FAQ, dan testimoni. Untuk artikel & banner gunakan menu Artikel /
          Banner.
        </p>
      </div>

      {missingPaths.length > 0 && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          API{' '}
          {missingPaths.map((p, i) => (
            <span key={p}>
              <code className="font-mono">{p}</code>
              {i < missingPaths.length - 1 ? ', ' : ' '}
            </span>
          ))}
          belum tersedia di backend (404). Sudah dilaporkan ke mandor.
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}
      {listErrors.map(({ key, label, msg }) => (
        <div
          key={key}
          role="alert"
          className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {label}: {msg}
        </div>
      ))}

      <div role="tablist" aria-label="Jenis konten" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            variant={tab === t.key ? 'primary' : 'outline'}
            size="sm"
          >
            {t.label}
          </Button>
        ))}
        <Button onClick={load} variant="outline" size="sm" className="ml-auto">
          Muat ulang
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-ink/60" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <>
          {tab === 'pages' && (
            <PagesTab
              pages={pages}
              page={page}
              totalPages={totalPages}
              onAddPage={(b) => handleAdd('pages', b)}
              onTogglePage={(id, active) => handleToggle('pages', id, active)}
              onDeletePage={(id) => handleDelete('pages', id)}
            />
          )}
          {tab === 'faqs' && (
            <FaqsTab
              faqs={faqs}
              page={page}
              totalPages={totalPages}
              onAddFaq={(b) => handleAdd('faqs', b)}
              onToggleFaq={(id, active) => handleToggle('faqs', id, active)}
              onDeleteFaq={(id) => handleDelete('faqs', id)}
            />
          )}
          {tab === 'testimonials' && (
            <TestimonialsTab
              testimonials={testis}
              page={page}
              totalPages={totalPages}
              onAddTestimonial={(b) => handleAdd('testimonials', b)}
              onToggleTestimonial={(id, active) => handleToggle('testimonials', id, active)}
              onDeleteTestimonial={(id) => handleDelete('testimonials', id)}
            />
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
