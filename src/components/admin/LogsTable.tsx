'use client';

import DataTable from '@/components/admin/DataTable';

export type LogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
};

/**
 * Wrapper klien untuk tabel log: kolom `render` didefinisikan di sisi
 * klien agar tidak dikirim sebagai function props dari Server Component
 * (tidak serializable -> Server Components render error di produksi).
 * Server hanya mengirim `rows` (data serializable).
 */
export default function LogsTable({ rows }: { rows: LogRow[] }) {
  return (
    <DataTable<LogRow>
      columns={[
        {
          key: 'created_at',
          header: 'Waktu',
          render: (r) => (
            <span className="whitespace-nowrap">
              {new Date(r.created_at).toLocaleDateString('id-ID')}
              <br />
              <span className="text-xs text-slate-500">
                {new Date(r.created_at).toLocaleTimeString('id-ID')}
              </span>
            </span>
          ),
        },
        {
          key: 'action',
          header: 'Aksi',
          render: (r) => <code className="font-mono text-xs">{r.action}</code>,
        },
        {
          key: 'entitas',
          header: 'Entitas',
          render: (r) => (
            <span className="text-xs">
              {r.entity_type ?? '-'}
              {r.entity_id ? (
                <span className="text-slate-400"> · {r.entity_id.slice(0, 8)}…</span>
              ) : (
                ''
              )}
            </span>
          ),
        },
        {
          key: 'user_id',
          header: 'Pelaku',
          render: (r) => (
            <span className="font-mono text-xs">
              {r.user_id ? `${r.user_id.slice(0, 8)}…` : '-'}
            </span>
          ),
        },
      ]}
      rows={rows}
      getRowKey={(r) => r.id}
      emptyText="Belum ada aktivitas tercatat."
    />
  );
}
