import * as React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'amber' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand text-surface shadow-[var(--shadow-sm)] hover:bg-brand-strong active:bg-brand-strong',
  amber: 'border border-accent bg-accent-soft text-ink hover:bg-accent hover:text-surface',
  outline:
    'border border-[var(--rule)] bg-[var(--surface)] text-brand hover:border-brand hover:bg-brand-soft',
  ghost: 'bg-transparent text-brand hover:bg-brand-soft',
  danger: 'bg-accent text-surface shadow-[var(--shadow-sm)] hover:opacity-90',
};

const sizeClass: Record<Size, string> = {
  sm: 'min-h-[44px] gap-1.5 px-3 py-2 text-sm',
  md: 'min-h-[44px] gap-2 px-5 py-2.5 text-sm',
  lg: 'min-h-[48px] gap-2 px-6 py-3 text-base',
};

/** Tombol generik: primary/amber/outline/ghost/danger + state loading. */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-[var(--radius-sm)] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
