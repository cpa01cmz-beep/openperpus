'use client';

import { useSyncExternalStore } from 'react';

function subscribeOnline(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

/** Status jaringan untuk error boundary (root + global).
 *  - subscribe/unsubscribe simetris: tak ada listener tertinggal, tak ada
 *    setState yang perlu dibatalkan (queueMicrotask tak lagi dipakai).
 *  - snapshot server `true`: sama dengan render awal sehingga aman hidrasi.
 *  - tanpa useEffect + setState/queueMicrotask: lolos react-hooks/set-state-in-effect. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    () => true
  );
}
