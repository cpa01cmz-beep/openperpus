import { ALL_STATUS, type EnumEntry } from '@/lib/enums';
import Badge, { type Tone } from './Badge';

/**
 * Label + tone status berasal dari SATU sumber enum (src/lib/enums.ts,
 * issue #79) — tidak ada kamus lokal yang bisa melenceng.
 */
const STATUS_MAP: Record<string, EnumEntry> = Object.fromEntries(
  ALL_STATUS.map((e) => [e.value, e])
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
