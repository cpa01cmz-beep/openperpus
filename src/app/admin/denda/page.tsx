'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import StatCard from '@/components/admin/StatCard';
import Pagination from '@/components/ui/Pagination';

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

const STATUS_OPTS = ['', 'unpaid', 'partial', 'paid', 'waived'];
const METHOD_OPTS = ['tunai', 'transfer', 'qris'];

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const fmtRp = (v: number | string | null | undefined) => `Rp${num(v).toLocaleString('id-ID')}`;

export default function DendaPage() {
  const [rows, setRows] = useState<Fine[]>([]);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('tunai');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [apiMissing, setApiMissing] = useState(false);
  const [error, setError] = useState('');
  const [finePerDay, setFinePerDay] = useState(1000);
  const [tagihanTotal, setTagihanTotal] = useState(0);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json() as Promise<{ data?: { fine_per_day?: unknown } }>)
      .then((j) => {
        const v = Number(j.data?.fine_per_day);
        if (Number.isFinite(v) && v > 0) setFinePerDay(v);
      })
      .catch(() => {});
  }, []);

  const loadTotals = useCallback(async () => {
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      // p_member_id = NULL → sum across all members (admin view)
      const { data, error } = await supabase.rpc('get_fines_total', {
        p_member_id: null,
      });
      if (!error && typeof data === 'number') {
        setTagihanTotal(data);
      }
    } catch {}
  }, []);

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
      if (res.status === 404) {
        setApiMissing(true);
        setRows([]);
        return;
      }
      const json = (await res.json()) as {
        data?: Fine[];
        pagination?: { totalPages?: number };
        meta?: { totalPages?: number };
      };
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
    loadTotals();
  }, [load, loadTotals]);

  async function onPay(f: Fine) {
    const sisa = num(f.amount) - num(f.paid_amount);
    if (
      !confirm(
        `Tandai lunas denda ${fmtRp(sisa)} (${f.members?.member_code ?? '?'}) via ${method}?`
      )
    )
      return;
    setPayingId(f.id);
    try {
      const res = await fetch(`/api/fines/${f.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metode: method, method }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setApiMissing(true);
        return alert('API /api/fines belum tersedia di backend.');
      }
      if (!res.ok) return alert(errMsg(json));
      load();
      loadTotals();
    } finally {
      setPayingId(null);
    }
  }

  const lunasCount = rows.filter((r) => r.status === 'paid').length;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Denda</h1>
        <p className="text-sm text-slate-500">
          Denda terbentuk otomatis saat pengembalian terlambat (Rp
          {finePerDay.toLocaleString('id-ID')}/hari, tarif denda_per_hari).
        </p>
      </div>

      {apiMissing && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          API <code className="font-mono">/api/fines</code> belum tersedia di backend (404). Daftar
          & tombol bayar menunggu worker backend. Sudah dilaporkan ke mandor.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Tagihan terbuka"
          value={fmtRp(tagihanTotal)}
          hint="unpaid + partial (semua anggota)"
        />
        <StatCard label="Lunas" value={lunasCount} hint="Status paid (halaman ini)" />
        <StatCard
          label="Total baris"
          value={rows.length}
          hint={`Halaman ${page} / ${totalPages}`}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 text-sm">
        <div className="grid gap-1">
          <label htmlFor="filter-status" className="text-sm font-semibold text-slate-700">
            Filter status
          </label>
          <select
            id="filter-status"
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
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
        </div>
        <div className="grid gap-1">
          <label htmlFor="pay-method" className="text-sm font-semibold text-slate-700">
            Metode bayar
          </label>
          <select
            id="pay-method"
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHOD_OPTS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Muat ulang
        </button>
        <ExportCsvButton
          filename="denda.csv"
          headers={['ID', 'Anggota', 'Tagihan', 'Dibayar', 'Status', 'Terbit']}
          rows={rows.map((r) => [
            r.id,
            r.members?.member_code ?? '',
            num(r.amount),
            num(r.paid_amount),
            r.status,
            r.issued_at,
          ])}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <DataTable<Fine>
          columns={[
            {
              key: 'anggota',
              header: 'Anggota',
              render: (r) => <span className="font-medium">{r.members?.member_code ?? '-'}</span>,
            },
            {
              key: 'amount',
              header: 'Tagihan / Dibayar',
              render: (r) => (
                <span>
                  {fmtRp(r.amount)}
                  <br />
                  <span className="text-xs text-slate-500">dibayar {fmtRp(r.paid_amount)}</span>
                </span>
              ),
            },
            { key: 'status', header: 'Status' },
            {
              key: 'issued_at',
              header: 'Terbit',
              render: (r) => new Date(r.issued_at).toLocaleDateString('id-ID'),
            },
            {
              key: 'aksi',
              header: 'Aksi',
              render: (r) =>
                r.status === 'unpaid' || r.status === 'partial' ? (
                  <button
                    type="button"
                    disabled={payingId === r.id}
                    onClick={() => onPay(r)}
                    aria-label={`Bayar denda anggota ${r.members?.member_code ?? r.id}`}
                    className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {payingId === r.id ? '…' : 'Bayar'}
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

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
