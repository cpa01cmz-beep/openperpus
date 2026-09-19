'use client';

import DataTable from '@/components/admin/DataTable';

export type LogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Wrapper klien untuk tabel log: kolom `render` didefinisikan di sisi
 * klien agar tidak dikirim sebagai function props dari Server Component
 * (tidak serializable -> Server Components render error di produksi).
 * Server hanya mengirim `rows` (data serializable).
 */
export default function LogsTable({ rows, caption }: { rows: LogRow[]; caption?: string }) {
  return (
    <DataTable<LogRow>
      caption={caption}
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
            <span className="font-mono text-xs" title={r.user_id ?? ''}>
              {r.user_id ? `${r.user_id.slice(0, 8)}…` : '-'}
            </span>
          ),
        },
        {
          key: 'metadata',
          header: 'Detail',
          render: (r) =>
            r.metadata ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 underline">metadata</summary>
                <pre className="mt-1 max-w-[280px] overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                  {JSON.stringify(r.metadata, null, 2)}
                </pre>
              </details>
            ) : (
              <span className="text-xs text-slate-400">-</span>
            ),
        },
      ]}
      rows={rows}
      getRowKey={(r) => r.id}
      emptyText="Belum ada aktivitas tercatat."
    />
  );
}
