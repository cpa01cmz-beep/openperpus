'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import SearchCombobox, { type SearchOption } from './SearchCombobox';

export type Option = { id: string; label: string; sub?: string };

export default function LoanForm({
  members,
  books,
}: {
  members: Option[];
  books: (Option & { stock?: number })[];
}) {
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [memberExtra, setMemberExtra] = useState<SearchOption | undefined>(undefined);
  const [bookExtra, setBookExtra] = useState<(SearchOption & { stock?: number }) | undefined>(
    undefined
  );

  // Due date auto +14 hari
  const duePreview = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }, []);

  const selectedBook =
    books.find((b) => b.id === bookId) ??
    (bookExtra && bookExtra.id === bookId ? bookExtra : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!memberId) return setErr('Pilih anggota.');
    if (!bookId) return setErr('Pilih buku.');
    if (selectedBook && (selectedBook.stock ?? 1) <= 0) return setErr('Stok buku habis.');
    setLoading(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, book_id: bookId, notes: notes || undefined }),
      });
      const json = (await res.json()) as { error?: string | { message?: string } };
      if (!res.ok)
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : (json?.error?.message ?? 'Gagal mencatat peminjaman.')
        );
      setMsg(`Peminjaman tercatat. Jatuh tempo: ${duePreview}.`);
      setMemberId('');
      setBookId('');
      setNotes('');
      setMemberExtra(undefined);
      setBookExtra(undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="kartu lubang grid max-w-xl gap-4 p-6">
      {err && (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-3 py-2 text-sm text-ink"
        >
          {err}
        </p>
      )}
      {msg && (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-rule bg-brand-soft px-3 py-2 text-sm text-ink"
        >
          {msg}
        </p>
      )}
      <label className="grid gap-1 text-sm font-medium text-ink">
        Anggota*
        <SearchCombobox
          kind="members"
          label="Anggota*"
          placeholder="Ketik nama / kode anggota…"
          value={memberId}
          initialOptions={
            memberExtra && !members.some((m) => m.id === memberExtra.id)
              ? [...members, memberExtra]
              : members
          }
          onPick={(id, o) => {
            setMemberId(id);
            setMemberExtra(o);
          }}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-ink">
        Buku*
        <SearchCombobox
          kind="books"
          label="Buku*"
          placeholder="Ketik judul / penulis / ISBN…"
          value={bookId}
          initialOptions={
            bookExtra && !books.some((b) => b.id === bookExtra.id) ? [...books, bookExtra] : books
          }
          disabledOption={(o) => (o.stock ?? 1) <= 0}
          onPick={(id, o) => {
            setBookId(id);
            setBookExtra(o);
          }}
        />
      </label>
      <p className="text-xs text-ink/70">
        Jatuh tempo otomatis: <strong className="entri">{duePreview}</strong> (+14 hari dari hari
        ini).
      </p>
      <div className="grid gap-1 text-sm">
        <label htmlFor="loan-notes" className="text-sm font-semibold text-ink">
          Catatan
        </label>
        <textarea
          id="loan-notes"
          className="min-h-[44px] w-full rounded-[var(--radius-sm)] border border-rule bg-surface px-4 py-2 text-sm text-ink transition hover:border-rule-strong focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" loading={loading}>
        Catat Peminjaman
      </Button>
    </form>
  );
}
