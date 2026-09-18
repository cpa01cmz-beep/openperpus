import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookForm from "@/components/admin/BookForm";

async function fetchCategories() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data as { id: string; name: string }[];
  } catch {
    return [];
  }
}

async function fetchRacks() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("racks")
      .select("id,code,name")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data as { id: string; code: string; name: string }[];
  } catch {
    return [];
  }
}

export default async function EditBukuPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.from("books").select("*").eq("id", params.id).single();
  if (!data) notFound();

  const [categories, racks] = await Promise.all([fetchCategories(), fetchRacks()]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Buku</h1>
      <BookForm
        mode="edit"
        initial={data as Parameters<typeof BookForm>[0]["initial"]}
        categories={categories as Parameters<typeof BookForm>[0]["categories"]}
        racks={racks as Parameters<typeof BookForm>[0]["racks"]}
      />
    </div>
  );
}
