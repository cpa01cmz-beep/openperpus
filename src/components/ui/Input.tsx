import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Input teks aksesibel: label selalu tampil, hint + pesan error terhubung via aria. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, required, className = '', ...rest },
  ref
) {
  const inputId = id ?? `input-${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-11 w-full rounded-[var(--radius-sm)] border bg-[var(--surface)] px-4 text-sm text-ink placeholder:opacity-60 transition focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? 'border-accent' : 'border-[var(--rule-strong)]'
        } ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
