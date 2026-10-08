'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEMES, getTheme, themes } from '@/lib/themes';

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal menyimpan tema.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal menyimpan tema.');
}

export default function ThemeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [active, setActive] = useState(current || 'emerald');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function onSelect(id: string) {
    setMsg('');
    setErr('');
    if (!THEMES[id] || getTheme(id).id !== id) {
      setErr(`Tema "${id}" tidak dikenal.`);
      return;
    }
    if (id === active) return;
    setSavingId(id);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_theme: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setActive(id);
      setMsg(`Tema "${getTheme(id).name}" aktif.`);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="kartu grid max-w-4xl gap-4 p-6">
      <div className="kartu-kop -mx-6 -mt-6 px-6 pt-5 pb-4">
        <h2 className="font-heading text-lg font-bold text-heading">Tema Tampilan</h2>
        <p className="mt-1 text-sm text-ink/70">
          Pilih salah satu dari 5 tema. Perubahan tersimpan otomatis.
        </p>
      </div>
      {err && (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-3 py-2 text-sm text-ink"
        >
          {err}
        </p>
      )}
      {msg && (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-rule bg-brand-soft px-3 py-2 text-sm text-ink"
        >
          {msg}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => {
          const isActive = t.id === active;
          const isSaving = savingId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={savingId !== null}
              onClick={() => onSelect(t.id)}
              className={`grid gap-2 rounded-[var(--radius-md)] border p-4 text-left transition disabled:opacity-50 ${
                isActive
                  ? 'border-brand ring-2 ring-brand'
                  : 'border-rule hover:border-rule-strong hover:bg-brand-soft/40'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-heading font-bold">{t.name}</span>
                {isActive && <span className="pelat-plat">Aktif</span>}
              </span>
              <span className="text-xs text-ink/70">{t.description}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <span
                  role="img"
                  aria-label={`Warna brand: ${t.tokens.brand}`}
                  className="entri h-6 w-6 border border-[var(--rule-strong)] rounded-[var(--radius-sm)]"
                  style={{ backgroundColor: t.tokens.brand }}
                />
                <span
                  role="img"
                  aria-label={`Warna accent: ${t.tokens.accent}`}
                  className="h-6 w-6 border border-[var(--rule-strong)] rounded-[var(--radius-sm)]"
                  style={{ backgroundColor: t.tokens.accent }}
                />
                <span
                  role="img"
                  aria-label={`Warna surface: ${t.tokens.surface}`}
                  className="h-6 w-6 border border-[var(--rule-strong)] rounded-[var(--radius-sm)]"
                  style={{ backgroundColor: t.tokens.surface }}
                />
                <span
                  role="img"
                  aria-label={`Warna ink: ${t.tokens.ink}`}
                  className="h-6 w-6 border border-[var(--rule-strong)] rounded-[var(--radius-sm)]"
                  style={{ backgroundColor: t.tokens.ink }}
                />
              </span>
              <span className="flex items-center gap-2">
                <span
                  title={t.fonts.heading}
                  className="text-base font-bold leading-none text-heading"
                  style={{ fontFamily: t.fonts.heading }}
                >
                  Aa
                </span>
                <span
                  title={`radius ${t.radius.lg}`}
                  className="h-5 w-5 border border-[var(--rule-strong)]"
                  style={{ borderRadius: t.radius.lg, backgroundColor: t.tokens.surface }}
                />
                <span className="flex gap-1">
                  {t.layout.homepageSections.map((s) => (
                    <span
                      key={s.id}
                      title={s.id}
                      className={`h-1.5 w-3 ${s.enabled ? '' : 'opacity-30'}`}
                      style={{ backgroundColor: t.tokens.brand }}
                    />
                  ))}
                </span>
              </span>
              <span className={`text-xs font-semibold ${isActive ? 'text-brand' : 'text-ink/70'}`}>
                {isSaving ? 'Menyimpan…' : isActive ? 'Tema saat ini' : 'Aktifkan tema ini'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
