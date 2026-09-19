import { notFound } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import type { BookInitial, CategoryOption, RackOption } from '@/components/admin/BookForm';

const BookForm = nextDynamic(() => import('@/components/admin/BookForm'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Memuat formulir…</p>,
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchCategories() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id,name')
      .eq('is_active', true)
      .order('name', { ascending: true })
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
      .from('racks')
      .select('id,code,name')
      .eq('is_active', true)
      .order('code', { ascending: true })
      .limit(100);
    if (error || !data) return [];
    return data as { id: string; code: string; name: string }[];
  } catch {
    return [];
  }
}

export default async function EditBukuPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.from('books').select('*').eq('id', params.id).single();
  if (!data) notFound();

  const [categories, racks] = await Promise.all([fetchCategories(), fetchRacks()]);

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Buku</h1>
      <BookForm
        mode="edit"
        initial={data as BookInitial}
        categories={categories as CategoryOption[]}
        racks={racks as RackOption[]}
      />
    </div>
  );
}
