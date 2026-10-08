import * as React from 'react';

type Tone = 'emerald' | 'amber' | 'rose' | 'slate' | 'sky';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Tinta stempel per tema — pasangan kontras diuji tests/theme-contrast. */
const toneClass: Record<Tone, string> = {
  emerald: 'text-brand',
  amber: 'bg-accent-soft text-accent',
  rose: 'bg-accent text-surface',
  // slate: tanpa warna sendiri — tinta default .stempel (var(--accent)); caller
  // boleh menimpa warna tanpa konflik utility. ponytail: upgrade path = token --stamp-netral.
  slate: '',
  sky: 'text-heading',
};

/** Lencana status kecil: stempel karet (kotak bergaris, kapital), bukan pill. */
export default function Badge({ tone = 'slate', className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`stempel ${toneClass[tone]} ${className}`} {...rest}>
      {children}
    </span>
  );
}
