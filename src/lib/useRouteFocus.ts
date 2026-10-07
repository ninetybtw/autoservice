import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * После перехода на другую страницу переносит фокус на её содержимое —
 * чтобы экранный диктор начал читать новую страницу, а не остался на старой кнопке.
 * При первой загрузке фокус не трогаем.
 */
export function useRouteFocus() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    ref.current?.focus({ preventScroll: true });
  }, [pathname]);
  return ref;
}
