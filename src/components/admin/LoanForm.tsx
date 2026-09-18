"use client";

import { useMemo, useState } from "react";

export type Option = { id: string; label: string; sub?: string };

export default function LoanForm({
  members,
  books,
}: {
  members: Option[];
  books: (Option & { stock?: number })[];
}) {
  const [memberId, setMemberId] = useState("");
  const [bookId, setBookId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Due date auto +14 hari
  const duePreview = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }, []);

  const selectedBook = books.find((b) => b.id === bookId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!memberId) return setErr("Pilih anggota.");
    if (!bookId) return setErr("Pilih buku.");
    if (selectedBook && (selectedBook.stock ?? 1) <= 0) return setErr("Stok buku habis.");
    setLoading(true);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId, book_id: bookId, notes: notes || undefined }),
      });
      const json = (await res.json()) as { error?: string | { message?: string } };
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : json?.error?.message ?? "Gagal mencatat peminjaman.");
      setMsg(`Peminjaman tercatat. Jatuh tempo: ${duePreview}.`);
      setMemberId("");
      setBookId("");
      setNotes("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4 rounded-2xl border bg-white p-6">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
      <label className="grid gap-1 text-sm font-medium">
        Anggota*
        <select className={input} value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="">— Pilih anggota —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.sub ? ` (${m.sub})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Buku*
        <select className={input} value={bookId} onChange={(e) => setBookId(e.target.value)} required>
          <option value="">— Pilih buku —</option>
          {books.map((b) => (
            <option key={b.id} value={b.id} disabled={(b.stock ?? 1) <= 0}>
              {b.label} — stok: {b.stock ?? "?"}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-slate-500">
        Jatuh tempo otomatis: <strong>{duePreview}</strong> (+14 hari dari hari ini).
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Catatan
        <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? "Menyimpan…" : "Catat Peminjaman"}
      </button>
    </form>
  );
}
