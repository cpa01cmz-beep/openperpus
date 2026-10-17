import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/http-error';

/**
 * POST /api/auth/logout — akhiri sesi Supabase (hapus cookie sesi via setAll).
 * Dipanggil dari form POST di Sidebar (bukan link GET) agar mendapat gate
 * CSRF same-origin dari middleware secara otomatis.
 * Redirect 303 ke /login setelah signOut sukses maupun gagal-idempoten
 * (sesi sudah bersih tidak perlu membuat pengguna terjebak error).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return jsonError('LOGOUT_FAILED', 'Gagal mengakhiri sesi.', 500);
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
