'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function KategoriPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: '1', page: String(page), per_page: '50', q: search });
    const res = await fetch(`/api/categories?${q}`);
    const json = (await res.json()) as {
      data?: Category[];
      pagination?: { totalPages?: number };
      meta?: { totalPages?: number };
    };
    if (res.ok) {
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setActionError('');
    if (!form.name.trim()) {
      setFormError('Nama kategori wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ name: '', description: '' });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Category) {
    setActionError('');
    const res = await fetch(`/api/categories?id=${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    load();
  }

  async function onDelete(id: string) {
    if (!confirm('Hapus kategori ini?')) return;
    setActionError('');
    const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    load();
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Kategori</h1>
        <p className="text-sm text-slate-500">
          Kelola kategori buku (name, slug otomatis, deskripsi, status aktif).
        </p>
      </div>
      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-4"
      >
        <div className="min-w-[180px] flex-1">
          <Input
            id="kategori-name"
            label="Nama kategori"
            placeholder="Nama kategori*"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formError || undefined}
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <Input
            id="kategori-description"
            label="Deskripsi"
            placeholder="Deskripsi (opsional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <Button type="submit" loading={loading}>
          + Tambah
        </Button>
      </form>
      <div className="w-full max-w-sm">
        <Input
          id="kategori-search"
          label="Cari kategori"
          placeholder="Cari nama / slug…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}
      <DataTable<Category>
        caption={`Daftar kategori halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'name',
            header: 'Nama',
            render: (r) => <span className="font-medium">{r.name}</span>,
          },
          { key: 'slug', header: 'Slug' },
          { key: 'description', header: 'Deskripsi', render: (r) => r.description ?? '-' },
          {
            key: 'is_active',
            header: 'Status',
            render: (r) => (
              <button
                type="button"
                onClick={() => onToggle(r)}
                aria-label={`Ubah status kategori ${r.name}`}
                aria-pressed={r.is_active}
                className="inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {r.is_active ? 'Aktif' : 'Nonaktif'}
              </button>
            ),
          },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                aria-label={`Hapus kategori ${r.name}`}
                className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Hapus
              </button>
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
