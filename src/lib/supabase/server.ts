import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase Server Client untuk App Router (Server Components / Route Handlers).
 * Memakai cookies() dari next/headers agar sesi SSR terbawa.
 * Di-memoize per-request via cache() agar satu request memakai satu instance.
 */
export const createClient = cache(() => {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Dipanggil dari Server Component: Next.js melarang set cookie di sana.
            // Sesi tetap terbaca via getAll; refresh token ditangani middleware.
          }
        },
      },
    }
  );
});
