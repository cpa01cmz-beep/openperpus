'use client';

import type { Category } from '@/lib/types';

type Props = {
  categories: Pick<Category, 'id' | 'name' | 'slug'>[];
  activeId: string | null;
  onChange: (id: string | null) => void;
};

/** Tab pembatas kategori — scroll horizontal di mobile, wrap di desktop. */
export default function CategoryChips({ categories, activeId, onChange }: Props) {
  const chipClass = (active: boolean) =>
    `tab-laci shrink-0 min-h-[44px] rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active
        ? 'border-brand bg-brand text-surface shadow-[var(--shadow-sm)]'
        : 'border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] hover:bg-brand-soft hover:text-brand'
    }`;

  return (
    <div
      role="group"
      aria-label="Filter kategori"
      className="-mx-4 flex gap-0 overflow-x-auto border-b border-[var(--ink)] px-4 pb-0 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={activeId === null}
        className={chipClass(activeId === null)}
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
            className={chipClass(active)}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
