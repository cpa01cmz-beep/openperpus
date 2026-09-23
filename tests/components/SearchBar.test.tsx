import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchBar from '@/components/public/SearchBar';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('SearchBar', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onChange.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with placeholder and label', () => {
    render(<SearchBar value="" onChange={onChange} />);

    const input = screen.getByRole('searchbox', { name: /cari buku/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Cari judul, penulis, penerbit, ISBN…');
  });

  it('calls onChange with debounced value', async () => {
    render(<SearchBar value="" onChange={onChange} />);

    const input = screen.getByRole('searchbox');

    // Type in search
    fireEvent.change(input, { target: { value: 'harry' } });

    // Should not call onChange immediately (debounce)
    expect(onChange).not.toHaveBeenCalled();

    // Advance timers past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('harry');
  });

  it('clears search on Escape key', async () => {
    render(<SearchBar value="test" onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('test');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows clear button when there is input', () => {
    render(<SearchBar value="test" onChange={onChange} />);

    const clearButton = screen.getByRole('button', { name: /hapus pencarian/i });
    expect(clearButton).toBeInTheDocument();
  });

  it('clear button clears input and calls onChange', async () => {
    render(<SearchBar value="test" onChange={onChange} />);

    const clearButton = screen.getByRole('button', { name: /hapus pencarian/i });
    fireEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('syncs with external prop value changes', () => {
    const { rerender } = render(<SearchBar value="initial" onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    expect(input).toHaveValue('initial');

    rerender(<SearchBar value="updated" onChange={onChange} />);

    expect(input).toHaveValue('updated');
  });

  it('shows aria-busy during search', async () => {
    render(<SearchBar value="" onChange={onChange} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'searching' } });

    expect(input).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(input).toHaveAttribute('aria-busy', 'false');
  });

  it('respects custom id and placeholder props', () => {
    render(
      <SearchBar value="" onChange={onChange} id="custom-search" placeholder="Custom placeholder" />
    );

    const input = screen.getByRole('searchbox', { name: /cari buku/i });
    expect(input).toHaveAttribute('id', 'custom-search');
    expect(input).toHaveAttribute('placeholder', 'Custom placeholder');
  });
});
