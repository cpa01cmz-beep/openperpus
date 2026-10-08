import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import { FOOTER_LINKS, SOCIAL_ICON, hourLabel } from '../shared';

/**
 * StackedFooter — pita gelap bertumpuk: kop identitas, lalu tiga kolom baris
 * entri bertik di atas batang rod, lalu baris kolofon. Midnight / brutalist / ocean.
 */
export default function StackedFooter({ settings }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';
  const socials = settings.socials ?? {};
  const hours = Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
  const socialEntries = Object.entries(socials).filter(([, v]) => !!v?.trim?.());

  return (
    <footer role="contentinfo" className="mt-12 bg-brand-strong text-[var(--surface)]">
      {/* band 1: kop identitas */}
      <div className="border-b border-[var(--surface)]/10">
        <div className="mx-auto flex w-full max-w-[var(--container)] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2.5">
              {settings.logo_url ? (
                <Image
                  src={settings.logo_url}
                  alt={`Logo ${name}`}
                  width={36}
                  height={36}
                  sizes="36px"
                  className="h-9 w-9 rounded-[var(--radius-md)] object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-[var(--surface)]"
                  aria-hidden="true"
                >
                  <BookOpenText className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block line-clamp-2 font-heading text-lg font-bold text-[var(--surface)]">
                  {name}
                </span>
                {settings.tagline ? (
                  <span className="entri block truncate text-xs uppercase tracking-[0.04em] text-[var(--surface)]/70">
                    {settings.tagline}
                  </span>
                ) : null}
              </span>
            </p>
            {settings.address ? (
              <p className="entri mt-3 flex items-start gap-2 text-sm text-[var(--surface)]/80">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />
                <span>{settings.address}</span>
              </p>
            ) : null}
          </div>

          {socialEntries.length > 0 ? (
            <ul className="flex shrink-0 gap-2" aria-label="Media sosial">
              {socialEntries.map(([key, url]) => {
                const Icon = SOCIAL_ICON[key.toLowerCase()] ?? MessageCircle;
                return (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${name} di ${key}`}
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] bg-[var(--surface)]/10 text-[var(--surface)] transition hover:bg-accent hover:text-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>

      {/* band 2: baris entri di atas batang rod */}
      <div className="mx-auto grid w-full max-w-[var(--container)] gap-8 px-4 py-8 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <h2 className="entri text-xs uppercase tracking-[0.04em] text-accent-soft">Alamat</h2>
          <ul className="batang mt-3">
            <li className="flex py-1 pl-6">
              <span className="entri flex min-h-[44px] flex-1 items-center gap-2 text-sm text-[var(--surface)]/80">
                {settings.address ? (
                  <>
                    <MapPin className="h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />
                    <span>{settings.address}</span>
                  </>
                ) : (
                  'Alamat menyusul.'
                )}
              </span>
            </li>
            {settings.phone ? (
              <li className="flex py-1 pl-6">
                <a
                  href={`tel:${settings.phone}`}
                  className="entri flex min-h-[44px] flex-1 items-center gap-2 text-sm text-[var(--surface)] transition hover:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Phone className="h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />{' '}
                  {settings.phone}
                </a>
              </li>
            ) : null}
            {settings.email ? (
              <li className="flex py-1 pl-6">
                <a
                  href={`mailto:${settings.email}`}
                  className="entri flex min-h-[44px] flex-1 items-center gap-2 text-sm text-[var(--surface)] transition hover:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Mail className="h-4 w-4 shrink-0 text-accent-soft" aria-hidden="true" />{' '}
                  {settings.email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <h2 className="entri flex items-center gap-2 text-xs uppercase tracking-[0.04em] text-accent-soft">
            <Clock className="h-4 w-4" aria-hidden="true" /> Jam Operasional
          </h2>
          {hours.length > 0 ? (
            <ul className="batang mt-3">
              {hours.map((h, i) => {
                const { hari, jam } = hourLabel(h as Record<string, string | undefined>);
                return (
                  <li key={i} className="flex py-1 pl-6">
                    <span className="entri flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)]/5 px-3 py-2 text-sm">
                      <span className="text-[var(--surface)]/80">{hari}</span>
                      <span className="font-semibold text-[var(--surface)]">{jam}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="entri mt-3 flex min-h-[44px] items-center pl-6 text-sm text-[var(--surface)]/70">
              Jadwal layanan menyusul.
            </p>
          )}
        </div>

        <nav aria-label="Tautan cepat">
          <h2 className="entri text-xs uppercase tracking-[0.04em] text-accent-soft">Jelajah</h2>
          <ul className="batang mt-3">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href} className="flex py-0.5 pl-6">
                <Link
                  href={l.href}
                  className="entri flex min-h-[44px] flex-1 items-center text-sm text-[var(--surface)] transition hover:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* band 3: baris kolofon */}
      <div className="border-t border-[var(--surface)]/10">
        <p className="entri mx-auto w-full max-w-[var(--container)] px-4 py-4 text-center text-xs text-[var(--surface)]/70 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} {name}. Seluruh konten dinamis dari sistem perpustakaan.
        </p>
      </div>
    </footer>
  );
}
