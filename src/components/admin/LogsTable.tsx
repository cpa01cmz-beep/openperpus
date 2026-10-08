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
            <span className="entri whitespace-nowrap">
              {new Date(r.created_at).toLocaleDateString('id-ID')}
              <br />
              <span className="text-xs text-ink/70">
                {new Date(r.created_at).toLocaleTimeString('id-ID')}
              </span>
            </span>
          ),
        },
        {
          key: 'action',
          header: 'Aksi',
          render: (r) => <code className="entri text-xs text-brand">{r.action}</code>,
        },
        {
          key: 'entitas',
          header: 'Entitas',
          render: (r) => (
            <span className="entri text-xs">
              {r.entity_type ?? '-'}
              {r.entity_id ? (
                <span className="text-ink/70"> · {r.entity_id.slice(0, 8)}…</span>
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
            <span className="entri text-xs" title={r.user_id ?? ''}>
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
                <summary className="cursor-pointer text-ink/70 underline">metadata</summary>
                <pre className="entri mt-1 max-w-[280px] overflow-auto rounded-[var(--radius-sm)] border border-rule bg-brand-soft/50 p-2 text-xs text-ink">
                  {JSON.stringify(r.metadata, null, 2)}
                </pre>
              </details>
            ) : (
              <span className="text-xs text-ink/70">-</span>
            ),
        },
      ]}
      rows={rows}
      getRowKey={(r) => r.id}
      emptyText="Belum ada aktivitas tercatat."
    />
  );
}
