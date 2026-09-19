'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import nextDynamic from 'next/dynamic';
import DataTable, { type SortDir } from '@/components/admin/DataTable';
import DunningButton from '@/components/admin/DunningButton';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';

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
  members: { member_code: string } | null;
  books: { title: string } | null;
};

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function PeminjamanPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [books, setBooks] = useState<{ id: string; label: string; stock?: number }[]>([]);
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const optionsLoaded = useRef(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('overdue') === '1') setOverdueOnly(true);
    } catch {
      /* abaikan */
    }
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams({
      page: String(page),
      per_page: '10',
      ...(overdueOnly ? { overdue: '1' } : status ? { status } : {}),
      ...(sortKey ? { sort: sortKey, order: sortDir } : {}),
    });
    const res = await fetch(`/api/loans?${q}`);
    if (res.status === 401 || res.status === 403) {
      setDenied(true);
      setLoans([]);
      return;
    }
    setDenied(false);
    const json = (await res.json()) as {
      data?: Loan[];
      pagination?: { totalPages?: number };
      meta?: { totalPages?: number };
    };
    if (!res.ok) return;
    setLoans(json.data ?? []);
    setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
  }, [status, overdueOnly, page, sortKey, sortDir]);

  const loadOptions = useCallback(async (force = false) => {
    if (optionsLoaded.current && !force) return;
    const [m, b] = (await Promise.all([
      fetch('/api/members?per_page=20')
        .then((r) => r.json())
        .catch(() => ({})),
      fetch('/api/books?per_page=20')
        .then((r) => r.json())
        .catch(() => ({})),
    ])) as [
      { data?: { id: string; member_code: string; profiles?: { full_name: string } }[] },
      { data?: { id: string; title: string; stock_available: number }[] },
    ];
    setMembers(
      (m.data ?? []).map(
        (x: { id: string; member_code: string; profiles?: { full_name: string } }) => ({
          id: x.id,
          label: x.profiles?.full_name ?? x.member_code,
          sub: x.member_code,
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
    optionsLoaded.current = true;
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  async function onReturn(id: string) {
    setPendingReturn(id);
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
    const res = await fetch(`/api/loans?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'return' }),
    });
    const json = (await res.json()) as { data?: { fine_amount?: number } | null };
    if (!res.ok) {
      setNotice(errMsg(json));
      return;
    }
    setNotice(`Dikembalikan. Denda: Rp${(json.data?.fine_amount ?? 0).toLocaleString('id-ID')}`);
    void Promise.all([load(), loadOptions(true)]);
  }

  const fmtRp = (n: number) => `Rp${(n ?? 0).toLocaleString('id-ID')}`;

  return (
    <div className="grid gap-6">
      <Modal
        open={pendingReturn !== null}
        onClose={() => setPendingReturn(null)}
        title="Proses pengembalian"
        description="Denda dihitung otomatis Rp1.000/hari telat."
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
            <Button type="button" size="sm" onClick={() => void confirmReturn()}>
              Ya, kembalikan
            </Button>
          </>
        }
      >
        <p>Proses pengembalian buku ini?</p>
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
      <LoanForm members={members} books={books} />
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
            <option value="overdue">overdue</option>
            <option value="returned">returned</option>
            <option value="lost">lost</option>
          </select>
        </div>
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
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
                {r.is_overdue && (
                  <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700">telat</span>
                )}
              </span>
            ),
          },
          { key: 'status', header: 'Status', sortable: true, render: (r) => r.status },
          { key: 'fine_amount', header: 'Denda', render: (r) => fmtRp(r.fine_amount) },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) =>
              r.status === 'borrowed' || r.status === 'overdue' ? (
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
                  {r.is_overdue && (
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
              ),
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
