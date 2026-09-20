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
  fine_per_day?: number | null;
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
    fine_per_day: String(
      typeof initial.fine_per_day === 'number' && initial.fine_per_day > 0
        ? initial.fine_per_day
        : 1000
    ),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (form.name.trim().length < 3) return setErr('Nama perpustakaan minimal 3 karakter.');
    const rate = Number(form.fine_per_day);
    if (!Number.isFinite(rate) || rate <= 0)
      return setErr('Tarif denda per hari (denda_per_hari) harus lebih dari 0.');
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
        fine_per_day: rate,
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

  const input =
    'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';
  const area =
    'min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';
  const label = 'grid gap-1 text-sm font-medium';
  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-5">
      {err && (
        <p
          id="settings-form-status"
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {err}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {msg}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Identitas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label} htmlFor="settings-name">
            Nama perpustakaan*
            <input
              id="settings-name"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </label>
          <label className={label} htmlFor="settings-tagline">
            Tagline
            <input
              id="settings-tagline"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </label>
          <label className={label} htmlFor="settings-logo-url">
            Logo URL
            <input
              id="settings-logo-url"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.logo_url}
              onChange={(e) => set('logo_url', e.target.value)}
              placeholder="https://…/logo.png"
            />
          </label>
          <label className={label} htmlFor="settings-favicon-url">
            Favicon URL
            <input
              id="settings-favicon-url"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
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
          <label className={label} htmlFor="settings-phone">
            Telepon
            <input
              id="settings-phone"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </label>
          <label className={label} htmlFor="settings-email">
            Email
            <input
              id="settings-email"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              type="email"
              className={input}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </label>
          <label className={label} htmlFor="settings-address">
            Alamat
            <input
              id="settings-address"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </label>
        </div>
        <label className={label} htmlFor="settings-operational-hours">
          Jam operasional (JSON: [{`day, open, close`}])
          <textarea
            id="settings-operational-hours"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={`${area} font-mono`}
            rows={4}
            value={form.operational_hours}
            onChange={(e) => set('operational_hours', e.target.value)}
          />
        </label>
        <label className={label} htmlFor="settings-socials">
          Sosial media (JSON: instagram/facebook/youtube/tiktok)
          <textarea
            id="settings-socials"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={`${area} font-mono`}
            rows={4}
            value={form.socials}
            onChange={(e) => set('socials', e.target.value)}
          />
        </label>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Konten & SEO</h2>
        <label className={label} htmlFor="settings-welcome-text">
          Sambutan (welcome_text)
          <textarea
            id="settings-welcome-text"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={area}
            rows={4}
            value={form.welcome_text}
            onChange={(e) => set('welcome_text', e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label} htmlFor="settings-vision">
            Visi
            <textarea
              id="settings-vision"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={area}
              rows={3}
              value={form.vision}
              onChange={(e) => set('vision', e.target.value)}
            />
          </label>
          <label className={label} htmlFor="settings-mission">
            Misi
            <textarea
              id="settings-mission"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={area}
              rows={3}
              value={form.mission}
              onChange={(e) => set('mission', e.target.value)}
            />
          </label>
        </div>
        <label className={label} htmlFor="settings-about">
          Tentang (about)
          <textarea
            id="settings-about"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={area}
            rows={3}
            value={form.about}
            onChange={(e) => set('about', e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label} htmlFor="settings-seo-title">
            SEO Title
            <input
              id="settings-seo-title"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={input}
              value={form.seo_title}
              onChange={(e) => set('seo_title', e.target.value)}
            />
          </label>
          <label className={label} htmlFor="settings-seo-desc">
            SEO Description
            <textarea
              id="settings-seo-desc"
              aria-invalid={err ? true : undefined}
              aria-describedby="settings-form-status"
              className={area}
              rows={2}
              value={form.seo_desc}
              onChange={(e) => set('seo_desc', e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-white p-6">
        <h2 className="font-semibold">Pengumuman</h2>
        <label className={label} htmlFor="settings-announcement">
          Pengumuman (announcement)
          <textarea
            id="settings-announcement"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={area}
            rows={2}
            value={form.announcement}
            onChange={(e) => set('announcement', e.target.value)}
          />
        </label>
        <label className={label} htmlFor="settings-fine-per-day">
          Tarif denda per hari / denda_per_hari (Rp)
          <input
            id="settings-fine-per-day"
            aria-invalid={err ? true : undefined}
            aria-describedby="settings-form-status"
            className={input}
            type="number"
            min={1}
            step={500}
            value={form.fine_per_day}
            onChange={(e) => set('fine_per_day', e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[44px] w-fit items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </section>
    </form>
  );
}
