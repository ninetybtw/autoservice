import { expect, test } from '@playwright/test';
import { SLUG, tomorrow } from './helpers';

test.describe('главная страница', () => {
  test('показывает фото, название, «Запись», услуги, работы, адрес и время работы', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await expect(page.locator('.hero-media img')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Noir Detailing' })).toBeVisible();
    await expect(page.getByTestId('hero-book')).toHaveText(/Записаться/);
    await expect(page.getByRole('heading', { name: 'Запись', exact: true })).toBeAttached();
    await expect(page.locator('#services')).toContainText('Комплексная мойка');
    await expect(page.locator('#services')).toContainText(/2\s500\s₽/);
    await expect(page.locator('#works figure')).toHaveCount(4);
    await expect(page.locator('#contacts')).toContainText('ул. Электрозаводская, 21');
    await expect(page.locator('#contacts')).toContainText('10:00–21:00');
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toContainText('Моя запись');
  });

  test('нижняя навигация не закрывает содержимое', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    const nav = await page.locator('.bottom-nav').boundingBox();
    const last = await page.locator('#contacts .card').last().boundingBox();
    expect(nav && last).toBeTruthy();
    expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
  });

  test('стеклянная кнопка двигается вместе с фото, надпись — обычный текст', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    const cta = page.getByTestId('hero-book');
    const before = await cta.boundingBox();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);
    const after = await cta.boundingBox();
    expect(Math.round(before!.y - after!.y)).toBeGreaterThan(150);
    // надпись не размывается и не перерисовывается в текстуру
    const label = cta.locator('.glass-label');
    await expect(label).toHaveText(/Записаться/);
    expect(await label.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    // стекло на кнопке берёт фон только из главного фото
    await expect(page.locator('.hero canvas[data-liquid-ignore]')).toBeAttached({ timeout: 15_000 });
  });

  test('при «уменьшить движение» разделы видны сразу, без анимации', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${SLUG}`);
    const opacity = await page.locator('#contacts').evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');
  });
});

test.describe('запись клиента', () => {
  test('занятое время отмечено и недоступно', async ({ page }) => {
    await page.goto(`/${SLUG}/book?service=complex-wash&date=${tomorrow()}`);
    const busy = page.locator('.slot.busy');
    await expect(busy.first()).toBeVisible();
    await expect(busy.first()).toContainText('занято');
    await expect(busy.first()).toBeDisabled();
  });

  test('полный путь: услуга → дата → время → данные → подтверждение → отмена', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.getByTestId('hero-book').click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/book`));
    await page.getByRole('radio', { name: /Химчистка салона/ }).click();
    await page.locator('.day:not([disabled])').nth(3).click();
    await page.locator('.slot:not(.busy)').first().click();

    // проверка данных
    await page.getByRole('button', { name: 'Подтвердить запись' }).click();
    await expect(page.getByText('Укажите имя')).toBeVisible();
    await page.getByLabel('Имя').fill('Анна');
    await page.getByLabel('Телефон').fill('123');
    await page.getByLabel('Автомобиль').fill('Mini Cooper');
    await page.getByRole('button', { name: 'Подтвердить запись' }).click();
    await expect(page.getByText('Проверьте номер телефона')).toBeVisible();
    await page.getByLabel('Телефон').fill('+7 (916) 555-44-33');
    await page.getByRole('button', { name: 'Подтвердить запись' }).click();

    await expect(page.getByRole('heading', { name: 'Вы записаны!' })).toBeVisible();
    await expect(page.getByText('Химчистка салона')).toBeVisible();
    await expect(page.getByText('+7 916 555-44-33', { exact: false })).toBeVisible();
    // напоминание: в демо без push — добавление в календарь
    await expect(page.getByRole('button', { name: 'В календарь (.ics)' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'В календарь (.ics)' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);

    // «Моя запись»
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: /Моя запись/ }).click();
    await expect(page.getByRole('link', { name: /Химчистка салона/ })).toBeVisible();
    await page.getByRole('link', { name: /Химчистка салона/ }).click();

    // отмена по правилам студии (больше чем за 24 часа)
    await page.getByRole('button', { name: 'Отменить запись' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Отменить запись' }).click();
    await expect(page.locator('.status.cancelled')).toHaveText('Отменена');
  });

  test('многодневная работа: предупреждение и время готовности', async ({ page }) => {
    await page.goto(`/${SLUG}/book?service=ceramic`);
    await page.locator('.slot:not(.busy)').first().click();
    await expect(page.getByText(/Работа займёт несколько дней/)).toBeVisible();
  });
});

test.describe('помощник', () => {
  test('примеры вопросов — кнопки, ответы по данным студии и уточняющий вопрос', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.locator('#assistant').getByRole('button', { name: 'Сколько стоит полировка?' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('Уточните');
    await dialog.getByRole('button', { name: /Восстановительная полировка/ }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText(/25\s000\s₽/);

    await dialog.getByLabel('Сообщение помощнику').fill('Как найти студию?');
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('шлагбаум');
  });

  test('«Когда ближайшее окно?» — уточняет услугу и называет время', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.locator('#assistant').getByRole('button', { name: 'Когда ближайшее окно?' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('Для какой услуги');
    await dialog.getByRole('button', { name: /Комплексная мойка/ }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText(/Ближайшее окно на «Комплексная мойка» — .+ в \d\d:\d\d/);
  });
});

test.describe('установка на телефон', () => {
  test('у каждой студии свой манифест и иконка', async ({ page, request }) => {
    await page.goto(`/${SLUG}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', `/api/manifest?slug=${SLUG}`);
    const m = await (await request.get(`/api/manifest?slug=${SLUG}`)).json();
    expect(m).toMatchObject({ name: 'Noir Detailing', display: 'standalone', start_url: `/${SLUG}`, scope: `/${SLUG}` });
    const icon = await request.get(m.icons[0].src);
    expect(icon.headers()['content-type']).toContain('image/png');
    const other = await (await request.get('/api/manifest?slug=gloss-lab')).json();
    expect(other.name).toBe('Gloss Lab');
  });
});
