/**
 * Настоящее стекло на liquid-gl (WebGPU/WebGL): преломляет то, что находится под элементом.
 *
 * - Стекло рисуется на отдельном слое, а надпись остаётся обычным текстом поверх — она всегда чёткая
 *   (content: false — библиотека не перерисовывает содержимое в текстуру).
 * - snapshot ограничивает, что видно сквозь стекло: для кнопки на главном фото это только фото,
 *   поэтому при прокрутке в кнопке не появляются буквы из соседних разделов.
 * - Без WebGL библиотека сама переходит на CSS backdrop-filter.
 */
import { useEffect, useId, useRef } from 'react';
import type { LiquidGLLens } from 'liquid-gl';

const lenses = new Set<LiquidGLLens>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/** Пересъёмка фона для всех стёкол — после загрузки данных, картинок и анимаций появления. */
export function refreshGlass(delay = 450) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    for (const lens of lenses) void lens.renderer?.captureSnapshot();
  }, delay);
}

async function waitForImages(root: Element | null) {
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 4000);
          }),
    ),
  );
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface Props {
  /** CSS-селектор области, которую видно сквозь стекло */
  snapshot: string;
  tint?: string;
  className?: string;
  /** Запустить, когда содержимое под стеклом готово */
  ready?: boolean;
  zIndex?: number;
  /** Качество снимка фона: для всей страницы меньше, чтобы не тратить память */
  resolution?: number;
}

export function LiquidGlass({ snapshot, tint = 'rgba(10, 10, 14, 0.28)', className = '', ready = true, zIndex = 1, resolution }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const cls = `lg-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    if ((window as { __NO_LIQUID_GL__?: boolean }).__NO_LIQUID_GL__) return;
    let cancelled = false;
    const created: LiquidGLLens[] = [];
    (async () => {
      const { default: liquidGL } = await import('liquid-gl');
      await document.fonts?.ready;
      await waitForImages(document.querySelector(snapshot));
      if (cancelled || !ref.current) return;
      const reduce = prefersReducedMotion();
      const result = liquidGL({
        target: `.${cls}`,
        snapshot,
        resolution: resolution ?? Math.min(2, window.devicePixelRatio || 1),
        refraction: 0.012,
        bevelDepth: 0.06,
        bevelWidth: 0.2,
        frost: 2.5,
        shadow: false,
        specular: !reduce,
        reveal: reduce ? 'none' : 'fade',
        tilt: false,
        tint,
        content: false,
        zIndex,
      });
      for (const lens of Array.isArray(result) ? result : result ? [result] : []) {
        if (cancelled) lens.destroy();
        else {
          created.push(lens);
          lenses.add(lens);
        }
      }
    })().catch((err) => console.warn('liquid-gl: стекло недоступно, остаётся CSS-размытие', err));
    return () => {
      cancelled = true;
      for (const lens of created) {
        lenses.delete(lens);
        try {
          lens.destroy();
        } catch {
          /* холст уже удалён */
        }
      }
    };
  }, [ready, snapshot, cls, tint, zIndex, resolution]);

  return <span ref={ref} aria-hidden="true" className={`glass-layer ${cls} ${className}`} />;
}
