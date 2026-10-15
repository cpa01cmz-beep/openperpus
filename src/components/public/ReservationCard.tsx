'use client';

import { useState } from 'react';
import { BookmarkX, CalendarClock, Loader2 } from 'lucide-react';
import type { MyLoan, MyReservation } from '@/lib/reservations-client';
import { statusLabel } from '@/components/ui/StatusBadge';
import { formatTanggalRingkas } from '@/lib/format';

// Label status dari satu sumber enum (src/lib/enums.ts via StatusBadge) —
// tidak ada kamus lokal kedua (issue #79).
function fmtDate(iso: string | null | undefined): string {
  const out = formatTanggalRingkas(iso);
  return out === '-' ? '—' : out;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'cancelled' || status === 'expired' || status === 'overdue'
      ? 'bg-accent-soft text-accent'
      : status === 'ready' || status === 'borrowed'
        ? 'bg-brand-soft text-brand-strong'
        : 'bg-surface text-ink/70 border border-[var(--ink)]/10';
  return (
    <span
      data-testid="reservation-status"
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}
    >
      {statusLabel(status)}
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
      className="rounded-[var(--radius-lg)] border bg-surface p-card shadow-[var(--shadow-sm)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="reservation-title" className="font-semibold">
            {title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-bold text-surface shadow-[var(--shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border px-4 py-2 text-sm font-semibold text-ink/70 disabled:opacity-60"
              >
                Urungkan
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-md)] border bg-accent-soft px-4 py-2 text-sm font-bold text-accent transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
      className="rounded-[var(--radius-lg)] border bg-surface p-card shadow-[var(--shadow-sm)]"
    >
      <p data-testid="loan-title" className="font-semibold">
        {title}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
        <StatusBadge status={row.status} />
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Jatuh tempo: {fmtDate(row.due_at)}
        </span>
      </p>
    </li>
  );
}
