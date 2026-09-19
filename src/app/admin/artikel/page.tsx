'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';

type Article = { id: string; title: string; slug: string; status: string };

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function ArtikelPage() {
  const [rows, setRows] = useState<Article[]>([]);
  const [form, setForm] = useState({
    title: '',
    content_md: '',
    excerpt: '',
    cover_url: '',
    category: '',
    status: 'draft',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/articles?per_page=20');
    const json = (await res.json()) as { data?: Article[] };
    if (res.ok) setRows(json.data ?? []);
  }, []);

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

  const input = 'rounded-lg border px-3 py-2 text-sm';
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Artikel</h1>
      <form onSubmit={onAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <input
          className={input}
          placeholder="Judul* (slug otomatis)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <div className="flex gap-2">
          <input
            className={input}
            placeholder="Cover URL"
            value={form.cover_url}
            onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
          />
          <input
            className={input}
            placeholder="Kategori"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </div>
        <input
          className={input}
          placeholder="Ringkasan (excerpt)"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
        <textarea
          className={input}
          rows={4}
          placeholder="Konten markdown* (content_md)"
          value={form.content_md}
          onChange={(e) => setForm({ ...form, content_md: e.target.value })}
          required
        />
        <div className="flex gap-2">
          <select
            className={input}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">+ Tambah</button>
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
              <span className="flex gap-2">
                <Link
                  href={`/admin/artikel/edit/${r.id}`}
                  className="text-blue-600 hover:underline"
                >
                  Edit
                </Link>
                <button onClick={() => onDelete(r.id)} className="text-red-600 hover:underline">
                  Hapus
                </button>
              </span>
            ),
          },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
      />
    </div>
  );
}
