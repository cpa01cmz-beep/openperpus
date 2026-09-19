'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import DataTable from '@/components/admin/DataTable';
import Modal from '@/components/ui/Modal';

const LoanForm = dynamic(() => import('@/components/admin/LoanForm'), {
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
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      per_page: '20',
      ...(overdueOnly ? { overdue: '1' } : status ? { status } : {}),
    });
    const res = await fetch(`/api/loans?${q}`);
    const json = (await res.json()) as { data?: Loan[] };
    if (!res.ok) return;
    const rows = json.data ?? [];
    if (overdueOnly) {
      rows.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    }
    setLoans(rows);
  }, [status, overdueOnly]);

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
            <button
              type="button"
              onClick={() => setPendingReturn(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void confirmReturn()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
            >
              Ya, kembalikan
            </button>
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
      <LoanForm members={members} books={books} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>Filter:</label>
        <select
          className="rounded-lg border px-3 py-1.5"
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
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 ${overdueOnly ? "border-red-300 bg-red-50 text-red-700" : ""}`}
        >
          Terlambat saja
        </button>
        <button
          onClick={() => {
            void Promise.all([load(), loadOptions(true)]);
          }}
          className="rounded-lg border px-3 py-1.5"
        >
          Muat ulang
        </button>
      </div>
      <DataTable<Loan>
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
          { key: 'status', header: 'Status', render: (r) => r.status },
          { key: 'fine_amount', header: 'Denda', render: (r) => fmtRp(r.fine_amount) },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) =>
              r.status === 'borrowed' || r.status === 'overdue' ? (
                <button
                  onClick={() => onReturn(r.id)}
                  className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
                >
                  Kembalikan
                </button>
              ) : (
                <span className="text-xs text-slate-400">-</span>
              ),
          },
        ]}
        rows={loans}
        getRowKey={(r) => r.id}
        emptyText="Belum ada peminjaman."
      />
    </div>
  );
}
