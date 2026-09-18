"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

export default function KategoriPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: "1", per_page: "50", q: search });
    const res = await fetch(`/api/categories?${q}`);
    const json = (await res.json()) as { data?: Category[] };
    if (res.ok) setRows(json.data ?? []);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setActionError("");
    if (!form.name.trim()) {
      setFormError("Nama kategori wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ name: "", description: "" });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Category) {
    setActionError("");
    const res = await fetch(`/api/categories?id=${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    load();
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus kategori ini?")) return;
    setActionError("");
    const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    load();
  }

  const input = "rounded-lg border px-3 py-2 text-sm";
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Kategori</h1>
        <p className="text-sm text-slate-500">Kelola kategori buku (name, slug otomatis, deskripsi, status aktif).</p>
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap items-start gap-2 rounded-2xl border bg-white p-4">
        <input
          className={input}
          placeholder="Nama kategori*"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={`${input} min-w-[240px] flex-1`}
          placeholder="Deskripsi (opsional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "…" : "+ Tambah"}
        </button>
        {formError && <p className="w-full text-sm text-red-600">{formError}</p>}
      </form>
      <input
        className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
        placeholder="Cari nama / slug…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      <DataTable<Category>
        columns={[
          { key: "name", header: "Nama", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "slug", header: "Slug" },
          { key: "description", header: "Deskripsi", render: (r) => r.description ?? "-" },
          {
            key: "is_active",
            header: "Status",
            render: (r) => (
              <button onClick={() => onToggle(r)} className="rounded-full border px-2 py-0.5 text-xs hover:bg-slate-100">
                {r.is_active ? "Aktif" : "Nonaktif"}
              </button>
            ),
          },
          {
            key: "aksi",
            header: "Aksi",
            render: (r) => (
              <button onClick={() => onDelete(r.id)} className="text-red-600 hover:underline">
                Hapus
              </button>
            ),
          },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
      />
    </div>
  );
}
