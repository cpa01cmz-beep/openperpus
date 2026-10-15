'use client';

import DataTable from '@/components/admin/DataTable';
import { formatTanggal, formatWaktu } from '@/lib/format';

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
              {formatTanggal(r.created_at)}
              <br />
              <span className="text-xs text-ink/60">{formatWaktu(r.created_at)}</span>
            </span>
          ),
        },
        {
          key: 'action',
          header: 'Aksi',
          render: (r) => <code className="font-mono text-xs">{r.action}</code>,
        },
        {
          // Isu #69: request-id disimpan handler API di metadata.requestId;
          // kolom ini memetakan trace response/log ke baris audit.
          key: 'trace',
          header: 'Trace',
          render: (r) => {
            const rid = r.metadata?.['requestId'];
            if (typeof rid !== 'string' || !rid) {
              return <span className="text-xs text-ink/50">-</span>;
            }
            return (
              <a
                href={`/admin/logs?rid=${encodeURIComponent(rid)}`}
                title={`Telusuri request ${rid}`}
                className="font-mono text-xs text-brand underline-offset-2 hover:underline"
              >
                {rid.slice(0, 8)}…
              </a>
            );
          },
        },
        {
          key: 'entitas',
          header: 'Entitas',
          render: (r) => (
            <span className="text-xs">
              {r.entity_type ?? '-'}
              {r.entity_id ? (
                <span className="text-ink/50"> · {r.entity_id.slice(0, 8)}…</span>
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
                <summary className="cursor-pointer text-ink/60 underline">metadata</summary>
                <pre className="mt-1 max-w-[280px] overflow-auto rounded-[var(--radius-sm)] bg-[var(--ink)]/5 p-2 font-mono text-xs text-ink/80">
                  {JSON.stringify(r.metadata, null, 2)}
                </pre>
              </details>
            ) : (
              <span className="text-xs text-ink/50">-</span>
            ),
        },
      ]}
      rows={rows}
      getRowKey={(r) => r.id}
      emptyText="Belum ada aktivitas tercatat."
    />
  );
}
