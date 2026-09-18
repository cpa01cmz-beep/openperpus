"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, getTheme, themes } from "@/lib/themes";

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal menyimpan tema.";
  return typeof err === "string" ? err : err.message ?? "Gagal menyimpan tema.";
}

export default function ThemeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [active, setActive] = useState(current || "emerald");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onSelect(id: string) {
    setMsg("");
    setErr("");
    if (!THEMES[id] || getTheme(id).id !== id) {
      setErr(`Tema "${id}" tidak dikenal.`);
      return;
    }
    if (id === active) return;
    setSavingId(id);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
    <section className="grid max-w-4xl gap-4 rounded-2xl border bg-white p-6">
      <div>
        <h2 className="font-semibold">Tema Tampilan</h2>
        <p className="text-sm text-slate-500">Pilih salah satu dari 5 tema. Perubahan tersimpan otomatis.</p>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
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
              className={`grid gap-2 rounded-xl border p-4 text-left transition disabled:opacity-50 ${
                isActive ? "border-slate-900 ring-2 ring-slate-900" : "hover:border-slate-400"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{t.name}</span>
                {isActive && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                    Aktif
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-500">{t.description}</span>
              <span className="mt-1 flex gap-1.5">
                <span
                  title="brand"
                  className="h-6 w-6 rounded-full border"
                  style={{ backgroundColor: t.tokens.brand }}
                />
                <span
                  title="accent"
                  className="h-6 w-6 rounded-full border"
                  style={{ backgroundColor: t.tokens.accent }}
                />
                <span
                  title="surface"
                  className="h-6 w-6 rounded-full border"
                  style={{ backgroundColor: t.tokens.surface }}
                />
                <span
                  title="ink"
                  className="h-6 w-6 rounded-full border"
                  style={{ backgroundColor: t.tokens.ink }}
                />
              </span>
              <span className="flex items-center gap-2">
                <span
                  title={t.fonts.heading}
                  className="text-base font-bold leading-none text-slate-900"
                  style={{ fontFamily: t.fonts.heading }}
                >
                  Aa
                </span>
                <span
                  title={`radius ${t.radius.lg}`}
                  className="h-5 w-5 border border-slate-400"
                  style={{ borderRadius: t.radius.lg, backgroundColor: t.tokens.surface }}
                />
                <span className="flex items-center gap-1">
                  {t.layout.homepageSections.map((s) => (
                    <span
                      key={s.id}
                      title={s.id}
                      className={`h-1.5 w-3 rounded-full ${s.enabled ? "" : "opacity-30"}`}
                      style={{ backgroundColor: t.tokens.brand }}
                    />
                  ))}
                </span>
              </span>
              <span className="text-xs font-medium text-slate-600">
                {isSaving ? "Menyimpan…" : isActive ? "Tema saat ini" : "Aktifkan tema ini"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
