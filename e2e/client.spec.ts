import { expect, test } from '@playwright/test';
import { SLUG, openDay } from './helpers';

test.describe('главная страница', () => {
  test('показывает фото, название, «Запись», услуги, работы, адрес и время работы', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await expect(page.locator('.hero-media img')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Мотор Сервис' })).toBeVisible();
    await expect(page.getByTestId('hero-book')).toHaveText(/Записаться/);
    await expect(page.getByRole('heading', { name: 'Запись', exact: true })).toBeAttached();
    await expect(page.locator('#services')).toContainText('Компьютерная диагностика');
    await expect(page.locator('#services')).toContainText(/1\s500\s₽/);
    await expect(page.locator('#works figure')).toHaveCount(4);
    await expect(page.locator('#contacts')).toContainText('Варшавское шоссе, 125');
    await expect(page.locator('#contacts')).toContainText('09:00–20:00');
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toContainText('Моя запись');
  });

  test('нижняя навигация не закрывает содержимое', async ({ page }) => {
    // меряем итоговую раскладку, а не кадр анимации появления
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    const styles = await page.locator('#contacts .card').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { opacity: s.opacity, transform: s.transform };
    });
    expect(styles).toEqual({ opacity: '1', transform: 'none' });
  });
});

test.describe('запись клиента', () => {
  test('занятое время отмечено и недоступно', async ({ page }) => {
    // в демо-данных на ближайший рабочий день все посты заняты одновременно
    await page.goto(`/${SLUG}/book?service=diagnostics&date=${openDay(1)}`);
    const busy = page.locator('.slot.busy');
    await expect(busy.first()).toBeVisible();
    await expect(busy.first()).toContainText('занято');
    await expect(busy.first()).toBeDisabled();
  });

  test('полный путь: услуга → дата → время → данные → подтверждение → отмена', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.getByTestId('hero-book').click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/book`));
    await page.getByRole('radio', { name: /Ремонт подвески/ }).click();
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
    await expect(page.locator('.summary')).toContainText('Ремонт подвески');
    await expect(page.getByText('+7 916 555-44-33', { exact: false })).toBeVisible();
    // напоминание: в демо без push — добавление в календарь
    await expect(page.getByRole('button', { name: 'В календарь (.ics)' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'В календарь (.ics)' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);

    // «Моя запись»
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: /Моя запись/ }).click();
    await expect(page.getByRole('link', { name: /Ремонт подвески/ })).toBeVisible();
    await page.getByRole('link', { name: /Ремонт подвески/ }).click();

    // отмена по правилам сервиса (раньше чем за 12 часов)
    await page.getByRole('button', { name: 'Отменить запись' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Отменить запись' }).click();
    await expect(page.locator('.status.cancelled')).toHaveText('Отменена');
  });

  test('многодневная работа: предупреждение и время готовности', async ({ page }) => {
    await page.goto(`/${SLUG}/book?service=engine-overhaul`);
    await page.locator('.slot:not(.busy)').first().click();
    await expect(page.getByText(/Работа займёт несколько дней/)).toBeVisible();
  });
});

test.describe('помощник', () => {
  test('примеры вопросов — кнопки, ответы по данным студии и уточняющий вопрос', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    // Пример берётся из услуг этого сервиса
    await page.locator('#assistant').getByRole('button', { name: 'Сколько стоит компьютерная диагностика?' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText(/1\s500\s₽/);

    await dialog.getByLabel('Сообщение помощнику').fill('Сколько стоит замена масла?');
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('Уточните');
    await dialog.getByRole('button', { name: /Замена масла в АКПП/ }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText(/3\s500\s₽/);

    await dialog.getByLabel('Сообщение помощнику').fill('Как вас найти?');
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('шлагбаум');
  });

  test('«Когда ближайшее окно?» — уточняет услугу и называет время', async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.locator('#assistant').getByRole('button', { name: 'Когда ближайшее окно?' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText('Для какой услуги');
    await dialog.getByRole('button', { name: /Компьютерная диагностика/ }).click();
    await expect(dialog.getByTestId('assistant-reply').last()).toContainText(/Ближайшее окно на «Компьютерная диагностика» — .+ в \d\d:\d\d/);
  });
});

test.describe('установка на телефон', () => {
  test('у каждой студии свой манифест и иконка', async ({ page, request }) => {
    await page.goto(`/${SLUG}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', `/m/${SLUG}.webmanifest`);
    const m = await (await request.get(`/m/${SLUG}.webmanifest`)).json();
    expect(m).toMatchObject({ name: 'Мотор Сервис', display: 'standalone', start_url: `/${SLUG}`, scope: `/${SLUG}` });
    const icon = await request.get(m.icons[0].src);
    expect(icon.headers()['content-type']).toContain('image/png');
    const other = await (await request.get('/m/garage-77.webmanifest')).json();
    expect(other.name).toBe('Гараж 77');
    // серверная функция для автосервисов из базы тоже работает
    expect((await (await request.get(`/api/manifest?slug=${SLUG}`)).json()).name).toBe('Мотор Сервис');
  });
});
