'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';

type Banner = {
  id: string;
  title: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function BannerPage() {
  const [rows, setRows] = useState<Banner[]>([]);
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    link: '',
    sort_order: 0,
  });
  const [sort, setSort] = useState('sort_order');
  const [order, setOrder] = useState('asc');

  const load = useCallback(async () => {
    const q = new URLSearchParams({ sort, order });
    const res = await fetch(`/api/banners?${q}`);
    const json = (await res.json()) as { data?: Banner[] };
    if (res.ok) setRows(json.data ?? []);
  }, [sort, order]);

  useEffect(() => {
    load();
  }, [load]);

  function onSort(col: string) {
    if (sort === col) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setOrder(col === 'created_at' ? 'desc' : 'asc');
    }
  }

  const arrow = (col: string) => (sort === col ? (order === 'asc' ? ' ▲' : ' ▼') : '');

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.image_url.trim()) return alert('Judul & image_url wajib.');
    const res = await fetch('/api/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) }),
    });
    const json = await res.json();
    if (!res.ok) return alert(errMsg(json));
    setForm({ title: '', subtitle: '', image_url: '', link: '', sort_order: 0 });
    load();
  }

  async function onToggle(r: Banner) {
    const res = await fetch(`/api/banners?id=${r.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !r.is_active }),
    });
    if (!res.ok) return alert('Gagal update.');
    load();
  }

  async function onDelete(id: string) {
    if (!confirm('Hapus banner?')) return;
    const res = await fetch(`/api/banners?id=${id}`, { method: 'DELETE' });
    if (!res.ok) return alert('Gagal menghapus.');
    load();
  }

  const input = 'rounded-lg border px-3 py-2 text-sm';
  const sortBtn = (active: boolean) =>
    `rounded-lg border px-3 py-1 text-sm ${active ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white text-slate-600'}`;
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Banner</h1>
      <form onSubmit={onAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <input
          className={input}
          placeholder="Judul*"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <input
          className={input}
          placeholder="Subtitle"
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
        <input
          className={input}
          placeholder="Image URL* https://…"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          required
        />
        <div className="flex gap-2">
          <input
            className={input}
            placeholder="Link URL"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
          <input
            type="number"
            className={input}
            placeholder="Urutan (sort_order)"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">+ Tambah</button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Urut:</span>
        <button onClick={() => onSort('sort_order')} className={sortBtn(sort === 'sort_order')}>
          Urutan{arrow('sort_order')}
        </button>
        <button onClick={() => onSort('title')} className={sortBtn(sort === 'title')}>
          Judul{arrow('title')}
        </button>
        <button onClick={() => onSort('created_at')} className={sortBtn(sort === 'created_at')}>
          Terbaru{arrow('created_at')}
        </button>
      </div>
      <DataTable<Banner>
        columns={[
          {
            key: 'title',
            header: 'Judul',
            render: (r) => <span className="font-medium">{r.title}</span>,
          },
          { key: 'sort_order', header: 'Urutan' },
          { key: 'is_active', header: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <span className="flex gap-2">
                <Link href={`/admin/banner/edit/${r.id}`} className="text-blue-600 hover:underline">
                  Edit
                </Link>
                <button onClick={() => onToggle(r)} className="text-blue-600 hover:underline">
                  {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
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
