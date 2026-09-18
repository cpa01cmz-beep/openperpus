"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import UploadInput from "./UploadInput";

/** Option lists for dropdowns (fetched server-side in tambah/edit pages). */
export type CategoryOption = { id: string; name: string };
export type RackOption = { id: string; code: string; name: string };

/** Kolom canonical migrasi books. */
export type BookInitial = {
  id?: string;
  title?: string;
  author?: string;
  publisher?: string;
  year?: number | null;
  isbn?: string;
  category_id?: string | null;
  rack_id?: string | null;
  cover_url?: string;
  pdf_url?: string;
  description?: string;
  pages?: number | null;
  language?: string;
  stock_total?: number;
  stock_available?: number;
  featured?: boolean;
  is_active?: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal menyimpan buku.";
  return typeof err === "string" ? err : err.message ?? "Gagal menyimpan buku.";
}

export default function BookForm({
  initial,
  mode,
  categories = [],
  racks = [],
}: {
  initial?: BookInitial;
  mode: "create" | "edit";
  categories?: CategoryOption[];
  racks?: RackOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<BookInitial>({
    title: initial?.title ?? "",
    author: initial?.author ?? "",
    publisher: initial?.publisher ?? "",
    year: initial?.year ?? null,
    isbn: initial?.isbn ?? "",
    category_id: initial?.category_id ?? "",
    rack_id: initial?.rack_id ?? "",
    cover_url: initial?.cover_url ?? "",
    pdf_url: initial?.pdf_url ?? "",
    description: initial?.description ?? "",
    pages: initial?.pages ?? null,
    language: initial?.language ?? "id",
    stock_total: initial?.stock_total ?? 1,
    stock_available: initial?.stock_available ?? initial?.stock_total ?? 1,
    featured: initial?.featured ?? false,
    is_active: initial?.is_active ?? true,
  });

  const set = (k: keyof BookInitial, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.title?.trim()) return setErr("Judul wajib diisi.");
    if (!form.author?.trim()) return setErr("Penulis wajib diisi (kolom NOT NULL di DB).");
    if ((form.stock_available ?? 0) < 0) return setErr("stock_available tidak boleh negatif.");
    if ((form.stock_available ?? 0) > (form.stock_total ?? 0)) return setErr("stock_available tidak boleh melebihi stock_total.");
    setLoading(true);
    try {
      const payload = {
        title: form.title?.trim(),
        author: form.author?.trim(),
        publisher: form.publisher || null,
        year: form.year ? Number(form.year) : null,
        isbn: form.isbn || null,
        category_id: form.category_id || null,
        rack_id: form.rack_id || null,
        cover_url: form.cover_url || null,
        pdf_url: form.pdf_url || null,
        description: form.description || null,
        pages: form.pages ? Number(form.pages) : null,
        language: form.language || "id",
        stock_total: Number(form.stock_total ?? 1),
        stock_available: Number(form.stock_available ?? 1),
        featured: Boolean(form.featured),
        is_active: form.is_active === undefined ? true : Boolean(form.is_active),
      };
      const url = mode === "create" ? "/api/books" : `/api/books/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      router.push("/admin/buku");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4 rounded-2xl border bg-white p-6">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Judul*<input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} required /></label>
        <label className="grid gap-1 text-sm">Penulis* (NOT NULL)<input className={input} value={form.author} onChange={(e) => set("author", e.target.value)} required /></label>
        <label className="grid gap-1 text-sm">Penerbit<input className={input} value={form.publisher} onChange={(e) => set("publisher", e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Tahun<input type="number" className={input} value={form.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="grid gap-1 text-sm">ISBN<input className={input} value={form.isbn} onChange={(e) => set("isbn", e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Bahasa<input className={input} value={form.language} onChange={(e) => set("language", e.target.value)} placeholder="id" /></label>
        <label className="grid gap-1 text-sm">Kategori
          {categories.length > 0 ? (
            <select className={input} value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input className={input} value={form.category_id ?? ""} onChange={(e) => set("category_id", e.target.value)} placeholder="uuid kategori (opsional)" />
          )}
        </label>
        <label className="grid gap-1 text-sm">Rak
          {racks.length > 0 ? (
            <select className={input} value={form.rack_id ?? ""} onChange={(e) => set("rack_id", e.target.value)}>
              <option value="">— Tanpa rak —</option>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
              ))}
            </select>
          ) : (
            <input className={input} value={form.rack_id ?? ""} onChange={(e) => set("rack_id", e.target.value)} placeholder="uuid rak (opsional)" />
          )}
        </label>
        <label className="grid gap-1 text-sm">Stok total<input type="number" min={0} className={input} value={form.stock_total} onChange={(e) => set("stock_total", Number(e.target.value))} /></label>
        <label className="grid gap-1 text-sm">Stok tersedia<input type="number" min={0} className={input} value={form.stock_available} onChange={(e) => set("stock_available", Number(e.target.value))} /></label>
        <label className="grid gap-1 text-sm">Jumlah halaman<input type="number" min={1} className={input} value={form.pages ?? ""} onChange={(e) => set("pages", e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="grid gap-1 text-sm">E-book (PDF)
          <UploadInput value={form.pdf_url ?? ""} onUploaded={(url) => set("pdf_url", url)} folder="ebooks" accept="application/pdf" label="Upload PDF" />
        </label>
      </div>
      <label className="grid gap-1 text-sm">Sampul (cover)
        <UploadInput value={form.cover_url ?? ""} onUploaded={(url) => set("cover_url", url)} folder="covers" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" label="Upload cover" />
      </label>
      <label className="grid gap-1 text-sm">Deskripsi<textarea className={input} rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.featured} onChange={(e) => set("featured", e.target.checked)} /> Unggulan (featured)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set("is_active", e.target.checked)} /> Aktif di katalog (is_active)</label>
      </div>
      <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? "Menyimpan…" : mode === "create" ? "Tambah Buku" : "Simpan Perubahan"}
      </button>
    </form>
  );
}
