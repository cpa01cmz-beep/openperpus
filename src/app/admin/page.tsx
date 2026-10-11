import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcFine, FINE_PER_DAY } from '@/lib/finecalc';
import { formatRp, num } from '@/lib/format';
import { effectiveLoanStatus } from '@/lib/loans-overdue';
import StatCard from '@/components/admin/StatCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Zero-fill 7 slot chart saat RPC gagal/v1-lengkap — bar tetap ada, bukan blank.
// Hari UTC agar konsisten dengan bucket SQL (UTC) bila TZ runtime non-UTC.
function seedWeekDays(): { label: string; count: number }[] {
  const out: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({
      label: d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }),
      count: 0,
    });
  }
  return out;
}

export default async function AdminDashboard() {
  const supabase = createClient();
  const now = new Date();

  // #58: 3 query (dari ~8 RTT) — 1 RPC get_dashboard_stats (counts + chart +
  // tarif denda + tagihan terbuka) + 2 list terbatas top-8.
  // Fallback bucket limit-500 dihapus; chart datang dari RPC (sargable).
  const [
    { data: statsData, error: statsError },
    { data: recent, error: recentError },
    { data: overdueQueue, error: overdueError },
  ] = await Promise.all([
    supabase.rpc('get_dashboard_stats', { p_days: 7 }),
    supabase
      .from('loans')
      .select('id,borrowed_at,due_at,status,fine_amount,members(id,member_code),books(title)')
      .order('borrowed_at', { ascending: false })
      .limit(8),
    supabase
      .from('loans')
      .select('id,due_at,status,fine_amount,members(id,member_code),books(title)')
      .in('status', ['borrowed', 'overdue'])
      .lt('due_at', now.toISOString())
      .order('due_at', { ascending: true })
      .limit(8),
  ]);

  type StatsRow = {
    total_books: number | string | null;
    total_members: number | string | null;
    active_loans: number | string | null;
    overdue_count: number | string | null;
    loans_per_day: { day: string; total: number | string }[] | null;
    fine_per_day: number | string | null;
    fines_open: number | string | null;
  };
  const stats = ((Array.isArray(statsData) ? statsData[0] : statsData) ?? null) as StatsRow | null;

  // Kegagalan RPC jangan senyap (review #58): log + chart zero-fill 7 hari.
  // List query error juga jangan senyap: bedakan antrean kosong vs query gagal.
  if (statsError || !stats) {
    console.error('[dashboard] get_dashboard_stats gagal', statsError?.message ?? 'data kosong');
  } else if (!('fines_open' in stats)) {
    // Guard deploy: signature v1 = migrasi 0025 belum diterapkan (lihat PR body).
    console.error('[dashboard] get_dashboard_stats v1 — jalankan migrasi 0025 sebelum deploy app');
  }
  if (recentError) {
    console.error('[dashboard] recent loans gagal', recentError.message);
  }
  if (overdueError) {
    console.error('[dashboard] overdue queue gagal', overdueError.message);
  }

  const totalBooks = num(stats?.total_books);
  const totalMembers = num(stats?.total_members);
  const dipinjam = num(stats?.active_loans);
  const terlambat = num(stats?.overdue_count);
  const fineRateRaw = num(stats?.fine_per_day, 0);
  const fineRate = fineRateRaw || FINE_PER_DAY;
  if (!fineRateRaw) {
    console.warn('[dashboard] fine_per_day tidak tersedia — fallback FINE_PER_DAY', fineRate);
  }
  // Guard deploy: tagihan terbuka hanya bila kolom RPC v2 benar-benar ada.
  const finesOpen = stats && 'fines_open' in stats ? num(stats.fines_open) : null;

  const perDay = stats?.loans_per_day ?? [];
  const days = perDay.length
    ? perDay.map((d) => ({
        // Bucket SQL hari UTC — label eksplisit UTC agar tak geser sehari bila TZ runtime non-UTC.
        label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('id-ID', {
          weekday: 'short',
          timeZone: 'UTC',
        }),
        count: Number(d.total),
      }))
    : seedWeekDays();
  const max = Math.max(1, ...days.map((d) => d.count));

  type OverdueRow = {
    id: string;
    due_at: string;
    fine_amount: number;
    members: { member_code: string } | { member_code: string }[] | null;
    books: { title: string } | { title: string }[] | null;
  };
  const overdue = (overdueQueue ?? []) as OverdueRow[];

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Buku" value={totalBooks ?? 0} hint="Judul aktif" />
        <StatCard label="Anggota" value={totalMembers ?? 0} hint="Terdaftar" />
        <StatCard label="Dipinjam" value={dipinjam} hint="borrowed/overdue berjalan" />
        <StatCard
          label="Terlambat"
          value={terlambat}
          hint={`Denda ${formatRp(fineRate)}/hari${
            finesOpen === null ? '' : ` · tagihan terbuka ${formatRp(finesOpen)}`
          }`}
        />
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
            const preview = calcFine(due, now, fineRate);
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
                  {formatRp(preview)}
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
                  className="w-full flex-1 rounded-t bg-slate-900"
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
                due_at: string;
                members: { member_code: string } | { member_code: string }[] | null;
                books: { title: string } | { title: string }[] | null;
              }) => {
                // Definisi tunggal (issue #57): terlambat = turunan, bukan kolom.
                const eff = effectiveLoanStatus(r);
                return (
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
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        eff === 'borrowed' || eff === 'overdue'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {eff}
                    </span>
                  </li>
                );
              }
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
