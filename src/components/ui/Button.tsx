import * as React from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "amber" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand active:bg-brand-strong disabled:bg-slate-200",
  amber:
    "bg-accent text-brand-strong shadow-sm hover:bg-accent active:bg-accent disabled:bg-slate-200",
  outline:
    "border border-brand/30 bg-white text-brand hover:border-brand hover:bg-brand-soft disabled:border-slate-200",
  ghost: "bg-transparent text-brand hover:bg-brand-soft disabled:text-slate-400",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-200",
};

const sizeClass: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-5 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

/** Tombol generik emerald+amber: primary/amber/outline/ghost/danger + state loading. */
export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-400 ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
