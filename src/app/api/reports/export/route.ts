import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';
import { createWriteLog } from '@/lib/api-utils';
import { rowsToCSV } from '@/lib/csv-export';
import { formatStamp } from '@/lib/format';
import {
  EXPORT_CHUNK,
  EXPORT_MAX_CHUNKS,
  EXPORT_INCOMPLETE,
  REPORTS,
  REPORT_SCOPES,
  chunkRange,
  headerLine,
  isReportScope,
  type ScopeDef,
} from '@/lib/report-export';

/** Audit kanonis (best-effort, membawa metadata.requestId). */
const writeReportsLog = createWriteLog('reports');

/**
 * GET /api/reports/export?scope=books|loans|fines — pustakawan+.
 *
 * Ekspor CSV SELURUH data (bukan hanya halaman aktif) — issue #78. Data
 * diambil per-chunk `range()` (1000 baris) dan dialirkan (streaming) ke
 * klien, jadi memori server tidak menampung seluruh tabel sekaligus.
 *
 * - `scope` wajib; nilai lain -> 422 VALIDATION.
 * - Chunk pertama di-fetch SEBELUM stream dibuka supaya error DB tetap
 *   membalas 500 JSON; kegagalan chunk berikutnya mengakhiri stream
 *   (sudah di-log) karena header respons sudah terlanjur terkirim.
 * - ORDER BY = kolom utama + tiebreaker unik `id` (wajib deterministik agar
 *   paginasi `range()` stabil), plus filter ruang lingkup per scope (books:
 *   hanya `is_active`) supaya ekspor selaras dengan tampilan aplikasi.
 * - Ekspor tidak lengkap TIDAK boleh menyamar jadi sukses: batas
 *   EXPORT_MAX_CHUNKS maupun kegagalan baca di tengah stream meninggalkan
 *   baris penanda `# PERINGATAN: ekspor TIDAK LENGKAP …` di akhir CSV
 *   (plus log warn/error), sehingga file parsial selalu terdeteksi.
 * - Audit best-effort `reports.export` lewat helper kanonis createWriteLog
 *   (metadata.requestId ikut terlacak).
 */

type FetchOk = { rows: Record<string, unknown>[] };
type FetchErr = { error: string };

async function fetchChunk(
  supabase: ReturnType<typeof createClient>,
  def: ScopeDef,
  chunkIndex: number
): Promise<FetchOk | FetchErr> {
  const [from, to] = chunkRange(chunkIndex);
  // ORDER BY deterministik WAJIB (kolom utama + tiebreaker unik `id`):
  // chunking `range()` memakai offset, dan offset hanya stabil bila urutan
  // kolom non-unik tidak bisa berubah antar query — kalau tidak, baris
  // ber-key-sama bisa pindah posisi dan ekspor jadi berisi baris GANDA plus
  // baris yang HILANG tanpa tanda apa pun (review PR #105).
  const [primary, ...tiebreaks] = def.order;
  let query = supabase.from(def.table).select(def.select).order(primary, { ascending: false });
  for (const col of tiebreaks) {
    query = query.order(col, { ascending: false });
  }
  // Filter ruang lingkup (mis. buku hanya aktif) supaya ekspor selaras aplikasi.
  for (const f of def.filters ?? []) {
    query = query.eq(f.col, f.val);
  }
  const { data, error } = await query.range(from, to);
  if (error) return { error: error.message };
  // select string dinamis -> tipe PostgREST generik; cast lewat unknown.
  return { rows: (data ?? []) as unknown as Record<string, unknown>[] };
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const scope = new URL(req.url).searchParams.get('scope');
  if (!isReportScope(scope)) {
    return jsonError('VALIDATION', `scope harus: ${REPORT_SCOPES.join('|')}.`, 422);
  }
  const def = REPORTS[scope];

  const first = await fetchChunk(supabase, def, 0);
  if ('error' in first) {
    log.error('reports.export_failed', { scope, detail: first.error });
    return jsonError('FETCH_FAILED', 'Gagal mengekspor data.', 500, { requestId: log.requestId });
  }

  // Audit best-effort: ekspor memuat PII anggota — jejak siapa menarik data.
  // Pakai helper kanonis writeLog (metadata.requestId ikut terlacak), bukan
  // insert tangan sendiri yang membuang request-id (review PR #105).
  await writeReportsLog(supabase, user.id, 'reports.export', scope, { scope }, log.requestId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(headerLine(def.headers)));
        let rows = first.rows;
        let exported = 0;
        let truncated = false;
        let failed = false;
        const limit = EXPORT_MAX_CHUNKS * EXPORT_CHUNK;
        for (let chunk = 0; ; chunk++) {
          if (rows.length > 0) {
            controller.enqueue(encoder.encode(rowsToCSV(rows.map(def.row)) + '\r\n'));
            exported += rows.length;
          }
          if (rows.length < EXPORT_CHUNK) break; // tabel sudah habis
          if (chunk + 1 >= EXPORT_MAX_CHUNKS) {
            // Semua chunk yang diizinkan sudah terpakai dan chunk terakhir
            // masih PENUH -> masih ada sisa. Ambil SATU chunk penentu (bukan
            // membuangnya tanpa jejak seperti sebelumnya): kosong berarti data
            // lengkap, ada isinya berarti ekspor ditandai TIDAK LENGKAP.
            const probe = await fetchChunk(supabase, def, chunk + 1);
            if ('error' in probe) {
              log.error('reports.export_stream_failed', { scope, detail: probe.error });
              failed = true;
            } else if (probe.rows.length > 0) {
              truncated = true;
              log.warn('reports.export_truncated', { scope, exported, limit });
            }
            break;
          }
          const next = await fetchChunk(supabase, def, chunk + 1);
          if ('error' in next) {
            log.error('reports.export_stream_failed', { scope, detail: next.error });
            failed = true;
            break;
          }
          rows = next.rows;
        }
        // Kegagalan akhir stream TIDAK boleh menyamar jadi CSV rapi berstatus
        // 200: header respons sudah terkirim, jadi penandanya masuk ke badan
        // stream sebagai baris komentar (review PR #105).
        if (truncated)
          controller.enqueue(encoder.encode(EXPORT_INCOMPLETE.truncated(exported, limit) + '\r\n'));
        if (failed) controller.enqueue(encoder.encode(EXPORT_INCOMPLETE.failed + '\r\n'));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  const stamp = formatStamp();
  const dated = def.filename.replace(/\.csv$/, `-${stamp}.csv`);
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dated}"`,
      'Cache-Control': 'no-store',
    },
  });
}
