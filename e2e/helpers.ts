import type { Page } from '@playwright/test';

export const SLUG = 'noir-detailing';
export const OWNER = { email: 'owner@noir-detailing.ru', password: 'demo1234' };

/** Завтрашняя дата в часовом поясе студии (Москва). */
export function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 3600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
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
