"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import LoanForm from "@/components/admin/LoanForm";

type Loan = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  fine_amount: number;
  is_overdue?: boolean;
  members: { member_code: string } | null;
  books: { title: string } | null;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

export default function PeminjamanPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [books, setBooks] = useState<{ id: string; label: string; stock?: number }[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams({ per_page: "20", ...(status ? { status } : {}) });
    const res = await fetch(`/api/loans?${q}`);
    const json = (await res.json()) as { data?: Loan[] };
    if (res.ok) setLoans(json.data ?? []);
  }, [status]);

  const loadOptions = useCallback(async () => {
    const [m, b] = (await Promise.all([
      fetch("/api/members?per_page=100").then((r) => r.json()).catch(() => ({})),
      fetch("/api/books?per_page=100").then((r) => r.json()).catch(() => ({})),
    ])) as [
      { data?: { id: string; member_code: string; profiles?: { full_name: string } }[] },
      { data?: { id: string; title: string; stock_available: number }[] },
    ];
    setMembers(
      (m.data ?? []).map((x: { id: string; member_code: string; profiles?: { full_name: string } }) => ({
        id: x.id,
        label: x.profiles?.full_name ?? x.member_code,
        sub: x.member_code,
      }))
    );
    setBooks((b.data ?? []).map((x: { id: string; title: string; stock_available: number }) => ({ id: x.id, label: x.title, stock: x.stock_available })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  async function onReturn(id: string) {
    if (!confirm("Proses pengembalian? Denda dihitung otomatis Rp1.000/hari telat.")) return;
    const res = await fetch(`/api/loans?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "return" }),
    });
    const json = (await res.json()) as { data?: { fine_amount?: number } | null };
    if (!res.ok) return alert(errMsg(json));
    alert(`Dikembalikan. Denda: Rp${(json.data?.fine_amount ?? 0).toLocaleString("id-ID")}`);
    void Promise.all([load(), loadOptions()]);
  }

  const fmtRp = (n: number) => `Rp${(n ?? 0).toLocaleString("id-ID")}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Peminjaman</h1>
      <LoanForm members={members} books={books} />
      <div className="flex items-center gap-2 text-sm">
        <label>Filter:</label>
        <select className="rounded-lg border px-3 py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua</option>
          <option value="borrowed">borrowed</option>
          <option value="overdue">overdue</option>
          <option value="returned">returned</option>
          <option value="lost">lost</option>
        </select>
        <button onClick={() => { void Promise.all([load(), loadOptions()]); }} className="rounded-lg border px-3 py-1.5">Muat ulang</button>
      </div>
      <DataTable<Loan>
        columns={[
          { key: "peminjam", header: "Peminjam/Buku", render: (r) => <span><strong>{r.members?.member_code}</strong><br /><span className="text-slate-500">{r.books?.title}</span></span> },
          { key: "due_at", header: "Pinjam → Tempo", render: (r) => <span>{new Date(r.borrowed_at).toLocaleDateString("id-ID")}<br />→ {new Date(r.due_at).toLocaleDateString("id-ID")}{r.is_overdue && <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700">telat</span>}</span> },
          { key: "status", header: "Status", render: (r) => r.status },
          { key: "fine_amount", header: "Denda", render: (r) => fmtRp(r.fine_amount) },
          { key: "aksi", header: "Aksi", render: (r) => (r.status === "borrowed" || r.status === "overdue" ? <button onClick={() => onReturn(r.id)} className="rounded bg-slate-900 px-2 py-1 text-xs text-white">Kembalikan</button> : <span className="text-xs text-slate-400">-</span>) },
        ]}
        rows={loans}
        getRowKey={(r) => r.id}
        emptyText="Belum ada peminjaman."
      />
    </div>
  );
}
