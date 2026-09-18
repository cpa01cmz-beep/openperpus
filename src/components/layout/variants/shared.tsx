import Image from 'next/image';
import { BookOpenText, Facebook, Instagram, MessageCircle, Music2, Youtube } from 'lucide-react';

/** Single source of truth for primary nav — menu behavior stays identical across variants. */
export const LINKS = [
  { href: '/', label: 'Beranda' },
  { href: '/katalog', label: 'Katalog' },
  { href: '/berita', label: 'Berita' },
  { href: '/tentang', label: 'Tentang' },
  { href: '/layanan', label: 'Layanan' },
  { href: '/faq', label: 'FAQ' },
  { href: '/kontak', label: 'Kontak' },
];

/** Quick links reused by every footer variant. */
export const FOOTER_LINKS = [
  { href: '/katalog', label: 'Katalog Buku' },
  { href: '/berita', label: 'Berita & Artikel' },
  { href: '/tentang', label: 'Tentang Kami' },
  { href: '/layanan', label: 'Layanan' },
  { href: '/faq', label: 'FAQ' },
  { href: '/kontak', label: 'Kontak' },
];

export const SOCIAL_ICON: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music2,
  whatsapp: MessageCircle,
};

export function hourLabel(h: Record<string, string | undefined>) {
  const hari = h.hari ?? h.day ?? '-';
  const buka = h.buka ?? h.open ?? '';
  const tutup = h.tutup ?? h.close ?? '';
  return { hari, jam: buka && tutup ? `${buka} – ${tutup}` : buka || tutup || '—' };
}

/** Shared brand mark — logo image when set, BookOpen icon fallback. Server-safe. */
export function LogoMark({
  siteName,
  logoSrc,
  size = 'md',
}: {
  siteName: string;
  logoSrc?: string | null;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-[var(--radius-sm)]' : 'h-9 w-9 rounded-[var(--radius-md)]';
  if (logoSrc) {
    return (
      <Image
        src={logoSrc}
        alt={`Logo ${siteName}`}
        width={64}
        height={64}
        sizes="64px"
        unoptimized
        className={`${box} object-cover shadow`}
        loading="eager"
      />
    );
  }
  return (
    <span
      className={`grid ${box} place-items-center bg-brand text-accent shadow`}
      aria-hidden="true"
    >
      <BookOpenText className="h-5 w-5" />
    </span>
  );
}
