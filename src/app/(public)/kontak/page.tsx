import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Phone,
  Youtube,
} from "lucide-react";
import { fetchBookBySlug, fetchPage, fetchSettings } from "@/lib/books";
import { sanitizeIlike } from "@/lib/search";

export const revalidate = 60;

export async function generateMetadata() {
  const s = await fetchSettings();
  return {
    title: `Kontak — ${s.name ?? "Perpustakaan"}`,
    description: s.address
      ? `Hubungi ${s.name ?? "perpustakaan"}: ${s.address}`
      : `Alamat, telepon, jam operasional, dan media sosial ${s.name ?? "perpustakaan"}.`,
  };
}

function hourLabel(h: Record<string, string | undefined>) {
  const hari = h.hari ?? h.day ?? "-";
  const buka = h.buka ?? h.open ?? "";
  const tutup = h.tutup ?? h.close ?? "";
  return { hari, jam: buka && tutup ? `${buka} – ${tutup}` : buka || tutup || "—" };
}

const SOCIAL_ICON: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music2,
  whatsapp: MessageCircle,
};

/** Kontak: alamat/telepon/jam/sosmed 100% dari library_settings + pages (slug 'kontak'). */
export default async function KontakPage({
  searchParams,
}: {
  searchParams?: { buku?: string | string[] };
}) {
  const rawBuku = Array.isArray(searchParams?.buku)
    ? searchParams.buku[0]
    : searchParams?.buku;
  const buku = rawBuku ? sanitizeIlike(rawBuku) : "";
  const [settings, page, book] = await Promise.all([
    fetchSettings(),
    fetchPage("kontak"),
    buku ? fetchBookBySlug(buku) : Promise.resolve(null),
  ]);
  const siteName = settings.name ?? "Perpustakaan Digital";

  const hours = Array.isArray(settings.operational_hours)
    ? settings.operational_hours
    : [];
  const socialEntries = Object.entries(settings.socials ?? {}).filter(([, v]) =>
    Boolean(v?.trim?.())
  );
  const hasContact = Boolean(settings.address || settings.phone || settings.email);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Hubungi kami
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Kontak {siteName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
          {page?.excerpt ??
            "Alamat, telepon, jam layanan, dan kanal resmi kami — kunjungi atau hubungi langsung."}
        </p>
      </header>

      {buku &&
        (book ? (
          <section
            aria-label="Konteks reservasi"
            role="status"
            className="rounded-lg border border-brand/20 bg-brand-soft/40 p-5 shadow-sm sm:p-6"
          >
            <h2 className="font-heading text-lg font-bold text-heading">
              Reservasi: {book.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Sebutkan judul ini saat menghubungi petugas sirkulasi.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href={`/katalog/${book.slug}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Lihat buku <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        ) : (
          <section
            aria-label="Konteks reservasi"
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6"
          >
            <h2 className="font-heading text-lg font-bold text-heading">
              Buku tidak ditemukan
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Judul yang Anda maksud tidak tersedia. Jelajahi katalog untuk
              memilih buku lain.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/katalog"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Jelajahi katalog{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        ))}

      {page?.content_md && (
        <section
          aria-label="Informasi kontak tambahan"
          className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
            {page.content_md}
          </p>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* alamat & kontak */}
        <section
          aria-labelledby="kontak-info"
          className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="kontak-info" className="font-heading text-xl font-bold text-heading">
            Alamat & Kontak
          </h2>
          {hasContact ? (
            <ul className="mt-4 space-y-3 text-sm sm:text-base">
              {settings.address && (
                <li className="flex items-start gap-2.5 text-slate-600">
                  <MapPin
                    className="mt-0.5 h-5 w-5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{settings.address}</span>
                </li>
              )}
              {settings.phone && (
                <li>
                  <a
                    href={`tel:${settings.phone}`}
                    className="inline-flex items-center gap-2.5 rounded-xl font-semibold text-slate-700 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Phone
                      className="h-5 w-5 shrink-0 text-brand"
                      aria-hidden="true"
                    />
                    {settings.phone}
                  </a>
                </li>
              )}
              {settings.email && (
                <li>
                  <a
                    href={`mailto:${settings.email}`}
                    className="inline-flex items-center gap-2.5 rounded-xl font-semibold text-slate-700 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Mail
                      className="h-5 w-5 shrink-0 text-brand"
                      aria-hidden="true"
                    />
                    {settings.email}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Informasi kontak belum diisi admin. Silakan kembali lagi nanti.
            </p>
          )}

          {socialEntries.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Media sosial
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {socialEntries.map(([key, url]) => {
                  const Icon = SOCIAL_ICON[key.toLowerCase()] ?? MessageCircle;
                  return (
                    <li key={key}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${siteName} di ${key}`}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium capitalize text-slate-700 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                        {key}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* jam operasional */}
        <section
          aria-labelledby="kontak-jam"
          className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2
            id="kontak-jam"
            className="flex items-center gap-2 font-heading text-xl font-bold text-heading"
          >
            <Clock className="h-5 w-5 text-brand" aria-hidden="true" />
            Jam Operasional
          </h2>
          {hours.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {hours.map((h, i) => {
                const { hari, jam } = hourLabel(
                  h as Record<string, string | undefined>
                );
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm sm:text-base"
                  >
                    <span className="font-medium text-slate-600">{hari}</span>
                    <span className="font-bold text-brand-strong">{jam}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Jadwal layanan menyusul — akan tampil otomatis setelah diisi admin.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Layanan tutup pada hari libur nasional kecuali diumumkan lain melalui
            pengumuman di beranda.
          </p>
        </section>
      </div>

      <section
        aria-labelledby="kontak-cta"
        className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8"
      >
        <h2 id="kontak-cta" className="font-heading text-xl font-bold">
          Sebelum berkunjung
        </h2>
        <p className="mt-2 text-sm text-brand-soft/90 sm:text-base">
          Cek ketersediaan koleksi di katalog atau baca jawaban atas pertanyaan umum.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/katalog"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Jelajahi katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/faq"
            className="inline-flex items-center rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Lihat FAQ
          </Link>
        </div>
      </section>
    </div>
  );
}
