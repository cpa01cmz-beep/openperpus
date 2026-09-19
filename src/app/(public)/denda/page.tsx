'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';

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
const methodOf = (notes: string | null) => {
  if (!notes) return '—';
  const m = notes.match(/Dibayar via ([^.]+)/i);
  return m?.[1]?.trim() ?? '—';
};

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
  const [pendingPay, setPendingPay] = useState<Fine | null>(null);
  const [receipt, setReceipt] = useState<(Fine & { methodUsed: string }) | null>(null);
  const [copied, setCopied] = useState(false);

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
    setPendingPay(f);
  }

  async function confirmPay() {
    const f = pendingPay;
    if (!f) return;
    if (payingId) return;
    const usedMethod = method;
    setPayingId(f.id);
    setPendingPay(null);
    try {
      const res = await fetch(`/api/fines/${f.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: usedMethod, metode: usedMethod }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) {
        setError(errMsg(json));
        return;
      }
      const data = (json as { data?: Fine }).data;
      if (data) setReceipt({ ...data, methodUsed: usedMethod });
      await load();
    } finally {
      setPayingId(null);
    }
  }

  async function copyReceipt() {
    if (!receipt) return;
    const text =
      `Bukti pembayaran denda\n` +
      `ID: ${receipt.id}\n` +
      `Nominal: ${fmtRp(receipt.amount)}\n` +
      `Dibayar: ${fmtRp(receipt.paid_amount)}\n` +
      `Sisa: ${fmtRp(num(receipt.amount) - num(receipt.paid_amount))}\n` +
      `Metode: ${receipt.methodUsed}\n` +
      `Lunas pada: ${receipt.paid_at}\n` +
      `paid_at: ${receipt.paid_at}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('Gagal menyalin bukti.');
    }
  }

  return (
    <div className="grid gap-4">
      <Modal
        open={pendingPay !== null}
        onClose={() => setPendingPay(null)}
        title="Bayar denda"
        description="Konfirmasi pembayaran denda Anda."
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingPay(null)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={payingId !== null}
              onClick={() => void confirmPay()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {payingId ? 'Memproses…' : 'Ya, bayar'}
            </button>
          </>
        }
      >
        {pendingPay && (
          <p>
            Bayar denda {fmtRp(num(pendingPay.amount) - num(pendingPay.paid_amount))} via{' '}
            {method}?
          </p>
        )}
      </Modal>
      <Modal
        open={receipt !== null}
        onClose={() => {
          setReceipt(null);
          setCopied(false);
        }}
        title="Bukti pembayaran"
        description="Pembayaran denda berhasil."
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setReceipt(null);
                setCopied(false);
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => void copyReceipt()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {copied ? 'Tersalin!' : 'Salin bukti'}
            </button>
          </>
        }
      >
        {receipt && (
          <div className="grid gap-1.5">
            <p>
              Nominal: <span className="font-semibold">{fmtRp(receipt.amount)}</span>
            </p>
            <p>
              Dibayar: <span className="font-semibold">{fmtRp(receipt.paid_amount)}</span>
            </p>
            <p>
              Sisa: <span className="font-semibold">{fmtRp(0)}</span>
            </p>
            <p>
              Metode: <span className="font-semibold">{receipt.methodUsed}</span>
            </p>
            <p>
              Status: <span className="font-semibold">{receipt.status}</span>
            </p>
            {receipt.paid_at && (
              <p>
                Lunas pada:{' '}
                <span className="font-semibold">
                  {new Date(receipt.paid_at).toLocaleDateString('id-ID')}
                </span>
              </p>
            )}
            {copied && (
              <p role="alert" className="text-sm text-green-700">
                Bukti berhasil disalin.
              </p>
            )}
          </div>
        )}
      </Modal>
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
                      {r.paid_at && (
                        <>
                          {' · '}Lunas pada:{' '}
                          {new Date(r.paid_at).toLocaleDateString('id-ID')}
                        </>
                      )}
                      {' · '}Metode: {methodOf(r.notes)}
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
