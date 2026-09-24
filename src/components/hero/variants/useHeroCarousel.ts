import { useCallback, useEffect, useRef, useState } from 'react';

/** Shared carousel state: auto-rotate + pause on hover. Reused by all hero variants.
 *  Also owns transition flag (aria-busy) + arrow-key tab navigation (T-M2-EXT). */
export function useHeroCarousel(total: number) {
  const [idx, setIdxRaw] = useState(0);
  const [paused, setPaused] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markTransition = useCallback(() => {
    setTransitioning(true);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => setTransitioning(false), 700);
  }, []);

  const setIdx = useCallback(
    (i: number) => {
      setIdxRaw(i);
      markTransition();
    },
    [markTransition]
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      setIdxRaw((i) => (total <= 0 ? 0 : (i + dir + total) % total));
      markTransition();
    },
    [total, markTransition]
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, current: number) => {
      let next = current;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next = (current + 1) % total;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        next = (current - 1 + total) % total;
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = total - 1;
      }
      if (next !== current) setIdx(next);
    },
    [total, setIdx]
  );

  useEffect(() => {
    if (total <= 1 || paused) return;
    const t = setInterval(() => setIdxRaw((i) => (i + 1) % total), 6000);
    return () => clearInterval(t);
  }, [total, paused]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  return { idx, setIdx, go, setPaused, transitioning, handleTabKeyDown };
}
