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

/** Status reservasi = stempel, bukan pil: jadi dicap accent, batal/jatuh tempo redup. */
function StatusBadge({ status }: { status: string }) {
  const dim =
    status === 'cancelled' || status === 'expired' || status === 'overdue' || status === 'lost';
  return (
    <span
      data-testid="reservation-status"
      className="stempel"
      data-state={dim ? 'tidak-tersedia' : undefined}
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
    <li
      data-testid="reservation-row"
      className="kartu rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            data-testid="reservation-title"
            className="font-heading font-semibold text-[var(--ink)]"
          >
            {title}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--ink)]/70">
            <StatusBadge status={row.status} />
            <span className="entri inline-flex items-center gap-1">
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-bold text-[var(--surface)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-brand-soft disabled:opacity-60"
              >
                Urungkan
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-accent px-4 py-2 text-sm font-bold text-accent transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
    <li
      data-testid="loan-row"
      className="kartu rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] p-4"
    >
      <p data-testid="loan-title" className="font-heading font-semibold text-[var(--ink)]">
        {title}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--ink)]/70">
        <StatusBadge status={row.status} />
        <span className="entri inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Jatuh tempo: {fmtDate(row.due_at)}
        </span>
      </p>
    </li>
  );
}
