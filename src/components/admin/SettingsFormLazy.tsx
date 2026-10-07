'use client';

import nextDynamic from 'next/dynamic';

// ponytail: Next 16 melarang ssr:false di server component — wrapper client ini
// mempertahankan lazy-load tanpa SSR. Upgrade path: bila SettingsForm sudah SSR-safe, hapus wrapper.
export default nextDynamic(() => import('./SettingsForm'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Memuat formulir…</p>,
});
