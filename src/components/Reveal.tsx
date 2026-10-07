import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react';
import { prefersReducedMotion, refreshGlass } from './LiquidGlass.tsx';

/** Плавное появление при прокрутке. При «Уменьшить движение» содержимое видно сразу, без анимации. */
export function Reveal({ children, as: Tag = 'div', className = '', id }: { children: ReactNode; as?: ElementType; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
          // стекло нижней панели должно преломлять уже появившийся раздел
          refreshGlass(800);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <Tag ref={ref} id={id} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </Tag>
  );
}
