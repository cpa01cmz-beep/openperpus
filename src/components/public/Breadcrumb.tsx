import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type Crumb = { label: string; href?: string };

/** Breadcrumb publik — baris entri laci, server-safe, aria-current di item terakhir. */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="entri flex flex-wrap items-center gap-1 text-xs uppercase tracking-[0.08em] text-[var(--ink)]/60">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              {last || !c.href ? (
                <span aria-current="page" className="font-semibold text-[var(--ink)]">
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-1 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
