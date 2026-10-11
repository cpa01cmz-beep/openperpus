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

/**
 * Pesan error dari nilai yang dilempar apa pun. `throw 'gagal'` atau
 * objek dari wrapper tetap menghasilkan string, sehingga state bertipe
 * string tidak pernah terisi undefined (lalu gagal ditampilkan).
 */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
