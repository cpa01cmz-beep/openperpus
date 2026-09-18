"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";

type Menu = {
  id: string;
  label: string;
  url: string;
  position: string;
  sort_order: number;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

export default function MenuPage() {
  const [rows, setRows] = useState<Menu[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ label: "", url: "", position: "header" });
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: "1", per_page: "50", q: search });
    const res = await fetch(`/api/menus?${q}`);
    const json = (await res.json()) as { data?: Menu[] };
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
    if (!form.label.trim()) {
      setFormError("Label menu wajib diisi.");
      return;
    }
    if (!form.url.trim()) {
      setFormError("URL menu wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim(),
          url: form.url.trim(),
          position: form.position,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ label: "", url: "", position: "header" });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Menu) {
    setActionError("");
    const res = await fetch(`/api/menus?id=${row.id}`, {
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
    if (!confirm("Hapus menu ini?")) return;
    setActionError("");
    const res = await fetch(`/api/menus?id=${id}`, { method: "DELETE" });
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
        <h1 className="text-2xl font-bold">Menu</h1>
        <p className="text-sm text-slate-500">Kelola menu navigasi situs (label, URL, posisi, status aktif).</p>
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap items-start gap-2 rounded-2xl border bg-white p-4">
        <input
          className={input}
          placeholder="Label menu*"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <input
          className={`${input} min-w-[200px] flex-1`}
          placeholder="URL / link*"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
        <select
          className={input}
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
        >
          <option value="header">header</option>
          <option value="footer">footer</option>
          <option value="sidebar">sidebar</option>
        </select>
        <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "…" : "+ Tambah"}
        </button>
        {formError && <p className="w-full text-sm text-red-600">{formError}</p>}
      </form>
      <input
        className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
        placeholder="Cari label / URL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      <DataTable<Menu>
        columns={[
          { key: "label", header: "Label", render: (r) => <span className="font-medium">{r.label}</span> },
          { key: "url", header: "URL" },
          { key: "position", header: "Posisi" },
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
