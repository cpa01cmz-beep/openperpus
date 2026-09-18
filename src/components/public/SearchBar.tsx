"use client";

import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
};

/** SearchBar aksesibel dengan tombol reset + loading visual via disabled opsional. */
export default function SearchBar({ value, onChange, placeholder, id = "cari-buku" }: Props) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Cari buku
      </label>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink)]/40"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Cari judul, penulis, penerbit, ISBN…"}
        autoComplete="off"
        className="w-full rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] py-3 pl-10 pr-10 text-sm text-[var(--ink)] shadow-sm transition placeholder:text-[var(--ink)]/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Hapus pencarian"
          className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--ink)]/40 transition hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
