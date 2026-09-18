import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase Browser Client untuk Client Components di panel admin.
 * Singleton sederhana agar tidak membuat banyak instance.
 */
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
