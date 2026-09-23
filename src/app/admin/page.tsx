import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import StatCard from '@/components/admin/StatCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboard() {
  const supabase = createClient();

  const { data: stats, error: statsError } = await supabase.rpc('get_dashboard_stats', {
    p_days: 7,
  });
  if (statsError) {
    console.error('get_dashboard_stats failed:', statsError.message);
  }

  const {
    total_books = 0,
    total_members = 0,
    active_loans = 0,
    overdue_count = 0,
    loans_per_day = [],
  } = (stats?.[0] ?? {}) as {
    total_books: number;
    total_members: number;
    active_loans: number;
    overdue_count: number;
    loans_per_day: { day: string; total: number }[];
  };

  const now = new Date();

  const days = (loans_per_day ?? []).map((d) => ({
    label: new Date(d.day).toLocaleDateString('id-ID', { weekday: 'short' }),
    count: Number(d.total),
  }));
  const max = Math.max(1, ...days.map((d) => d.count));

  const [{ data: recent }, { data: overdueQueue }] = await Promise.all([
    supabase
      .from('loans')
      .select('id,borrowed_at,due_at,status,fine_amount,members(id,member_code),books(title)')
      .order('borrowed_at', { ascending: false })
      .limit(8),
    supabase
      .from('loans')
      .select('id,due_at,status,fine_amount,members(id,member_code),books(title)')
      .in('status', ['borrowed', 'overdue'])
      .lt('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(8),
  ]);

  type OverdueRow = {
    id: string;
    due_at: string;
    fine_amount: number;
    members: { member_code: string } | { member_code: string }[] | null;
    books: { title: string } | { title: string }[] | null;
  };
  const overdue = (overdueQueue ?? []) as OverdueRow[];
  const fmtRp = (n: number) => `Rp${(n ?? 0).toLocaleString('id-ID')}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Buku" value={total_books} hint="Judul terdaftar" />
        <StatCard label="Anggota" value={total_members} hint="Terdaftar" />
        <StatCard label="Dipinjam" value={active_loans} hint="borrowed/overdue berjalan" />
        <StatCard label="Terlambat" value={overdue_count} hint="Denda Rp1.000/hari" />
      </div>

      <section className="rounded-2xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Perlu dikembalikan (terlambat)</h2>
          <Link
            href="/admin/peminjaman?overdue=1"
            className="text-sm font-medium text-slate-700 underline"
          >
            Lihat antrean
          </Link>
        </div>
        <ul className="grid gap-2 text-sm">
          {overdue.length === 0 && <li className="text-slate-500">Belum ada keterlambatan.</li>}
          {overdue.map((o) => {
            const due = new Date(o.due_at);
            const lateDays = Math.max(
              0,
              Math.floor((now.getTime() - new Date(due).setHours(0, 0, 0, 0)) / 86400000)
            );
            const preview = lateDays * 1000;
            return (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2"
              >
                <span className="truncate">
                  {(Array.isArray(o.members)
                    ? o.members[0]?.member_code
                    : o.members?.member_code) ?? '?'}{' '}
                  → {(Array.isArray(o.books) ? o.books[0]?.title : o.books?.title) ?? '?'}
                  <span className="ml-1 text-xs text-red-700">telat {lateDays} hari</span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">
                  {fmtRp(preview)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 font-semibold">Peminjaman 7 hari terakhir</h2>
          <div className="flex h-32 items-end gap-2">
            {days.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-slate-900"
                  style={{ height: `${Math.max(4, (d.count / max) * 100)}px` }}
                  title={`${d.count} pinjam`}
                />
                <span className="text-xs text-slate-500">{d.label}</span>
                <span className="text-xs font-semibold tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 font-semibold">Aktivitas terbaru</h2>
          <ul className="grid gap-2 text-sm">
            {(recent ?? []).length === 0 && (
              <li className="text-slate-500">Belum ada aktivitas.</li>
            )}
            {(recent ?? []).map(
              (r: {
                id: string;
                status: string;
                members: { member_code: string } | { member_code: string }[] | null;
                books: { title: string } | { title: string }[] | null;
              }) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="truncate">
                    {(Array.isArray(r.members)
                      ? r.members[0]?.member_code
                      : r.members?.member_code) ?? '?'}{' '}
                    → {(Array.isArray(r.books) ? r.books[0]?.title : r.books?.title) ?? '?'}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r.status === 'borrowed' || r.status === 'overdue' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}
                  >
                    {r.status}
                  </span>
                </li>
              )
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
