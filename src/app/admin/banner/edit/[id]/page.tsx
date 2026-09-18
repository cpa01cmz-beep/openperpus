"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal menyimpan banner.";
  return typeof err === "string" ? err : err.message ?? "Gagal menyimpan banner.";
}

export default function EditBannerPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    image_url: "",
    link: "",
    sort_order: 0,
    is_active: true,
  });

  useEffect(() => {
    async function loadById() {
      const supabase = createClient();
      const { data, error } = await supabase.from("banners").select("*").eq("id", params.id).single();
      if (error || !data) {
        setErr("Banner tidak ditemukan.");
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? "",
        subtitle: data.subtitle ?? "",
        image_url: data.image_url ?? "",
        link: data.link ?? "",
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active ?? true,
      });
      setLoading(false);
    }
    loadById();
  }, [params.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.title.trim() || !form.image_url.trim()) return setErr("Judul & image_url wajib.");
    setSaving(true);
    try {
      const res = await fetch(`/api/banners?id=${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      router.push("/admin/banner");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  if (loading) return <p className="text-sm text-slate-500">Memuat banner…</p>;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Banner</h1>
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <input className={input} placeholder="Judul*" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className={input} placeholder="Subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        <input className={input} placeholder="Image URL* https://…" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} required />
        <div className="flex gap-2">
          <input className={input} placeholder="Link URL" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
          <input type="number" className={input} placeholder="Urutan (sort_order)" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Aktif (is_active)
        </label>
        <button disabled={saving} className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </button>
      </form>
    </div>
  );
}
