'use client';

import { useState, type FormEvent } from 'react';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  is_active: boolean;
};

const rawInput =
  'h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1';

export function FaqsTab({
  faqs,
  page,
  totalPages,
  onAddFaq,
  onToggleFaq,
  onDeleteFaq,
}: {
  faqs: Faq[];
  page: number;
  totalPages: number;
  onAddFaq: (body: Record<string, unknown>) => void;
  onToggleFaq: (id: string, is_active: boolean) => void;
  onDeleteFaq: (id: string) => void;
}) {
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '' });
  const [busy, setBusy] = useState(false);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim())
      return alert('Pertanyaan & jawaban wajib.');
    setBusy(true);
    onAddFaq({ ...faqForm, sort_order: 0 });
    setFaqForm({ question: '', answer: '', category: '' });
    setBusy(false);
  };

  return (
    <section className="grid gap-4" aria-label="FAQ">
      <form onSubmit={handleAdd} className="grid max-w-2xl gap-2 rounded-2xl border bg-white p-4">
        <Input
          id="konten-faq-question"
          label="Pertanyaan"
          placeholder="Pertanyaan*"
          value={faqForm.question}
          onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
          required
        />
        <div className="grid gap-1 text-sm">
          <label
            htmlFor="konten-faq-answer"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Jawaban
          </label>
          <textarea
            id="konten-faq-answer"
            className={rawInput}
            rows={3}
            placeholder="Jawaban*"
            value={faqForm.answer}
            onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              id="konten-faq-category"
              label="Kategori"
              placeholder="Kategori (opsional)"
              value={faqForm.category}
              onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
            />
          </div>
          <Button type="submit" loading={busy}>
            + Tambah FAQ
          </Button>
        </div>
      </form>
      <DataTable<Faq>
        caption={`Daftar konten halaman ${page} dari ${totalPages}`}
        columns={[
          {
            key: 'question',
            header: 'Pertanyaan',
            render: (r) => <span className="font-medium">{r.question}</span>,
          },
          { key: 'category', header: 'Kategori', render: (r) => r.category ?? '-' },
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
                  onClick={() => onToggleFaq(r.id, r.is_active)}
                  className="inline-flex min-h-[44px] items-center text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  onClick={() => onDeleteFaq(r.id)}
                  className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
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
  );
}
