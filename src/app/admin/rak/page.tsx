'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';

type Rack = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  capacity: number | null;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function RakPage() {
  const [rows, setRows] = useState<Rack[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [form, setForm] = useState({ code: '', name: '', location: '' });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: '1', page: String(page), per_page: '50', q: search });
    const res = await fetch(`/api/racks?${q}`);
    const json = (await res.json()) as {
      data?: Rack[];
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
    if (!form.code.trim()) {
      setFormError('Kode rak wajib diisi.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Nama rak wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/racks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          location: form.location.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ code: '', name: '', location: '' });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Rack) {
    setActionError('');
    const res = await fetch(`/api/racks?id=${row.id}`, {
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
    if (!confirm('Hapus rak ini?')) return;
    setActionError('');
    const res = await fetch(`/api/racks?id=${id}`, { method: 'DELETE' });
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
        <h1 className="text-2xl font-bold">Rak</h1>
        <p className="text-sm text-slate-500">
          Kelola rak penyimpanan buku (kode, nama, lokasi, status aktif).
        </p>
      </div>
      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-4"
      >
        <div className="min-w-[140px] flex-1">
          <Input
            id="rak-code"
            label="Kode rak"
            placeholder="Kode rak*"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            error={formError || undefined}
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <Input
            id="rak-name"
            label="Nama rak"
            placeholder="Nama rak*"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <Input
            id="rak-location"
            label="Lokasi"
            placeholder="Lokasi (opsional)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <Button type="submit" loading={loading}>
          + Tambah
        </Button>
      </form>
      <div className="w-full max-w-sm">
        <Input
          id="rak-search"
          label="Cari rak"
          placeholder="Cari kode / nama / lokasi…"
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
      <DataTable<Rack>
        caption={`Daftar rak halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'code',
            header: 'Kode',
            render: (r) => <span className="font-medium">{r.code}</span>,
          },
          { key: 'name', header: 'Nama' },
          { key: 'location', header: 'Lokasi', render: (r) => r.location ?? '-' },
          {
            key: 'capacity',
            header: 'Kapasitas',
            render: (r) => (r.capacity === null ? '-' : String(r.capacity)),
          },
          {
            key: 'is_active',
            header: 'Status',
            render: (r) => (
              <button
                type="button"
                onClick={() => onToggle(r)}
                aria-label={`Ubah status rak ${r.code}`}
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
                aria-label={`Hapus rak ${r.code}`}
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
