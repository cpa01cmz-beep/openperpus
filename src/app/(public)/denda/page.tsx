'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Breadcrumb from '@/components/public/Breadcrumb';
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
  const [downloadError, setDownloadError] = useState('');
  const [finePerDay, setFinePerDay] = useState(1000);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json() as Promise<{ data?: { fine_per_day?: unknown } }>)
      .then((j) => {
        const v = Number(j.data?.fine_per_day);
        if (Number.isFinite(v) && v > 0) setFinePerDay(v);
      })
      .catch(() => {});
  }, []);

  // Fetch member ID for RPC call
  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then((res) => {
        const user = res.data?.user;
        if (user) {
          supabase
            .from('members')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()
            .then((memRes) => {
              if (memRes.data) setMemberId(memRes.data.id);
            });
        }
      });
    });
  }, []);

  const loadTotals = useCallback(async () => {
    if (!memberId) return;
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_fines_total', {
        p_member_id: memberId,
      });
      if (!error && typeof data === 'number') {
        setOpenTotal(data);
      }
    } catch {}
  }, [memberId]);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

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
      loadTotals();
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

  function printReceipt() {
    window.print();
  }

  function downloadReceipt() {
    if (!receipt) return;
    const text =
      `Bukti pembayaran denda\n` +
      `ID: ${receipt.id}\n` +
      `Nominal: ${fmtRp(receipt.amount)}\n` +
      `Dibayar: ${fmtRp(receipt.paid_amount)}\n` +
      `Sisa: ${fmtRp(0)}\n` +
      `Metode: ${receipt.methodUsed}\n` +
      `Lunas pada: ${receipt.paid_at}\n` +
      `paid_at: ${receipt.paid_at}`;
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bukti-denda-${receipt.id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Gagal mengunduh bukti.');
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
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={payingId !== null}
              onClick={() => void confirmPay()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {payingId ? 'Memproses…' : 'Ya, bayar'}
            </button>
          </>
        }
      >
        {pendingPay && (
          <p>
            Bayar denda {fmtRp(num(pendingPay.amount) - num(pendingPay.paid_amount))} via {method}?
          </p>
        )}
      </Modal>
      <Modal
        open={receipt !== null}
        onClose={() => {
          setReceipt(null);
          setCopied(false);
          setDownloadError('');
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
                setDownloadError('');
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => printReceipt()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cetak
            </button>
            <button
              type="button"
              onClick={() => downloadReceipt()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Unduh
            </button>
            <button
              type="button"
              onClick={() => void copyReceipt()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {copied ? 'Tersalin!' : 'Salin bukti'}
            </button>
          </>
        }
      >
        {receipt && (
          <>
            <div className="grid gap-1.5 print:hidden">
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
                <p role="alert" className="entri text-sm text-brand">
                  Bukti berhasil disalin.
                </p>
              )}
              {downloadError && (
                <p role="alert" className="entri text-sm text-accent">
                  Gagal mengunduh bukti.
                </p>
              )}
            </div>
            <div className="hidden print:block">
              <p>Bukti pembayaran denda</p>
              <p>ID: {receipt.id}</p>
              <p>Nominal: {fmtRp(receipt.amount)}</p>
              <p>Dibayar: {fmtRp(receipt.paid_amount)}</p>
              <p>Sisa: {fmtRp(0)}</p>
              <p>Metode: {receipt.methodUsed}</p>
              <p>Lunas pada: {receipt.paid_at}</p>
              <p>paid_at: {receipt.paid_at}</p>
            </div>
          </>
        )}
      </Modal>
      <div>
        <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Denda Saya' }]} />
        {/* Kop kartu indeks: judul + baris entri tarif/halaman */}
        <div className="kartu mt-3 px-5 pb-6 pt-7 sm:px-8 sm:pt-8">
          <div className="kartu-kop pb-4">
            <h1 className="font-heading text-2xl font-bold leading-[1.06] tracking-[-0.02em] text-heading sm:text-3xl">
              Denda Saya
            </h1>
          </div>
          <p className="entri mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs uppercase tracking-[0.08em] text-ink/70">
            <span className="flex gap-2">
              <span>Tarif</span>
              <span className="font-semibold text-ink">
                Rp{finePerDay.toLocaleString('id-ID')}/hari
              </span>
            </span>
          </p>
          <p className="mt-2 text-sm text-ink/70">
            Denda terbentuk otomatis saat pengembalian terlambat (Rp
            {finePerDay.toLocaleString('id-ID')}/hari, tarif denda_per_hari). Bayar langsung tanpa
            payment gateway.
          </p>
        </div>
      </div>

      {needLogin && (
        <div role="alert" className="kartu bg-accent-soft px-4 py-3 text-sm text-ink">
          Silakan{' '}
          <a className="font-semibold text-brand underline" href="/login?next=/denda">
            login
          </a>{' '}
          sebagai anggota untuk melihat denda Anda.
        </div>
      )}
      {error && (
        <div role="alert" className="kartu bg-accent-soft px-4 py-3 text-sm text-ink">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="kartu px-4 py-4">
          <p className="entri text-xs uppercase tracking-[0.08em] text-ink/70">Total terbuka</p>
          <p className="entri mt-1 text-xl font-bold text-ink">{fmtRp(openTotal)}</p>
        </div>
        <div className="kartu px-4 py-4">
          <p className="entri text-xs uppercase tracking-[0.08em] text-ink/70">Baris</p>
          <p className="entri mt-1 text-xl font-bold text-ink">{rows.length}</p>
          <p className="entri mt-1 text-xs text-ink/70">
            Halaman {page} / {totalPages}
          </p>
        </div>
      </div>

      <div className="kartu mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
        <label
          htmlFor="denda-status"
          className="entri text-xs uppercase tracking-[0.08em] text-ink/70"
        >
          Filter:
        </label>
        <select
          id="denda-status"
          className="entri min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-3 py-1.5 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        <label
          htmlFor="denda-method"
          className="entri text-xs uppercase tracking-[0.08em] text-ink/70"
        >
          Metode bayar:
        </label>
        <select
          id="denda-method"
          className="entri min-h-[44px] rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-3 py-1.5 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof METHOD_OPTS)[number])}
        >
          {METHOD_OPTS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-4 py-1.5 font-semibold text-ink transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Muat ulang
        </button>
      </div>

      {loading ? (
        <p className="entri text-sm text-ink/70" aria-live="polite">
          Memuat…
        </p>
      ) : rows.length === 0 ? (
        <div className="kartu px-6 py-12 text-left">
          <p className="entri text-sm uppercase tracking-[0.08em] text-ink/70">Belum ada denda</p>
          <p className="mt-2 text-sm text-ink/70">
            Kabar baik — jaga riwayat pinjaman agar tetap bersih.
          </p>
          <p>
            <Link
              href="/katalog"
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Jelajahi katalog
            </Link>
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const sisa = num(r.amount) - num(r.paid_amount);
            const open = r.status === 'unpaid' || r.status === 'partial';
            return (
              <li key={r.id} className="kartu px-5 pb-7 pt-4">
                <div className="kartu-kop flex flex-wrap items-center justify-between gap-2 pb-2">
                  <p className="entri text-xs uppercase tracking-[0.05em] text-ink/70">
                    Tagihan / Dibayar
                  </p>
                  <span className="stempel" data-state={open ? undefined : 'dipinjam'}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="entri font-semibold text-ink">
                      {fmtRp(r.amount)}{' '}
                      <span className="text-xs font-normal opacity-70">
                        dibayar {fmtRp(r.paid_amount)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-ink/70">
                      Status: <span className="font-semibold">{r.status}</span>
                      {' · '}Terbit: {new Date(r.issued_at).toLocaleDateString('id-ID')}
                      {r.paid_at && (
                        <>
                          {' · '}Lunas pada: {new Date(r.paid_at).toLocaleDateString('id-ID')}
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
                      className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-brand px-4 py-2 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {payingId === r.id ? '…' : 'Bayar'}
                    </button>
                  ) : (
                    <span className="entri text-xs text-ink/70">Lunas/dibebaskan</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="entri flex items-center gap-2 text-sm text-ink">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-3 py-1 transition hover:bg-brand-soft disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          ‹ Prev
        </button>
        <span>
          Halaman {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-3 py-1 transition hover:bg-brand-soft disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
