/**
 * Студии из папки studios/: используются в демо-режиме и как источник фото,
 * указанных в studio.json относительным именем файла.
 */
import { studioFileSchema, type StudioFile } from '@shared/schema.ts';

const files = import.meta.glob<unknown>(['/studios/*/studio.json', '!/studios/_template/**'], { eager: true, import: 'default' });
const media = import.meta.glob<string>(['/studios/*/*.{jpg,jpeg,png,webp,svg,avif}', '!/studios/_template/**'], {
  eager: true,
  query: '?url',
  import: 'default',
});

let cache: StudioFile[] | null = null;

export function bundledStudios(): StudioFile[] {
  if (cache) return cache;
  cache = [];
  for (const [path, raw] of Object.entries(files)) {
    const parsed = studioFileSchema.safeParse(raw);
    if (parsed.success) cache.push(parsed.data);
    else console.error(`Ошибка в ${path}:`, parsed.error.issues);
  }
  return cache;
}

/** Абсолютный адрес картинки: внешние ссылки как есть, имена файлов — из папки студии. */
export function mediaUrl(slug: string, value: string | undefined): string {
  if (!value) return '';
  if (/^(https?:|data:|blob:|\/)/.test(value)) return value;
  return media[`/studios/${slug}/${value}`] ?? '';
}
