import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/supabase/auth';

/**
 * Shared session retrieval for API routes.
 * Returns authenticated user session with role and membership info.
 */
export type Session = {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  role: string;
  memberId: string | null;
  isStaff: boolean;
};

/**
 * Sesi login apa pun (anggota boleh). Kembalikan 401 bila belum login.
 */
export async function getSession(): Promise<
  { session: Session } | { errorResponse: ReturnType<typeof jsonError> }
> {
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return { errorResponse: jsonError('UNAUTHORIZED', 'Silakan login.', 401) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? 'member';
  const isStaff = role === 'admin' || role === 'librarian';

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const memberId = (member as { id: string } | null)?.id ?? null;

  return { session: { supabase, userId: user.id, role, memberId, isStaff } };
}
