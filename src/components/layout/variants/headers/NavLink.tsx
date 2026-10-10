'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  href: string;
  label: string;
  className: string;
  /** Extra classes when this link matches the current path. */
  activeClassName?: string;
  /** Render as block (mobile panel). Passed through for styling parity. */
  block?: boolean;
  /** Target dari CMS (menus.target). Hanya '_blank' yang diteruskan ke <a>. */
  target?: '_self' | '_blank';
};

/** Nav link with aria-current="page" on the active route — client island. */
export default function NavLink({ href, label, className, activeClassName = '', target }: Props) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && (pathname ?? '').startsWith(`${href}/`));
  const isBlank = target === '_blank';
  return (
    <Link
      href={href}
      target={isBlank ? '_blank' : undefined}
      rel={isBlank ? 'noopener' : undefined}
      aria-current={active ? 'page' : undefined}
      className={active ? `${className} ${activeClassName}`.trim() : className}
    >
      {label}
    </Link>
  );
}
