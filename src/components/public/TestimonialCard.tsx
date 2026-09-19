import Image from 'next/image';
import { Quote, Star } from 'lucide-react';
import type { Testimonial } from '@/lib/books';

/** Kartu testimoni: avatar inisial bila tanpa foto, rating bintang aksesibel. */
export default function TestimonialCard({ item }: { item: Testimonial }) {
  const initial = (item.name.trim().charAt(0) || 'P').toUpperCase();

  return (
    <figure className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] p-5 shadow-sm">
      <Quote className="h-6 w-6 text-accent" aria-hidden="true" />
      <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[var(--ink)]/80">
        “{item.content}”
      </blockquote>
      <div
        className="mt-3 flex items-center gap-0.5"
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
      <figcaption className="mt-3 flex items-center gap-3 border-t border-[var(--ink)]/10 pt-3">
        {item.avatar_url ? (
          <Image
            src={item.avatar_url}
            alt={`Foto ${item.name}`}
            width={96}
            height={96}
            sizes="96px"
            loading="lazy"
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-full bg-brand font-heading text-base font-bold text-accent"
          >
            {initial}
          </span>
        )}
        <span>
          <span className="block text-sm font-semibold text-[var(--ink)]">{item.name}</span>
          {item.role ? (
            <span className="block text-xs text-[var(--ink)]/60">{item.role}</span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
