'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Pagination from '@/components/ui/Pagination';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ sort, order, page: String(page), per_page: '20' });
    const res = await fetch(`/api/banners?${q}`);
    const json = (await res.json()) as {
      data?: Banner[];
      pagination?: { totalPages?: number };
      meta?: { totalPages?: number };
    };
    if (res.ok) {
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    }
  }, [sort, order, page]);

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

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Banner</h1>
      <form onSubmit={onAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <Input
          id="banner-title"
          label="Judul"
          placeholder="Judul*"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <Input
          id="banner-subtitle"
          label="Subtitle"
          placeholder="Subtitle"
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
        <Input
          id="banner-image-url"
          label="Image URL"
          placeholder="Image URL* https://…"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          required
        />
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              id="banner-link"
              label="Link URL"
              placeholder="Link URL"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </div>
          <div className="min-w-[140px]">
            <Input
              id="banner-sort-order"
              label="Urutan"
              type="number"
              placeholder="Urutan (sort_order)"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
          <Button type="submit">+ Tambah</Button>
        </div>
      </form>
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        role="group"
        aria-label="Urutkan banner"
      >
        <span className="text-slate-500" id="banner-sort-label">
          Urut:
        </span>
        <Button
          size="sm"
          variant={sort === 'sort_order' ? 'primary' : 'outline'}
          onClick={() => onSort('sort_order')}
          aria-pressed={sort === 'sort_order'}
        >
          Urutan{arrow('sort_order')}
        </Button>
        <Button
          size="sm"
          variant={sort === 'title' ? 'primary' : 'outline'}
          onClick={() => onSort('title')}
          aria-pressed={sort === 'title'}
        >
          Judul{arrow('title')}
        </Button>
        <Button
          size="sm"
          variant={sort === 'created_at' ? 'primary' : 'outline'}
          onClick={() => onSort('created_at')}
          aria-pressed={sort === 'created_at'}
        >
          Terbaru{arrow('created_at')}
        </Button>
      </div>
      <DataTable<Banner>
        caption={`Daftar banner halaman ${page} dari ${totalPages}`}
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
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/banner/edit/${r.id}`}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onToggle(r)}
                  aria-label={`${r.is_active ? 'Nonaktifkan' : 'Aktifkan'} banner ${r.title}`}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label={`Hapus banner ${r.title}`}
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
        emptyText="Belum ada banner."
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
