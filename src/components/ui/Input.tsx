import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Input teks aksesibel: label selalu tampil, hint + pesan error terhubung via aria. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, required, className = "", ...rest },
  ref
) {
  const inputId = id ?? `input-${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-semibold text-slate-700"
      >
        {label}
        {required && (
          <span className="ml-1 text-rose-600" aria-hidden="true">
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
        className={`h-11 w-full rounded-md border bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
          error
            ? "border-rose-400 focus-visible:ring-rose-500"
            : "border-slate-200 hover:border-slate-300 focus:border-brand"
        } ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
