import { useEffect, useRef } from 'react';

export function useInterval(callback: () => void, intervalMs: number | null): void {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
