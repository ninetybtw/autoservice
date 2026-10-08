import { useLayoutEffect } from 'react';
import { brandCssVariables, brandPalette } from '@shared/brand.ts';
import type { StudioSettings } from '@shared/schema.ts';

/**
 * Фирменные цвета автосервиса поверх стандартной темы.
 * Стиль без @layer перекрывает токены Astryx (они в @layer astryx-theme),
 * а селектор :root достаёт до диалогов и уведомлений, которые рендерятся вне страницы.
 */
export function useBrandColors(colors: StudioSettings['branding']['colors']) {
  const accent = colors?.accent;
  const accentText = colors?.accentText;
  useLayoutEffect(() => {
    if (!accent) return;
    const vars = brandCssVariables(brandPalette(accent, accentText));
    const style = document.createElement('style');
    style.dataset.studioBrand = '';
    style.textContent = `:root, [data-astryx-theme] {\n${Object.entries(vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n')}\n}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [accent, accentText]);
}
