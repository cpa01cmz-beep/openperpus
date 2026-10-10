'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import StatCard from '@/components/admin/StatCard';
import ConfirmModal from '@/components/admin/ConfirmModal';
import FilterBar from '@/components/admin/FilterBar';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import { checkoutReservation } from '@/lib/reservation-checkout';
import { findExpiredCandidates, sweepExpiredReservations } from '@/lib/reservation-sweep';
import { errMsg } from '@/lib/admin-errors';

type Reservation = {
  id: string;
  status: string;
  book_id: string;
  member_id: string;
  reserved_at: string;
  expires_at: string | null;
  notes: string | null;
  members: { member_code: string } | null;
  books: { title: string } | null;
};

const STATUS_OPTS = ['', 'pending', 'ready', 'completed', 'cancelled', 'expired'];

const NEXT_ACTION_LABEL: Record<'ready' | 'cancelled', string> = {
  ready: 'Setujui (siap diambil)',
  cancelled: 'Batalkan',
};

export default function ReservasiPage() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [apiMissing, setApiMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sweeping, setSweeping] = useState(false);
  // Pengganti window.confirm: dialog konfirmasi per aksi.
  const [pendingCheckout, setPendingCheckout] = useState<Reservation | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    row: Reservation;
    next: 'ready' | 'cancelled';
  } | null>(null);
  const [pendingSweep, setPendingSweep] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        per_page: '20',
        ...(status ? { status } : {}),
        ...(search ? { q: search } : {}),
      });
      const res = await fetch(`/api/reservations?${q}`, { cache: 'no-store' });
      if (res.status === 404) {
        setApiMissing(true);
        setRows([]);
        return;
      }
      const json = (await res.json()) as {
        data?: Reservation[];
        pagination?: { totalPages?: number };
        meta?: { totalPages?: number };
      };
      if (!res.ok) throw new Error(errMsg(json));
      setApiMissing(false);
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function onCheckout(r: Reservation) {
    setPendingCheckout(r);
  }

  function onUpdate(id: string, next: 'ready' | 'cancelled') {
    const row = rows.find((x) => x.id === id);
    if (row) setPendingUpdate({ row, next });
  }

  async function runCheckout() {
    const r = pendingCheckout;
    if (!r) return;
    setPendingCheckout(null);
    // #92: checkout atomik 1-klik — POST /api/reservations/{id}/checkout
    // (RPC checkout_reservation_tx): loan + completed dalam satu transaksi.
    // Gagal => rollback penuh; message server persis ditampilkan inline.
    setActingId(r.id);
    setNotice('');
    setError('');
    try {
      // #92: checkout atomik 1-klik — POST /api/reservations/{id}/checkout
      // (RPC checkout_reservation_tx): loan + completed dalam satu transaksi.
      // Gagal => rollback penuh; message server persis ditampilkan inline.
      const out = await checkoutReservation(
        {
          fetchLike: (url, init) =>
            fetch(url, { ...(init ?? {}), cache: 'no-store' }) as unknown as Promise<{
              ok: boolean;
              status: number;
              json: () => Promise<unknown>;
            }>,
        },
        { reservationId: r.id }
      );
      if (out.skipped) return;
      setNotice(`Reservasi ${r.members?.member_code ?? '-'} selesai — buku dipinjamkan.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  async function runUpdate() {
    const pending = pendingUpdate;
    if (!pending) return;
    setPendingUpdate(null);
    const { row, next } = pending;
    setActingId(row.id);
    setNotice('');
    setError('');
    try {
      const res = await fetch(`/api/reservations/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setApiMissing(true);
        setError('API /api/reservations belum tersedia di backend.');
        return;
      }
      if (!res.ok) {
        setError(errMsg(json));
        return;
      }
      setNotice(`Reservasi diperbarui: ${NEXT_ACTION_LABEL[next]}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  async function confirmSweep() {
    // S-roi6 1-klik: PUT expired per kandidat via reservation-sweep.ts.
    // 422 per-baris diskip + failure count; 403/offline -> zero sukses + inline error.
    setPendingSweep(false);
    const candidates = findExpiredCandidates(rows);
    if (candidates.length === 0) return;
    setSweeping(true);
    setNotice('');
    setError('');
    try {
      const out = await sweepExpiredReservations(
        {
          fetchLike: (url, init) =>
            fetch(url, { ...(init ?? {}), cache: 'no-store' }) as unknown as Promise<{
              ok: boolean;
              status: number;
              json: () => Promise<unknown>;
            }>,
          isStaff: true,
        },
        { candidates: candidates.map((r) => ({ id: r.id })) }
      );
      if (out.failed > 0) {
        setError(
          `${out.succeeded} ditandai kedaluwarsa, ${out.failed} gagal: ${out.errors
            .map((e) => `${e.id}: ${e.message}`)
            .join('; ')}`
        );
      } else {
        setNotice(`${out.succeeded} reservasi ditandai kedaluwarsa.`);
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSweeping(false);
    }
  }

  const pending = rows.filter((r) => r.status === 'pending').length;
  const ready = rows.filter((r) => r.status === 'ready').length;
  const expired = findExpiredCandidates(rows);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Reservasi</h1>
        <p className="text-sm text-slate-500">
          Setujui reservasi menjadi siap diambil, selesaikan bila buku dipinjam, atau batalkan.
        </p>
      </div>

      {apiMissing && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          API <code className="font-mono">/api/reservations</code> belum tersedia di backend (404).
          Daftar &amp; aksi approve/batal menunggu worker backend. Sudah dilaporkan ke mandor.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {expired.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p className="font-semibold">Kedaluwarsa {expired.length} baris</p>
          <ul className="mt-1 list-disc pl-5">
            {expired.map((r) => (
              <li key={r.id}>
                {r.members?.member_code ?? '-'} · {r.books?.title ?? '-'} ·{' '}
                {r.expires_at ? new Date(r.expires_at).toLocaleDateString('id-ID') : '-'}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPendingSweep(true)}
            disabled={sweeping}
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-amber-600 px-3 font-semibold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sweeping ? 'Menandai…' : 'Tandai kedaluwarsa'}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Menunggu" value={pending} hint="Status pending (halaman ini)" />
        <StatCard label="Siap diambil" value={ready} hint="Status ready (halaman ini)" />
        <StatCard
          label="Total baris"
          value={rows.length}
          hint={`Halaman ${page} / ${totalPages}`}
        />
      </div>

      <FilterBar
        search={{
          id: 'reservasi-search',
          label: 'Cari reservasi',
          placeholder: 'Cari kode anggota / judul buku…',
          value: search,
          onChange: (v) => {
            setPage(1);
            setSearch(v);
          },
        }}
        onReload={load}
      >
        <div className="grid gap-1">
          <label htmlFor="filter-status" className="text-sm font-semibold text-slate-700">
            Filter status
          </label>
          <select
            id="filter-status"
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'Semua' : s}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <DataTable<Reservation>
          columns={[
            {
              key: 'info',
              header: 'Anggota / Buku',
              render: (r) => (
                <span>
                  <strong>{r.members?.member_code ?? '-'}</strong>
                  <br />
                  <span className="text-slate-500">{r.books?.title ?? '-'}</span>
                </span>
              ),
            },
            {
              key: 'reserved_at',
              header: 'Reservasi',
              render: (r) => (
                <span>
                  {new Date(r.reserved_at).toLocaleDateString('id-ID')}
                  <br />
                  <span className="text-xs text-slate-500">
                    {r.expires_at
                      ? `kadaluarsa ${new Date(r.expires_at).toLocaleDateString('id-ID')}`
                      : 'tanpa kadaluarsa'}
                  </span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'aksi',
              header: 'Aksi',
              render: (r) =>
                r.status === 'pending' || r.status === 'ready' ? (
                  <span className="flex flex-wrap gap-2">
                    {r.status === 'pending' && (
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => onUpdate(r.id, 'ready')}
                        className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingId === r.id ? '…' : 'Setujui'}
                      </button>
                    )}
                    {r.status === 'ready' && (
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => onCheckout(r)}
                        className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingId === r.id ? '…' : 'Pinjamkan'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actingId === r.id}
                      onClick={() => onUpdate(r.id, 'cancelled')}
                      className="inline-flex min-h-[44px] items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                ),
            },
          ]}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyState={{
            title: 'Belum ada reservasi',
            description: search
              ? `Tidak ada reservasi yang cocok dengan "${search}". Coba kata kunci lain.`
              : 'Reservasi anggota akan muncul di sini untuk disetujui atau diselesaikan.',
          }}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmModal
        open={pendingCheckout !== null}
        onClose={() => setPendingCheckout(null)}
        onConfirm={() => void runCheckout()}
        title="Pinjamkan buku"
        description="Loan dibuat dulu; reservasi ditandai selesai hanya jika loan berhasil."
        confirmLabel="Ya, pinjamkan"
      >
        <p>
          Pinjamkan buku <strong>{pendingCheckout?.books?.title ?? '-'}</strong> ke{' '}
          <strong>{pendingCheckout?.members?.member_code ?? '-'}</strong>? Stok berkurang 1 dan
          tempo otomatis 14 hari.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pendingUpdate !== null}
        onClose={() => setPendingUpdate(null)}
        onConfirm={() => void runUpdate()}
        title={pendingUpdate ? NEXT_ACTION_LABEL[pendingUpdate.next] : 'Perbarui reservasi'}
        confirmLabel="Ya, lanjutkan"
      >
        <p>
          Yakin{' '}
          {pendingUpdate ? NEXT_ACTION_LABEL[pendingUpdate.next].toLowerCase() : 'memperbarui'}{' '}
          reservasi <strong>{pendingUpdate?.row.members?.member_code ?? '-'}</strong> (
          {pendingUpdate?.row.books?.title ?? '-'})?
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pendingSweep}
        onClose={() => setPendingSweep(false)}
        onConfirm={() => void confirmSweep()}
        title="Tandai kedaluwarsa"
        description={`${expired.length} reservasi akan ditandai expired.`}
        confirmLabel="Ya, tandai"
        loading={sweeping}
      >
        <p>Tandai {expired.length} reservasi kedaluwarsa sebagai expired?</p>
      </ConfirmModal>
    </div>
  );
}
