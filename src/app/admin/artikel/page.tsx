'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';

type Article = { id: string; title: string; slug: string; status: string };

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function ArtikelPage() {
  const [rows, setRows] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState({
    title: '',
    content_md: '',
    excerpt: '',
    cover_url: '',
    category: '',
    status: 'draft',
  });

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), per_page: '10' });
    const res = await fetch(`/api/articles?${q}`);
    const json = (await res.json()) as {
      data?: Article[];
      pagination?: { totalPages?: number };
      meta?: { totalPages?: number };
    };
    if (res.ok) {
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content_md.trim()) return alert('Judul & konten wajib.');
    const res = await fetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) return alert(errMsg(json));
    setForm({
      title: '',
      content_md: '',
      excerpt: '',
      cover_url: '',
      category: '',
      status: 'draft',
    });
    load();
  }

  async function onDelete(id: string) {
    if (!confirm('Hapus artikel?')) return;
    const res = await fetch(`/api/articles?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) return alert(errMsg(json));
    load();
  }

  const rawInput =
    'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Artikel</h1>
      <form onSubmit={onAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <Input
          id="artikel-title"
          label="Judul"
          placeholder="Judul* (slug otomatis)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              id="artikel-cover-url"
              label="Cover URL"
              placeholder="Cover URL"
              value={form.cover_url}
              onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input
              id="artikel-category"
              label="Kategori"
              placeholder="Kategori"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
        </div>
        <Input
          id="artikel-excerpt"
          label="Ringkasan"
          placeholder="Ringkasan (excerpt)"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
        <div className="grid gap-1 text-sm">
          <label
            htmlFor="artikel-content"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Konten markdown
          </label>
          <textarea
            id="artikel-content"
            className={rawInput}
            rows={4}
            placeholder="Konten markdown* (content_md)"
            value={form.content_md}
            onChange={(e) => setForm({ ...form, content_md: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label
              htmlFor="artikel-status"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Status
            </label>
            <select
              id="artikel-status"
              className={rawInput}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <Button type="submit">+ Tambah</Button>
        </div>
      </form>
      <DataTable<Article>
        columns={[
          {
            key: 'title',
            header: 'Judul',
            render: (r) => <span className="font-medium">{r.title}</span>,
          },
          { key: 'slug', header: 'Slug' },
          { key: 'status', header: 'Status' },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/artikel/edit/${r.id}`}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label={`Hapus artikel ${r.title}`}
                  className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Hapus
                </button>
              </span>
            ),
          },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
