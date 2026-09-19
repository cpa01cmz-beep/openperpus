import * as React from 'react';

type Tone = 'emerald' | 'amber' | 'rose' | 'slate' | 'sky';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClass: Record<Tone, string> = {
  emerald: 'border-brand-soft bg-brand-soft text-brand',
  amber: 'border-amber-200 bg-amber-100 text-amber-800',
  rose: 'border-rose-200 bg-rose-100 text-rose-800',
  slate: 'border-slate-200 bg-slate-100 text-slate-700',
  sky: 'border-sky-200 bg-sky-100 text-sky-800',
};

/** Lencana status kecil: stok, kategori, status — border + tone konsisten. */
export default function Badge({ tone = 'slate', className = '', children, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${toneClass[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
