import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import { FOOTER_LINKS, SOCIAL_ICON, hourLabel } from '../shared';

/**
 * ClassicFooter — emerald default. 4-column grid: identity, contact,
 * hours, quick links. 1:1 preserve of the original Footer markup.
 */
export default function ClassicFooter({ settings }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';
  const socials = settings.socials ?? {};
  const hours = Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
  const socialEntries = Object.entries(socials).filter(([, v]) => !!v?.trim?.());

  return (
    <footer className="mt-12 rounded-[var(--radius-lg)] bg-brand-strong text-brand-soft shadow-[var(--shadow-lg)] ring-1 ring-[var(--ink)]/10">
      <div className="mx-auto grid w-full max-w-[var(--container)] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {/* identitas */}
        <div>
          <p className="flex items-center gap-2">
            {settings.logo_url ? (
              <Image src={settings.logo_url} alt={`Logo ${name}`} width={36} height={36} sizes="36px" unoptimized className="h-9 w-9 rounded-[var(--radius-md)] object-cover shadow-[var(--shadow-md)]" loading="lazy" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-md)]" aria-hidden="true">
                <BookOpenText className="h-5 w-5" />
              </span>
            )}
            <span className="font-heading text-lg font-bold text-[var(--surface)]">{name}</span>
          </p>
          {settings.tagline ? <p className="mt-2 text-sm text-brand-soft/80">{settings.tagline}</p> : null}
          {settings.address ? (
            <p className="mt-3 flex gap-2 text-sm text-brand-soft/80">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{settings.address}</span>
            </p>
          ) : null}
        </div>

        {/* kontak */}
        <nav aria-label="Kontak">
          <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Hubungi Kami</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {settings.phone && (
              <li>
                <a href={`tel:${settings.phone}`} className="flex items-center gap-2 rounded-[var(--radius-sm)] transition hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Phone className="h-4 w-4 text-accent" aria-hidden="true" /> {settings.phone}
                </a>
              </li>
            )}
            {settings.email && (
              <li>
                <a href={`mailto:${settings.email}`} className="flex items-center gap-2 rounded-[var(--radius-sm)] transition hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Mail className="h-4 w-4 text-accent" aria-hidden="true" /> {settings.email}
                </a>
              </li>
            )}
            {!settings.phone && !settings.email && (
              <li className="text-brand-soft/70">Kontak belum diisi admin.</li>
            )}
          </ul>
          {socialEntries.length > 0 && (
            <ul className="mt-4 flex gap-2" aria-label="Media sosial">
              {socialEntries.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key.toLowerCase()] ?? MessageCircle;
                return (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${name} di ${key}`}
                      className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)]/10 shadow-[var(--shadow-sm)] transition hover:bg-accent hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* jam operasional */}
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-accent">
            <Clock className="h-4 w-4" aria-hidden="true" /> Jam Operasional
          </h2>
          {hours.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {hours.map((h, i) => {
                const { hari, jam } = hourLabel(h as Record<string, string | undefined>);
                return (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)]/5 px-3 py-2 shadow-[var(--shadow-sm)]">
                    <span className="text-brand-soft/90">{hari}</span>
                    <span className="font-semibold text-[var(--surface)]">{jam}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-brand-soft/70">Jadwal layanan menyusul.</p>
          )}
        </div>

        {/* tautan */}
        <nav aria-label="Tautan cepat">
          <h2 className="text-sm font-bold uppercase tracking-wider text-accent">Jelajah</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="rounded-[var(--radius-sm)] transition hover:text-[var(--surface)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-[var(--surface)]/10">
        <p className="mx-auto w-full max-w-[var(--container)] px-4 py-4 text-center text-xs text-brand-soft/70 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} {name}. Seluruh konten dinamis dari sistem perpustakaan.
        </p>
      </div>
    </footer>
  );
}
