'use client';

import { useCallback, useEffect, useState } from 'react';

type Fine = {
  id: string;
  loan_id: string;
  amount: number | string;
  paid_amount: number | string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
};

const STATUS_OPTS = ['', 'unpaid', 'partial', 'paid', 'waived'];
const METHOD_OPTS = ['tunai', 'transfer', 'qris'] as const;

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const fmtRp = (v: number | string | null | undefined) => `Rp${num(v).toLocaleString('id-ID')}`;

export default function DendaSayaPage() {
  const [rows, setRows] = useState<Fine[]>([]);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState<(typeof METHOD_OPTS)[number]>('qris');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openTotal, setOpenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        per_page: '20',
        ...(status ? { status } : {}),
      });
      const res = await fetch(`/api/fines?${q}`, { cache: 'no-store' });
      if (res.status === 401) {
        setNeedLogin(true);
        setRows([]);
        return;
      }
      const json = (await res.json()) as {
        data?: Fine[];
        pagination?: { totalPages?: number };
        meta?: { totalPages?: number };
      };
      if (!res.ok) throw new Error(errMsg(json));
      setNeedLogin(false);
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
      const terbuka = (json.data ?? [])
        .filter((r) => r.status === 'unpaid' || r.status === 'partial')
        .reduce((s, r) => s + (num(r.amount) - num(r.paid_amount)), 0);
      setOpenTotal(terbuka);
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
    if (!confirm(`Bayar denda ${fmtRp(sisa)} via ${method}?`)) return;
    setPayingId(f.id);
    try {
      const res = await fetch(`/api/fines/${f.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, metode: method }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) return alert(errMsg(json));
      await load();
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Denda Saya</h1>
        <p className="text-sm text-slate-500">
          Denda terbentuk otomatis saat pengembalian terlambat (Rp1.000/hari). Bayar langsung tanpa
          payment gateway.
        </p>
      </div>

      {needLogin && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Silakan{' '}
          <a className="font-semibold underline" href="/login?next=/denda">
            login
          </a>{' '}
          sebagai anggota untuk melihat denda Anda.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Total terbuka</p>
          <p className="text-xl font-bold">{fmtRp(openTotal)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Baris</p>
          <p className="text-xl font-bold">{rows.length}</p>
          <p className="text-xs text-slate-500">
            Halaman {page} / {totalPages}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="denda-status">Filter:</label>
        <select
          id="denda-status"
          className="rounded-lg border px-3 py-1.5"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'Semua' : s}
            </option>
          ))}
        </select>
        <label htmlFor="denda-method">Metode bayar:</label>
        <select
          id="denda-method"
          className="rounded-lg border px-3 py-1.5"
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof METHOD_OPTS)[number])}
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada denda.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const sisa = num(r.amount) - num(r.paid_amount);
            const open = r.status === 'unpaid' || r.status === 'partial';
            return (
              <li key={r.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-slate-500">Tagihan / Dibayar</p>
                    <p className="font-semibold">
                      {fmtRp(r.amount)}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        dibayar {fmtRp(r.paid_amount)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm">
                      Status: <span className="font-semibold">{r.status}</span>
                      {' · '}Terbit: {new Date(r.issued_at).toLocaleDateString('id-ID')}
                      {open && sisa > 0 && (
                        <>
                          {' · '}Sisa: <span className="font-semibold">{fmtRp(sisa)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {open ? (
                    <button
                      disabled={payingId === r.id}
                      onClick={() => onPay(r)}
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {payingId === r.id ? '…' : 'Bayar'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Lunas/dibebaskan</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
