'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';

type Menu = {
  id: string;
  label: string;
  url: string;
  position: string;
  sort_order: number;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function MenuPage() {
  const [rows, setRows] = useState<Menu[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState({ label: '', url: '', position: 'header' });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: '1', page: String(page), per_page: '50', q: search });
    const res = await fetch(`/api/menus?${q}`);
    const json = (await res.json()) as {
      data?: Menu[];
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
    if (!form.label.trim()) {
      setFormError('Label menu wajib diisi.');
      return;
    }
    if (!form.url.trim()) {
      setFormError('URL menu wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label.trim(),
          url: form.url.trim(),
          position: form.position,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ label: '', url: '', position: 'header' });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Menu) {
    setActionError('');
    const res = await fetch(`/api/menus?id=${row.id}`, {
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
    if (!confirm('Hapus menu ini?')) return;
    setActionError('');
    const res = await fetch(`/api/menus?id=${id}`, { method: 'DELETE' });
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
        <h1 className="text-2xl font-bold">Menu</h1>
        <p className="text-sm text-slate-500">
          Kelola menu navigasi situs (label, URL, posisi, status aktif).
        </p>
      </div>
      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-4"
      >
        <div className="min-w-[180px] flex-1">
          <Input
            id="menu-label"
            label="Label menu"
            placeholder="Label menu*"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <Input
            id="menu-url"
            label="URL / link"
            placeholder="URL / link*"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label
            htmlFor="menu-position"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Posisi
          </label>
          <select
            id="menu-position"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            <option value="header">header</option>
            <option value="footer">footer</option>
            <option value="sidebar">sidebar</option>
          </select>
        </div>
        <Button type="submit" loading={loading}>
          + Tambah
        </Button>
        {formError && (
          <p role="alert" className="w-full text-sm text-red-600">
            {formError}
          </p>
        )}
      </form>
      <div className="w-full max-w-sm">
        <Input
          id="menu-search"
          label="Cari menu"
          placeholder="Cari label / URL…"
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
      <DataTable<Menu>
        caption={`Daftar menu halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'label',
            header: 'Label',
            render: (r) => <span className="font-medium">{r.label}</span>,
          },
          { key: 'url', header: 'URL' },
          { key: 'position', header: 'Posisi' },
          {
            key: 'is_active',
            header: 'Status',
            render: (r) => (
              <button
                type="button"
                onClick={() => onToggle(r)}
                aria-label={`Ubah status menu ${r.label}`}
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
                aria-label={`Hapus menu ${r.label}`}
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
