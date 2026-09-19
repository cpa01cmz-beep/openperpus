'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import StatCard from '@/components/admin/StatCard';
import { checkoutReservation } from '@/lib/reservation-checkout';
import { findExpiredCandidates, sweepExpiredReservations } from '@/lib/reservation-sweep';

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

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function ReservasiPage() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [apiMissing, setApiMissing] = useState(false);
  const [error, setError] = useState('');
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        per_page: '20',
        ...(status ? { status } : {}),
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
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCheckout(r: Reservation) {
    // US-02 1-klik: POST /api/loans dulu, HANYA jika 201 lanjut PUT completed.
    // Jika POST gagal: message server persis via alert + reservasi tak tersentuh.
    // Kompensasi: tanpa rollback loan bila PUT gagal (lihat reservation-checkout.ts).
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
        { reservationId: r.id, memberId: r.member_id, bookId: r.book_id }
      );
      if (out.skipped) return;
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  async function onUpdate(id: string, next: 'ready' | 'completed' | 'cancelled') {
    const label =
      next === 'ready'
        ? 'setujui (siap diambil)'
        : next === 'completed'
          ? 'selesaikan'
          : 'batalkan';
    if (!confirm(`Yakin ${label} reservasi ini?`)) return;
    setActingId(id);
    try {
      const res = await fetch(`/api/reservations?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setApiMissing(true);
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
            onClick={onSweep}
            disabled={sweeping}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-white disabled:opacity-50"
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

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="filter-status">Filter:</label>
        <select
          id="filter-status"
          className="rounded-lg border px-3 py-1.5"
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
        <button onClick={load} className="rounded-lg border px-3 py-1.5">
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
                        disabled={actingId === r.id}
                        onClick={() => onUpdate(r.id, 'ready')}
                        className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {actingId === r.id ? '…' : 'Setujui'}
                      </button>
                    )}
                    {r.status === 'ready' && (
                      <>
                        <button
                          disabled={actingId === r.id}
                          onClick={() => onCheckout(r)}
                          className="rounded bg-blue-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          {actingId === r.id ? '…' : 'Pinjamkan'}
                        </button>
                        <button
                          disabled={actingId === r.id}
                          onClick={() => onUpdate(r.id, 'completed')}
                          className="rounded bg-green-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          {actingId === r.id ? '…' : 'Selesaikan'}
                        </button>
                      </>
                    )}
                    <button
                      disabled={actingId === r.id}
                      onClick={() => onUpdate(r.id, 'cancelled')}
                      className="rounded border px-2 py-1 text-xs text-red-600 disabled:opacity-50"
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
