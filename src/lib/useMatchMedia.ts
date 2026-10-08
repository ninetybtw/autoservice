import { useSyncExternalStore } from 'react';

/** true, когда медиа-запрос выполняется (обновляется при повороте экрана и изменении окна). */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
