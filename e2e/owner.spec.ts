import { expect, test } from '@playwright/test';
import { SLUG, OWNER, login, openDay, pngBuffer } from './helpers';

test.describe('кабинет владельца', () => {
  test('вход по почте и паролю, неверный пароль отклоняется', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`);
    await page.getByLabel('Почта').fill(OWNER.email);
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
    await dialog.getByLabel('Дата').fill(openDay(5));
    await dialog.locator('.slot:not(.busy)').first().click();
    await dialog.getByLabel('Имя клиента').fill('Пётр');
    await dialog.getByLabel('Телефон').fill('89990001122');
    await dialog.getByLabel('Автомобиль').fill('Lada Vesta');
    await dialog.getByRole('button', { name: 'Записать' }).click();
    await expect(dialog).toBeHidden();

    // Запись этой недели: готово, оплата и возврат (деньги считаются по дате платежа)
    await page.getByText('Неделя', { exact: true }).click();
    const num = async (id: string) => Number((await page.getByTestId(id).innerText()).replace(/\D/g, ''));
    await expect(page.locator('.booking-row.booked, .booking-row.arrived').first()).toBeVisible();
    const moneyBefore = await num('kpi-money');
    const doneBefore = await num('kpi-completed');
    await page.locator('.booking-row.booked, .booking-row.arrived').first().click();
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
    await expect.poll(() => num('kpi-money')).toBe(moneyBefore + 4000);
    await expect.poll(() => num('kpi-completed')).toBeGreaterThanOrEqual(doneBefore);
  });

  test('перенос записи', async ({ page }) => {
    await login(page);
    await page.getByText('Неделя', { exact: true }).click();
    if ((await page.locator('.booking-row.booked').count()) === 0) await page.getByRole('button', { name: 'Вперёд' }).click();
    await page.locator('.booking-row.booked').first().click();
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Перенести / изменить' }).click();
    await d.getByLabel('Дата').fill(openDay(6));
    await d.locator('.slot:not(.busy)').nth(2).click();
    await d.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(d).toBeHidden();
  });

  test('новая цена сразу видна клиентам', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Услуги' }).click();
    const diag = page.getByRole('region', { name: 'Компьютерная диагностика' });
    await diag.getByLabel('Цена, ₽').fill('1900');
    await diag.getByLabel('Цена, ₽').press('Tab');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible();
    await page.goto(`/${SLUG}`);
    await expect(page.locator('#services')).toContainText(/1\s900\s₽/);
  });

  test('контакты, часы работы и карточки на главной', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Сервис', exact: true }).click();
    await page.getByLabel('Адрес').fill('Москва, Новая улица, 5');
    await page.getByLabel('Суббота', { exact: true }).click(); // сделать выходным
    await page.getByLabel('Заголовок').first().fill('Гарантия 5 лет');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await expect(page.getByRole('button', { name: 'Сохранено' })).toBeVisible();
    await page.goto(`/${SLUG}`);
    await expect(page.locator('#contacts')).toContainText('Москва, Новая улица, 5');
    await expect(page.locator('#contacts')).toContainText(/Суббота\s*выходной/);
    await expect(page.locator('#about')).toContainText('Гарантия 5 лет');
  });

  test('фото работ: заменить одно фото, изменить подпись, добавить — остальные на месте', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Фото работ' }).click();
    const srcs = async () => page.locator('.photo-card [data-photo]').evaluateAll((els) => els.map((e) => e.getAttribute('data-photo')));
    await expect(page.locator('.photo-card [data-photo]')).toHaveCount(4);
    const before = await srcs();

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
