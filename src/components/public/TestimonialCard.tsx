import Image from 'next/image';
import { Quote, Star } from 'lucide-react';
import type { Testimonial } from '@/lib/types';

/** Kartu tanggapan pembaca: slip balasan diketik di kartu, rating stempel. */
export default function TestimonialCard({ item }: { item: Testimonial }) {
  const initial = (item.name.trim().charAt(0) || 'P').toUpperCase();

  return (
    <figure className="kartu flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)]">
      <figcaption className="kartu-kop flex items-center gap-3 bg-brand px-5 py-3">
        {item.avatar_url ? (
          <Image
            src={item.avatar_url}
            alt={`Foto ${item.name}`}
            width={96}
            height={96}
            sizes="96px"
            loading="lazy"
            className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--surface)]/40"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)] font-heading text-sm font-bold text-brand"
          >
            {initial}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--surface)]">
            {item.name}
          </span>
          {item.role ? (
            <span className="entri block truncate text-xs uppercase tracking-[0.08em] text-[var(--surface)]">
              {item.role}
            </span>
          ) : null}
        </span>
        <Quote className="ml-auto h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      </figcaption>

      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <blockquote className="flex-1 text-sm leading-relaxed text-[var(--ink)]">
          “{item.content}”
        </blockquote>
        <div
          className="flex items-center gap-0.5"
          role="img"
          aria-label={`Rating ${item.rating} dari 5`}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${i < item.rating ? 'fill-accent text-accent' : 'text-[var(--ink)]/25'}`}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
