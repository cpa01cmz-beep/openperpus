'use client';

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
};

/** SearchBar aksesibel dengan tombol reset + loading visual via disabled opsional.
 *  300ms debounce + useDeferredValue, aria-busy during search, clear on Escape. */
export default function SearchBar({ value, onChange, placeholder, id = 'cari-buku' }: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const deferredValue = useDeferredValue(localValue);

  // Sync local value with prop value (when controlled externally)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange callback
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);

      // Clear existing debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Set searching state
      setIsSearching(true);

      // Debounce the onChange callback
      debounceRef.current = setTimeout(() => {
        onChange(newValue);
        setIsSearching(false);
      }, 300);
    },
    [onChange]
  );

  // Clear on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLocalValue('');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onChange('');
        setIsSearching(false);
      }
    },
    [onChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative" aria-busy={isSearching}>
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
        value={deferredValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Cari judul, penulis, penerbit, ISBN…'}
        autoComplete="off"
        className="min-h-[44px] w-full rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] py-3 pl-10 pr-12 text-sm text-[var(--ink)] shadow-sm transition placeholder:text-[var(--ink)]/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        aria-busy={isSearching}
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            setLocalValue('');
            if (debounceRef.current) clearTimeout(debounceRef.current);
            onChange('');
            setIsSearching(false);
          }}
          aria-label="Hapus pencarian"
          className="absolute right-1 top-1/2 grid min-h-[44px] min-w-[44px] -translate-y-1/2 place-items-center rounded-full text-[var(--ink)]/40 transition hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
