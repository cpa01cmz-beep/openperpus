"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";

type Member = {
  id: string;
  member_code: string;
  phone: string | null;
  address: string | null;
  status: string;
  profiles?: { full_name: string | null } | null;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

export default function AnggotaPage() {
  const [rows, setRows] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ user_id: "", member_code: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ per_page: "50", q: search });
    const res = await fetch(`/api/members?${q}`);
    const json = (await res.json()) as { data?: Member[] };
    if (res.ok) setRows(json.data ?? []);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.user_id.trim()) return alert("user_id (profiles.id / auth user) wajib diisi.");
    setLoading(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: form.user_id.trim(),
          member_code: form.member_code.trim() || undefined,
          phone: form.phone || null,
          address: form.address || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ user_id: "", member_code: "", phone: "", address: "" });
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus anggota ini?")) return;
    const res = await fetch(`/api/members?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return alert(errMsg(json));
    load();
  }

  const input = "rounded-lg border px-3 py-2 text-sm";
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Anggota</h1>
        <p className="text-sm text-slate-500">members.user_id wajib merujuk profiles.id (auth user). Nama tampil dari profiles.full_name.</p>
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap gap-2 rounded-2xl border bg-white p-4">
        <input className={input} placeholder="user_id (UUID profiles)*" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required />
        <input className={input} placeholder="member_code (auto bila kosong)" value={form.member_code} onChange={(e) => setForm({ ...form, member_code: e.target.value })} />
        <input className={input} placeholder="Telepon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className={input} placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <button disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {loading ? "…" : "+ Tambah"}
        </button>
      </form>
      <input className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm" placeholder="Cari kode / telepon…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <DataTable<Member>
        columns={[
          { key: "member_code", header: "Kode", render: (r) => <span className="font-medium">{r.member_code}</span> },
          { key: "profiles", header: "Nama", render: (r) => r.profiles?.full_name ?? "-" },
          { key: "phone", header: "Telepon" },
          { key: "status", header: "Status" },
          { key: "aksi", header: "Aksi", render: (r) => <button onClick={() => onDelete(r.id)} className="text-red-600 hover:underline">Hapus</button> },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
      />
    </div>
  );
}
