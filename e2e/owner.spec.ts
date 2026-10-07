import { expect, test } from '@playwright/test';
import { SLUG, login, pngBuffer } from './helpers';

test.describe('кабинет владельца', () => {
  test('вход по почте и паролю, неверный пароль отклоняется', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`);
    await page.getByLabel('Почта').fill('owner@noir-detailing.ru');
    await page.getByLabel('Пароль').fill('wrong');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText('Неверная почта или пароль')).toBeVisible();
    await login(page);
    await expect(page.getByTestId('kpi-bookings')).toBeVisible();
  });

  test('ручная запись, приём машины, готово, оплата и возврат', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Записать вручную' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Дата').fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(Date.now() + 5 * 86400_000)));
    await dialog.locator('.slot:not(.busy)').first().click();
    await dialog.getByLabel('Имя клиента').fill('Пётр');
    await dialog.getByLabel('Телефон').fill('89990001122');
    await dialog.getByLabel('Автомобиль').fill('Lada Vesta');
    await dialog.getByRole('button', { name: 'Записать' }).click();
    await expect(dialog).toBeHidden();

    // Сегодняшняя запись: принять, готово, оплатить
    await page.getByText('Неделя', { exact: true }).click();
    await page.getByText('День', { exact: true }).click();
    const moneyBefore = await page.getByTestId('kpi-money').innerText();
    await page.locator('.booking-row').first().click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Готово' }).click();
    await expect(d.locator('.status.ready')).toBeVisible();
    await d.getByLabel('Сумма, ₽').fill('5000');
    await d.getByRole('button', { name: 'Внести оплату' }).click();
    await expect(d).toContainText(/Оплачено\s+5\s000\s₽/);
    await d.getByText('Возврат', { exact: true }).click();
    await d.getByLabel('Сумма, ₽').fill('1000');
    await d.getByRole('button', { name: 'Оформить возврат' }).click();
    await expect(d).toContainText(/Оплачено\s+4\s000\s₽/);
    await d.getByRole('button', { name: /Закрыть|Close/ }).first().click();
    await expect(page.getByTestId('kpi-money')).not.toHaveText(moneyBefore);
    await expect(page.getByTestId('kpi-money')).toHaveText(/4\s000\s₽/);
    await expect(page.getByTestId('kpi-completed')).toHaveText('1');
  });

  test('перенос записи', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Вперёд' }).click();
    await page.locator('.booking-row').first().click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Перенести / изменить' }).click();
    await d.getByLabel('Дата').fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(Date.now() + 6 * 86400_000)));
    await d.locator('.slot:not(.busy)').nth(2).click();
    await d.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(d).toBeHidden();
  });

  test('новая цена сразу видна клиентам', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Услуги' }).click();
    const wash = page.getByRole('region', { name: 'Комплексная мойка' });
    await wash.getByLabel('Цена, ₽').fill('2900');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible();
    await page.goto(`/${SLUG}`);
    await expect(page.locator('#services')).toContainText(/2\s900\s₽/);
  });

  test('контакты, часы работы и карточки на главной', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Студия' }).click();
    await page.getByLabel('Адрес').fill('Москва, Новая улица, 5');
    await page.getByLabel('Воскресенье').click(); // выходной
    await page.getByLabel('Заголовок').first().fill('Гарантия 5 лет');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible();
    await page.goto(`/${SLUG}`);
    await expect(page.locator('#contacts')).toContainText('Москва, Новая улица, 5');
    await expect(page.locator('#contacts')).toContainText(/Воскресенье\s*выходной/);
    await expect(page.locator('#about')).toContainText('Гарантия 5 лет');
  });

  test('фото работ: заменить одно фото, изменить подпись, добавить — остальные на месте', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Фото работ' }).click();
    const srcs = async () => page.locator('.photo-card img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute('src')));
    const before = await srcs();
    expect(before).toHaveLength(4);

    await page.getByTestId('replace-w2').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: pngBuffer() });
    await expect.poll(async () => (await srcs())[1]).not.toBe(before[1]);
    const afterReplace = await srcs();
    expect([afterReplace[0], afterReplace[2], afterReplace[3]]).toEqual([before[0], before[2], before[3]]);

    const card = page.getByTestId('work-w3');
    await card.getByLabel('Подпись под фото').fill('Новая подпись');
    await card.getByRole('button', { name: 'Сохранить подпись' }).click();
    await expect(page.getByTestId('work-w3').getByLabel('Подпись под фото')).toHaveValue('Новая подпись');

    await page.getByLabel('Подпись').first().fill('Свежая работа');
    await page.getByTestId('add-work-file').setInputFiles({ name: 'add.png', mimeType: 'image/png', buffer: pngBuffer() });
    await expect(page.locator('.photo-card')).toHaveCount(5);
    expect((await srcs()).slice(0, 4)).toEqual(afterReplace);

    await page.goto(`/${SLUG}`);
    await expect(page.locator('#works figure')).toHaveCount(5);
    await expect(page.locator('#works')).toContainText('Новая подпись');
    await expect(page.locator('#works')).toContainText('Свежая работа');
  });

  test('помощник владельца отвечает по записям и деньгам', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Помощник' }).click();
    await page.getByRole('button', { name: 'Что у меня завтра?' }).click();
    await expect(page.getByTestId('assistant-reply').last()).toContainText(/Завтра \d+ запис/);
    await page.getByLabel('Сообщение помощнику').fill('Сколько машин было на неделе?');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByTestId('assistant-reply').last()).toContainText(/На этой неделе: \d+ запис/);
    await page.getByLabel('Сообщение помощнику').fill('Сколько денег получено?');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByTestId('assistant-reply').last()).toContainText(/получено/);
  });
});
