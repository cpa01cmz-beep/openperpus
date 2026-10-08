'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import StatCard from '@/components/admin/StatCard';
import Pagination from '@/components/ui/Pagination';
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
        <h1 className="kartu-kop pb-3 font-heading text-2xl font-bold text-heading">Reservasi</h1>
        <p className="text-sm text-ink/70">
          Setujui reservasi menjadi siap diambil, selesaikan bila buku dipinjam, atau batalkan.
        </p>
      </div>

      {apiMissing && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          API <code className="font-data">/api/reservations</code> belum tersedia di backend (404).
          Daftar &amp; aksi approve/batal menunggu worker backend. Sudah dilaporkan ke mandor.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-3 text-sm text-accent"
        >
          {error}
        </div>
      )}

      {expired.length > 0 && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
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
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-lg)] bg-accent px-3 font-semibold text-surface transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
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
          <label htmlFor="filter-status" className="text-sm font-semibold text-ink">
            Filter status
          </label>
          <select
            id="filter-status"
            className="h-11 min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-surface px-3 text-sm text-ink transition hover:border-rule-strong focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-sm)] border border-rule bg-surface px-3 font-semibold text-ink transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Muat ulang
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink/70" aria-live="polite">
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
                  <strong className="entri">{r.members?.member_code ?? '-'}</strong>
                  <br />
                  <span className="text-ink/70">{r.books?.title ?? '-'}</span>
                </span>
              ),
            },
            {
              key: 'reserved_at',
              header: 'Reservasi',
              render: (r) => (
                <span className="entri whitespace-nowrap">
                  {new Date(r.reserved_at).toLocaleDateString('id-ID')}
                  <br />
                  <span className="text-xs text-ink/70">
                    {r.expires_at
                      ? `kadaluarsa ${new Date(r.expires_at).toLocaleDateString('id-ID')}`
                      : 'tanpa kadaluarsa'}
                  </span>
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <span
                  className="stempel"
                  data-state={
                    r.status === 'completed' || r.status === 'cancelled' ? 'dipinjam' : undefined
                  }
                >
                  {r.status}
                </span>
              ),
            },
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
                        className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-surface transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {actingId === r.id ? '…' : 'Setujui'}
                      </button>
                    )}
                    {r.status === 'ready' && (
                      <>
                        <button
                          type="button"
                          disabled={actingId === r.id}
                          onClick={() => onCheckout(r)}
                          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-surface transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actingId === r.id ? '…' : 'Pinjamkan'}
                        </button>
                        <button
                          type="button"
                          disabled={actingId === r.id}
                          onClick={() => onUpdate(r.id, 'completed')}
                          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-surface transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actingId === r.id ? '…' : 'Selesaikan'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={actingId === r.id}
                      onClick={() => onUpdate(r.id, 'cancelled')}
                      className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule bg-surface px-3 text-xs font-semibold text-accent transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-ink/70">-</span>
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
