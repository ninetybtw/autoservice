import { useState, type ImgHTMLAttributes } from 'react';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'onLoad'> {
  src: string;
  /** Показать вместо основного, если оно не загрузилось */
  fallback?: string;
  /** Фото показано (или окончательно не загрузилось) */
  onReady?: () => void;
}

/** Фото с запасным вариантом: при ошибке загрузки тихо подставляет локальную картинку. */
export function Photo({ src, fallback, onReady, ...rest }: Props) {
  const [failed, setFailed] = useState(false);
  const current = failed && fallback ? fallback : src;
  return (
    <img
      {...rest}
      key={current}
      src={current}
      data-photo={src}
      crossOrigin="anonymous"
      onLoad={() => onReady?.()}
      onError={() => {
        if (!failed && fallback && fallback !== src) setFailed(true);
        else onReady?.();
      }}
    />
  );
}
