import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Klien Supabase PUBLIK tanpa cookies — untuk helper data publik
 * (src/lib/books.ts) yang dibungkus unstable_cache().
 *
 * Kenapa file ini ada: createClient() dari @/lib/supabase/server
 * memanggil cookies() (next/headers), dan Next.js MELARANG akses
 * Dynamic data source di dalam unstable_cache() — semua helper
 * publik melempar lalu jatuh ke fallback [] (halaman kosong).
 * Klien ini hanya memakai URL + anon key dari env, tanpa cookies,
 * sehingga aman dipakai di dalam cache scope. RLS tetap menjaga:
 * policy "public read ..." (roles anon,authenticated) yang berlaku.
 *
 * JANGAN pakai untuk operasi butuh sesi (admin/API guard) —
 * tetap pakai @/lib/supabase/server di sana.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum diset — salin .env.example ke .env.local."
    );
  }
  return createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
