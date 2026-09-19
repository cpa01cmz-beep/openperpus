'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';

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

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

async function apiList(path: string, page = 1) {
  const q = new URLSearchParams({ page: String(page), per_page: '10' });
  const res = await fetch(`${path}?${q}`, { cache: 'no-store' });
  if (res.status === 404) return { missing: true as const, rows: [] as never[], totalPages: 1 };
  const json = (await res.json()) as {
    data?: never[];
    pagination?: { totalPages?: number };
    meta?: { totalPages?: number };
  };
  if (!res.ok) throw new Error(errMsg(json));
  return {
    missing: false as const,
    rows: (json.data ?? []) as never[],
    totalPages: json.pagination?.totalPages ?? json.meta?.totalPages ?? 1,
  };
}

export default function KontenPage() {
  const [tab, setTab] = useState<Tab>('pages');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [testis, setTestis] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<Record<Tab, boolean>>({
    pages: false,
    faqs: false,
    testimonials: false,
  });
  const [error, setError] = useState('');

  const [pageForm, setPageForm] = useState({ title: '', content_md: '', excerpt: '' });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '' });
  const [testiForm, setTestiForm] = useState({ name: '', role: '', content: '', rating: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, f, t] = await Promise.all([
        apiList('/api/pages', page),
        apiList('/api/faqs', page),
        apiList('/api/testimonials', page),
      ]);
      setTotalPages(Math.max(p.totalPages, f.totalPages, t.totalPages));
      setPages(p.rows as PageItem[]);
      setFaqs(f.rows as Faq[]);
      setTestis(t.rows as Testimonial[]);
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

  async function onAdd(kind: Tab, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const path =
        kind === 'pages' ? '/api/pages' : kind === 'faqs' ? '/api/faqs' : '/api/testimonials';
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setMissing((m) => ({ ...m, [kind]: true }));
        return alert(`API ${path} belum tersedia di backend.`);
      }
      if (!res.ok) return alert(errMsg(json));
      if (kind === 'pages') setPageForm({ title: '', content_md: '', excerpt: '' });
      if (kind === 'faqs') setFaqForm({ question: '', answer: '', category: '' });
      if (kind === 'testimonials') setTestiForm({ name: '', role: '', content: '', rating: 5 });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(kind: Tab, id: string, is_active: boolean) {
    const path =
      kind === 'pages' ? '/api/pages' : kind === 'faqs' ? '/api/faqs' : '/api/testimonials';
    const res = await fetch(`${path}?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !is_active }),
    });
    if (res.status === 404) {
      setMissing((m) => ({ ...m, [kind]: true }));
      return alert(`API ${path} belum tersedia di backend.`);
    }
    if (!res.ok) return alert('Gagal update.');
    load();
  }

  async function onDelete(kind: Tab, id: string) {
    if (!confirm('Hapus data ini?')) return;
    const path =
      kind === 'pages' ? '/api/pages' : kind === 'faqs' ? '/api/faqs' : '/api/testimonials';
    const res = await fetch(`${path}?id=${id}`, { method: 'DELETE' });
    if (res.status === 404) {
      setMissing((m) => ({ ...m, [kind]: true }));
      return alert(`API ${path} belum tersedia di backend.`);
    }
    if (!res.ok) return alert('Gagal menghapus.');
    load();
  }

  const missingPaths = [
    missing.pages && '/api/pages',
    missing.faqs && '/api/faqs',
    missing.testimonials && '/api/testimonials',
  ].filter((v): v is string => typeof v === 'string');
  const rawInput =
    'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';
  const tabs: { key: Tab; label: string }[] = [
    { key: 'pages', label: 'Halaman' },
    { key: 'faqs', label: 'FAQ' },
    { key: 'testimonials', label: 'Testimoni' },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Konten</h1>
        <p className="text-sm text-slate-500">
          Kelola halaman dinamis, FAQ, dan testimoni. Untuk artikel &amp; banner gunakan menu
          Artikel / Banner.
        </p>
      </div>

      {missingPaths.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
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
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

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
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <>
          {tab === 'pages' && (
            <section className="grid gap-4" aria-label="Halaman dinamis">
              {' '}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!pageForm.title.trim() || !pageForm.content_md.trim())
                    return alert('Judul & konten wajib.');
                  onAdd('pages', pageForm);
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <Input
                  id="konten-page-title"
                  label="Judul halaman"
                  placeholder="Judul* (slug otomatis)"
                  value={pageForm.title}
                  onChange={(e) => setPageForm({ ...pageForm, title: e.target.value })}
                  required
                />
                <Input
                  id="konten-page-excerpt"
                  label="Ringkasan"
                  placeholder="Ringkasan (excerpt)"
                  value={pageForm.excerpt}
                  onChange={(e) => setPageForm({ ...pageForm, excerpt: e.target.value })}
                />
                <div className="grid gap-1 text-sm">
                  <label
                    htmlFor="konten-page-content"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Konten markdown
                  </label>
                  <textarea
                    id="konten-page-content"
                    className={rawInput}
                    rows={4}
                    placeholder="Konten markdown* (content_md)"
                    value={pageForm.content_md}
                    onChange={(e) => setPageForm({ ...pageForm, content_md: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" loading={busy} className="w-fit">
                  + Tambah Halaman
                </Button>
              </form>
              <DataTable<PageItem>
                caption={`Daftar konten halaman ${page} dari ${totalPages}`}
                columns={[
                  {
                    key: 'title',
                    header: 'Judul',
                    render: (r) => <span className="font-medium">{r.title}</span>,
                  },
                  { key: 'slug', header: 'Slug' },
                  {
                    key: 'is_active',
                    header: 'Aktif',
                    render: (r) => (r.is_active ? 'Ya' : 'Tidak'),
                  },
                  {
                    key: 'aksi',
                    header: 'Aksi',
                    render: (r) => (
                      <span className="flex gap-2">
                        <button
                          onClick={() => onToggle('pages', r.id, r.is_active)}
                          className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          onClick={() => onDelete('pages', r.id)}
                          className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={pages}
                getRowKey={(r) => r.id}
                emptyText="Belum ada halaman."
              />
            </section>
          )}

          {tab === 'faqs' && (
            <section className="grid gap-4" aria-label="FAQ">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!faqForm.question.trim() || !faqForm.answer.trim())
                    return alert('Pertanyaan & jawaban wajib.');
                  onAdd('faqs', { ...faqForm, sort_order: 0 });
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <Input
                  id="konten-faq-question"
                  label="Pertanyaan"
                  placeholder="Pertanyaan*"
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  required
                />
                <div className="grid gap-1 text-sm">
                  <label
                    htmlFor="konten-faq-answer"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Jawaban
                  </label>
                  <textarea
                    id="konten-faq-answer"
                    className={rawInput}
                    rows={3}
                    placeholder="Jawaban*"
                    value={faqForm.answer}
                    onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <Input
                      id="konten-faq-category"
                      label="Kategori"
                      placeholder="Kategori (opsional)"
                      value={faqForm.category}
                      onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                    />
                  </div>
                  <Button type="submit" loading={busy}>
                    + Tambah FAQ
                  </Button>
                </div>
              </form>
              <DataTable<Faq>
                caption={`Daftar konten halaman ${page} dari ${totalPages}`}
                columns={[
                  {
                    key: 'question',
                    header: 'Pertanyaan',
                    render: (r) => <span className="font-medium">{r.question}</span>,
                  },
                  { key: 'category', header: 'Kategori', render: (r) => r.category ?? '-' },
                  {
                    key: 'is_active',
                    header: 'Aktif',
                    render: (r) => (r.is_active ? 'Ya' : 'Tidak'),
                  },
                  {
                    key: 'aksi',
                    header: 'Aksi',
                    render: (r) => (
                      <span className="flex gap-2">
                        <button
                          onClick={() => onToggle('faqs', r.id, r.is_active)}
                          className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          onClick={() => onDelete('faqs', r.id)}
                          className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={faqs}
                getRowKey={(r) => r.id}
                emptyText="Belum ada FAQ."
              />
            </section>
          )}

          {tab === 'testimonials' && (
            <section className="grid gap-4" aria-label="Testimoni">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!testiForm.name.trim() || !testiForm.content.trim())
                    return alert('Nama & isi wajib.');
                  onAdd('testimonials', { ...testiForm, sort_order: 0 });
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[160px] flex-1">
                    <Input
                      id="konten-testi-name"
                      label="Nama"
                      placeholder="Nama*"
                      value={testiForm.name}
                      onChange={(e) => setTestiForm({ ...testiForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="min-w-[160px] flex-1">
                    <Input
                      id="konten-testi-role"
                      label="Peran"
                      placeholder="Peran (ex: Mahasiswa)"
                      value={testiForm.role}
                      onChange={(e) => setTestiForm({ ...testiForm, role: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label
                      htmlFor="konten-testi-rating"
                      className="mb-1.5 block text-sm font-semibold text-slate-700"
                    >
                      Rating
                    </label>
                    <select
                      id="konten-testi-rating"
                      className={rawInput}
                      value={testiForm.rating}
                      onChange={(e) =>
                        setTestiForm({ ...testiForm, rating: Number(e.target.value) })
                      }
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          ★ {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1 text-sm">
                  <label
                    htmlFor="konten-testi-content"
                    className="mb-1.5 block text-sm font-semibold text-slate-700"
                  >
                    Isi testimoni
                  </label>
                  <textarea
                    id="konten-testi-content"
                    className={rawInput}
                    rows={3}
                    placeholder="Isi testimoni*"
                    value={testiForm.content}
                    onChange={(e) => setTestiForm({ ...testiForm, content: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" loading={busy} className="w-fit">
                  + Tambah Testimoni
                </Button>
              </form>
              <DataTable<Testimonial>
                caption={`Daftar konten halaman ${page} dari ${totalPages}`}
                columns={[
                  {
                    key: 'name',
                    header: 'Nama',
                    render: (r) => <span className="font-medium">{r.name}</span>,
                  },
                  { key: 'rating', header: 'Rating', render: (r) => `★ ${r.rating}` },
                  {
                    key: 'is_active',
                    header: 'Aktif',
                    render: (r) => (r.is_active ? 'Ya' : 'Tidak'),
                  },
                  {
                    key: 'aksi',
                    header: 'Aksi',
                    render: (r) => (
                      <span className="flex gap-2">
                        <button
                          onClick={() => onToggle('testimonials', r.id, r.is_active)}
                          className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          onClick={() => onDelete('testimonials', r.id)}
                          className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={testis}
                getRowKey={(r) => r.id}
                emptyText="Belum ada testimoni."
              />
            </section>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
