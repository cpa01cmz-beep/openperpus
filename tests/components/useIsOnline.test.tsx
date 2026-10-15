import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useIsOnline } from '@/hooks/useIsOnline';

function Probe() {
  const online = useIsOnline();
  return <span data-testid="net">{online ? 'online' : 'offline'}</span>;
}

/** jsdom: onLine hidup di Navigator.prototype; shadow sbg own property. */
function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

afterEach(() => {
  // Kembalikan getter prototype (hapus shadow own property).
  delete (window.navigator as { onLine?: boolean }).onLine;
});

describe('useIsOnline (review #235: ganti queueMicrotask)', () => {
  it('mencerminkan navigator.onLine saat mount', () => {
    setOnLine(false);
    render(<Probe />);

    expect(screen.getByTestId('net')).toHaveTextContent('offline');

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('net')).toHaveTextContent('online');
  });

  it('mengikuti event online/offline dan melepas listener saat unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    setOnLine(true);
    const { unmount } = render(<Probe />);

    expect(screen.getByTestId('net')).toHaveTextContent('online');

    setOnLine(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('net')).toHaveTextContent('offline');

    setOnLine(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('net')).toHaveTextContent('online');

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));

    removeSpy.mockRestore();
  });
});
