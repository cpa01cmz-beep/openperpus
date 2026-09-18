"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MENU = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/buku", label: "Buku" },
  { href: "/admin/kategori", label: "Kategori" },
  { href: "/admin/rak", label: "Rak" },
  { href: "/admin/anggota", label: "Anggota" },
  { href: "/admin/peminjaman", label: "Peminjaman" },
  { href: "/admin/reservasi", label: "Reservasi" },
  { href: "/admin/denda", label: "Denda" },
  { href: "/admin/artikel", label: "Artikel" },
  { href: "/admin/banner", label: "Banner" },
  { href: "/admin/konten", label: "Konten" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/logs", label: "Log Aktivitas" },
  { href: "/admin/pengaturan", label: "Pengaturan" },
];

export default function Sidebar({ libraryName = "Perpustakaan" }: { libraryName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      <p className="px-2 pb-2 text-sm font-semibold uppercase tracking-wide opacity-70">{libraryName}</p>
      {MENU.map((m) => {
        const active = pathname === m.href || (m.href !== "/admin" && pathname.startsWith(m.href));
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={() => setOpen(false)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {m.label}
          </Link>
        );
      })}
      <Link href="/" className="mt-4 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
        ← Lihat Situs
      </Link>
    </nav>
  );

  return (
    <>
      {/* Topbar mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <span className="font-semibold">{libraryName} · Admin</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border px-3 py-1.5 text-sm"
          aria-label="Toggle menu"
        >
          {open ? "Tutup" : "Menu"}
        </button>
      </div>
      {/* Desktop */}
      <aside className="hidden min-h-screen w-60 shrink-0 border-r bg-white lg:block">{nav}</aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
