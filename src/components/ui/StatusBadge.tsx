import Badge, { type Tone } from './Badge';
import { ARTICLE_STATUS, FINE_STATUS, LOAN_STATUS, MEMBER_STATUS, RESERVATION_STATUS } from '@/lib/enums';

// Issue #79: satu sumber enum — STATUS_MAP dibangun dari src/lib/enums.ts
// (value EN + label ID), bukan salinan label mentah di sini.
const TONE_MAP: Record<string, Tone> = {
  borrowed: 'sky',
  overdue: 'rose',
  returned: 'emerald',
  lost: 'rose',
  pending: 'amber',
  ready: 'sky',
  completed: 'emerald',
  cancelled: 'slate',
  expired: 'rose',
  unpaid: 'rose',
  partial: 'amber',
  paid: 'emerald',
  waived: 'slate',
  active: 'emerald',
  suspended: 'amber',
  draft: 'slate',
  published: 'emerald',
  archived: 'slate',
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = Object.fromEntries(
  [...LOAN_STATUS, ...RESERVATION_STATUS, ...FINE_STATUS, ...MEMBER_STATUS, ...ARTICLE_STATUS].map(
    (e) => [e.value, { label: e.label, tone: TONE_MAP[e.value] ?? 'slate' }]
  )
);

/** Label Indonesia untuk enum status DB (fallback: nilai mentah apa adanya). */
export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

/** Tone Badge untuk enum status DB (fallback: slate netral). */
export function statusTone(status: string): Tone {
  return STATUS_MAP[status]?.tone ?? 'slate';
}

/** Badge status bilingual-safe: enum DB -> label Indonesia + tone konsisten. */
export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}
