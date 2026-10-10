'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { errMsg } from '@/lib/admin-errors';

type Menu = {
  id: string;
  label: string;
  url: string;
  position: string;
  sort_order: number;
  is_active: boolean;
  target?: string | null;
  parent_id?: string | null;
};

export default function MenuPage() {
  const [rows, setRows] = useState<Menu[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState({
    label: '',
    url: '',
    position: 'header',
    target: '_self',
    sort_order: '0',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
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
      setTotalPages(json.pagination?.totalPages ?? 1);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
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
    const sortOrder = Number(form.sort_order);
    if (!Number.isInteger(sortOrder)) {
      setFormError('Urutan harus bilangan bulat.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        label: form.label.trim(),
        url: form.url.trim(),
        position: form.position,
        target: form.target,
        sort_order: sortOrder,
      };
      const res = editingId
        ? await fetch(`/api/menus?id=${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/menus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ label: '', url: '', position: 'header', target: '_self', sort_order: '0' });
      setEditingId(null);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onEdit(row: Menu) {
    setEditingId(row.id);
    setForm({
      label: row.label,
      url: row.url,
      position: row.position,
      target: row.target === '_blank' ? '_blank' : '_self',
      sort_order: String(row.sort_order ?? 0),
    });
    setFormError('');
  }

  function onCancelEdit() {
    setEditingId(null);
    setForm({ label: '', url: '', position: 'header', target: '_self', sort_order: '0' });
    setFormError('');
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
          Kelola menu navigasi situs (label, URL, posisi, target, urutan, status aktif). Menu aktif
          langsung tampil di navigasi publik.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
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
        <div className="grid gap-1">
          <label
            htmlFor="menu-target"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Target
          </label>
          <select
            id="menu-target"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            <option value="_self">_self (tab sama)</option>
            <option value="_blank">_blank (tab baru)</option>
          </select>
        </div>
        <div className="w-28">
          <Input
            id="menu-sort"
            label="Urutan"
            placeholder="0"
            inputMode="numeric"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
          />
        </div>
        <Button type="submit" loading={loading}>
          {editingId ? 'Simpan' : '+ Tambah'}
        </Button>
        {editingId && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            Batal
          </Button>
        )}
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
            key: 'sort_order',
            header: 'Urutan',
            render: (r) => <span className="tabular-nums">{r.sort_order}</span>,
          },
          {
            key: 'target',
            header: 'Target',
            render: (r) => <span>{r.target ?? '_self'}</span>,
          },
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
              <span className="inline-flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  aria-label={`Ubah menu ${r.label}`}
                  className="inline-flex min-h-[44px] items-center text-slate-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label={`Hapus menu ${r.label}`}
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
