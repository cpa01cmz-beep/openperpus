/**
 * src/lib/konten-api.ts — API helpers MUTASI untuk halaman admin/konten.
 * Diekstrak verbatim dari page.tsx (behavior-preserving).
 * Mengembalikan true bila sukses, false bila gagal/dibatalkan.
 *
 * Pembacaan daftar TIDAK lagi di sini: halaman konten memakai
 * src/hooks/useAdminList.ts seperti halaman admin lainnya (issue #62),
 * sehingga `apiList()` lokal dihapus dan tidak ada dua jalur baca.
 */
import { errMsg } from '@/lib/admin-errors';

export type KontenTab = 'pages' | 'faqs' | 'testimonials';

export { errMsg };

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
  // Satu transport ID (issue #54): PUT via path REST /{id}, bukan ?id=.
  const res = await fetch(`${path}/${id}`, {
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
  // Satu transport ID (issue #54): DELETE via path REST /{id}, bukan ?id=.
  const res = await fetch(`${path}/${id}`, { method: 'DELETE' });
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
