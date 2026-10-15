import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DunningButton from '@/components/admin/DunningButton';

const NOW = new Date('2026-10-15T12:00:00.000Z');
// Jatuh tempo tepat 2 hari sebelum NOW -> lateDays = 2 (ceil dari 2.0).
const DUE_AT = '2026-10-13T12:00:00.000Z';

describe('DunningButton lateDays (review #235: clock tidak membeku di mount)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menyegar keterlambatan saat hari berganti, bukan membeku di waktu mount', async () => {
    render(
      <DunningButton loanId="L-1" memberCode="M-01" title="Buku A" dueAt={DUE_AT} fine={5000} />
    );

    const link = screen.getByRole('link', { name: /tagih wa/i });
    const waText = () => decodeURIComponent(link.getAttribute('href') ?? '');
    expect(waText()).toContain('telat 2 hari');

    // +1 jam: keterlambatan naik jadi 2 hari 1 jam -> ceil = 3 hari.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });

    expect(waText()).toContain('telat 3 hari');
  });

  it('melepas interval saat unmount', () => {
    const { unmount } = render(
      <DunningButton loanId="L-2" memberCode="M-02" title="Buku B" dueAt={DUE_AT} fine={1000} />
    );

    unmount();

    // Tak ada timer tersisa -> advance tak error dan tak ada setState tertinggal.
    expect(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000)).not.toThrow();
  });
});
