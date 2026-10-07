import { createContext, useContext } from 'react';
import type { Studio } from '@shared/schema.ts';
import { mediaUrl } from './data/bundled.ts';

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error('useStudio вне StudioLayout');
  return s;
}

export function useMedia() {
  const s = useStudio();
  return (value: string | undefined) => mediaUrl(s.slug, value);
}
