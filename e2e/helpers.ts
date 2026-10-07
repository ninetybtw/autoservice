import type { Page } from '@playwright/test';

export const SLUG = 'motor-service';
export const OWNER = { email: 'owner@motor-service.ru', password: 'demo1234' };

/** Первый рабочий день (не воскресенье) начиная со смещения в днях — по времени сервиса (Москва). */
export function openDay(offset: number): string {
  for (let i = offset; i < offset + 7; i++) {
    const d = new Date(Date.now() + i * 24 * 3600_000);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(d);
    if (wd !== 'Sun') return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
  }
  throw new Error('нет рабочего дня');
}

export async function login(page: Page) {
  await page.goto(`/${SLUG}/admin`);
  await page.getByLabel('Почта').fill(OWNER.email);
  await page.getByLabel('Пароль').fill(OWNER.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.locator('.kpis').waitFor();
}

/** Небольшая PNG-картинка заданного цвета для загрузки фото. */
export function pngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAGklEQVR4nGP4z8CAFTGMSuCUYPiPA4xK4JQAAFmbP8Fwq3eSAAAAAElFTkSuQmCC',
    'base64',
  );
}
