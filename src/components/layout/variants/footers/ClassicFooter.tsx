import Image from 'next/image';
import Link from 'next/link';
import { BookOpenText, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { FooterVariantProps } from '../types';
import { FOOTER_LINKS, SOCIAL_ICON, hourLabel } from '../shared';

/**
 * ClassicFooter — kolofon kartu: `.kartu` + kop bergaris kembar, alamat/jam/
 * tautan sebagai baris `.entri` bertik di atas batang rod. Emerald default.
 */
export default function ClassicFooter({ settings }: FooterVariantProps) {
  const name = settings.name ?? 'Perpustakaan Digital';
  const socials = settings.socials ?? {};
  const hours = Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
  const socialEntries = Object.entries(socials).filter(([, v]) => !!v?.trim?.());

  return (
    <footer role="contentinfo" className="mt-12 px-4 sm:px-6 lg:px-8">
      <div className="kartu mx-auto w-full max-w-[var(--container)] rounded-[var(--radius-lg)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-lg)]">
        {/* kop kartu: identitas + alamat + media sosial */}
        <div className="kartu-kop flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2.5">
              {settings.logo_url ? (
                <Image
                  src={settings.logo_url}
                  alt={`Logo ${name}`}
                  width={36}
                  height={36}
                  sizes="36px"
                  className="h-9 w-9 rounded-[var(--radius-md)] object-cover shadow-[var(--shadow-md)]"
                  loading="lazy"
                />
              ) : (
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-accent"
                  aria-hidden="true"
                >
                  <BookOpenText className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block line-clamp-2 font-heading text-lg font-bold text-heading">
                  {name}
                </span>
                {settings.tagline ? (
                  <span className="entri block truncate text-xs uppercase tracking-[0.04em] text-[var(--ink)]/70">
                    {settings.tagline}
                  </span>
                ) : null}
              </span>
            </p>
            {settings.address ? (
              <p className="entri mt-3 flex items-start gap-2 text-sm text-[var(--ink)]/80">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
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
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[var(--radius-md)] border border-rule text-[var(--ink)] transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/* baris entri: kontak / jam / jelajah di atas batang rod */}
        <div className="grid gap-8 px-5 py-6 sm:grid-cols-2 lg:grid-cols-3">
          <nav aria-label="Kontak">
            <h2 className="entri text-xs uppercase tracking-[0.04em] text-accent">Hubungi Kami</h2>
            <ul className="batang mt-3">
              {settings.phone ? (
                <li className="flex py-1 pl-6">
                  <a
                    href={`tel:${settings.phone}`}
                    className="entri flex min-h-[44px] flex-1 items-center gap-2 text-sm text-[var(--ink)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />{' '}
                    {settings.phone}
                  </a>
                </li>
              ) : null}
              {settings.email ? (
                <li className="flex py-1 pl-6">
                  <a
                    href={`mailto:${settings.email}`}
                    className="entri flex min-h-[44px] flex-1 items-center gap-2 text-sm text-[var(--ink)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />{' '}
                    {settings.email}
                  </a>
                </li>
              ) : null}
              {!settings.phone && !settings.email ? (
                <li className="flex min-h-[44px] items-center pl-6 text-sm text-[var(--ink)]/70">
                  Kontak belum diisi admin.
                </li>
              ) : null}
            </ul>
          </nav>

          <div>
            <h2 className="entri flex items-center gap-2 text-xs uppercase tracking-[0.04em] text-accent">
              <Clock className="h-4 w-4" aria-hidden="true" /> Jam Operasional
            </h2>
            {hours.length > 0 ? (
              <ul className="batang mt-3">
                {hours.map((h, i) => {
                  const { hari, jam } = hourLabel(h as Record<string, string | undefined>);
                  return (
                    <li key={i} className="flex py-1 pl-6">
                      <span className="entri flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-brand-soft px-3 py-2 text-sm">
                        <span>{hari}</span>
                        <span className="font-semibold">{jam}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="entri mt-3 flex min-h-[44px] items-center pl-6 text-sm text-[var(--ink)]/70">
                Jadwal layanan menyusul.
              </p>
            )}
          </div>

          <nav aria-label="Tautan cepat">
            <h2 className="entri text-xs uppercase tracking-[0.04em] text-accent">Jelajah</h2>
            <ul className="batang mt-3">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href} className="flex py-0.5 pl-6">
                  <Link
                    href={l.href}
                    className="entri flex min-h-[44px] flex-1 items-center text-sm text-[var(--ink)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-rule px-5 py-4">
          <p className="entri text-center text-xs text-[var(--ink)]/60">
            © {new Date().getFullYear()} {name}. Seluruh konten dinamis dari sistem perpustakaan.
          </p>
        </div>
      </div>
    </footer>
  );
}
