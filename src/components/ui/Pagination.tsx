import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Opsional: untuk navigasi server (Link href). Bila diisi, render <a>. */
  hrefForPage?: (page: number) => string;
  /** Opsional: untuk interaksi client-side. */
  onPageChange?: (page: number) => void;
  className?: string;
}

function pageItems(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, page - 1, page, page + 1, total - 1, total]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

/** Pagination aksesibel: nav + aria-current, dukung href server atau callback client. */
export default function Pagination({
  page,
  totalPages,
  hrefForPage,
  onPageChange,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;
  const safe = Math.min(Math.max(1, page), totalPages);
  const items = pageItems(safe, totalPages);

  const baseBtn =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const idle = "border border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand";
  const active = "bg-brand text-white shadow-sm";
  const disabled = "cursor-not-allowed opacity-40";

  const renderControl = (
    target: number,
    label: string,
    icon: React.ReactNode,
    isDisabled: boolean,
    rel?: string
  ) => {
    const cls = `${baseBtn} ${isDisabled ? disabled : idle}`;
    if (hrefForPage) {
      const href = hrefForPage(target);
      return isDisabled ? (
        <span aria-disabled="true" className={cls}>
          <span className="sr-only">{label}</span>
          {icon}
        </span>
      ) : (
        <a href={href} rel={rel} aria-label={label} className={cls}>
          {icon}
        </a>
      );
    }
    return (
      <button
        type="button"
        aria-label={label}
        disabled={isDisabled}
        onClick={() => onPageChange?.(target)}
        className={cls}
      >
        {icon}
      </button>
    );
  };

  return (
    <nav aria-label="Navigasi halaman" className={`flex items-center justify-center gap-1.5 ${className}`}>
      {renderControl(
        safe - 1,
        "Halaman sebelumnya",
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />,
        safe <= 1,
        "prev"
      )}
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-slate-400">
            …
          </span>
        ) : hrefForPage ? (
          <a
            key={it}
            href={hrefForPage(it)}
            aria-label={`Halaman ${it}`}
            aria-current={it === safe ? "page" : undefined}
            className={`${baseBtn} ${it === safe ? active : idle}`}
          >
            {it}
          </a>
        ) : (
          <button
            key={it}
            type="button"
            aria-label={`Halaman ${it}`}
            aria-current={it === safe ? "page" : undefined}
            disabled={it === safe}
            onClick={() => onPageChange?.(it)}
            className={`${baseBtn} ${it === safe ? active : `${idle} disabled:opacity-100`}`}
          >
            {it}
          </button>
        )
      )}
      {renderControl(
        safe + 1,
        "Halaman berikutnya",
        <ChevronRight className="h-4 w-4" aria-hidden="true" />,
        safe >= totalPages,
        "next"
      )}
    </nav>
  );
}
