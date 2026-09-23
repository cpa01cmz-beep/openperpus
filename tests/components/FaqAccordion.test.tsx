import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FaqAccordion from '@/components/public/FaqAccordion';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockFaqs = [
  {
    id: '1',
    question: 'Bagaimana cara pinjam buku?',
    answer: 'Datang ke perpustakaan dan tunjukkan KTM.',
    category: 'Peminjaman',
  },
  {
    id: '2',
    question: 'Berapa lama masa pinjam?',
    answer: 'Maksimal 14 hari dengan 1 kali perpanjangan.',
    category: 'Peminjaman',
  },
  {
    id: '3',
    question: 'Bagaimana cara bayar denda?',
    answer: 'Bayar via QRIS di menu Denda Saya.',
    category: 'Denda',
  },
  {
    id: '4',
    question: 'Bisa reservasi online?',
    answer: 'Ya, melalui katalog klik tombol Reservasi.',
    category: null,
  },
];

describe('FaqAccordion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all FAQs with questions and answers', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    mockFaqs.forEach((faq) => {
      expect(screen.getByText(faq.question)).toBeInTheDocument();
    });
  });

  it('filters FAQs by search query', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const searchInput = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(searchInput, { target: { value: 'denda' } });

    expect(screen.getByText('Bagaimana cara bayar denda?')).toBeInTheDocument();
    expect(screen.queryByText('Bagaimana cara pinjam buku?')).not.toBeInTheDocument();
    expect(screen.queryByText('Berapa lama masa pinjam?')).not.toBeInTheDocument();
  });

  it('filters FAQs by category', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const categoryButtons = screen.getAllByRole('button', { name: /peminjaman/i });
    fireEvent.click(categoryButtons[0]); // Click "Peminjaman" category

    expect(screen.getByText('Bagaimana cara pinjam buku?')).toBeInTheDocument();
    expect(screen.getByText('Berapa lama masa pinjam?')).toBeInTheDocument();
    expect(screen.queryByText('Bagaimana cara bayar denda?')).not.toBeInTheDocument();
  });

  it('shows category chips and allows selection', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    expect(screen.getByRole('button', { name: /semua/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /peminjaman/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /denda/i })).toBeInTheDocument();
  });

  it('opens and closes FAQ details (single-open mode)', async () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const firstQuestion = screen.getByText('Bagaimana cara pinjam buku?').closest('details');
    const secondQuestion = screen.getByText('Berapa lama masa pinjam?').closest('details');

    // Initially closed
    expect(firstQuestion).not.toHaveAttribute('open');
    expect(secondQuestion).not.toHaveAttribute('open');

    // Click first to open
    fireEvent.click(screen.getByText('Bagaimana cara pinjam buku?'));
    await waitFor(() => expect(firstQuestion).toHaveAttribute('open'));
    expect(secondQuestion).not.toHaveAttribute('open');

    // Click second - should close first and open second
    fireEvent.click(screen.getByText('Berapa lama masa pinjam?'));
    await waitFor(() => expect(secondQuestion).toHaveAttribute('open'));
    expect(firstQuestion).not.toHaveAttribute('open');
  });

  it('closes open FAQ on Escape key', async () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const firstQuestion = screen.getByText('Bagaimana cara pinjam buku?').closest('details');
    fireEvent.click(screen.getByText('Bagaimana cara pinjam buku?'));
    await waitFor(() => expect(firstQuestion).toHaveAttribute('open'));

    fireEvent.keyDown(firstQuestion!, { key: 'Escape' });
    await waitFor(() => expect(firstQuestion).not.toHaveAttribute('open'));
  });

  it('shows empty state when no FAQs match', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const searchInput = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(searchInput, { target: { value: 'xyz-nonexistent' } });

    expect(screen.getByText(/tidak ada jawaban yang cocok/i)).toBeInTheDocument();
    expect(screen.getByText(/coba kata kunci lain/i)).toBeInTheDocument();
  });

  it('shows empty state when no FAQs exist', () => {
    render(<FaqAccordion faqs={[]} />);

    expect(screen.getByText(/belum ada pertanyaan/i)).toBeInTheDocument();
  });

  it('displays count of filtered vs total FAQs', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    expect(screen.getByText(/menampilkan 4 dari 4 pertanyaan/i)).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(searchInput, { target: { value: 'denda' } });

    expect(screen.getByText(/menampilkan 1 dari 4 pertanyaan/i)).toBeInTheDocument();
  });

  it('shows reset filter button when filter is active', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const searchInput = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(searchInput, { target: { value: 'denda' } });

    expect(screen.getByRole('button', { name: /atur ulang filter/i })).toBeInTheDocument();
  });

  it('reset filter clears search and category', () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const searchInput = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(searchInput, { target: { value: 'denda' } });

    const categoryButton = screen.getByRole('button', { name: /peminjaman/i });
    fireEvent.click(categoryButton);

    fireEvent.click(screen.getByRole('button', { name: /atur ulang filter/i }));

    expect(searchInput).toHaveValue('');
    expect(screen.getByText('Bagaimana cara pinjam buku?')).toBeInTheDocument();
    expect(screen.getByText('Bagaimana cara bayar denda?')).toBeInTheDocument();
  });

  it('has accessible markup: aria-expanded, aria-controls, role region', async () => {
    render(<FaqAccordion faqs={mockFaqs} />);

    const firstQuestion = screen.getByText('Bagaimana cara pinjam buku?').closest('details');
    const summary = firstQuestion!.querySelector('summary');

    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveAttribute('aria-controls');

    fireEvent.click(screen.getByText('Bagaimana cara pinjam buku?'));
    await waitFor(() => expect(summary).toHaveAttribute('aria-expanded', 'true'));

    const panel = firstQuestion!.querySelector('[role="region"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('aria-live', 'polite');
  });
});
