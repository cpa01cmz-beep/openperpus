"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import StatCard from "@/components/admin/StatCard";

type Fine = {
  id: string;
  loan_id: string;
  amount: number | string;
  paid_amount: number | string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
  members: { member_code: string } | null;
};

const STATUS_OPTS = ["", "unpaid", "partial", "paid", "waived"];
const METHOD_OPTS = ["tunai", "transfer", "qris"];

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const fmtRp = (v: number | string | null | undefined) => `Rp${num(v).toLocaleString("id-ID")}`;

export default function DendaPage() {
  const [rows, setRows] = useState<Fine[]>([]);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("tunai");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [apiMissing, setApiMissing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ page: String(page), per_page: "20", ...(status ? { status } : {}) });
      const res = await fetch(`/api/fines?${q}`, { cache: "no-store" });
      if (res.status === 404) {
        setApiMissing(true);
        setRows([]);
        return;
      }
      const json = (await res.json()) as { data?: Fine[]; pagination?: { totalPages?: number }; meta?: { totalPages?: number } };
      if (!res.ok) throw new Error(errMsg(json));
      setApiMissing(false);
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPay(f: Fine) {
    const sisa = num(f.amount) - num(f.paid_amount);
    if (!confirm(`Tandai lunas denda ${fmtRp(sisa)} (${f.members?.member_code ?? "?"}) via ${method}?`)) return;
    setPayingId(f.id);
    try {
      const res = await fetch(`/api/fines/${f.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metode: method, method }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setApiMissing(true);
        return alert("API /api/fines belum tersedia di backend.");
      }
      if (!res.ok) return alert(errMsg(json));
      load();
    } finally {
      setPayingId(null);
    }
  }

  const tagihan = rows
    .filter((r) => r.status === "unpaid" || r.status === "partial")
    .reduce((s, r) => s + (num(r.amount) - num(r.paid_amount)), 0);
  const lunasCount = rows.filter((r) => r.status === "paid").length;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Denda</h1>
        <p className="text-sm text-slate-500">Denda terbentuk otomatis saat pengembalian terlambat (Rp1.000/hari).</p>
      </div>

      {apiMissing && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          API <code className="font-mono">/api/fines</code> belum tersedia di backend (404). Daftar &amp; tombol
          bayar menunggu worker backend. Sudah dilaporkan ke mandor.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tagihan terbuka" value={fmtRp(tagihan)} hint="unpaid + partial (halaman ini)" />
        <StatCard label="Lunas" value={lunasCount} hint="Status paid (halaman ini)" />
        <StatCard label="Total baris" value={rows.length} hint={`Halaman ${page} / ${totalPages}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="filter-status">Filter:</label>
        <select
          id="filter-status"
          className="rounded-lg border px-3 py-1.5"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "Semua" : s}
            </option>
          ))}
        </select>
        <label htmlFor="pay-method">Metode bayar:</label>
        <select
          id="pay-method"
          className="rounded-lg border px-3 py-1.5"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHOD_OPTS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-lg border px-3 py-1.5">
          Muat ulang
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <DataTable<Fine>
          columns={[
            {
              key: "anggota",
              header: "Anggota",
              render: (r) => <span className="font-medium">{r.members?.member_code ?? "-"}</span>,
            },
            {
              key: "amount",
              header: "Tagihan / Dibayar",
              render: (r) => (
                <span>
                  {fmtRp(r.amount)}
                  <br />
                  <span className="text-xs text-slate-500">dibayar {fmtRp(r.paid_amount)}</span>
                </span>
              ),
            },
            { key: "status", header: "Status" },
            {
              key: "issued_at",
              header: "Terbit",
              render: (r) => new Date(r.issued_at).toLocaleDateString("id-ID"),
            },
            {
              key: "aksi",
              header: "Aksi",
              render: (r) =>
                r.status === "unpaid" || r.status === "partial" ? (
                  <button
                    disabled={payingId === r.id}
                    onClick={() => onPay(r)}
                    className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    {payingId === r.id ? "…" : "Bayar"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                ),
            },
          ]}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyText="Belum ada denda."
        />
      )}

      <div className="flex items-center gap-2 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          ‹ Prev
        </button>
        <span>
          Halaman {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
