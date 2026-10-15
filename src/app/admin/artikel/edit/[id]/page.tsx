'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ARTICLE_STATUS } from '@/lib/enums';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { errMsg } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function EditArtikelPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    content_md: '',
    excerpt: '',
    cover_url: '',
    category: '',
    status: 'draft',
  });

  useEffect(() => {
    async function loadById() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', params.id)
        .single();
      if (error || !data) {
        setErr('Artikel tidak ditemukan.');
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? '',
        slug: data.slug ?? '',
        content_md: data.content_md ?? '',
        excerpt: data.excerpt ?? '',
        cover_url: data.cover_url ?? '',
        category: data.category ?? '',
        status: data.status ?? 'draft',
      });
      setPublishedAt(data.published_at ?? null);
      setLoading(false);
    }
    loadById();
  }, [params.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!form.title.trim() || !form.content_md.trim()) return setErr('Judul & konten wajib.');
    setSaving(true);
    try {
      const res = await fetch(`/api/articles/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json, 'Gagal menyimpan artikel.'));
      router.push('/admin/artikel');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const rawInput =
    'h-11 min-h-[44px] w-full rounded-md border border-[var(--ink)]/10 bg-surface px-4 text-sm text-ink transition hover:border-[var(--ink)]/20 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';
  if (loading) return <p className="text-sm text-ink/60">Memuat artikel…</p>;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Artikel</h1>
      <form
        onSubmit={onSubmit}
        className="grid max-w-2xl gap-2 rounded-[var(--radius-lg)] border bg-surface p-4"
      >
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <Input
          id="artikel-title"
          label="Judul"
          placeholder="Judul*"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <Input
          id="artikel-slug"
          label="Slug"
          placeholder="Slug (otomatis dari judul bila kosong)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              id="artikel-cover-url"
              label="URL Sampul"
              placeholder="URL Sampul"
              value={form.cover_url}
              onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input
              id="artikel-category"
              label="Kategori"
              placeholder="Kategori"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
        </div>
        <Input
          id="artikel-excerpt"
          label="Ringkasan"
          placeholder="Ringkasan (excerpt)"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
        <textarea
          className={rawInput}
          rows={6}
          placeholder="Konten markdown* (content_md)"
          value={form.content_md}
          onChange={(e) => setForm({ ...form, content_md: e.target.value })}
          required
          aria-label="Konten markdown"
        />
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label
              htmlFor="artikel-status"
              className="mb-1.5 block text-sm font-semibold text-ink/80"
            >
              Status
            </label>
            <select
              id="artikel-status"
              className={rawInput}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {ARTICLE_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={saving}>
            Simpan Perubahan
          </Button>
        </div>
        {publishedAt && <p className="text-xs text-ink/60">published_at: {publishedAt}</p>}
      </form>
    </div>
  );
}
