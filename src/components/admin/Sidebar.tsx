'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

const MENU = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/buku', label: 'Buku' },
  { href: '/admin/kategori', label: 'Kategori' },
  { href: '/admin/rak', label: 'Rak' },
  { href: '/admin/anggota', label: 'Anggota' },
  { href: '/admin/peminjaman', label: 'Peminjaman' },
  { href: '/admin/reservasi', label: 'Reservasi' },
  { href: '/admin/denda', label: 'Denda' },
  { href: '/admin/artikel', label: 'Artikel' },
  { href: '/admin/banner', label: 'Banner' },
  { href: '/admin/konten', label: 'Konten' },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/logs', label: 'Log Aktivitas' },
  { href: '/admin/pengaturan', label: 'Pengaturan' },
];

export default function Sidebar({ libraryName = 'Perpustakaan' }: { libraryName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Tab laci: daftar indeks laci kartu katalog — tab aktif = aria-current="page".
  const nav = (
    <nav aria-label="Menu admin" className="batang flex flex-col gap-1 p-4">
      <p className="entri px-3 pb-3 text-xs uppercase tracking-[0.04em] text-ink/70">
        {libraryName}
      </p>
      {MENU.map((m) => {
        const active = pathname === m.href || (m.href !== '/admin' && pathname.startsWith(m.href));
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className="tab-laci min-h-[44px] w-full justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {m.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="mt-4 flex min-h-[44px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--rule)] px-3 text-sm text-ink/70 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Lihat Situs
      </Link>
    </nav>
  );

  return (
    <>
      {/* Topbar mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--surface)] px-4 py-3 lg:hidden">
        <span className="font-heading font-bold text-heading">{libraryName} · Admin</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--rule)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="admin-mobile-nav"
        >
          {open ? 'Tutup' : 'Menu'}
        </button>
      </div>
      {/* Desktop */}
      <aside className="hidden min-h-screen w-60 shrink-0 border-r border-[var(--rule)] bg-[var(--surface)] lg:block">
        {nav}
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            className="absolute inset-0 bg-ink/50"
            onClick={() => setOpen(false)}
          />
          <aside
            id="admin-mobile-nav"
            className="absolute left-0 top-0 h-full w-64 border-r border-[var(--rule)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
          >
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
