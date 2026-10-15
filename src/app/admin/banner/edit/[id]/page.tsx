'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { errMsg } from '@/lib/admin-errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function EditBannerPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    link: '',
    sort_order: 0,
    is_active: true,
  });

  useEffect(() => {
    async function loadById() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .eq('id', params.id)
        .single();
      if (error || !data) {
        setErr('Banner tidak ditemukan.');
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? '',
        subtitle: data.subtitle ?? '',
        image_url: data.image_url ?? '',
        link: data.link ?? '',
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active ?? true,
      });
      setLoading(false);
    }
    loadById();
  }, [params.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!form.title.trim() || !form.image_url.trim()) return setErr('Judul & image_url wajib.');
    setSaving(true);
    try {
      const res = await fetch(`/api/banners/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json, 'Gagal menyimpan banner.'));
      router.push('/admin/banner');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/60">Memuat banner…</p>;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">Edit Banner</h1>
      <form
        onSubmit={onSubmit}
        className="grid max-w-2xl gap-2 rounded-[var(--radius-lg)] border bg-surface p-4"
      >
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <Input
          id="banner-title"
          label="Judul"
          placeholder="Judul*"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <Input
          id="banner-subtitle"
          label="Subjudul"
          placeholder="Subjudul"
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
        <Input
          id="banner-image-url"
          label="URL Gambar"
          placeholder="URL Gambar* https://…"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          required
        />
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              id="banner-link"
              label="URL Tautan"
              placeholder="URL Tautan"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <Input
              id="banner-sort-order"
              label="Urutan"
              type="number"
              placeholder="Urutan (sort_order)"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-5 w-5 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          Aktif (is_active)
        </label>
        <div className="w-fit">
          <Button type="submit" loading={saving}>
            Simpan Perubahan
          </Button>
        </div>
      </form>
    </div>
  );
}
