'use client';

import { useState } from 'react';
import Image from 'next/image';

/** Kolom canonical migrasi 0001 (library_settings). */
export type SettingsRow = {
  name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  operational_hours?: unknown;
  socials?: unknown;
  welcome_text?: string | null;
  vision?: string | null;
  mission?: string | null;
  about?: string | null;
  seo_title?: string | null;
  seo_desc?: string | null;
  announcement?: string | null;
};

function toText(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

function parseMaybeJSON(s: string): unknown {
  const t = s.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal menyimpan.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal menyimpan.');
}

export default function SettingsForm({ initial }: { initial: SettingsRow }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    name: initial.name ?? '',
    tagline: initial.tagline ?? '',
    logo_url: initial.logo_url ?? '',
    favicon_url: initial.favicon_url ?? '',
    address: initial.address ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    operational_hours: toText(
      initial.operational_hours ?? [{ day: 'Senin-Jumat', open: '08:00', close: '20:00' }]
    ),
    socials: toText(initial.socials ?? { instagram: '', facebook: '', youtube: '', tiktok: '' }),
    welcome_text: initial.welcome_text ?? '',
    vision: initial.vision ?? '',
    mission: initial.mission ?? '',
    about: initial.about ?? '',
    seo_title: initial.seo_title ?? '',
    seo_desc: initial.seo_desc ?? '',
    announcement: initial.announcement ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (form.name.trim().length < 3) return setErr('Nama perpustakaan minimal 3 karakter.');
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline || null,
        logo_url: form.logo_url || null,
        favicon_url: form.favicon_url || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        operational_hours: parseMaybeJSON(form.operational_hours),
        socials: parseMaybeJSON(form.socials),
        welcome_text: form.welcome_text || null,
        vision: form.vision || null,
        mission: form.mission || null,
        about: form.about || null,
        seo_title: form.seo_title || null,
        seo_desc: form.seo_desc || null,
        announcement: form.announcement || null,
      };
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setMsg('Pengaturan berhasil disimpan.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const label = 'grid gap-1 text-sm font-medium';
  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-5">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Identitas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Nama perpustakaan*
            <input
              className={input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </label>
          <label className={label}>
            Tagline
            <input
              className={input}
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </label>
          <label className={label}>
            Logo URL
            <input
              className={input}
              value={form.logo_url}
              onChange={(e) => set('logo_url', e.target.value)}
              placeholder="https://…/logo.png"
            />
          </label>
          <label className={label}>
            Favicon URL
            <input
              className={input}
              value={form.favicon_url}
              onChange={(e) => set('favicon_url', e.target.value)}
              placeholder="https://…/favicon.ico"
            />
          </label>
        </div>
        {form.logo_url && (
          <Image
            src={form.logo_url}
            alt="Logo"
            width={64}
            height={64}
            sizes="64px"
            className="h-16 w-auto rounded border bg-slate-50 p-1"
          />
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Telepon
            <input
              className={input}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </label>
          <label className={label}>
            Email
            <input
              type="email"
              className={input}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </label>
          <label className={label}>
            Alamat
            <input
              className={input}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </label>
        </div>
        <label className={label}>
          Jam operasional (JSON: [{`day, open, close`}])
          <textarea
            className={`${input} font-mono`}
            rows={4}
            value={form.operational_hours}
            onChange={(e) => set('operational_hours', e.target.value)}
          />
        </label>
        <label className={label}>
          Sosial media (JSON: instagram/facebook/youtube/tiktok)
          <textarea
            className={`${input} font-mono`}
            rows={4}
            value={form.socials}
            onChange={(e) => set('socials', e.target.value)}
          />
        </label>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Konten & SEO</h2>
        <label className={label}>
          Sambutan (welcome_text)
          <textarea
            className={input}
            rows={4}
            value={form.welcome_text}
            onChange={(e) => set('welcome_text', e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Visi
            <textarea
              className={input}
              rows={3}
              value={form.vision}
              onChange={(e) => set('vision', e.target.value)}
            />
          </label>
          <label className={label}>
            Misi
            <textarea
              className={input}
              rows={3}
              value={form.mission}
              onChange={(e) => set('mission', e.target.value)}
            />
          </label>
        </div>
        <label className={label}>
          Tentang (about)
          <textarea
            className={input}
            rows={3}
            value={form.about}
            onChange={(e) => set('about', e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            SEO Title
            <input
              className={input}
              value={form.seo_title}
              onChange={(e) => set('seo_title', e.target.value)}
            />
          </label>
          <label className={label}>
            SEO Description
            <textarea
              className={input}
              rows={2}
              value={form.seo_desc}
              onChange={(e) => set('seo_desc', e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Pengumuman</h2>
        <label className={label}>
          Pengumuman (announcement)
          <textarea
            className={input}
            rows={2}
            value={form.announcement}
            onChange={(e) => set('announcement', e.target.value)}
          />
        </label>
        <button
          disabled={loading}
          className="inline-flex min-h-[44px] w-fit items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </section>
    </form>
  );
}
