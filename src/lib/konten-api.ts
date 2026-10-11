/**
 * src/lib/konten-api.ts — API helpers MUTASI untuk halaman admin/konten.
 * Diekstrak verbatim dari page.tsx (behavior-preserving).
 * Mengembalikan true bila sukses, false bila gagal/dibatalkan.
 *
 * Pembacaan daftar TIDAK lagi di sini: halaman konten memakai
 * src/hooks/useAdminList.ts seperti halaman admin lainnya (issue #62),
 * sehingga `apiList()` lokal dihapus dan tidak ada dua jalur baca.
 *
 * Issue #79: nol `alert()`/`confirm()` native (lihat #60/#72) — semua
 * kegagalan lewat `opts.onMissing`/`opts.onError` lalu dirender inline
 * (role=alert) oleh pemanggil. Konfirmasi hapus milik ConfirmModal
 * di halaman, bukan di helper ini.
 */
import { clientFetch } from '@/lib/api-client';
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
  const res = await clientFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    opts?.onError?.(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    opts?.onError?.(errMsg(json));
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
  const res = await clientFetch(`${path}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: !is_active }),
  });
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    opts?.onError?.(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    opts?.onError?.('Gagal update.');
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
  const path = pathForKind(kind);
  // Satu transport ID (issue #54): DELETE via path REST /{id}, bukan ?id=.
  const res = await clientFetch(`${path}/${id}`, { method: 'DELETE' });
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    opts?.onError?.(`API ${path} belum tersedia di backend.`);
    return false;
  }
  if (!res.ok) {
    opts?.onError?.('Gagal menghapus.');
    return false;
  }
  opts?.onSuccess?.();
  return true;
}
