import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLibrarySettings } from "@/lib/settings";
import Sidebar from "@/components/admin/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileResult, settings] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getLibrarySettings(),
  ]);
  const role = (profileResult.data as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "librarian") redirect("/login");

  const libraryName = settings?.name ?? "Perpustakaan";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="lg:flex">
        <Sidebar libraryName={libraryName} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
