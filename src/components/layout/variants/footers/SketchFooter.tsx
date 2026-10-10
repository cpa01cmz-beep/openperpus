import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import type { NavItem } from '@/lib/types';
import { getSocials } from '@/lib/settings';
import { FOOTER_LINKS, SOCIAL_ICON, hourLabel } from '../shared';

/**
 * SketchFooter — margin-note footer for sketch-margin.
 * Ruled-paper band, doodle dividers, hand-lettered headings.
 * Same content sources, same var tokens.
 */
export default function SketchFooter({ settings, menus }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';
  const socials = getSocials(settings);
  const hours = Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
  const socialEntries = Object.entries(socials).filter(([, v]) => !!v?.trim?.());
  const footerLinks: NavItem[] = menus && menus.length > 0 ? menus : FOOTER_LINKS;

  return (
    <footer
      role="contentinfo"
      className="mt-12 rotate-[0.3deg] rounded-[var(--radius-lg)] border-2 border-[var(--ink)] bg-brand-strong text-brand-soft shadow-[var(--shadow-lg)]"
    >
      {/* doodle divider */}
      <div aria-hidden="true" className="overflow-hidden px-6 pt-4">
        <svg viewBox="0 0 600 14" className="h-3.5 w-full text-accent" fill="none">
          <path
            d="M4 9 C 80 4, 140 12, 220 7 S 380 3, 460 8 S 560 10, 596 6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="10 8"
          />
        </svg>
      </div>
      {/* band 1: identity */}
      <div className="border-b-2 border-dashed border-[var(--surface)]/20">
        <div className="mx-auto flex w-full max-w-[var(--container)] flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-center gap-2">
            {settings.logo_url ? (
              <Image
                src={settings.logo_url}
                alt={`Logo ${name}`}
                width={36}
                height={36}
                sizes="36px"
                className="-rotate-2 rounded-[var(--radius-md)] border-2 border-[var(--surface)]/40 object-cover"
                loading="lazy"
              />
            ) : (
              <span
                className="grid h-9 w-9 -rotate-3 place-items-center rounded-[var(--radius-md)] border-2 border-[var(--surface)]/40 bg-accent text-brand-strong"
                aria-hidden="true"
              >
                <BookOpenText className="h-5 w-5" />
              </span>
            )}
            <span>
              <span className="block font-heading text-2xl font-bold text-[var(--surface)]">
                {name}
              </span>
              {settings.tagline ? (
                <span className="block font-heading text-lg text-brand-soft/80">
                  ~ {settings.tagline} ~
                </span>
              ) : null}
            </span>
          </p>
          {socialEntries.length > 0 && (
            <ul className="flex gap-2" aria-label="Media sosial">
              {socialEntries.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key.toLowerCase()] ?? MessageCircle;
                return (
                  <li key={key} className="odd:-rotate-3 even:rotate-3">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${name} di ${key}`}
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border-2 border-[var(--surface)]/30 bg-[var(--surface)]/10 transition hover:rotate-3 hover:bg-accent hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* band 2: info columns */}
      <div className="mx-auto grid w-full max-w-[var(--container)] gap-8 px-4 py-8 sm:px-6 md:grid-cols-3 lg:px-8">
        <div className="-rotate-[0.4deg] rounded-[var(--radius-md)] border-2 border-dashed border-[var(--surface)]/25 p-4">
          <h2 className="font-heading text-2xl font-bold text-accent">* Alamat *</h2>
          {settings.address ? (
            <p className="mt-3 flex gap-2 text-sm text-brand-soft/80">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{settings.address}</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-brand-soft/70">Alamat menyusul.</p>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {settings.phone && (
              <li>
                <a
                  href={`tel:${settings.phone}`}
                  className="flex items-center gap-2 rounded transition hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Phone className="h-4 w-4 text-accent" aria-hidden="true" /> {settings.phone}
                </a>
              </li>
            )}
            {settings.email && (
              <li>
                <a
                  href={`mailto:${settings.email}`}
                  className="flex items-center gap-2 rounded transition hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Mail className="h-4 w-4 text-accent" aria-hidden="true" /> {settings.email}
                </a>
              </li>
            )}
          </ul>
        </div>
        <div className="rotate-[0.4deg] rounded-[var(--radius-md)] border-2 border-dashed border-[var(--surface)]/25 p-4">
          <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-accent">
            <Clock className="h-4 w-4" aria-hidden="true" /> Jam Operasional
          </h2>
          {hours.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {hours.map((h, i) => {
                const { hari, jam } = hourLabel(h as Record<string, string | undefined>);
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--surface)]/20 bg-[var(--surface)]/5 px-3 py-2"
                  >
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
        <nav aria-label="Tautan cepat" className="-rotate-[0.3deg]">
          <h2 className="font-heading text-2xl font-bold text-accent">Jelajah -&gt;</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {footerLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  target={l.target === '_blank' ? '_blank' : undefined}
                  rel={l.target === '_blank' ? 'noreferrer noopener' : undefined}
                  className="rounded underline decoration-dotted underline-offset-4 transition hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* band 3: bottom bar */}
      <div className="border-t-2 border-dashed border-[var(--surface)]/20">
        <p className="mx-auto w-full max-w-[var(--container)] px-4 py-4 text-center font-heading text-lg text-brand-soft/70 sm:px-6 lg:px-8">
          (c) {new Date().getFullYear()} {name} — dicoret dengan pensil &amp; cinta.
        </p>
      </div>
    </footer>
  );
}
