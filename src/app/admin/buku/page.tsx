'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';

type Book = {
  id: string;
  title: string;
  author: string;
  stock_total: number;
  stock_available: number;
  categories?: { name: string } | null;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function BukuPage() {
  const [rows, setRows] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), per_page: '10', q: search });
      const res = await fetch(`/api/books?${q}`);
      const json = (await res.json()) as { data?: Book[]; pagination?: { totalPages?: number } };
      if (res.ok) {
        setRows(json.data ?? []);
        setTotalPages(json.pagination?.totalPages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function onDelete(id: string) {
    if (!confirm('Hapus buku ini?')) return;
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) return alert(errMsg(json));
    load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function onBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Hapus ${selected.size} buku terpilih?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/books?id=${[...selected].join(',')}`, { method: 'DELETE' });
      const json = (await res.json()) as {
        data?: { deleted?: string[]; skipped?: string[] };
        error?: { message?: string } | string;
      };
      if (!res.ok) return alert(errMsg(json));
      const skipped = json.data?.skipped ?? [];
      if (skipped.length > 0)
        alert(
          `${json.data?.deleted?.length ?? 0} dihapus, ${skipped.length} dilewati (masih dipinjam).`
        );
      setSelected(new Set());
      load();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Buku</h1>
        <Link
          href="/admin/buku/tambah"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          + Tambah Buku
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
          placeholder="Cari judul / penulis / ISBN…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        {selected.size > 0 && (
          <>
            <button
              onClick={toggleAll}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600"
            >
              {selected.size === rows.length ? 'Batalkan semua' : 'Pilih semua'}
            </button>
            <button
              disabled={bulkLoading}
              onClick={onBulkDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {bulkLoading ? 'Menghapus…' : `Hapus terpilih (${selected.size})`}
            </button>
          </>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : (
        <DataTable<Book>
          columns={[
            {
              key: 'pilih',
              header: 'Pilih',
              render: (r) => (
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${r.title}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="h-4 w-4"
                  />
                </span>
              ),
            },
            {
              key: 'title',
              header: 'Judul',
              render: (r) => <span className="font-medium">{r.title}</span>,
            },
            { key: 'author', header: 'Penulis' },
            { key: 'categories', header: 'Kategori', render: (r) => r.categories?.name ?? '-' },
            {
              key: 'stock_available',
              header: 'Stok',
              render: (r) => `${r.stock_available}/${r.stock_total}`,
            },
            {
              key: 'aksi',
              header: 'Aksi',
              render: (r) => (
                <span className="flex gap-2">
                  <Link href={`/admin/buku/edit/${r.id}`} className="text-blue-600 hover:underline">
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
      )}
      <div className="flex items-center gap-2 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          ‹ Prev
        </button>
        <span>
          Halaman {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
