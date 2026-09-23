/**
 * src/lib/konten-api.ts — API helpers untuk halaman admin/konten.
 * Diekstrak verbatim dari page.tsx (behavior-preserving).
 * Mengembalikan true bila sukses, false bila gagal/dibatalkan.
 */

export type KontenTab = 'pages' | 'faqs' | 'testimonials';

type ApiListResult<T> =
  { missing: true; rows: T[]; totalPages: 1 } | { missing: false; rows: T[]; totalPages: number };

export function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export async function apiList<T>(path: string, page = 1): Promise<ApiListResult<T>> {
  const q = new URLSearchParams({ page: String(page), per_page: '10' });
  const res = await fetch(`${path}?${q}`, { cache: 'no-store' });
  if (res.status === 404) return { missing: true, rows: [], totalPages: 1 };
  const json = (await res.json()) as {
    data?: T[];
    pagination?: { totalPages?: number };
    meta?: { totalPages?: number };
  };
  if (!res.ok) throw new Error(errMsg(json));
  return {
    missing: false,
    rows: (json.data ?? []) as T[],
    totalPages: json.pagination?.totalPages ?? json.meta?.totalPages ?? 1,
  };
}

function pathForKind(kind: KontenTab): string {
  return kind === 'pages' ? '/api/pages' : kind === 'faqs' ? '/api/faqs' : '/api/testimonials';
}

export interface KontenMutateOpts {
  onMissing?: (kind: KontenTab) => void;
  onError?: (msg: string) => void;
  onSuccess?: () => void;
}

export async function onAdd(
  kind: KontenTab,
  body: Record<string, unknown>,
  opts?: KontenMutateOpts
): Promise<boolean> {
  const path = pathForKind(kind);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    alert(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    const m = errMsg(json);
    if (opts?.onError) opts.onError(m);
    else alert(m);
    return false;
  }
  opts?.onSuccess?.();
  return true;
}

export async function onToggle(
  kind: KontenTab,
  id: string,
  is_active: boolean,
  opts?: KontenMutateOpts
): Promise<boolean> {
  const path = pathForKind(kind);
  const res = await fetch(`${path}?id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: !is_active }),
  });
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    alert(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    if (opts?.onError) opts.onError('Gagal update.');
    else alert('Gagal update.');
    return false;
  }
  opts?.onSuccess?.();
  return true;
}

export async function onDelete(
  kind: KontenTab,
  id: string,
  opts?: KontenMutateOpts
): Promise<boolean> {
  if (!confirm('Hapus data ini?')) return false;
  const path = pathForKind(kind);
  const res = await fetch(`${path}?id=${id}`, { method: 'DELETE' });
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    alert(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    if (opts?.onError) opts.onError('Gagal menghapus.');
    else alert('Gagal menghapus.');
    return false;
  }
  opts?.onSuccess?.();
  return true;
}
