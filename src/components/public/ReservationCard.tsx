'use client';

import { useState } from 'react';
import { BookmarkX, CalendarClock, Loader2 } from 'lucide-react';
import type { MyLoan, MyReservation } from '@/lib/reservations-client';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  ready: 'Siap diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
  borrowed: 'Dipinjam',
  overdue: 'Terlambat',
  returned: 'Dikembalikan',
  lost: 'Hilang',
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'cancelled' || status === 'expired' || status === 'overdue'
      ? 'bg-rose-100 text-rose-800'
      : status === 'ready' || status === 'borrowed'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span
      data-testid="reservation-status"
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type ReservationCardProps = {
  row: MyReservation;
  cancelling: boolean;
  onCancel: (id: string) => void;
};

/** Kartu reservasi milik sendiri + tombol Batal 1-klik (pending saja). */
export function ReservationCard({ row, cancelling, onCancel }: ReservationCardProps) {
  const title = row.books?.title ?? 'Judul tidak tersedia';
  const [confirming, setConfirming] = useState(false);
  const cancellable = row.status === 'pending';

  return (
    <li data-testid="reservation-row" className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="reservation-title" className="font-semibold">
            {title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge status={row.status} />
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Kedaluwarsa: {fmtDate(row.expires_at)}
            </span>
          </p>
        </div>
        {cancellable &&
          (confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => {
                  setConfirming(false);
                  onCancel(row.id);
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:opacity-60"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Membatalkan…
                  </>
                ) : (
                  'Ya, batalkan'
                )}
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setConfirming(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Urungkan
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            >
              <BookmarkX className="h-4 w-4" aria-hidden="true" /> Batal
            </button>
          ))}
      </div>
    </li>
  );
}

type LoanCardProps = { row: MyLoan };

/** Kartu pinjaman aktif milik sendiri (read-only, due_at). */
export function LoanCard({ row }: LoanCardProps) {
  const title = row.books?.title ?? 'Judul tidak tersedia';
  return (
    <li data-testid="loan-row" className="rounded-xl border bg-white p-4 shadow-sm">
      <p data-testid="loan-title" className="font-semibold">
        {title}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <StatusBadge status={row.status} />
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Jatuh tempo: {fmtDate(row.due_at)}
        </span>
      </p>
    </li>
  );
}
