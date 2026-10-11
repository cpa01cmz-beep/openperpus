'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import nextDynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import DataTable, { type SortDir } from '@/components/admin/DataTable';
import DunningButton from '@/components/admin/DunningButton';
import ExportCsvButton from '@/components/admin/ExportCsvButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { useAdminList } from '@/hooks/useAdminList';
import { useAdminSubmit } from '@/hooks/useAdminSubmit';
import { useFineRate } from '@/hooks/useFineRate';
import { errMsg } from '@/lib/admin-errors';
import { formatRp } from '@/lib/format';
import { PER_PAGE } from '@/lib/pagination';
import { effectiveLoanStatus } from '@/lib/loans-overdue';

const LoanForm = nextDynamic(() => import('@/components/admin/LoanForm'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Memuat formulir…</p>,
});

type Loan = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  fine_amount: number;
  is_overdue?: boolean;
  effective_status?: string;
  members: { member_code: string } | null;
  books: { title: string } | null;
};

/** Status tunggal untuk tampilan: kolom status + turunan terlambat (issue #57). */
function statusOf(loan: Loan): string {
  return loan.effective_status ?? effectiveLoanStatus(loan);
}

/** Isu #62: satu hook daftar, satu hook tarif/pengaturan, satu hook aksi tulis. */
function PeminjamanInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('');
  // ?overdue=1 diteruskan dari antrean terlambat di dashboard.
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get('overdue') === '1');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);
  const [pendingExtend, setPendingExtend] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('7');
  const [notice, setNotice] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [returnKondisi, setReturnKondisi] = useState('baik');
  const [members, setMembers] = useState<
    {
      id: string;
      label: string;
      sub?: string;
      fines_total?: number;
      active_loans?: number;
      overdue_loans?: number;
    }[]
  >([]);
  const [books, setBooks] = useState<{ id: string; label: string; stock?: number }[]>([]);
  const optionsLoaded = useRef(false);

  // Isu #74: kebijakan pinjam dari settings (bukan angka mati di kode) —
  // kini lewat satu hook bersama, bukan salinan fetch('/api/settings').
  const {
    finePerDay,
    loanDays,
    maxExtensions,
    replacementFees,
    notice: fineNotice,
  } = useFineRate();

  // Isu #62: satu hook daftar — fetch, pagination, dan penanganan 401/403
  // (bukan petugas) tak ditulis ulang per halaman.
  const list = useAdminList<Loan>({
    path: '/api/loans',
    params: {
      page: String(page),
      ...(overdueOnly ? { overdue: '1' } : status ? { status } : {}),
      ...(sortKey ? { sort: sortKey, order: sortDir } : {}),
    },
    errorMessage: 'Gagal memuat peminjaman.',
  });
  // Aksi tulis (kembalikan/perpanjang) berbagi pesan error dengan daftar.
  const {
    error: actionError,
    run: submitAction,
    busy,
    clearError: clearActionError,
  } = useAdminSubmit();
  const { rows: loans, totalPages, denied, reload: load, clearError } = list;
  // Pesan aksi tulis lebih baru daripada pesan pemuatan daftar, jadi ia yang
  // ditampilkan lebih dulu (dulu satu state, selalu ditimpa yang terbaru).
  const error = actionError || list.error;

  // Daftar dimuat ulang karena filter/halaman berubah -> pesan aksi lama
  // dibuang, seperti perilaku load() lama.
  useEffect(() => {
    clearActionError();
  }, [clearActionError, page, status, overdueOnly, sortKey, sortDir]);

  // Gagal -> optionsLoaded TIDAK diset (retry oleh "Muat ulang"/force berikutnya).
  const loadOptions = useCallback(async (force = false) => {
    if (optionsLoaded.current && !force) return;
    try {
      const [mr, br] = await Promise.all([
        fetch(`/api/members?per_page=${PER_PAGE}`),
        fetch(`/api/books?per_page=${PER_PAGE}`),
      ]);
      const m = (await mr.json().catch(() => ({}))) as {
        data?: {
          id: string;
          member_code: string;
          profiles?: { full_name: string };
          fines_total?: number;
          active_loans?: number;
          overdue_loans?: number;
        }[];
      };
      const b = (await br.json().catch(() => ({}))) as {
        data?: { id: string; title: string; stock_available: number }[];
      };
      if (!mr.ok) throw new Error(errMsg(m, 'Gagal memuat opsi anggota.'));
      if (!br.ok) throw new Error(errMsg(b, 'Gagal memuat opsi buku.'));
      setMembers(
        (m.data ?? []).map(
          (x: {
            id: string;
            member_code: string;
            profiles?: { full_name: string };
            fines_total?: number;
            active_loans?: number;
            overdue_loans?: number;
          }) => ({
            id: x.id,
            label: x.profiles?.full_name ?? x.member_code,
            sub: x.member_code,
            // Isu #56: agregat kelayakan checkout untuk gate pra-submit LoanForm.
            fines_total: Number(x.fines_total ?? 0),
            active_loans: Number(x.active_loans ?? 0),
            overdue_loans: Number(x.overdue_loans ?? 0),
          })
        )
      );
      setBooks(
        (b.data ?? []).map((x: { id: string; title: string; stock_available: number }) => ({
          id: x.id,
          label: x.title,
          stock: x.stock_available,
        }))
      );
      setOptionsError('');
      optionsLoaded.current = true;
    } catch (e) {
      setOptionsError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  async function onReturn(id: string) {
    setReturnKondisi('baik');
    setPendingReturn(id);
  }

  async function onExtend(id: string) {
    setExtendDays('7');
    setPendingExtend(id);
  }

  function toggleSort(key: string) {
    setSortDir((prev) => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
    setSortKey(key);
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === loans.length ? new Set() : new Set(loans.map((r) => r.id))
    );
  }

  async function confirmReturn() {
    const id = pendingReturn;
    if (!id) return;
    setPendingReturn(null);
    clearError();
    await submitAction(async () => {
      // Isu #74: kondisi buku dikirim eksplisit (baik|rusak|hilang).
      // rusak/hilang mengurangi stok buku + menambah denda ganti rugi.
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return', kondisi: returnKondisi }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { fine_amount?: number } | null;
      };
      if (!res.ok) {
        throw new Error(errMsg(json, 'Gagal memproses pengembalian.'));
      }
      const kondisiLabel =
        returnKondisi === 'baik' ? 'baik' : returnKondisi === 'rusak' ? 'rusak' : 'hilang';
      setNotice(
        `Dikembalikan (kondisi: ${kondisiLabel}). Denda: ${formatRp(json.data?.fine_amount ?? 0)}`
      );
      void Promise.all([load(), loadOptions(true)]);
    });
  }

  async function confirmExtend() {
    const id = pendingExtend;
    if (!id) return;
    setPendingExtend(null);
    clearError();
    await submitAction(async () => {
      const days = Number(extendDays);
      const res = await fetch(`/api/loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend', days }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { due_at?: string; extension_count?: number } | null;
      };
      if (!res.ok) {
        throw new Error(errMsg(json, 'Gagal memproses perpanjangan.'));
      }
      const due = json.data?.due_at ? new Date(json.data.due_at).toLocaleDateString('id-ID') : '-';
      // Isu #74: hitungan perpanjangan kini milik kolom loans.extend_count.
      const used = Number(json.data?.extension_count);
      const usedLabel = Number.isFinite(used) && used > 0 ? ` (perpanjangan ke-${used})` : '';
      setNotice(
        `Diperpanjang ${Number.isFinite(days) ? days : '?'} hari. Tempo baru: ${due}.${usedLabel}`
      );
      void Promise.all([load(), loadOptions(true)]);
    });
  }

  return (
    <div className="grid gap-6">
      <Modal
        open={pendingReturn !== null}
        onClose={() => setPendingReturn(null)}
        title="Proses pengembalian"
        description={`Denda dihitung otomatis Rp${finePerDay.toLocaleString('id-ID')}/hari telat (tarif denda_per_hari).`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingReturn(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void confirmReturn()}
            >
              Ya, kembalikan
            </Button>
          </>
        }
      >
        <p>Proses pengembalian buku ini?</p>
        {/* Isu #74: kondisi buku dipilih sebelum submit — 'baik' default
            (perilaku lama), rusak/hilang mengurangi stok buku dan menagih
            biaya ganti rugi dari pengaturan. */}
        <fieldset className="grid gap-1">
          <legend className="text-sm font-semibold text-slate-700">Kondisi buku</legend>
          {[
            { value: 'baik', label: 'Baik — stok kembali tersedia' },
            {
              value: 'rusak',
              label: `Rusak — stok berkurang${
                replacementFees.rusak > 0
                  ? ` + denda ganti rugi Rp${replacementFees.rusak.toLocaleString('id-ID')}`
                  : ''
              }`,
            },
            {
              value: 'hilang',
              label: `Hilang — stok berkurang${
                replacementFees.hilang > 0
                  ? ` + denda ganti rugi Rp${replacementFees.hilang.toLocaleString('id-ID')}`
                  : ''
              }`,
            },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="return-kondisi"
                value={opt.value}
                checked={returnKondisi === opt.value}
                onChange={() => setReturnKondisi(opt.value)}
                className="h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
        {returnKondisi !== 'baik' && (
          <p className="text-sm text-amber-700">
            Konfirmasi: buku {returnKondisi === 'hilang' ? 'hilang' : 'rusak'} tidak kembali
            tersedia dipinjam dan anggota dikenai biaya ganti rugi bila diatur di Pengaturan.
          </p>
        )}
      </Modal>
      <Modal
        open={pendingExtend !== null}
        onClose={() => setPendingExtend(null)}
        title="Perpanjang pinjaman"
        description={`Tempo mundur sejauh jumlah hari yang dipilih (maksimal ${maxExtensions} kali per pinjaman).`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingExtend(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void confirmExtend()}
            >
              Ya, perpanjang
            </Button>
          </>
        }
      >
        <div className="grid gap-1">
          <label htmlFor="extend-days" className="text-sm font-semibold text-slate-700">
            Lama perpanjangan (hari)
          </label>
          <select
            id="extend-days"
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={extendDays}
            onChange={(e) => setExtendDays(e.target.value)}
          >
            {['3', '7', '14', '30'].map((d) => (
              <option key={d} value={d}>
                {d} hari
              </option>
            ))}
          </select>
        </div>
      </Modal>
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      <h1 className="text-2xl font-bold">Peminjaman</h1>
      {denied && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Akses ditolak (401/403). Silakan login sebagai petugas untuk menagih dan memproses
          pengembalian.
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
      {optionsError && (
        <p role="alert" className="text-sm text-red-600">
          {optionsError} Opsi anggota/buku mungkin kosong — klik &quot;Muat ulang&quot; untuk
          mencoba lagi.
        </p>
      )}
      {fineNotice && (
        <p role="alert" className="text-sm text-red-600">
          {fineNotice}
        </p>
      )}
      <LoanForm members={members} books={books} loanDays={loanDays} />
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <div className="grid gap-1">
          <label htmlFor="peminjaman-status" className="text-sm font-semibold text-slate-700">
            Filter status
          </label>
          <select
            id="peminjaman-status"
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOverdueOnly(false);
            }}
            disabled={overdueOnly}
          >
            <option value="">Semua</option>
            <option value="borrowed">borrowed</option>
            <option value="returned">returned</option>
            <option value="lost">lost</option>
          </select>
        </div>
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
          title="Terlambat = pinjaman berjalan yang melewati jatuh tempo (definisi tunggal, sama dengan status overdue di API)"
          className={`inline-flex min-h-[44px] items-center justify-center rounded-md border px-3 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${overdueOnly ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand'}`}
        >
          Terlambat saja
        </button>
        <button
          type="button"
          onClick={() => {
            void Promise.all([load(), loadOptions(true)]);
          }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Muat ulang
        </button>
        <ExportCsvButton
          filename="peminjaman.csv"
          headers={['ID', 'Anggota', 'Buku', 'Pinjam', 'Tempo', 'Status', 'Denda']}
          rows={loans.map((r) => [
            r.id,
            r.members?.member_code ?? '',
            r.books?.title ?? '',
            r.borrowed_at,
            r.due_at,
            statusOf(r),
            r.fine_amount,
          ])}
        />
      </div>
      <DataTable<Loan>
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        selectedKeys={selected}
        onToggleRow={toggleSelect}
        onToggleAll={toggleAll}
        bulkLabel={(k) => `Pilih pinjaman ${k}`}
        columns={[
          {
            key: 'peminjam',
            header: 'Peminjam/Buku',
            render: (r) => (
              <span>
                <strong>{r.members?.member_code}</strong>
                <br />
                <span className="text-slate-500">{r.books?.title}</span>
              </span>
            ),
          },
          {
            key: 'due_at',
            header: 'Pinjam → Tempo',
            sortable: true,
            render: (r) => (
              <span>
                {new Date(r.borrowed_at).toLocaleDateString('id-ID')}
                <br />→ {new Date(r.due_at).toLocaleDateString('id-ID')}
                {statusOf(r) === 'overdue' && (
                  <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700">telat</span>
                )}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (r) => statusOf(r),
          },
          { key: 'fine_amount', header: 'Denda', render: (r) => formatRp(r.fine_amount) },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => {
              const eff = statusOf(r);
              return eff === 'borrowed' || eff === 'overdue' ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onReturn(r.id)}
                    disabled={denied}
                    aria-label={`Kembalikan pinjaman ${r.members?.member_code ?? r.id}`}
                    className="inline-flex min-h-[44px] items-center rounded bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Kembalikan
                  </button>
                  <button
                    type="button"
                    onClick={() => onExtend(r.id)}
                    disabled={denied}
                    aria-label={`Perpanjang pinjaman ${r.members?.member_code ?? r.id}`}
                    className="inline-flex min-h-[44px] items-center rounded border border-brand px-3 text-xs font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Perpanjang
                  </button>
                  {eff === 'overdue' && (
                    <DunningButton
                      loanId={r.id}
                      memberCode={r.members?.member_code ?? '-'}
                      title={r.books?.title ?? '-'}
                      dueAt={r.due_at}
                      fine={r.fine_amount}
                      disabled={denied}
                    />
                  )}
                </span>
              ) : (
                <span className="text-xs text-slate-400">-</span>
              );
            },
          },
        ]}
        rows={loans}
        getRowKey={(r) => r.id}
        emptyText="Belum ada peminjaman."
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

/** useSearchParams butuh batas Suspense (pola sama dengan halaman login). */
export default function PeminjamanPage() {
  return (
    <Suspense fallback={null}>
      <PeminjamanInner />
    </Suspense>
  );
}
