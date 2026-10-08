import { useState, type ImgHTMLAttributes } from 'react';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'onLoad' | 'crossOrigin'> {
  src: string;
  /** Показать вместо основного, если оно не загрузилось */
  fallback?: string;
  /** Фото показано (или окончательно не загрузилось) */
  onReady?: () => void;
}

type Attempt = 'cors' | 'plain' | 'fallback';

/**
 * Фото с запасными вариантами. Сначала грузим в режиме CORS (нужно стеклу, чтобы преломлять фото),
 * если сайт с фото так не отдаёт — грузим обычным способом, и только если не вышло совсем —
 * показываем локальную запасную картинку.
 */
export function Photo({ src, fallback, onReady, ...rest }: Props) {
  const external = /^https?:/.test(src) && typeof location !== 'undefined' && !src.startsWith(location.origin);
  const [attempt, setAttempt] = useState<Attempt>('cors');
  const current = attempt === 'fallback' && fallback ? fallback : src;
  return (
    <img
      {...rest}
      key={`${attempt}:${current}`}
      src={current}
      data-photo={src}
      crossOrigin={attempt === 'cors' ? 'anonymous' : undefined}
      onLoad={() => onReady?.()}
      onError={() => {
        if (attempt === 'cors' && external) setAttempt('plain');
        else if (attempt !== 'fallback' && fallback && fallback !== src) setAttempt('fallback');
        else onReady?.();
      }}
    />
  );
}
