/**
 * src/lib/api-client.ts — fetch klien ber-batas-waktu untuk form admin dan
 * komponen publik (isu #69: "fetch admin telanjang tanpa AbortController/
 * timeout/retry").
 *
 * Kenapa TIDAK memakai fetchWithRetry di sini:
 * - helper itu me-retry setiap status 408/429/5xx dan MELEMPAR ketika semua
 *   percobaan habis. Handler UI di repo ini membaca `res.ok` lalu merender
 *   `errMsg(json)`; memperlakukan respons 5xx sebagai lemparan membuat pesan
 *   asli dari server hilang (mis. "Stok tidak cukup di server.").
 * - tulisan (POST/PUT/PATCH/DELETE) tidak aman di-retry buta: backend baru
 *   idempoten sebagian (guard 409 + RPC atomik), retry bisa menduplikasi efek.
 *
 * Jadi modul ini menjamin bagian yang paling penting untuk UX: PERMINTAAN
 * TIDAK MENGGANTUNG. Batas waktu memakai AbortController + clearTimeout di
 * `finally` agar tidak ada timer tertinggal, dan timeout diterjemahkan jadi
 * pesan Bahasa Indonesia yang bisa ditampilkan langsung ke pengguna.
 *
 * Bila nanti butuh retry, wiring-nya khusus GET lewat fetchWithRetry —
 * jangan angkat retry untuk tulisan di sini.
 */

/** Batas waktu tunggu respons API (ms) — cukup longgar untuk Supabase cold start. */
export const CLIENT_FETCH_TIMEOUT_MS = 10_000;

/** Pesan seragam saat request melewati batas waktu (Bahasa Indonesia). */
export const TIMEOUT_MESSAGE = 'Permintaan melebihi batas waktu. Coba lagi.';

function isTimeout(a: unknown): boolean {
  return (a as { name?: string } | null)?.name === 'TimeoutError';
}

/**
 * fetch() dengan batas waktu absolut. Bentuk kembalian identik dengan fetch()
 * — termasuk respons 4xx/5xx — sehingga pemanggil yang sudah memeriksa
 * `res.ok` tidak perlu diubah.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = CLIENT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut || isTimeout(error)) throw new Error(TIMEOUT_MESSAGE);
    throw error;
  } finally {
    // Selalu dieksekusi: tidak ada timer yang tertinggal di browser/jsdom.
    clearTimeout(timer);
  }
}

/** Alias semantik untuk call-site UI (tetap fetch biasa + batas waktu). */
export const clientFetch = fetchWithTimeout;

/**
 * GET daftar admin: selalu `cache: 'no-store'` + batas waktu.
 * Satu-satunya jalur fetch daftar (dipakai `useAdminList`) — issue #79:
 * data operasional tak boleh basi, jadi no-store dipusatkan di sini,
 * bukan tersebar sebagai flag per halaman.
 */
export function listFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(url, { cache: 'no-store', ...init });
}
