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
};

/** Nav link with aria-current="page" on the active route — client island. */
export default function NavLink({ href, label, className, activeClassName = '' }: Props) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && (pathname ?? '').startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={active ? `${className} ${activeClassName}`.trim() : className}
    >
      {label}
    </Link>
  );
}
