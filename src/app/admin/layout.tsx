import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isStaffRole } from '@/lib/supabase/auth';
import { ROLE_HEADER } from '@/lib/role-claim';
import { getLibrarySettings } from '@/lib/settings';
import Sidebar from '@/components/admin/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = (await headers()).get(ROLE_HEADER);
  if (!isStaffRole(role)) redirect('/login');

  const settings = await getLibrarySettings();

  const libraryName = settings?.name ?? 'Perpustakaan';

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="lg:flex">
        <Sidebar libraryName={libraryName} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
