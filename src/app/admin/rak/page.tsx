'use client';

import { useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import ConfirmModal from '@/components/admin/ConfirmModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { useAdminList } from '@/hooks/useAdminList';
import { errMsg } from '@/lib/admin-errors';

type Rack = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  capacity: number | null;
  is_active: boolean;
};

export default function RakPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ code: '', name: '', location: '' });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Rack | null>(null);

  const list = useAdminList<Rack>({
    path: '/api/racks',
    params: { all: '1', page: String(page), q: search },
    debounceMs: 300,
    errorMessage: 'Gagal memuat rak.',
  });
  const { rows, totalPages, error: listError, reload: load } = list;

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
    const res = await fetch(`/api/racks/${row.id}`, {
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

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    setActionError('');
    const res = await fetch(`/api/racks/${row.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
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
                <Badge tone={r.is_active ? 'emerald' : 'slate'}>
                  {r.is_active ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </button>
            ),
          },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <button
                type="button"
                onClick={() => setPendingDelete(r)}
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
        emptyState={{
          title: 'Belum ada rak',
          description: search
            ? `Tidak ada rak yang cocok dengan "${search}". Coba kata kunci lain.`
            : 'Rak penyimpanan buku akan muncul di sini.',
        }}
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Hapus rak"
        description="Buku yang menunjuk ke rak ini akan kehilangan rak."
        confirmLabel="Ya, hapus"
      >
        <p>
          Hapus rak <strong>{pendingDelete?.code}</strong> ({pendingDelete?.name})?
        </p>
      </ConfirmModal>
    </div>
  );
}
