'use client';

import nextDynamic from 'next/dynamic';

// ponytail: Next 16 melarang ssr:false di server component — wrapper client ini
// mempertahankan lazy-load tanpa SSR. Upgrade path: bila BookForm sudah SSR-safe, hapus wrapper.
export default nextDynamic(() => import('./BookForm'), {
  ssr: false,
  loading: () => <p className="text-sm text-ink/70">Memuat formulir…</p>,
});
