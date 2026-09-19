/* ============================================================
 * src/lib/admin-errors.ts — helper MURNI, aman untuk client bundle.
 * NOL impor server. Satu pintu untuk mengekstrak pesan error
 * dari respons API { error: { code, message } } di panel admin,
 * menggantikan salinan lokal errMsg() di tiap halaman admin.
 * ============================================================ */

/** Ambil pesan error dari body JSON API; fallback bila bentuk tak dikenal. */
export function errMsg(json: unknown, fallback = 'Gagal.'): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return fallback;
  return typeof err === 'string' ? err : (err.message ?? fallback);
}
