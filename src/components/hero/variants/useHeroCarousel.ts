import { useCallback, useEffect, useState } from "react";

/** Shared carousel state: auto-rotate + pause on hover. Reused by all hero variants. */
export function useHeroCarousel(total: number) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (dir: 1 | -1) => setIdx((i) => (total <= 0 ? 0 : (i + dir + total) % total)),
    [total]
  );

  useEffect(() => {
    if (total <= 1 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % total), 6000);
    return () => clearInterval(t);
  }, [total, paused]);

  return { idx, setIdx, go, setPaused };
}
