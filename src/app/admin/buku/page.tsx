'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { errMsg } from '@/lib/admin-errors';
import type { Book } from '@/lib/types';

type BukuRow = Pick<
  Book,
  'id' | 'title' | 'author' | 'stock_total' | 'stock_available' | 'categories'
>;

export default function BukuPage() {
  const [rows, setRows] = useState<BukuRow[]>([]);
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
      const json = (await res.json()) as { data?: BukuRow[]; pagination?: { totalPages?: number } };
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

  async function onBulkOpname() {
    if (selected.size === 0) return;
    const total = prompt(
      `Stok opname ${selected.size} buku terpilih.\nMasukkan stok_total baru (angka bulat >= 0):`,
      ''
    );
    if (total === null) return;
    const st = Number(total);
    if (!Number.isInteger(st) || st < 0) return alert('stok_total harus bilangan bulat >= 0.');
    const availRaw = prompt(
      `Masukkan stok_available baru (0–${st}, kosongkan = samakan dengan total):`,
      String(st)
    );
    if (availRaw === null) return;
    const sa = availRaw.trim() === '' ? st : Number(availRaw);
    if (!Number.isInteger(sa) || sa < 0 || sa > st) return alert('stok_available harus 0–total.');
    if (!confirm(`Terapkan stok ${sa}/${st} ke ${selected.size} buku?`)) return;
    setBulkLoading(true);
    try {
      const items = [...selected].map((id) => ({ id, stock_total: st, stock_available: sa }));
      const res = await fetch('/api/books', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stock_opname', items }),
      });
      const json = (await res.json()) as {
        data?: { updated?: string[]; skipped?: { id: string; reason: string }[] };
        error?: { message?: string } | string;
      };
      if (!res.ok) return alert(errMsg(json));
      const updated = json.data?.updated ?? [];
      const skipped = json.data?.skipped ?? [];
      if (skipped.length > 0)
        alert(
          `${updated.length} terupdate, ${skipped.length} dilewati (${skipped
            .slice(0, 3)
            .map((s) => s.reason)
            .join('; ')}).`
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
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          + Tambah Buku
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Input
            id="buku-search"
            label="Cari buku"
            placeholder="Cari judul / penulis / ISBN…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <ExportCsvButton
          filename="buku.csv"
          headers={['ID', 'Judul', 'Penulis', 'Kategori', 'Tersedia', 'Total']}
          rows={rows.map((r) => [
            r.id,
            r.title,
            r.author,
            r.categories?.name ?? '',
            r.stock_available,
            r.stock_total,
          ])}
        />
        {selected.size > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === rows.length ? 'Batalkan semua' : 'Pilih semua'}
            </Button>
            <Button variant="danger" size="sm" loading={bulkLoading} onClick={onBulkDelete}>
              {`Hapus terpilih (${selected.size})`}
            </Button>
            <Button variant="outline" size="sm" loading={bulkLoading} onClick={onBulkOpname}>
              {`Stok opname (${selected.size})`}
            </Button>
          </>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : (
        <DataTable<BukuRow>
          columns={[
            {
              key: 'pilih',
              header: 'Pilih',
              render: (r) => (
                <span className="flex min-h-[44px] items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${r.title}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="h-5 w-5 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/buku/edit/${r.id}`}
                    className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    aria-label={`Hapus buku ${r.title}`}
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
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
