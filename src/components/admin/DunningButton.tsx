'use client';

import { useState } from 'react';
import { buildCopyPayload, buildDunningMessage } from '@/lib/wa-dunning';

type Props = {
  loanId: string;
  memberCode: string;
  title: string;
  dueAt: string;
  fine: number;
  disabled?: boolean;
};

export default function DunningButton({ loanId, memberCode, title, dueAt, fine, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const lateDays = Math.max(0, Math.ceil((Date.now() - new Date(dueAt).getTime()) / 86400000));
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
        className={`inline-flex min-h-[44px] items-center rounded px-3 text-xs font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${disabled ? 'pointer-events-none bg-slate-300' : 'bg-emerald-700 hover:bg-emerald-800'}`}
      >
        Tagih WA
      </a>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          void onCopy();
        }}
        className="inline-flex min-h-[44px] items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
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
