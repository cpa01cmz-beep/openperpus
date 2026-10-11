'use client';

import { useCallback, useEffect, useState } from 'react';
import DataTable from '@/components/admin/DataTable';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import ConfirmModal from '@/components/admin/ConfirmModal';
import FilterBar from '@/components/admin/FilterBar';
import StatCard from '@/components/admin/StatCard';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAdminList } from '@/hooks/useAdminList';
import { useFineRate } from '@/hooks/useFineRate';
import { errMsg } from '@/lib/admin-errors';
import { formatRp, num } from '@/lib/format';
import { PER_PAGE } from '@/lib/pagination';
import { isAdminRole } from '@/lib/roles';

type Payment = {
  id: string;
  amount: number | string;
  method: string;
  receipt_no: string;
  paid_at: string;
};

type Waiver = {
  id: string;
  status: string;
  reason: string;
  requested_by: string;
  approved_by: string | null;
  decided_at: string | null;
};

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
  payments?: Payment[] | null;
  fine_waivers?: Waiver[] | null;
};

const STATUS_OPTS = ['', 'unpaid', 'partial', 'paid', 'waived'];
const METHOD_OPTS = ['tunai', 'transfer', 'qris'];
const REASON_MIN = 10;

const fmtRp = formatRp;

/** Kwitansi terbaru sebuah denda (immutable, issue #72). */
function receiptNoOf(f: Fine): string | null {
  const rows = f.payments ?? [];
  return rows.length > 0 ? (rows[rows.length - 1]?.receipt_no ?? null) : null;
}

/** Pengajuan pembebasan yang masih menunggu keputusan (issue #72). */
function pendingWaiverOf(f: Fine): Waiver | null {
  return (f.fine_waivers ?? []).find((w) => w.status === 'requested') ?? null;
}

export default function DendaPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('tunai');
  const [page, setPage] = useState(1);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [tagihanTotal, setTagihanTotal] = useState(0);
  // Identitas admin pemakai: dasar segregation-of-duties pengajuan waive.
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Dialog state — dialog native (confirm/alert) dilarang, lihat #60/#72.
  const [pendingPay, setPendingPay] = useState<Fine | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<Fine | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveBusy, setWaiveBusy] = useState(false);
  const [decision, setDecision] = useState<{ waiver: Waiver; fine: Fine; approve: boolean } | null>(
    null
  );
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

  // #62: tarif denda dari satu hook pengaturan.
  const { finePerDay } = useFineRate();

  // Siapa yang login (id profil) + apakah admin — untuk aturan approver ≠ pengaju.
  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then((res) => {
        const user = res.data?.user;
        if (!user) return;
        setMyUserId(user.id);
        supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
          .then((p) => {
            const role = (p.data as { role?: string | null } | null)?.role ?? 'member';
            // Predikat admin kanonis (issue #25) — untuk aturan
            // approver ≠ pengaju di UI persetujuan pembebasan denda.
            setIsAdmin(isAdminRole(role));
          });
      });
    });
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

  // #62: satu hook daftar — termasuk memisahkan 404 (API belum tersedia).
  const list = useAdminList<Fine>({
    path: '/api/fines',
    params: {
      page: String(page),
      per_page: PER_PAGE,
      ...(status ? { status } : {}),
      ...(search ? { q: search } : {}),
    },
    noStore: true,
    errorMessage: 'Gagal memuat denda.',
  });
  const { rows, loading, missing: apiMissing, totalPages, error: listError, reload: load } = list;
  // Aksi tulis punya state sibuk masing-masing (bayar vs waive vs decision),
  // jadi tidak memakai useAdminSubmit di sini.
  const [actionError, setActionError] = useState('');
  // 404 dari aksi bayar: banner amber sendiri; dibuang saat filter berubah.
  const [payMissing, setPayMissing] = useState(false);
  // Banner 404 khusus + pesan generic hook tak ditampilkan bersamaan.
  // Pesan aksi tulis lebih baru daripada pesan pemuatan daftar.
  const error = actionError || (apiMissing ? '' : listError);

  // Total tagihan disegarkan saat filter/halaman berubah (perilaku lama:
  // ikut load()); riwayatnya diurus useAdminList.
  useEffect(() => {
    loadTotals();
  }, [loadTotals, page, status, search]);

  // Pesan aksi lama dibuang saat daftar dimuat ulang (perilaku lama: state
  // error tunggal di-clear di awal load()).
  useEffect(() => {
    setActionError('');
    setPayMissing(false);
  }, [page, status, search]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  async function confirmPay() {
    const f = pendingPay;
    if (!f) return;
    if (payingId) return;
    setPayingId(f.id);
    setActionError('');
    setPayMissing(false);
    setNotice('');
    try {
      const res = await fetch(`/api/fines/${f.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metode: method, method }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setPayMissing(true);
        setActionError('API /api/fines belum tersedia di backend.');
        return;
      }
      if (!res.ok) {
        setActionError(errMsg(json));
        return;
      }
      const payment = (json as { payment?: { receipt_no?: string | null } | null }).payment;
      const receipt = payment?.receipt_no ? ` Kwitansi: ${payment.receipt_no}` : '';
      setPendingPay(null);
      setNotice(`Pembayaran tersimpan.${receipt}`);
      load();
      loadTotals();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPayingId(null);
    }
  }

  async function submitWaive() {
    const f = waiveTarget;
    if (!f) return;
    if (waiveBusy) return;
    if (waiveReason.trim().length < REASON_MIN) {
      setActionError(`Alasan pembebasan wajib diisi minimal ${REASON_MIN} karakter.`);
      return;
    }
    setWaiveBusy(true);
    setActionError('');
    setNotice('');
    try {
      const res = await fetch(`/api/fines/${f.id}/waive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: waiveReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(errMsg(json));
        return;
      }
      setWaiveTarget(null);
      setWaiveReason('');
      setNotice('Pengajuan pembebasan terkirim — menunggu approval admin.');
      load();
    } finally {
      setWaiveBusy(false);
    }
  }

  async function submitDecision() {
    const d = decision;
    if (!d) return;
    if (decisionBusy) return;
    setDecisionBusy(true);
    setActionError('');
    setNotice('');
    try {
      const res = await fetch(`/api/fines/waivers/${d.waiver.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: d.approve, note: decisionNote.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(errMsg(json));
        return;
      }
      setDecision(null);
      setDecisionNote('');
      setNotice(d.approve ? 'Pembebasan disetujui.' : 'Pengajuan pembebasan ditolak.');
      load();
      loadTotals();
    } finally {
      setDecisionBusy(false);
    }
  }

  const lunasCount = rows.filter((r) => r.status === 'paid').length;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Denda</h1>
        <p className="text-sm text-slate-500">
          Denda terbentuk otomatis saat pengembalian terlambat (Rp
          {finePerDay.toLocaleString('id-ID')}/hari, tarif denda_per_hari; dipatok plafon denda_maks
          bila diatur). Pembayaran mencetak nomor struk; pembebasan butuh alasan + approval admin
          lain.
        </p>
      </div>

      {(apiMissing || payMissing) && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          API <code className="font-mono">/api/fines</code> belum tersedia di backend (404). Daftar
          &amp; tombol bayar menunggu worker backend. Sudah dilaporkan ke mandor.
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
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
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

      <FilterBar
        search={{
          id: 'denda-search',
          label: 'Cari denda',
          placeholder: 'Cari kode anggota…',
          value: search,
          onChange: (v) => {
            setPage(1);
            setSearch(v);
          },
        }}
        onReload={load}
        actions={
          <ExportCsvButton
            filename="denda.csv"
            scope="fines"
            headers={['ID', 'Anggota', 'Tagihan', 'Dibayar', 'Status', 'No. struk', 'Terbit']}
            rows={rows.map((r) => [
              r.id,
              r.members?.member_code ?? '',
              num(r.amount),
              num(r.paid_amount),
              r.status,
              receiptNoOf(r) ?? '',
              r.issued_at,
            ])}
          />
        }
      >
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
      </FilterBar>

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
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'receipt',
              header: 'No. struk',
              render: (r) => {
                const no = receiptNoOf(r);
                return no ? (
                  <span className="font-mono text-xs text-slate-600">{no}</span>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                );
              },
            },
            {
              key: 'issued_at',
              header: 'Terbit',
              render: (r) => new Date(r.issued_at).toLocaleDateString('id-ID'),
            },
            {
              key: 'aksi',
              header: 'Aksi',
              render: (r) => {
                const open = r.status === 'unpaid' || r.status === 'partial';
                if (!open) return <span className="text-xs text-slate-400">-</span>;
                const pending = pendingWaiverOf(r);
                if (pending) {
                  const canDecide = isAdmin && pending.requested_by !== myUserId;
                  return (
                    <span className="grid gap-1">
                      <span className="text-xs font-semibold text-amber-700">
                        Menunggu approval pembebasan
                      </span>
                      {canDecide ? (
                        <span className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              setDecisionNote('');
                              setDecision({ waiver: pending, fine: r, approve: true });
                            }}
                            aria-label={`Setujui pembebasan denda anggota ${r.members?.member_code ?? r.id}`}
                            className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Setujui
                          </button>
                          <button
                            type="button"
                            disabled={decisionBusy}
                            onClick={() => {
                              setDecisionNote('');
                              setDecision({ waiver: pending, fine: r, approve: false });
                            }}
                            aria-label={`Tolak pembebasan denda anggota ${r.members?.member_code ?? r.id}`}
                            className="inline-flex min-h-[44px] items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Tolak
                          </button>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">butuh admin lain</span>
                      )}
                    </span>
                  );
                }
                return (
                  <span className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={payingId === r.id}
                      onClick={() => {
                        setActionError('');
                        setNotice('');
                        setPendingPay(r);
                      }}
                      aria-label={`Bayar denda anggota ${r.members?.member_code ?? r.id}`}
                      className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {payingId === r.id ? '…' : 'Bayar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError('');
                        setNotice('');
                        setWaiveReason('');
                        setWaiveTarget(r);
                      }}
                      aria-label={`Ajukan pembebasan denda anggota ${r.members?.member_code ?? r.id}`}
                      className="inline-flex min-h-[44px] items-center rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      Bebaskan
                    </button>
                  </span>
                );
              },
            },
          ]}
          rows={rows}
          getRowKey={(r) => r.id}
          emptyState={{
            title: 'Belum ada denda',
            description: search
              ? `Tidak ada denda yang cocok dengan "${search}". Coba kata kunci lain.`
              : 'Denda muncul otomatis saat ada pengembalian terlambat.',
          }}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmModal
        open={pendingPay !== null}
        onClose={() => setPendingPay(null)}
        onConfirm={() => void confirmPay()}
        title="Tandai lunas"
        description="Pembayaran langsung tercatat lunas penuh; kwitansi bisa dicetak dari riwayat."
        confirmLabel="Ya, bayar"
        loading={payingId !== null}
      >
        <div className="grid gap-3">
          <p>
            Tandai lunas denda{' '}
            <strong>
              {fmtRp(pendingPay ? num(pendingPay.amount) - num(pendingPay.paid_amount) : 0)}
            </strong>{' '}
            ({pendingPay?.members?.member_code ?? '?'})?
          </p>
          <div className="grid gap-1">
            <label htmlFor="pay-method-modal" className="text-sm font-semibold text-slate-700">
              Metode bayar
            </label>
            <select
              id="pay-method-modal"
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
        </div>
      </ConfirmModal>

      <Modal
        open={waiveTarget !== null}
        onClose={() => setWaiveTarget(null)}
        title="Bebaskan denda"
        description="Pengajuan pembebasan wajib berisi alasan dan disetujui admin lain."
        footer={
          <>
            <button
              type="button"
              onClick={() => setWaiveTarget(null)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={waiveBusy || waiveReason.trim().length < REASON_MIN}
              onClick={() => void submitWaive()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
            >
              {waiveBusy ? 'Mengirim…' : 'Ajukan pembebasan'}
            </button>
          </>
        }
      >
        {waiveTarget && (
          <div className="grid gap-2">
            <p>
              Ajukan pembebasan denda {fmtRp(waiveTarget.amount)} untuk anggota{' '}
              {waiveTarget.members?.member_code ?? '?'}.
            </p>
            <label htmlFor="waive-reason" className="text-sm font-semibold text-slate-700">
              Alasan pembebasan (minimal {REASON_MIN} karakter)
            </label>
            <textarea
              id="waive-reason"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              rows={3}
              className="min-h-[44px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              placeholder="mis. salah input tarif saat pengembalian…"
            />
            <p className="text-xs text-slate-500">
              Pengajuan tercatat dengan nama Anda; keputusan diambil admin yang berbeda.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision?.approve ? 'Setujui pembebasan' : 'Tolak pembebasan'}
        description="Keputusan tercatat beserta pengaju dan approver."
        footer={
          <>
            <button
              type="button"
              onClick={() => setDecision(null)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={decisionBusy}
              onClick={() => void submitDecision()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
            >
              {decisionBusy ? 'Memproses…' : decision?.approve ? 'Setujui' : 'Tolak'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="grid gap-2">
            <p>
              Alasan pengajuan: <span className="font-semibold">{decision.waiver.reason}</span>
            </p>
            <label htmlFor="decision-note" className="text-sm font-semibold text-slate-700">
              Catatan keputusan (opsional)
            </label>
            <textarea
              id="decision-note"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              rows={2}
              className="min-h-[44px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
