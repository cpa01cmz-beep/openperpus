import Badge, { type Tone } from './Badge';

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Sirkulasi (loans)
  borrowed: { label: 'Dipinjam', tone: 'sky' },
  overdue: { label: 'Terlambat', tone: 'rose' },
  returned: { label: 'Dikembalikan', tone: 'emerald' },
  lost: { label: 'Hilang', tone: 'rose' },
  // Reservasi
  pending: { label: 'Menunggu', tone: 'amber' },
  ready: { label: 'Siap diambil', tone: 'sky' },
  completed: { label: 'Selesai', tone: 'emerald' },
  cancelled: { label: 'Dibatalkan', tone: 'slate' },
  expired: { label: 'Kedaluwarsa', tone: 'rose' },
  // Denda
  unpaid: { label: 'Belum lunas', tone: 'rose' },
  partial: { label: 'Sebagian', tone: 'amber' },
  paid: { label: 'Lunas', tone: 'emerald' },
  waived: { label: 'Dibebaskan', tone: 'slate' },
  // Anggota
  active: { label: 'Aktif', tone: 'emerald' },
  suspended: { label: 'Ditangguhkan', tone: 'amber' },
  // Artikel
  draft: { label: 'Draf', tone: 'slate' },
  published: { label: 'Terbit', tone: 'emerald' },
  archived: { label: 'Arsip', tone: 'slate' },
};

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
