// S-roi4: helper client "Reservasi & pinjaman saya".
// Kontrak server:
// - GET /api/reservations -> milik sendiri otomatis (member_id diabaikan server);
//   baris: status, expires_at, books{id,title,slug}.
// - GET /api/loans -> ruta koleksi saat ini staff-gated (403 untuk anggota);
//   helper tetap no-store + tanpa member_id, melempar FORBIDDEN agar halaman
//   menampilkan daftar pinjaman kosong dengan pesan ramah (tanpa bocor data).
// - PUT /api/reservations?id= {status:'cancelled'} -> 200; activity log
//   "reservations.cancelled" ditulis server (writeLog best-effort).

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type MyReservation = {
  id: string;
  status: string;
  expires_at: string | null;
  reserved_at?: string;
  notes?: string | null;
  books?: { id?: string; title?: string; slug?: string | null } | null;
  [k: string]: unknown;
};

export type MyLoan = {
  id: string;
  status: string;
  due_at: string | null;
  borrowed_at?: string;
  books?: { id?: string; title?: string; slug?: string | null } | null;
  [k: string]: unknown;
};

export class ReservasiSayaError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'OFFLINE' | 'VALIDATION' | 'REQUEST_FAILED';
  status?: number;
  constructor(code: ReservasiSayaError['code'], message: string, status?: number) {
    super(message);
    this.name = 'ReservasiSayaError';
    this.code = code;
    this.status = status;
  }
}

function serverMessage(json: unknown, fallback: string): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) {
    const msg = (json as { message?: string } | null | undefined)?.message;
    return msg ?? fallback;
  }
  return typeof err === 'string' ? err : (err.message ?? fallback);
}

type Deps = { fetchLike: FetchLike };

async function getJson(fetchLike: FetchLike, url: string): Promise<unknown[]> {
  let res: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    // no-store: status reservasi/loan harus segar (AC1).
    res = await fetchLike(url, { cache: 'no-store' });
  } catch {
    throw new ReservasiSayaError(
      'OFFLINE',
      'Anda offline. Menampilkan data terakhir + tombol muat ulang.'
    );
  }
  const json = (await res.json().catch(() => ({}))) as { data?: unknown };
  if (res.status === 401) {
    throw new ReservasiSayaError('UNAUTHENTICATED', serverMessage(json, 'Silakan login.'), 401);
  }
  if (res.status === 403) {
    // SENGAJA tanpa member_id di query: server memaksa milik sendiri.
    throw new ReservasiSayaError('FORBIDDEN', serverMessage(json, 'Bukan data milik Anda.'), 403);
  }
  if (!res.ok) {
    throw new ReservasiSayaError(
      'REQUEST_FAILED',
      serverMessage(json, 'Gagal memuat data.'),
      res.status
    );
  }
  const data = (json as { data?: unknown }).data;
  return Array.isArray(data) ? data : [];
}

/** AC1: daftar reservasi milik sendiri (server memaksa member miliknya). */
export async function fetchMyReservations(deps: Deps): Promise<MyReservation[]> {
  return (await getJson(deps.fetchLike, '/api/reservations')) as MyReservation[];
}

/** AC1: daftar pinjaman aktif milik sendiri; 403 (staff-gated) -> FORBIDDEN. */
export async function fetchMyLoans(deps: Deps): Promise<MyLoan[]> {
  return (await getJson(deps.fetchLike, '/api/loans')) as MyLoan[];
}

export type CancelInput = { id: string };

/**
 * AC2: batal 1-klik milik sendiri.
 * PUT /api/reservations?id= {status:'cancelled'} — server menulis
 * activity_logs "reservations.cancelled" via writeLog.
 */
export async function cancelMyReservation(deps: Deps, input: CancelInput): Promise<MyReservation> {
  const id = input.id?.trim();
  if (!id) {
    throw new ReservasiSayaError('VALIDATION', 'Parameter id wajib.');
  }
  let res: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    res = await deps.fetchLike(`/api/reservations?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch {
    throw new ReservasiSayaError('OFFLINE', 'Anda offline. Coba lagi setelah tersambung.');
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: MyReservation;
  };
  if (res.status === 401) {
    throw new ReservasiSayaError('UNAUTHENTICATED', serverMessage(json, 'Silakan login.'), 401);
  }
  if (res.status === 403) {
    throw new ReservasiSayaError(
      'FORBIDDEN',
      serverMessage(json, 'Bukan reservasi milik Anda.'),
      403
    );
  }
  if (!res.ok || res.status !== 200) {
    throw new ReservasiSayaError(
      'REQUEST_FAILED',
      serverMessage(json, 'Gagal membatalkan.'),
      res.status
    );
  }
  return (json.data ?? { id, status: 'cancelled', expires_at: null }) as MyReservation;
}
