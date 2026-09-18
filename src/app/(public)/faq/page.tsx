import Link from "next/link";
import { ArrowRight, Mail, Phone } from "lucide-react";
import FaqAccordion, { type FaqItem } from "@/components/public/FaqAccordion";
import { fetchSettings } from "@/lib/books";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 60;

export async function generateMetadata() {
  const s = await fetchSettings();
  return {
    title: `FAQ — ${s.name ?? "Perpustakaan"}`,
    description: `Jawaban atas pertanyaan umum seputar keanggotaan, peminjaman, dan layanan ${
      s.name ?? "perpustakaan"
    }.`,
  };
}

/** FAQ aktif dari tabel faqs (diambil di page agar lib/ tak perlu diubah). */
async function fetchFaqs(): Promise<FaqItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faqs")
      .select("id,question,answer,category")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data as FaqItem[];
  } catch {
    return [];
  }
}

/** FAQ: cari + filter kategori + kartu bantuan dari settings. */
export default async function FaqPage() {
  const [settings, faqs] = await Promise.all([fetchSettings(), fetchFaqs()]);
  const siteName = settings.name ?? "Perpustakaan Digital";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Bantuan
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Pertanyaan Umum
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
          Jawaban cepat seputar keanggotaan, peminjaman, dan layanan {siteName}.
        </p>
      </header>

      <FaqAccordion faqs={faqs} />

      <section
        aria-labelledby="butuh-bantuan"
        className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8"
      >
        <h2 id="butuh-bantuan" className="font-heading text-xl font-bold">
          Masih butuh bantuan?
        </h2>
        <p className="mt-2 text-sm text-brand-soft/90 sm:text-base">
          Hubungi petugas sirkulasi pada jam operasional atau kunjungi halaman kontak.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {settings.phone && (
            <a
              href={`tel:${settings.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Phone className="h-4 w-4 text-accent" aria-hidden="true" />
              {settings.phone}
            </a>
          )}
          {settings.email && (
            <a
              href={`mailto:${settings.email}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
              {settings.email}
            </a>
          )}
          <Link
            href="/kontak"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Halaman kontak <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
