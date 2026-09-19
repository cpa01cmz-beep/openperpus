'use client';

import type { Category } from '@/lib/types';

type Props = {
  categories: Pick<Category, 'id' | 'name' | 'slug'>[];
  activeId: string | null;
  onChange: (id: string | null) => void;
};

/** Chips kategori — scroll horizontal di mobile, wrap di desktop. */
export default function CategoryChips({ categories, activeId, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter kategori"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={activeId === null}
        className={`shrink-0 min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          activeId === null
            ? 'border-brand bg-brand text-white shadow'
            : 'border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand'
        }`}
      >
        Semua
      </button>
      {categories.map((c) => {
        const active = activeId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(active ? null : c.id)}
            aria-pressed={active}
            className={`shrink-0 min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              active
                ? 'border-brand bg-brand text-white shadow'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand'
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
