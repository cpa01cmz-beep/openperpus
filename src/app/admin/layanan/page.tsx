'use client';

import { useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { useAdminList } from '@/hooks/useAdminList';
import { errMsg } from '@/lib/admin-errors';

type ServiceRow = {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

const ICON_OPTIONS = ['book', 'catalog', 'users', 'clock', 'info', 'star'] as const;

const EMPTY_FORM = { title: '', description: '', icon: 'book', sort_order: '0' };

export default function LayananAdminPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);

  // #62: satu hook daftar — pencarian tetap ditunda 300 ms, ukuran halaman
  // tunggal dari src/lib/pagination.ts (tak lagi '50').
  const list = useAdminList<ServiceRow>({
    path: '/api/services',
    params: { all: '1', page: String(page), q: search },
    debounceMs: 300,
    errorMessage: 'Gagal memuat layanan.',
  });
  // #62: error pemuatan daftar ikut tampil (sebelumnya gagal load diabaikan diam-diam).
  const { rows, totalPages, error: listError, reload: load } = list;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setActionError('');
    if (!form.title.trim()) {
      setFormError('Judul layanan wajib diisi.');
      return;
    }
    if (!form.description.trim()) {
      setFormError('Deskripsi layanan wajib diisi.');
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
        title: form.title.trim(),
        description: form.description.trim(),
        icon: form.icon,
        sort_order: sortOrder,
      };
      const res = editingId
        ? await fetch(`/api/services/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm(EMPTY_FORM);
      setEditingId(null);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onEdit(row: ServiceRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description ?? '',
      icon: ICON_OPTIONS.includes(row.icon as (typeof ICON_OPTIONS)[number]) ? row.icon : 'book',
      sort_order: String(row.sort_order ?? 0),
    });
    setFormError('');
  }

  function onCancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function onToggle(row: ServiceRow) {
    setActionError('');
    const res = await fetch(`/api/services/${row.id}`, {
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
    if (!confirm('Hapus layanan ini?')) return;
    setActionError('');
    const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
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
        <h1 className="text-2xl font-bold">Layanan</h1>
        <p className="text-sm text-slate-500">
          Kelola kartu layanan (judul, deskripsi, ikon, urutan, status aktif). Kartu langsung tampil
          di halaman /layanan publik.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-4"
      >
        <div className="min-w-[180px] flex-1">
          <Input
            id="layanan-title"
            label="Judul layanan"
            placeholder="Judul layanan*"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <Input
            id="layanan-description"
            label="Deskripsi"
            placeholder="Deskripsi layanan*"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label
            htmlFor="layanan-icon"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Ikon
          </label>
          <select
            id="layanan-icon"
            value={form.icon}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {ICON_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <Input
            id="layanan-sort"
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
          id="layanan-search"
          label="Cari layanan"
          placeholder="Cari judul / deskripsi…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>
      {listError && (
        <p role="alert" className="text-sm text-red-600">
          {listError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}
      <DataTable<ServiceRow>
        caption={`Daftar layanan halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'title',
            header: 'Judul',
            render: (r) => <span className="font-medium">{r.title}</span>,
          },
          {
            key: 'description',
            header: 'Deskripsi',
            render: (r) => (
              <span className="line-clamp-2 max-w-md text-sm text-slate-600">
                {r.description ?? '-'}
              </span>
            ),
          },
          { key: 'icon', header: 'Ikon' },
          {
            key: 'sort_order',
            header: 'Urutan',
            render: (r) => <span className="tabular-nums">{r.sort_order}</span>,
          },
          {
            key: 'is_active',
            header: 'Status',
            render: (r) => (
              <button
                type="button"
                onClick={() => onToggle(r)}
                aria-label={`Ubah status layanan ${r.title}`}
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
                  aria-label={`Ubah layanan ${r.title}`}
                  className="inline-flex min-h-[44px] items-center text-slate-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label={`Hapus layanan ${r.title}`}
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
