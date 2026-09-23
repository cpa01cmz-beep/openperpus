import { vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup } from '@testing-library/react';

// Make React available globally for JSX
globalThis.React = React;

// Cleanup after each test to avoid DOM pollution
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

HTMLDialogElement.prototype.showModal = vi.fn();
HTMLDialogElement.prototype.close = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.pdf' }, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/test.pdf' } })),
      })),
    },
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  })),
}));

vi.mock('@/components/ui/Button', () => ({
  default: ({
    children,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button disabled={loading} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/admin/UploadInput', () => {
  const UploadInput = ({
    value,
    onUploaded,
    ...props
  }: {
    value: string;
    onUploaded: (url: string) => void;
    folder?: string;
    accept?: string;
    label?: string;
  }) => (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploaded(URL.createObjectURL(file));
          }
        }}
        {...props}
      />
      {value && <span>Current: {value}</span>}
    </div>
  );
  return {
    default: UploadInput,
    ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  };
});

vi.mock('@/components/admin/SearchCombobox', () => {
  const SearchCombobox = ({
    options = [],
    value,
    onPick,
  }: {
    options: Array<{ id: string; label: string; sub?: string }>;
    value: string;
    onPick: (id: string, option: { id: string; label: string; sub?: string }) => void;
  }) => (
    <div>
      <select
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.id === e.target.value);
          if (opt) onPick(e.target.value, opt);
        }}
      >
        <option value="">Pilih...</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  return { default: SearchCombobox };
});
