/**
 * SATU SUMBER klasifikasi "0 baris" pada penulisan bersyarat (optimistic-lock).
 *
 * Tiga titik tulisan kondisional di repo ini memakai kontrak yang sama, dan
 * semuanya WAJIB lewat helper ini supaya satu perubahan kontrak tidak pernah
 * basi hanya di satu berkas — pelajaran issue #174/#175 (kosakata status satu
 * sumber) dan #171/#173 (kosakata kompensasi): duplikat bisa basi BERSAMA
 * tanpa satu tes pun gagal.
 *
 *   - `PUT /api/reservations/{id}`  (src/app/api/reservations/[id]/route.ts)
 *   - pengembalian legacy, RACE-01  (src/lib/legacyReturn.ts)
 *   - perpanjangan pinjaman, RACE-02 (src/lib/extendLoan.ts)
 *
 * Klasifikasi WAJIB eksak, BUKAN substring atas gabungan `message + code`:
 * detail Postgres bisa memuat angka acuan (`22P02 invalid input syntax for type
 * integer: "406"`, `22001 value too long for type character varying(406)`), dan
 * substring seperti itu mengubah kegagalan server sungguhan jadi 409 CONFLICT —
 * `log.error` + requestId hilang, staf disuruh "muat ulang"/"coba lagi"
 * padahal penulisan TIDAK terjadi (issue #179, dulu hidup di ketiga berkas).
 *
 * Kontrak kode: PERSIS `PGRST116` (satu-satunya). `406` sengaja TIDAK diterima
 * sebagai kode — di pustaka itu STATUS HTTP, dan menerimanya adalah dead code
 * sekaligus jalan masuk kembali kelas masking (issue #183).
 *
 * Perilaku postgrest-js@2.117.3 (`dist/index.cjs`, `processResponse`):
 * `.single()` 0 baris pada respons 200 `[]` → `data = null` dengan `error`
 * dibiarkan null; hanya cabang `> 1 baris` yang men-set `code: 'PGRST116'`
 * dan `status = 406` (406 di sana STATUS HTTP, bukan `error.code`). Karena itu
 * error null/undefined JUSTRU bentuk asli miss guard, dan kegagalan tulis
 * sungguhan selalu ber-`error` berisi kode Postgres (42501/22P02/22001/…).
 */

/** Bentuk minimum error PostgREST yang diperiksa (bisa null: lihat catatan di atas). */
export type ZeroRowsError = { code?: string; message?: string } | null | undefined;

/**
 * Frasa kanonik "tidak ada baris" yang BOLEH dicari sebagai frasa utuh di
 * `message` — bukan substring gabungan. `concurrent winner` bukan pesan
 * Postgres asli, tetapi bentuk zero-rows yang dipakai `tests/coredata2-races.ts:41`
 * (mock race) dan sudah jadi kontrak perilaku 409 di sana; daftar ini dikunci
 * `tests/zero-rows-satu-sumber.test.ts`.
 */
const ZERO_ROWS_PHRASE = /multiple \(or no\) rows|PGRST116|concurrent winner/i;

/**
 * 0 baris = pemenang konkuren sudah menimpa baris ini (write bersyarat tak
 * cocok guard) → pemanggil menjawab 409 CONFLICT. Sisanya (22P02, 42501, 23505,
 * 42883, P0001, …) adalah kegagalan DB sungguhan → 500 SAVE_FAILED + requestId.
 */
export function isZeroRows(error: ZeroRowsError): boolean {
  // 200 + [] dari postgrest-js@2: miss guard asli TIDAK menghasilkan error.
  if (!error) return true;
  // Kode PERSIS — HANYA PGRST116. Sifatnya "406" adalah STATUS HTTP, bukan
  // `error.code` (terverifikasi di postgrest-js@2.117.3 processResponse), jadi
  // cabang `code === '406'` yang dulu ada di sini adalah dead code yang justru
  // melawan kontrak berkas ini: tak bisa menyala dari pustaka, sementara lapisan
  // baru yang menyampaikan status HTTP sebagai `code` akan membuka lagi jalur
  // masking kegagalan tulis jadi 409 (issue #183).
  if (error.code === 'PGRST116') return true;
  // Frasa kanonik di message SAJA (bukan digabung dengan code).
  return ZERO_ROWS_PHRASE.test(error.message ?? '');
}
