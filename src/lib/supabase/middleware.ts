import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/**
 * Helper sesi untuk middleware di root (middleware.ts):
 *
 *   import { updateSession } from "@/lib/supabase/middleware";
 *   export async function middleware(req: NextRequest) {
 *     return updateSession(req);
 *   }
 *
 * Tugasnya: refresh token Supabase via cookies lalu lanjutkan request.
 * Mengembalikan response + user dari SATU getUser() agar pemanggil
 * tidak perlu createServerClient->getUser kedua (dedupe auth roundtrip).
 */
export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: User | null }> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Penting: jangan hapus — me-refresh sesi agar tidak expired.
  // Satu-satunya getUser() di jalur middleware; hasilnya dipakai ulang pemanggil.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
