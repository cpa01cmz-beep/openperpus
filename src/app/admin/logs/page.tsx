import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DataTable from "@/components/admin/DataTable";

export const dynamic = "force-dynamic";
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

export default async function LogsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const role = (profile as { role?: string } | null)?.role;

  if (role !== "admin") {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-bold">Log Aktivitas</h1>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          Akses ditolak — halaman ini khusus <strong>admin</strong>. Peran Anda: {role ?? "tidak diketahui"}.
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

  const { data, count, error } = await supabase
    .from("activity_logs")
    .select("id,action,entity_type,entity_id,user_id,metadata,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as Log[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Log Aktivitas</h1>
        <p className="text-sm text-slate-500">
          Jejak audit read-only (tabel <code className="font-mono">activity_logs</code>), khusus admin. Total {count ?? 0}{" "}
          baris.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal memuat log: {error.message}
        </div>
      )}

      <DataTable<Log>
        columns={[
          {
            key: "created_at",
            header: "Waktu",
            render: (r) => (
              <span className="whitespace-nowrap">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
                <br />
                <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleTimeString("id-ID")}</span>
              </span>
            ),
          },
          { key: "action", header: "Aksi", render: (r) => <code className="font-mono text-xs">{r.action}</code> },
          {
            key: "entitas",
            header: "Entitas",
            render: (r) => (
              <span className="text-xs">
                {r.entity_type ?? "-"}
                {r.entity_id ? <span className="text-slate-400"> · {r.entity_id.slice(0, 8)}…</span> : ""}
              </span>
            ),
          },
          {
            key: "user_id",
            header: "Pelaku",
            render: (r) => <span className="font-mono text-xs">{r.user_id ? `${r.user_id.slice(0, 8)}…` : "-"}</span>,
          },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
        emptyText="Belum ada aktivitas tercatat."
      />

      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/admin/logs?page=${page - 1}`}
          aria-disabled={page <= 1}
          className={`rounded border px-3 py-1 ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
        >
          ‹ Prev
        </Link>
        <span>
          Halaman {page} / {totalPages}
        </span>
        <Link
          href={`/admin/logs?page=${page + 1}`}
          aria-disabled={page >= totalPages}
          className={`rounded border px-3 py-1 ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
        >
          Next ›
        </Link>
      </div>
    </div>
  );
}
