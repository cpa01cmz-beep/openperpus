"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";

type Rack = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  capacity: number | null;
  is_active: boolean;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

export default function RakPage() {
  const [rows, setRows] = useState<Rack[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "", location: "" });
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ all: "1", per_page: "50", q: search });
    const res = await fetch(`/api/racks?${q}`);
    const json = (await res.json()) as { data?: Rack[] };
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
    if (!form.code.trim()) {
      setFormError("Kode rak wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Nama rak wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/racks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          location: form.location.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ code: "", name: "", location: "" });
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(row: Rack) {
    setActionError("");
    const res = await fetch(`/api/racks?id=${row.id}`, {
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
    if (!confirm("Hapus rak ini?")) return;
    setActionError("");
    const res = await fetch(`/api/racks?id=${id}`, { method: "DELETE" });
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
        <h1 className="text-2xl font-bold">Rak</h1>
        <p className="text-sm text-slate-500">Kelola rak penyimpanan buku (kode, nama, lokasi, status aktif).</p>
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap items-start gap-2 rounded-2xl border bg-white p-4">
        <input
          className={input}
          placeholder="Kode rak*"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          className={input}
          placeholder="Nama rak*"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={`${input} min-w-[200px] flex-1`}
          placeholder="Lokasi (opsional)"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "…" : "+ Tambah"}
        </button>
        {formError && <p className="w-full text-sm text-red-600">{formError}</p>}
      </form>
      <input
        className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
        placeholder="Cari kode / nama / lokasi…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      <DataTable<Rack>
        columns={[
          { key: "code", header: "Kode", render: (r) => <span className="font-medium">{r.code}</span> },
          { key: "name", header: "Nama" },
          { key: "location", header: "Lokasi", render: (r) => r.location ?? "-" },
          { key: "capacity", header: "Kapasitas", render: (r) => (r.capacity === null ? "-" : String(r.capacity)) },
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
