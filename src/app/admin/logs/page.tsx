import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LogsTable from '@/components/admin/LogsTable';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PER_PAGE = 20;

type Log = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams?: { page?: string; action?: string; entity?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };
  const role = (profile as { role?: string } | null)?.role;

  if (role !== 'admin') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-bold">Log Aktivitas</h1>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700"
        >
          Akses ditolak — halaman ini khusus <strong>admin</strong>. Peran Anda:{' '}
          {role ?? 'tidak diketahui'}.
          <br />
          <Link href="/admin" className="mt-2 inline-block underline">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  const actionFilter = (searchParams?.action ?? '').trim();
  const entityFilter = (searchParams?.entity ?? '').trim();

  let query = supabase
    .from('activity_logs')
    .select('id,action,entity_type,entity_id,user_id,metadata,created_at', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (actionFilter) query = query.eq('action', actionFilter);
  if (entityFilter) query = query.eq('entity_type', entityFilter);

  const { data, count, error } = await query.range(from, to);

  const rows = (data ?? []) as Log[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const qs = (p: number) => {
    const sp = new URLSearchParams({ page: String(p) });
    if (actionFilter) sp.set('action', actionFilter);
    if (entityFilter) sp.set('entity', entityFilter);
    return `/admin/logs?${sp}`;
  };

  const ACTIONS = [
    '',
    'books.create',
    'books.update',
    'books.delete',
    'members.create',
    'members.update',
    'members.delete',
    'loans.create',
    'loans.return',
    'loans.delete',
    'fines.create',
    'fines.pay',
    'reservations.create',
    'reservations.ready',
    'reservations.completed',
    'reservations.cancelled',
    'reservations.expired',
    'reservations.update',
    'reservations.delete',
    'categories.create',
    'categories.update',
    'categories.delete',
    'racks.create',
    'racks.update',
    'racks.delete',
    'menus.create',
    'menus.update',
    'menus.delete',
    'loans.create',
    'loans.return',
    'loans.delete',
    'fines.pay',
    'reservations.create',
    'reservations.delete',
    'banners.create',
    'banners.update',
    'banners.delete',
    'articles.create',
    'articles.update',
    'articles.delete',
    'settings.update',
  ];
  const ENTITIES = [
    '',
    'books',
    'members',
    'loans',
    'fines',
    'reservations',
    'categories',
    'racks',
    'menus',
    'banners',
    'articles',
    'settings',
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Log Aktivitas</h1>
        <p className="text-sm text-slate-500">
          Jejak audit read-only (tabel <code className="font-mono">activity_logs</code>), khusus
          admin. Total {count ?? 0} baris.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Gagal memuat log: {error.message}
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <div className="grid gap-1">
          <label htmlFor="log-action" className="text-sm font-semibold text-slate-700">
            Aksi
          </label>
          <select
            id="log-action"
            name="action"
            defaultValue={actionFilter}
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {ACTIONS.map((a) => (
              <option key={a || 'all-a'} value={a}>
                {a || 'Semua aksi'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="log-entity" className="text-sm font-semibold text-slate-700">
            Entitas
          </label>
          <select
            id="log-entity"
            name="entity"
            defaultValue={entityFilter}
            className="h-11 min-h-[44px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          >
            {ENTITIES.map((e) => (
              <option key={e || 'all-e'} value={e}>
                {e || 'Semua entitas'}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm">
          Filter
        </Button>
        {(actionFilter || entityFilter) && (
          <Link
            href="/admin/logs"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Reset
          </Link>
        )}
      </form>

      <LogsTable rows={rows} caption={`Log aktivitas halaman ${page} dari ${totalPages}`} />

      <Pagination page={page} totalPages={totalPages} hrefForPage={qs} />
    </div>
  );
}
