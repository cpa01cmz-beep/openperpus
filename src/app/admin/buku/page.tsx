'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import ConfirmModal from '@/components/admin/ConfirmModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { errMsg } from '@/lib/admin-errors';
import type { Book } from '@/lib/types';

type BukuRow = Pick<
  Book,
  'id' | 'title' | 'author' | 'stock_total' | 'stock_available' | 'categories'
>;

type DeleteResult = {
  data?: { deleted?: string[]; skipped?: string[] };
  error?: { message?: string } | string;
};

type OpnameResult = {
  data?: { updated?: string[]; skipped?: { id: string; reason: string }[] };
  error?: { message?: string } | string;
};

export default function BukuPage() {
  const [rows, setRows] = useState<BukuRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // Pengganti window.confirm/prompt: dialog per aksi destruktif.
  const [pendingDelete, setPendingDelete] = useState<BukuRow | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [opnameOpen, setOpnameOpen] = useState(false);
  const [opnameTotal, setOpnameTotal] = useState('');
  const [opnameAvail, setOpnameAvail] = useState('');
  const [opnameError, setOpnameError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ page: String(page), per_page: '10', q: search });
      const res = await fetch(`/api/books?${q}`);
      const json = (await res.json().catch(() => ({}))) as {
        data?: BukuRow[];
        pagination?: { totalPages?: number };
      };
      if (!res.ok) throw new Error(errMsg(json, 'Gagal memuat buku.'));
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

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

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    setNotice('');
    setActionError('');
    const res = await fetch(`/api/books/${row.id}`, { method: 'DELETE' });
    const json = (await res.json().catch(() => ({}))) as DeleteResult;
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    setNotice(`Buku "${row.title}" dihapus.`);
    load();
  }

  async function confirmBulkDelete() {
    setPendingBulkDelete(false);
    setBulkLoading(true);
    setError('');
    setNotice('');
    setActionError('');
    try {
      const res = await fetch(`/api/books?id=${[...selected].join(',')}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as DeleteResult;
      if (!res.ok) {
        setActionError(errMsg(json));
        return;
      }
      const skipped = json.data?.skipped ?? [];
      if (skipped.length > 0)
        setActionError(
          `${json.data?.deleted?.length ?? 0} dihapus, ${skipped.length} dilewati (masih dipinjam).`
        );
      else setNotice(`${json.data?.deleted?.length ?? 0} buku dihapus.`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  function openOpname() {
    setOpnameError('');
    setOpnameTotal('');
    setOpnameAvail('');
    setOpnameOpen(true);
  }

  async function applyOpname() {
    // Validasi di dalam modal — pengganti dua kotak input beruntun.
    const st = Number(opnameTotal);
    if (opnameTotal.trim() === '' || !Number.isInteger(st) || st < 0) {
      setOpnameError('stok_total harus bilangan bulat >= 0.');
      return;
    }
    const sa = opnameAvail.trim() === '' ? st : Number(opnameAvail);
    if (!Number.isInteger(sa) || sa < 0 || sa > st) {
      setOpnameError('stok_available harus 0–total.');
      return;
    }
    setOpnameError('');
    setBulkLoading(true);
    setError('');
    try {
      const items = [...selected].map((id) => ({ id, stock_total: st, stock_available: sa }));
      const res = await fetch('/api/books', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stock_opname', items }),
      });
      const json = (await res.json().catch(() => ({}))) as OpnameResult;
      if (!res.ok) {
        setOpnameError(errMsg(json));
        return;
      }
      const updated = json.data?.updated ?? [];
      const skipped = json.data?.skipped ?? [];
      setOpnameOpen(false);
      if (skipped.length > 0)
        setActionError(
          `${updated.length} terupdate, ${skipped.length} dilewati (${skipped
            .slice(0, 3)
            .map((s: { reason: string }) => s.reason)
            .join('; ')}).`
        );
      else setNotice(`${updated.length} buku di-opname menjadi ${sa}/${st}.`);
      setSelected(new Set());
      load();
    } catch (e) {
      setError((e as Error).message);
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
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}
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
            <Button
              variant="danger"
              size="sm"
              loading={bulkLoading}
              onClick={() => setPendingBulkDelete(true)}
            >
              {`Hapus terpilih (${selected.size})`}
            </Button>
            <Button variant="outline" size="sm" onClick={openOpname}>
              {`Stok opname (${selected.size})`}
            </Button>
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
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
              render: (r) => (
                <Badge tone={r.stock_available > 0 ? 'emerald' : 'rose'}>
                  {r.stock_available}/{r.stock_total}
                </Badge>
              ),
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
                    onClick={() => setPendingDelete(r)}
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
          emptyState={{
            title: 'Belum ada buku',
            description: search
              ? `Tidak ada buku yang cocok dengan "${search}". Coba kata kunci lain.`
              : 'Buku yang terdaftar akan muncul di sini.',
          }}
        />
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Hapus buku"
        description="Buku yang masih dipinjam tidak bisa dihapus."
        confirmLabel="Ya, hapus"
      >
        <p>
          Hapus buku <strong>{pendingDelete?.title}</strong>?
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pendingBulkDelete}
        onClose={() => setPendingBulkDelete(false)}
        onConfirm={() => void confirmBulkDelete()}
        title={`Hapus ${selected.size} buku terpilih`}
        description="Buku yang masih dipinjam akan dilewati otomatis."
        confirmLabel="Ya, hapus semua"
        loading={bulkLoading}
      >
        <p>Hapus {selected.size} buku terpilih?</p>
      </ConfirmModal>

      <Modal
        open={opnameOpen}
        onClose={() => setOpnameOpen(false)}
        title={`Stok opname ${selected.size} buku terpilih`}
        description="Sesuaikan stok fisik dengan sistem. Buku yang dipinjam akan dilewati."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpnameOpen(false)}
              disabled={bulkLoading}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              loading={bulkLoading}
              onClick={() => void applyOpname()}
            >
              Terapkan
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Input
            id="opname-total"
            label="Stok total baru"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={opnameTotal}
            onChange={(e) => setOpnameTotal(e.target.value)}
            error={opnameError || undefined}
          />
          <Input
            id="opname-avail"
            label="Stok tersedia baru"
            type="number"
            inputMode="numeric"
            hint="Kosongkan = samakan dengan total"
            placeholder={opnameTotal}
            value={opnameAvail}
            onChange={(e) => setOpnameAvail(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
