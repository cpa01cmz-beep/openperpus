'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import { PagesTab } from './PagesTab';
import { FaqsTab } from './FaqsTab';
import { TestimonialsTab } from './TestimonialsTab';
import { apiList, onAdd, onToggle, onDelete } from '@/lib/konten-api';

type Tab = 'pages' | 'faqs' | 'testimonials';

type PageItem = { id: string; slug: string; title: string; is_active: boolean };
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
  const [totalPages, setTotalPages] = useState(1);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [testis, setTestis] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<Record<Tab, boolean>>({
    pages: false,
    faqs: false,
    testimonials: false,
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, f, t] = await Promise.all([
        apiList<PageItem>('/api/pages', page),
        apiList<Faq>('/api/faqs', page),
        apiList<Testimonial>('/api/testimonials', page),
      ]);
      setTotalPages(Math.max(p.totalPages, f.totalPages, t.totalPages));
      setPages(p.rows);
      setFaqs(f.rows);
      setTestis(t.rows);
      setMissing({ pages: p.missing, faqs: f.missing, testimonials: t.missing });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(
    (kind: Tab, body: Record<string, unknown>) =>
      onAdd(kind, body, {
        onMissing: (k) => setMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => alert(m),
        onSuccess: load,
      }),
    [load]
  );

  const handleToggle = useCallback(
    (kind: Tab, id: string, is_active: boolean) =>
      onToggle(kind, id, is_active, {
        onMissing: (k) => setMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => alert(m),
        onSuccess: load,
      }),
    [load]
  );

  const handleDelete = useCallback(
    (kind: Tab, id: string) =>
      onDelete(kind, id, {
        onMissing: (k) => setMissing((m) => ({ ...m, [k]: true })),
        onError: (m) => alert(m),
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
        <h1 className="kartu-kop pb-3 font-heading text-2xl font-bold text-heading">Konten</h1>
        <p className="text-sm text-ink/70">
          Kelola halaman dinamis, FAQ, dan testimoni. Untuk artikel & banner gunakan menu Artikel /
          Banner.
        </p>
      </div>

      {missingPaths.length > 0 && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          API{' '}
          {missingPaths.map((p, i) => (
            <span key={p}>
              <code className="font-data">{p}</code>
              {i < missingPaths.length - 1 ? ', ' : ' '}
            </span>
          ))}
          belum tersedia di backend (404). Sudah dilaporkan ke mandor.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-3 text-sm text-accent"
        >
          {error}
        </div>
      )}

      {/* Tab pembatas laci: strip tab di atas garis rule */}
      <div
        role="tablist"
        aria-label="Jenis konten"
        className="flex flex-wrap items-end gap-1.5 border-b border-rule"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="tab-laci -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t.label}
          </button>
        ))}
        <Button onClick={load} variant="outline" size="sm" className="mb-1 ml-auto">
          Muat ulang
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-ink/70" aria-live="polite">
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
