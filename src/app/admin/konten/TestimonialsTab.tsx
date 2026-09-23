'use client';

import { useState, type FormEvent } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  content: string;
  rating: number;
  is_active: boolean;
};

const rawInput =
  'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';

export function TestimonialsTab({
  testimonials,
  page,
  totalPages,
  onAddTestimonial,
  onToggleTestimonial,
  onDeleteTestimonial,
}: {
  testimonials: Testimonial[];
  page: number;
  totalPages: number;
  onAddTestimonial: (body: Record<string, unknown>) => void;
  onToggleTestimonial: (id: string, is_active: boolean) => void;
  onDeleteTestimonial: (id: string) => void;
}) {
  const [testiForm, setTestiForm] = useState({ name: '', role: '', content: '', rating: 5 });
  const [busy, setBusy] = useState(false);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!testiForm.name.trim() || !testiForm.content.trim()) return alert('Nama & isi wajib.');
    setBusy(true);
    onAddTestimonial({ ...testiForm, sort_order: 0 });
    setTestiForm({ name: '', role: '', content: '', rating: 5 });
    setBusy(false);
  };

  return (
    <section className="grid gap-4" aria-label="Testimoni">
      <form onSubmit={handleAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <Input
              id="konten-testi-name"
              label="Nama"
              placeholder="Nama*"
              value={testiForm.name}
              onChange={(e) => setTestiForm({ ...testiForm, name: e.target.value })}
              required
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input
              id="konten-testi-role"
              label="Peran"
              placeholder="Peran (ex: Mahasiswa)"
              value={testiForm.role}
              onChange={(e) => setTestiForm({ ...testiForm, role: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <label
              htmlFor="konten-testi-rating"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Rating
            </label>
            <select
              id="konten-testi-rating"
              className={rawInput}
              value={testiForm.rating}
              onChange={(e) => setTestiForm({ ...testiForm, rating: Number(e.target.value) })}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  ★ {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1 text-sm">
          <label
            htmlFor="konten-testi-content"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Isi testimoni
          </label>
          <textarea
            id="konten-testi-content"
            className={rawInput}
            rows={3}
            placeholder="Isi testimoni*"
            value={testiForm.content}
            onChange={(e) => setTestiForm({ ...testiForm, content: e.target.value })}
            required
          />
        </div>
        <Button type="submit" loading={busy} className="w-fit">
          + Tambah Testimoni
        </Button>
      </form>
      <DataTable<Testimonial>
        caption={`Daftar konten halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'name',
            header: 'Nama',
            render: (r) => <span className="font-medium">{r.name}</span>,
          },
          { key: 'rating', header: 'Rating', render: (r) => `★ ${r.rating}` },
          {
            key: 'is_active',
            header: 'Aktif',
            render: (r) => (r.is_active ? 'Ya' : 'Tidak'),
          },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <span className="flex gap-2">
                <button
                  onClick={() => onToggleTestimonial(r.id, r.is_active)}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  onClick={() => onDeleteTestimonial(r.id)}
                  className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Hapus
                </button>
              </span>
            ),
          },
        ]}
        rows={testimonials}
        getRowKey={(r) => r.id}
        emptyText="Belum ada testimoni."
      />
    </section>
  );
}
