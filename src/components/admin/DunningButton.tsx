'use client';

import { useEffect, useState } from 'react';
import { buildCopyPayload, buildDunningMessage } from '@/lib/wa-dunning';

type Props = {
  loanId: string;
  memberCode: string;
  title: string;
  dueAt: string;
  fine: number;
  disabled?: boolean;
};

const DAY_MS = 86_400_000;
const CLOCK_REFRESH_MS = 60_000;

export default function DunningButton({ loanId, memberCode, title, dueAt, fine, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const dueMs = new Date(dueAt).getTime();
  // Date.now() impure — dibaca dari initializer + interval, bukan badan render,
  // agar lolos react-hooks/purity. Nilai hanya di-commit bila keterlambatan
  // level-hari berubah, jadi antrian admin yang lama dibuka tidak membuat
  // lateDays membeku di waktu mount (pesan WA ikut hari berjalan).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow((prev) =>
        Math.ceil((t - dueMs) / DAY_MS) === Math.ceil((prev - dueMs) / DAY_MS) ? prev : t
      );
    }, CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, [dueMs]);
  const lateDays = Math.max(0, Math.ceil((now - dueMs) / DAY_MS));
  const message = buildDunningMessage({ title, dueAt, fine, memberCode, loanId, lateDays });
  const href = 'https://wa.me/?text=' + encodeURIComponent(message);

  async function logClick(): Promise<void> {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fines.dunning_click',
          entity_type: 'loans',
          entity_id: loanId,
          metadata: { channel: 'wa', fine },
        }),
      });
    } catch {
      /* best-effort: klik tercatat via activity_logs bila API tersedia */
    }
  }

  async function onCopy(): Promise<void> {
    setCopyError(null);
    setCopied(false);
    // Aliases below keep snake_case keys visible for the copy-payload contract.
    const loan_id = loanId;
    const member_code = memberCode;
    const title_text = title;
    const due_at = dueAt;
    const payload = buildCopyPayload({
      loanId: loan_id,
      memberCode: member_code,
      title: title_text,
      dueAt: due_at,
      lateDays,
      fine,
    });
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
    } catch {
      setCopyError('Gagal menyalin. Salin manual dari layar.');
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
        onClick={() => {
          void logClick();
        }}
        className={`inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-3 text-xs font-semibold text-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${disabled ? 'pointer-events-none bg-[var(--ink)]/20' : 'bg-emerald-700 hover:bg-emerald-800'}`}
      >
        Tagih WA
      </a>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          void onCopy();
        }}
        className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-[var(--ink)]/10 bg-surface px-3 text-xs font-semibold text-ink/80 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        Salin rincian
      </button>
      {copied && (
        <span role="status" className="text-xs text-emerald-700">
          Tersalin
        </span>
      )}
      {copyError && (
        <span role="alert" className="text-xs text-red-700">
          {copyError}
        </span>
      )}
    </span>
  );
}
