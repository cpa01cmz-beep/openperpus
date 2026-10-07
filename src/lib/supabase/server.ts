import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase Server Client untuk App Router (Server Components / Route Handlers).
 * Memakai cookies() dari next/headers agar sesi SSR terbawa.
 * Di-memoize per-request via cache() agar satu request memakai satu instance.
 */
export const createClient = cache(() => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Next 15+: cookies() mengembalikan Promise — dibaca lazy di dalam
        // callback (di-await oleh @supabase/ssr) agar createClient() tetap sinkron.
        async getAll() {
          return (await cookies()).getAll();
        },
        async setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            const cookieStore = await cookies();
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
