import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, slugify, parsePaging } from '@/lib/supabase/auth';
import { validateBook } from '@/lib/validation';
import { isUuid } from '@/lib/api-utils';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/books?page=&per_page=&q=&kategori=&rak=&tersedia=1&featured=1
 *  -> PUBLIK (docs/api-contract.md §2). RLS is_active yang menjaga;
 *     panel admin tetap bisa memakai endpoint yang sama.
 * POST /api/books -> admin/librarian
 * Kolom mengikuti migrasi 0001: title, slug, author(!), publisher, isbn, year,
 * category_id, rack_id, cover_url, pdf_url, description, pages, language,
 * stock_total, stock_available, featured, is_active.
 */

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  // PUBLIK: tanpa requireStaff. Keamanan dipegang RLS (is_active=true).
  const supabase = createClient();

  const { sp, page, perPage, q, from, to } = parsePaging(req.url);
  const kategori = (sp.get('kategori') ?? sp.get('category') ?? '').trim();
  const rak = (sp.get('rak') ?? '').trim();
  const tersedia = sp.get('tersedia');
  const featured = sp.get('featured');

  // Pencarian via RPC search_books (full-text + trigram, server-side).
  let searchIds: string[] | null = null;
  if (q) {
    const { data: found, error: searchErr } = await supabase.rpc('search_books', {
      p_q: q,
      p_limit: 100,
    });
    if (searchErr) {
      log.error('books.search_failed', { detail: searchErr.message });
      return jsonError('FETCH_FAILED', 'Gagal mencari buku.', 500, { requestId: log.requestId });
    }
    searchIds = ((found ?? []) as { id: string }[]).map((r) => r.id);
    if (searchIds.length === 0) {
      return NextResponse.json(
        {
          data: [],
          pagination: { page, limit: perPage, total: 0, totalPages: 0 },
        },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
      );
    }
  }

  let query = supabase
    .from('books')
    .select(
      'id,title,slug,author,publisher,year,isbn,category_id,rack_id,cover_url,pages,language,stock_total,stock_available,featured,rating_avg,created_at,updated_at,categories(id,name,slug),racks(code,name,location)',
      { count: 'estimated' }
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (searchIds) query = query.in('id', searchIds);
  if (kategori) query = query.eq('category_id', kategori);
  if (rak) query = query.eq('rack_id', rak);
  if (tersedia === '1') query = query.gt('stock_available', 0);
  if (featured === '1') query = query.eq('featured', true);

  const { data, error, count } = await query;
  if (error) {
    log.error('books.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil buku.', 500, { requestId: log.requestId });
  }
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
  );
}

export async function POST(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  // Alias Indonesia (docs) -> canonical
  if (body.judul && !body.title) body.title = body.judul;
  if (body.penulis && !body.author) body.author = body.penulis;
  if (body.penerbit && !body.publisher) body.publisher = body.penerbit;
  if (body.tahun && body.year === undefined) body.year = body.tahun;
  if (body.deskripsi && !body.description) body.description = body.deskripsi;
  if (body.jumlah_halaman && body.pages === undefined) body.pages = body.jumlah_halaman;
  if (body.bahasa && !body.language) body.language = body.bahasa;
  if (body.category && !body.category_id) body.category_id = body.category; // izinkan string UUID
  if (body.shelf && !body.rack_id) body.rack_id = body.shelf;

  const err = validateBook(body);
  if (err) return jsonError('VALIDATION', err, 422);

  const title = (body.title as string).trim();
  const slug =
    typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(title);
  const stock_total = body.stock_total === undefined ? 1 : Number(body.stock_total);
  const stock_available =
    body.stock_available === undefined ? stock_total : Number(body.stock_available);
  if (!Number.isInteger(stock_total) || stock_total < 0)
    return jsonError('VALIDATION', 'stock_total harus bilangan bulat >= 0.', 422);
  if (!Number.isInteger(stock_available) || stock_available < 0)
    return jsonError('VALIDATION', 'stock_available tidak boleh negatif.', 422);
  if (stock_available > stock_total)
    return jsonError('VALIDATION', 'stock_available tidak boleh melebihi stock_total.', 422);

  const { data, error } = await supabase
    .from('books')
    .insert({
      title,
      slug,
      author: (body.author as string).trim(),
      publisher: (body.publisher as string | null) ?? null,
      isbn: (body.isbn as string | null) ?? null,
      year: (body.year as number | null) ?? null,
      category_id: (body.category_id as string | null) ?? null,
      rack_id: (body.rack_id as string | null) ?? null,
      cover_url: (body.cover_url as string | null) ?? null,
      pdf_url: (body.pdf_url as string | null) ?? null,
      description: (body.description as string | null) ?? null,
      pages: (body.pages as number | null) ?? null,
      language: (body.language as string) ?? 'id',
      stock_total,
      stock_available,
      featured: Boolean(body.featured ?? false),
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('books.conflict', { detail: (error as { message?: string }).message ?? 'conflict' });
      return jsonError('CONFLICT', 'Slug/ISBN sudah dipakai.', 409, { requestId: log.requestId });
    }
    log.error('books.save_failed', {
      detail: (error as { message?: string }).message ?? 'save-failed',
    });
    return jsonError('SAVE_FAILED', 'Gagal menambah buku.', 500, { requestId: log.requestId });
  }
  revalidateTag('books', 'max');
  return NextResponse.json({ data }, { status: 201 });
}

/** Batas int4 Postgres (2147483647) — dipakai predikat stok opname. */
const OPNAME_STOCK_MAX = 2147483647;

/**
 * Predikat stok opname IDENTIK dengan RPC stock_opname_tx (migrasi 0033):
 * hanya bilangan bulat >= 0 — angka JSON atau string digit, maks 10 digit
 * (batas panjang int4), disaring rentang 2147483647. Number() lama MENERIMA
 * null/""/true/"5.0"/1e21 -> 0/1/5/1e21 DAN MENULISNYA; nilai di luar
 * int4 juga melempar 22003 di DB. null = baris tidak valid (dilewati
 * dengan reason), sama seperti RPC.
 * Paritas dua kasus tepi (review PR #122):
 *  - `-0` DINORMALKAN jadi 0, bukan ditolak. UI kirim `Number("-0")` -> -0
 *    dan JSON.stringify(-0) = "-0", sedangkan jsonb Postgres menormalkan -0
 *    jadi 0 sehingga `->>` menghasilkan '0' yang LOLOS predikat RPC dan
 *    ditulis sebagai 0. Menolaknya di fallback justru membuat dua jalur
 *    berbeda untuk permintaan yang sama.
 *  - `5.0` tak bisa dijangkau klien JS: JSON.parse selalu memberi angka 5 dan
 *    supabase-js serialisasi ulang menjadi `5`. Bila dikirim sebagai STRING
 *    "5.0", kedua jalur menolaknya (regex ^\d{1,10}$) — tetap identik.
 */
function parseOpnameStock(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0 || v > OPNAME_STOCK_MAX) return null;
    // -0 -> 0: -0 < 0 salah di JS, jadi ia lolos filter di atas; normalkan
    // agar sama dengan jsonb/RPC yang menulis 0.
    return Object.is(v, -0) ? 0 : v;
  }
  if (typeof v === 'string' && /^\d{1,10}$/.test(v)) {
    const n = Number(v);
    return n <= OPNAME_STOCK_MAX ? n : null;
  }
  return null;
}

/**
 * PUT /api/books { action: 'stock_opname', items: [{ id, stock_total, stock_available }] }
 * Stok opname ATOMIK via RPC stock_opname_tx (migrasi 0032 + hardening 0033):
 * lock semua kandidat SEKALIGUS `ORDER BY id FOR UPDATE` (bebas deadlock),
 * hitung pinjaman aktif fresh di dalam transaksi, update + audit full diff
 * (berita acara selisih) dalam SATU transaksi.
 * Aturan: buku dengan pinjaman borrowed/overdue DILEWATI (dengan alasan) —
 * available akhir selalu = nilai opname (tidak ada clamp tersembunyi).
 * Fallback ke orkestrasi aplikasi HANYA bila RPC belum terdeploy
 * (42883/PGRST202) atau klien tanpa .rpc. Fallback tidak dipakai ketika RPC
 * sudah merespons: hasil ambigu TIDAK boleh diulang via jalur non-atomik
 * (opname bisa termuat dua kali + audit ganda).
 * Kontrak fallback == RPC (urutan cek per item): id -> eksistensi ->
 * dipinjam -> stok, dengan reason string yang sama. Cek eksistensi wajib:
 * id tak dikenal yang jatuh ke `upsert` memicu NOT NULL title/slug/author
 * (0001_core.sql) sehingga SELURUH batch gagal (`Gagal menyimpan.`, HTTP 200),
 * padahal RPC hanya melewati baris itu (`Buku tidak ditemukan.`).
 * Balikan: { data: { updated: string[], skipped: [{ id, reason }], diffs: [...] } }.
 * ponytail: naikkan ke approval opname dua langkah (tabel batch +
 * ajukan/setujui) bila opname jadi SOP sensitif — cukup bila bulk <= 100 manual.
 */
export async function PUT(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }
  if (body.action !== 'stock_opname' || !Array.isArray(body.items)) {
    return jsonError('VALIDATION', 'Body harus { action: stock_opname, items: [...] }.', 422);
  }
  const items = body.items as { id?: unknown; stock_total?: unknown; stock_available?: unknown }[];
  if (items.length === 0) {
    return jsonError('VALIDATION', 'items tidak boleh kosong.', 422);
  }
  if (items.length > 100) {
    return jsonError('VALIDATION', 'Maksimal 100 item per stock_opname.', 422);
  }
  const validIds = [...new Set(items.filter((i) => isUuid(i.id)).map((i) => i.id as string))];
  if (validIds.length === 0) {
    return jsonError('VALIDATION', 'Setiap item wajib punya id UUID.', 422);
  }

  // Jalur utama ATOMIK: satu transaksi DB (lock + update + audit).
  // Fallback orkestrasi aplikasi bila RPC belum terdeploy (42883/PGRST202)
  // atau klien mock tanpa .rpc — dengan predikat stok identik (parseOpnameStock).
  if (typeof (supabase as { rpc?: unknown }).rpc === 'function') {
    try {
      const { data, error } = (await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
      )('stock_opname_tx', { p_items: items, p_user_id: user?.id ?? null })) as {
        data: {
          updated: string[];
          skipped: { id: string; reason: string }[];
          diffs: unknown[];
        } | null;
        error: { code?: string; message?: string } | null;
      };
      // RPC sudah berkomitmen (atau dibatalkan DB). Hasil apa pun TIDAK boleh
      // diulang lewat jalur non-atomik di bawah — opname bisa termuat dua kali
      // dan menulis audit ganda.
      if (!error) {
        revalidateTag('books', 'max');
        if (data) return NextResponse.json({ data });
        // data null tanpa error: PostgREST jarang melakukan ini pada fungsi
        // RETURN jsonb, tapi bila terjadi, laporkan kosong — jangan ulang mutasi.
        log.warn('books.stock_opname_rpc_no_payload');
        return NextResponse.json({ data: { updated: [], skipped: [], diffs: [] } });
      }
      // Guard eksplisit: blok mapping error hanya boleh jalan saat error
      // benar-benar ada — TypeScript menarrow tipe di sini, tidak lagi lewat
      // cast yang "diam-diam" lolos saat error null.
      if (error) {
        const rc = error.code ?? '';
        const msg = error.message ?? '';
        const rpcMissing =
          rc === '42883' ||
          rc === 'PGRST202' ||
          /could not find.*stock_opname_tx|function.*stock_opname_tx.*does not exist/i.test(msg);
        if (!rpcMissing) {
          // 22000 dipetakan ke pesan tetap; teks exception asli hanya ke log —
          // jangan bocorkan detail DB ke klien.
          if (rc === '42501')
            return jsonError('FORBIDDEN', 'Hanya pustakawan yang boleh opname.', 403);
          if (rc === '22000') {
            log.warn('books.stock_opname_invalid', { detail: msg });
            return jsonError('VALIDATION', 'Data opname tidak valid.', 422);
          }
          log.error('books.stock_opname_failed', { detail: msg });
          return jsonError('SAVE_FAILED', 'Gagal menyimpan stok opname.', 500, {
            requestId: log.requestId,
          });
        }
        // RPC belum terdeploy -> jatuh ke fallback di bawah.
      }
    } catch (err) {
      // Throw (network/timeout/abort): status commit TIDAK diketahui. Mengulang
      // lewat jalur non-atomik bisa menerapkan opname dua kali -> gagal jujur.
      log.error('books.stock_opname_rpc_threw', { detail: String(err) });
      return jsonError('SAVE_FAILED', 'Gagal menyimpan stok opname.', 500, {
        requestId: log.requestId,
      });
    }
  }

  const { data: active } = await supabase
    .from('loans')
    .select('book_id')
    .in('book_id', validIds)
    .in('status', ['borrowed', 'overdue']);
  const activeBookIds = ((active ?? []) as { book_id: string }[]).map((r) => r.book_id);
  const blocked = new Set(activeBookIds);

  const skipped: { id: string; reason: string }[] = [];
  const rows: { id: string; stock_total: number; stock_available: number }[] = [];
  // Peta buku yang ADA (id -> stock_available lama). Dimuat SEBELUM loop
  // (satu round-trip untuk semua kandidat, meniru pass 2 RPC yang mengunci
  // kandidat sekaligus) dan dipakai untuk DUA hal: cek eksistensi dan
  // `old_available` pada diffs.
  // Cek eksistensi wajib ada (review PR #122): id tak dikenal yang jatuh ke
  // `upsert` memicu NOT NULL title/slug/author (0001_core.sql) sehingga
  // SELURUH batch gagal — semua baris jadi 'Gagal menyimpan.' dengan HTTP 200,
  // sedangkan RPC hanya melewati baris itu dengan 'Buku tidak ditemukan.'.
  const existing = new Map<string, number>();
  {
    const { data: found, error: fetchError } = await supabase
      .from('books')
      .select('id,stock_available')
      .in('id', validIds);
    if (fetchError) {
      // Jangan ditelan: kegagalan baca yang diabaikan akan membuat SEMUA
      // baris tampak "tidak ditemukan" dan opname mengembalikan 200 kosong.
      log.error('books.stock_opname_fetch_failed', { detail: fetchError.message });
      return jsonError('SAVE_FAILED', 'Gagal menyimpan stok opname.', 500, {
        requestId: log.requestId,
      });
    }
    for (const b of (found ?? []) as { id: string; stock_available: number }[])
      existing.set(b.id, b.stock_available);
  }
  for (const item of items) {
    const rawId = item.id;
    const id = typeof rawId === 'string' ? rawId : String(rawId ?? '');
    if (!isUuid(rawId)) {
      skipped.push({ id: id || '(tanpa id)', reason: 'id wajib UUID valid.' });
      continue;
    }
    // Eksistensi SEBELUM cek pinjam — urutan identik dengan RPC pass 3
    // (id -> eksistensi -> dipinjam -> stok) agar reason dan urutan `skipped`
    // sama di kedua jalur.
    if (!existing.has(id)) {
      skipped.push({ id, reason: 'Buku tidak ditemukan.' });
      continue;
    }
    if (blocked.has(id)) {
      skipped.push({ id, reason: 'Dilewati: buku masih dipinjam.' });
      continue;
    }
    // Predikat stok IDENTIK dengan RPC stock_opname_tx (migrasi 0033): hanya
    // bilangan bulat >= 0 (angka JSON atau string digit, maks 10 digit —
    // batas int4). Number() lama menerima null/""/true/"5.0" -> 0/1/5 dan
    // menulisnya; nilai > 2147483647 juga lolos lalu melempar 22003 di DB.
    // null = tidak valid (dilewati), sama seperti RPC.
    const st = parseOpnameStock(item.stock_total);
    const sa = parseOpnameStock(item.stock_available);
    if (st === null || sa === null) {
      skipped.push({ id, reason: 'Stok tidak valid: harus bilangan bulat >= 0.' });
      continue;
    }
    if (sa > st) {
      skipped.push({ id, reason: 'Stok tersedia melebihi stok total.' });
      continue;
    }
    // Tanpa clamp: buku berpinjaman sudah dilewati di atas — available akhir
    // selalu = nilai opname (sama seperti RPC, tanpa clamp tersembunyi).
    if (!rows.some((r) => r.id === id)) rows.push({ id, stock_total: st, stock_available: sa });
  }
  let updated: string[] = [];
  let diffs: { id: string; old_available: number | null; new_available: number }[] = [];
  if (rows.length > 0) {
    // old_available datang dari `existing` yang sudah dimuat sebelum loop
    // (bukan query kedua di sini) — tidak ada round-trip tambahan.
    diffs = rows.map((r) => ({
      id: r.id,
      old_available: existing.has(r.id) ? (existing.get(r.id) as number) : null,
      new_available: r.stock_available,
    }));
    const { error } = await supabase.from('books').upsert(rows, { onConflict: 'id' });
    if (error) {
      log.error('books.stock_opname_failed', { detail: error.message });
      for (const r of rows) skipped.push({ id: r.id, reason: 'Gagal menyimpan.' });
      diffs = [];
    } else {
      updated = rows.map((r) => r.id);
      try {
        await supabase.from('activity_logs').insert({
          user_id: user?.id ?? null,
          action: 'books.stock_opname',
          entity_type: 'books',
          entity_id: updated[0] as string,
          // bulk = jumlah baris yang TERUPDATE (identik dengan RPC:
          // array_length(v_updated, 1) > 1), bukan jumlah item input.
          metadata: { ids: updated, diffs, bulk: updated.length > 1 },
        });
      } catch {
        /* best-effort */
      }
    }
  }
  revalidateTag('books', 'max');
  return NextResponse.json({ data: { updated, skipped, diffs } });
}

/**
 * DELETE /api/books?id=<uuid>[,<uuid>...] -> staf (admin/librarian) SOFT.
 * Bulk soft-delete (is_active=false): lewati buku yang masih dipinjam
 * (borrowed/overdue), audit books.delete best-effort.
 * Balikan: { data: { deleted: string[], skipped: string[] } }.
 */
export async function DELETE(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const raw = (new URL(req.url).searchParams.get('id') ?? '').trim();
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) {
    return jsonError('VALIDATION', 'Parameter ?id= wajib (pisahkan koma untuk bulk).', 400);
  }

  // Guard: buku dengan loan aktif tidak ikut terhapus.
  const { data: active } = await supabase
    .from('loans')
    .select('book_id')
    .in('book_id', ids)
    .in('status', ['borrowed', 'overdue']);
  const blocked = new Set(((active ?? []) as { book_id: string }[]).map((r) => r.book_id));
  const deletable = ids.filter((id) => !blocked.has(id));
  const skipped = ids.filter((id) => blocked.has(id));

  if (deletable.length > 0) {
    const { error } = await supabase.from('books').update({ is_active: false }).in('id', deletable);
    if (error) {
      if ((error as { code?: string }).code === '23503')
        return NextResponse.json({ data: { deleted: [], skipped: ids } }, { status: 409 });
      return jsonError('DELETE_FAILED', 'Gagal menghapus buku.', 500, { requestId: log.requestId });
    }
    try {
      await supabase.from('activity_logs').insert({
        user_id: user?.id ?? null,
        action: 'books.delete',
        entity_type: 'books',
        entity_id: deletable[0] as string,
        metadata: { ids: deletable, bulk: ids.length > 1 },
      });
    } catch {
      /* best-effort: jangan gagalkan request bila log gagal */
    }
    revalidateTag('books', 'max');
  }

  return NextResponse.json({ data: { deleted: deletable, skipped } });
}
