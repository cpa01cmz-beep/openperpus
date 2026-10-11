/**
 * src/lib/konten-api.ts — API helpers MUTASI untuk halaman admin/konten.
 * Diekstrak verbatim dari page.tsx (behavior-preserving).
 * Mengembalikan true bila sukses, false bila gagal/dibatalkan.
 *
 * Pembacaan daftar TIDAK lagi di sini: halaman konten memakai
 * src/hooks/useAdminList.ts seperti halaman admin lainnya (issue #62),
 * sehingga `apiList()` lokal dihapus dan tidak ada dua jalur baca.
 *
 * Isu #79: TIDAK ADA dialog native (alert/confirm/prompt) di sini. Semua
 * kegagalan mengalir lewat callback `onMissing`/`onError` milik pemanggil
 * (satu-satunya pemanggil — admin/konten/page.tsx — selalu mengirim
 * keduanya, jadi perilaku tampilan tidak berubah: pesan tampil sebagai
 * banner inline, bukan dialog native). Konfirmasi hapus adalah milik UI
 * (ConfirmModal di tab), bukan helper transport.
 */
import { errMsg } from '@/lib/admin-errors';

export type KontenTab = 'pages' | 'faqs' | 'testimonials';

export { errMsg };

function pathForKind(kind: KontenTab): string {
  return kind === 'pages' ? '/api/pages' : kind === 'faqs' ? '/api/faqs' : '/api/testimonials';
}

export interface KontenMutateOpts {
  /** 404 — endpoint belum tersedia; pemanggil menampilkan banner per-tab. */
  onMissing?: (kind: KontenTab) => void;
  /** Kegagalan lain — pemanggil menampilkan banner error inline. */
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
    return false;
  }
  if (!res.ok) {
    opts?.onError?.(errMsg(json, 'Gagal menambah data.'));
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
    return false;
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    opts?.onError?.(errMsg(json, 'Gagal update.'));
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
  // Konfirmasi hapus ada di UI (ConfirmModal per tab) sebelum fungsi ini
  // dipanggil — helper transport tidak lagi memunculkan dialog native.
  const path = pathForKind(kind);
  // Satu transport ID (issue #54): DELETE via path REST /{id}, bukan ?id=.
  const res = await fetch(`${path}/${id}`, { method: 'DELETE' });
  if (res.status === 404) {
    opts?.onMissing?.(kind);
    return false;
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    opts?.onError?.(errMsg(json, 'Gagal menghapus.'));
    return false;
  }
  opts?.onSuccess?.();
  return true;
}
