import * as React from 'react';
import { BookOpen } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** State kosong generik: ikon + judul + deskripsi + aksi opsional. Tidak pernah blank. */
export default function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`kartu lubang flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center sm:py-16 ${className}`}
    >
      <span className="grid h-14 w-14 place-items-center rounded-[var(--radius-md)] bg-brand text-surface shadow-sm">
        {icon ?? <BookOpen className="h-7 w-7" aria-hidden="true" />}
      </span>
      <h3 className="font-heading text-lg font-bold text-heading">{title}</h3>
      {description && <p className="max-w-md text-sm leading-relaxed text-ink/70">{description}</p>}
      {action && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
