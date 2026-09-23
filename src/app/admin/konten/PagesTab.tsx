'use client';

import { useState, type FormEvent } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type PageItem = { id: string; slug: string; title: string; is_active: boolean };

const rawInput =
  'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';

export function PagesTab({
  pages,
  page,
  totalPages,
  onAddPage,
  onTogglePage,
  onDeletePage,
}: {
  pages: PageItem[];
  page: number;
  totalPages: number;
  onAddPage: (body: Record<string, unknown>) => void;
  onTogglePage: (id: string, is_active: boolean) => void;
  onDeletePage: (id: string) => void;
}) {
  const [pageForm, setPageForm] = useState({ title: '', content_md: '', excerpt: '' });
  const [busy, setBusy] = useState(false);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!pageForm.title.trim() || !pageForm.content_md.trim())
      return alert('Judul & konten wajib.');
    setBusy(true);
    onAddPage(pageForm);
    setPageForm({ title: '', content_md: '', excerpt: '' });
    setBusy(false);
  };

  return (
    <section className="grid gap-4" aria-label="Halaman dinamis">
      <form onSubmit={handleAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
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
                  onClick={() => onTogglePage(r.id, r.is_active)}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  onClick={() => onDeletePage(r.id)}
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
  );
}
