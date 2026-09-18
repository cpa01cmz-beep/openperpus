"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal menyimpan artikel.";
  return typeof err === "string" ? err : err.message ?? "Gagal menyimpan artikel.";
}

export default function EditArtikelPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    content_md: "",
    excerpt: "",
    cover_url: "",
    category: "",
    status: "draft",
  });

  useEffect(() => {
    async function loadById() {
      const supabase = createClient();
      const { data, error } = await supabase.from("articles").select("*").eq("id", params.id).single();
      if (error || !data) {
        setErr("Artikel tidak ditemukan.");
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? "",
        slug: data.slug ?? "",
        content_md: data.content_md ?? "",
        excerpt: data.excerpt ?? "",
        cover_url: data.cover_url ?? "",
        category: data.category ?? "",
        status: data.status ?? "draft",
      });
      setPublishedAt(data.published_at ?? null);
      setLoading(false);
    }
    loadById();
  }, [params.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.title.trim() || !form.content_md.trim()) return setErr("Judul & konten wajib.");
    setSaving(true);
    try {
      const res = await fetch(`/api/articles?id=${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      router.push("/admin/artikel");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  if (loading) return <p className="text-sm text-slate-500">Memuat artikel…</p>;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Artikel</h1>
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <input className={input} placeholder="Judul*" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className={input} placeholder="Slug (otomatis dari judul bila kosong)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <div className="flex gap-2">
          <input className={input} placeholder="Cover URL" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} />
          <input className={input} placeholder="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <input className={input} placeholder="Ringkasan (excerpt)" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        <textarea className={input} rows={6} placeholder="Konten markdown* (content_md)" value={form.content_md} onChange={(e) => setForm({ ...form, content_md: e.target.value })} required />
        <div className="flex gap-2">
          <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
          <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
        {publishedAt && <p className="text-xs text-slate-500">published_at: {publishedAt}</p>}
      </form>
    </div>
  );
}
