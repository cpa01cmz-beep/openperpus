'use client';

import { useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import StatCard from '@/components/admin/StatCard';
import Pagination from '@/components/ui/Pagination';
import { useAdminList } from '@/hooks/useAdminList';
import { checkoutReservation } from '@/lib/reservation-checkout';
import { PER_PAGE } from '@/lib/pagination';
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

export default function ReservasiPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState<string | null>(null);
  // 404 dari aksi (bukan dari pemuatan daftar).
  const [payMissing, setPayMissing] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  // #62: satu hook daftar — termasuk memisahkan 404 (API belum tersedia).
  const list = useAdminList<Reservation>({
    path: '/api/reservations',
    params: { page: String(page), per_page: PER_PAGE, ...(status ? { status } : {}) },
    noStore: true,
  });
  const { rows, loading, missing: apiMissing, totalPages, error, reload: load } = list;

  async function onCheckout(r: Reservation) {
    // #73: checkout atomik 1-klik — POST /api/reservations/{id}/checkout
    // (RPC checkout_reservation_tx): loan + completed dalam satu transaksi.
    // Gagal => rollback penuh; message server persis ditampilkan.
    if (!confirm(`Pinjamkan buku "${r.books?.title ?? '-'}" ke ${r.members?.member_code ?? '-'}?`))
      return;
    setActingId(r.id);
    try {
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
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  async function onUpdate(id: string, next: 'ready' | 'cancelled') {
    const label = next === 'ready' ? 'setujui (siap diambil)' : 'batalkan';
    if (!confirm(`Yakin ${label} reservasi ini?`)) return;
    setActingId(id);
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setPayMissing(true);
        return alert('API /api/reservations belum tersedia di backend.');
      }
      if (!res.ok) return alert(errMsg(json));
      load();
    } finally {
      setActingId(null);
    }
  }

  async function onSweep() {
    // S-roi6 1-klik: PUT expired per kandidat via reservation-sweep.ts.
    // 422 per-baris diskip + failure count; 403/offline → zero sukses + alert.
    if (expired.length === 0) return;
    if (!confirm(`Tandai ${expired.length} reservasi kedaluwarsa sebagai expired?`)) return;
    setSweeping(true);
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
        { candidates: expired.map((r) => ({ id: r.id })) }
      );
      if (out.failed > 0) {
        alert(
          `${out.succeeded} ditandai kedaluwarsa, ${out.failed} gagal: ${out.errors
            .map((e) => `${e.id}: ${e.message}`)
            .join('; ')}`
        );
      }
      load();
    } catch (e) {
      alert((e as Error).message);
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

      {(apiMissing || payMissing) && (
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
            onClick={onSweep}
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

      <div className="flex flex-wrap items-end gap-2 text-sm">
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
        <button
          type="button"
          onClick={load}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Muat ulang
        </button>
      </div>

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
            { key: 'status', header: 'Status' },
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
          emptyText="Belum ada reservasi."
        />
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
