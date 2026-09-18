"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";

type Tab = "pages" | "faqs" | "testimonials";

type PageItem = { id: string; slug: string; title: string; is_active: boolean };
type Faq = { id: string; question: string; answer: string; category: string | null; is_active: boolean };
type Testimonial = { id: string; name: string; role: string | null; content: string; rating: number; is_active: boolean };

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return "Gagal.";
  return typeof err === "string" ? err : err.message ?? "Gagal.";
}

async function apiList(path: string) {
  const res = await fetch(`${path}?per_page=50`, { cache: "no-store" });
  if (res.status === 404) return { missing: true as const, rows: [] as never[] };
  const json = (await res.json()) as { data?: never[] };
  if (!res.ok) throw new Error(errMsg(json));
  return { missing: false as const, rows: (json.data ?? []) as never[] };
}

export default function KontenPage() {
  const [tab, setTab] = useState<Tab>("pages");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [testis, setTestis] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<Record<Tab, boolean>>({ pages: false, faqs: false, testimonials: false });
  const [error, setError] = useState("");

  const [pageForm, setPageForm] = useState({ title: "", content_md: "", excerpt: "" });
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "" });
  const [testiForm, setTestiForm] = useState({ name: "", role: "", content: "", rating: 5 });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, f, t] = await Promise.all([apiList("/api/pages"), apiList("/api/faqs"), apiList("/api/testimonials")]);
      setPages(p.rows as PageItem[]);
      setFaqs(f.rows as Faq[]);
      setTestis(t.rows as Testimonial[]);
      setMissing({ pages: p.missing, faqs: f.missing, testimonials: t.missing });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(kind: Tab, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const path = kind === "pages" ? "/api/pages" : kind === "faqs" ? "/api/faqs" : "/api/testimonials";
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setMissing((m) => ({ ...m, [kind]: true }));
        return alert(`API ${path} belum tersedia di backend.`);
      }
      if (!res.ok) return alert(errMsg(json));
      if (kind === "pages") setPageForm({ title: "", content_md: "", excerpt: "" });
      if (kind === "faqs") setFaqForm({ question: "", answer: "", category: "" });
      if (kind === "testimonials") setTestiForm({ name: "", role: "", content: "", rating: 5 });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(kind: Tab, id: string, is_active: boolean) {
    const path = kind === "pages" ? "/api/pages" : kind === "faqs" ? "/api/faqs" : "/api/testimonials";
    const res = await fetch(`${path}?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !is_active }),
    });
    if (res.status === 404) {
      setMissing((m) => ({ ...m, [kind]: true }));
      return alert(`API ${path} belum tersedia di backend.`);
    }
    if (!res.ok) return alert("Gagal update.");
    load();
  }

  async function onDelete(kind: Tab, id: string) {
    if (!confirm("Hapus data ini?")) return;
    const path = kind === "pages" ? "/api/pages" : kind === "faqs" ? "/api/faqs" : "/api/testimonials";
    const res = await fetch(`${path}?id=${id}`, { method: "DELETE" });
    if (res.status === 404) {
      setMissing((m) => ({ ...m, [kind]: true }));
      return alert(`API ${path} belum tersedia di backend.`);
    }
    if (!res.ok) return alert("Gagal menghapus.");
    load();
  }

  const missingPaths = [
    missing.pages && "/api/pages",
    missing.faqs && "/api/faqs",
    missing.testimonials && "/api/testimonials",
  ].filter((v): v is string => typeof v === "string");
  const input = "rounded-lg border px-3 py-2 text-sm";
  const tabs: { key: Tab; label: string }[] = [
    { key: "pages", label: "Halaman" },
    { key: "faqs", label: "FAQ" },
    { key: "testimonials", label: "Testimoni" },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Konten</h1>
        <p className="text-sm text-slate-500">
          Kelola halaman dinamis, FAQ, dan testimoni. Untuk artikel &amp; banner gunakan menu Artikel / Banner.
        </p>
      </div>

      {missingPaths.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          API{" "}
          {missingPaths.map((p, i) => (
            <span key={p}>
              <code className="font-mono">{p}</code>
              {i < missingPaths.length - 1 ? ", " : " "}
            </span>
          ))}
          belum tersedia di backend (404). Sudah dilaporkan ke mandor.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div role="tablist" aria-label="Jenis konten" className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-slate-900 text-white" : "border text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto rounded-lg border px-3 py-2 text-sm">
          Muat ulang
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : (
        <>
          {tab === "pages" && (
            <section className="grid gap-4" aria-label="Halaman dinamis">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!pageForm.title.trim() || !pageForm.content_md.trim()) return alert("Judul & konten wajib.");
                  onAdd("pages", pageForm);
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <input className={input} placeholder="Judul* (slug otomatis)" value={pageForm.title} onChange={(e) => setPageForm({ ...pageForm, title: e.target.value })} required />
                <input className={input} placeholder="Ringkasan (excerpt)" value={pageForm.excerpt} onChange={(e) => setPageForm({ ...pageForm, excerpt: e.target.value })} />
                <textarea className={input} rows={4} placeholder="Konten markdown* (content_md)" value={pageForm.content_md} onChange={(e) => setPageForm({ ...pageForm, content_md: e.target.value })} required />
                <button disabled={busy} className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
                  {busy ? "…" : "+ Tambah Halaman"}
                </button>
              </form>
              <DataTable<PageItem>
                columns={[
                  { key: "title", header: "Judul", render: (r) => <span className="font-medium">{r.title}</span> },
                  { key: "slug", header: "Slug" },
                  { key: "is_active", header: "Aktif", render: (r) => (r.is_active ? "Ya" : "Tidak") },
                  {
                    key: "aksi",
                    header: "Aksi",
                    render: (r) => (
                      <span className="flex gap-2">
                        <button onClick={() => onToggle("pages", r.id, r.is_active)} className="text-blue-600 hover:underline">
                          {r.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button onClick={() => onDelete("pages", r.id)} className="text-red-600 hover:underline">
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={pages}
                getRowKey={(r) => r.id}
                emptyText="Belum ada halaman."
              />
            </section>
          )}

          {tab === "faqs" && (
            <section className="grid gap-4" aria-label="FAQ">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!faqForm.question.trim() || !faqForm.answer.trim()) return alert("Pertanyaan & jawaban wajib.");
                  onAdd("faqs", { ...faqForm, sort_order: 0 });
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <input className={input} placeholder="Pertanyaan*" value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} required />
                <textarea className={input} rows={3} placeholder="Jawaban*" value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} required />
                <div className="flex gap-2">
                  <input className={input} placeholder="Kategori (opsional)" value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} />
                  <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
                    {busy ? "…" : "+ Tambah FAQ"}
                  </button>
                </div>
              </form>
              <DataTable<Faq>
                columns={[
                  { key: "question", header: "Pertanyaan", render: (r) => <span className="font-medium">{r.question}</span> },
                  { key: "category", header: "Kategori", render: (r) => r.category ?? "-" },
                  { key: "is_active", header: "Aktif", render: (r) => (r.is_active ? "Ya" : "Tidak") },
                  {
                    key: "aksi",
                    header: "Aksi",
                    render: (r) => (
                      <span className="flex gap-2">
                        <button onClick={() => onToggle("faqs", r.id, r.is_active)} className="text-blue-600 hover:underline">
                          {r.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button onClick={() => onDelete("faqs", r.id)} className="text-red-600 hover:underline">
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={faqs}
                getRowKey={(r) => r.id}
                emptyText="Belum ada FAQ."
              />
            </section>
          )}

          {tab === "testimonials" && (
            <section className="grid gap-4" aria-label="Testimoni">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!testiForm.name.trim() || !testiForm.content.trim()) return alert("Nama & isi wajib.");
                  onAdd("testimonials", { ...testiForm, sort_order: 0 });
                }}
                className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4"
              >
                <div className="flex gap-2">
                  <input className={input} placeholder="Nama*" value={testiForm.name} onChange={(e) => setTestiForm({ ...testiForm, name: e.target.value })} required />
                  <input className={input} placeholder="Peran (ex: Mahasiswa)" value={testiForm.role} onChange={(e) => setTestiForm({ ...testiForm, role: e.target.value })} />
                  <select className={input} aria-label="Rating" value={testiForm.rating} onChange={(e) => setTestiForm({ ...testiForm, rating: Number(e.target.value) })}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        ★ {n}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea className={input} rows={3} placeholder="Isi testimoni*" value={testiForm.content} onChange={(e) => setTestiForm({ ...testiForm, content: e.target.value })} required />
                <button disabled={busy} className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
                  {busy ? "…" : "+ Tambah Testimoni"}
                </button>
              </form>
              <DataTable<Testimonial>
                columns={[
                  { key: "name", header: "Nama", render: (r) => <span className="font-medium">{r.name}</span> },
                  { key: "rating", header: "Rating", render: (r) => `★ ${r.rating}` },
                  { key: "is_active", header: "Aktif", render: (r) => (r.is_active ? "Ya" : "Tidak") },
                  {
                    key: "aksi",
                    header: "Aksi",
                    render: (r) => (
                      <span className="flex gap-2">
                        <button onClick={() => onToggle("testimonials", r.id, r.is_active)} className="text-blue-600 hover:underline">
                          {r.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button onClick={() => onDelete("testimonials", r.id)} className="text-red-600 hover:underline">
                          Hapus
                        </button>
                      </span>
                    ),
                  },
                ]}
                rows={testis}
                getRowKey={(r) => r.id}
                emptyText="Belum ada testimoni."
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
