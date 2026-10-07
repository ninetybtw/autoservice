/** Подготовка фото перед загрузкой: уменьшение, сжатие, квадратные иконки из логотипа. */

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* SVG и редкие форматы — через <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать фото'))), type, quality));
}

/** Уменьшает фото до maxSide по длинной стороне и сжимает в JPEG. */
export async function prepareImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Нужен файл изображения (JPG, PNG, WebP)');
  const img = await loadBitmap(file);
  const w = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

/** Квадратная иконка приложения: логотип по центру на чёрном фоне. */
export async function makeIcon(file: Blob, size: number): Promise<Blob> {
  const img = await loadBitmap(file);
  const w = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const box = size * 0.8;
  const scale = Math.min(box / w, box / h);
  ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  return canvasToBlob(canvas, 'image/png');
}

export function uniqueName(prefix: string, ext = 'jpg'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
}
