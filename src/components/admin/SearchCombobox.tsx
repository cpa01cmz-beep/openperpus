'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { sanitizeIlike } from '@/lib/search';

export type SearchKind = 'members' | 'books';
export type SearchOption = { id: string; label: string; sub?: string; stock?: number };

export const EMPTY_TEXT = 'Tidak ditemukan — coba kata kunci lain.';
export const DEBOUNCE_MS = 300;

type MemberRow = { id: string; member_code: string; profiles?: { full_name?: string } | null };
type BookRow = { id: string; title: string; stock_available?: number | null };

function mapRows(kind: SearchKind, rows: unknown): SearchOption[] {
  const list = (Array.isArray(rows) ? rows : []) as (MemberRow | BookRow)[];
  if (kind === 'members') {
    return (list as MemberRow[]).map((x) => ({
      id: x.id,
      label: x.profiles?.full_name ?? x.member_code,
      sub: x.member_code,
    }));
  }
  return (list as BookRow[]).map((x) => ({
    id: x.id,
    label: x.title,
    stock: x.stock_available ?? undefined,
  }));
}

/** Fetch sekali server-side search. q kosong -> tanpa fetch, []. Wildcard disanitasi agar server 200 via sanitizeIlike. */
export async function fetchSearchOptions(
  kind: SearchKind,
  q: string,
  init?: RequestInit
): Promise<SearchOption[]> {
  const clean = sanitizeIlike(q);
  if (!clean) return [];
  const params = new URLSearchParams({ q: clean, per_page: '10' });
  const res = await fetch(
    kind === 'members' ? `/api/members?${params}` : `/api/books?${params}`,
    init
  );
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: unknown };
  return mapRows(kind, json.data);
}

/** Sesi pencarian: stale-guard — hanya hasil terakhir yang dipakai, sisanya null. */
export function createSearchSession() {
  let seq = 0;
  async function search(
    kind: SearchKind,
    q: string,
    init?: RequestInit
  ): Promise<SearchOption[] | null> {
    const my = ++seq;
    const rows = await fetchSearchOptions(kind, q, init);
    return my === seq ? rows : null;
  }
  return { search };
}

export default function SearchCombobox({
  kind,
  label,
  placeholder,
  value,
  initialOptions = [],
  disabledOption,
  onPick,
}: {
  kind: SearchKind;
  label: string;
  placeholder: string;
  value: string;
  initialOptions?: SearchOption[];
  disabledOption?: (o: SearchOption) => boolean;
  onPick: (id: string, option?: SearchOption) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchOption[]>(initialOptions);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  const picked = [...initialOptions, ...options].find((o) => o.id === value);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function runSearch(q: string) {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    const clean = sanitizeIlike(q);
    if (!clean) {
      setOptions([]);
      setSearched(false);
      setOpen(false);
      return;
    }
    const my = ++seq.current;
    const ctrl = new AbortController();
    abort.current = ctrl;
    timer.current = setTimeout(async () => {
      try {
        const rows = await fetchSearchOptions(kind, q, { signal: ctrl.signal });
        if (my !== seq.current || ctrl.signal.aborted) return;
        setOptions(rows);
        setSearched(true);
        setOpen(true);
      } catch {
        // Abort / network: abaikan, pertahankan opsi terakhir
      }
    }, DEBOUNCE_MS);
  }

  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm';
  return (
    <div className="grid gap-1">
      <span className="font-medium">{label}</span>
      {picked && !open && value ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg border bg-slate-50 px-3 py-2 text-sm">
            {picked.label}
            {picked.sub ? ` (${picked.sub})` : ''}
            {picked.stock !== undefined ? ` — stok: ${picked.stock}` : ''}
          </span>
          <button
            type="button"
            className="rounded-lg border px-2 py-1 text-xs"
            onClick={() => {
              setText('');
              setOpen(true);
              setSearched(false);
            }}
          >
            Ganti
          </button>
        </div>
      ) : (
        <>
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className={inputCls}
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              runSearch(e.target.value);
            }}
            onFocus={() => {
              if (searched && options.length > 0) setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
          />
          {open && (
            <ul
              role="listbox"
              id={listId}
              className="grid max-h-56 gap-1 overflow-auto rounded-lg border bg-white p-1"
            >
              {options.length === 0 && searched ? (
                <li className="px-3 py-2 text-sm text-slate-500">{EMPTY_TEXT}</li>
              ) : (
                options.map((o) => (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={o.id === value}
                    aria-disabled={disabledOption?.(o) ?? false}
                    className="cursor-pointer rounded px-3 py-2 text-sm hover:bg-slate-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (disabledOption?.(o)) return;
                      onPick(o.id, o);
                      setOpen(false);
                      setText('');
                    }}
                  >
                    {o.label}
                    {o.sub ? ` (${o.sub})` : ''}
                    {o.stock !== undefined ? ` — stok: ${o.stock}` : ''}
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
