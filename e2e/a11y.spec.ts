import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SLUG, login } from './helpers';

/** Автоматическая проверка доступности (axe-core, WCAG 2.2 AA) ключевых экранов. */
async function expectNoA11yViolations(page: Page) {
  // без анимаций: элементы в середине появления дают ложные ошибки контраста
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.describe('доступность', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('экраны клиента', async ({ page }) => {
    for (const path of ['', '/services', '/my', '/book?service=diagnostics']) {
      await page.goto(`/${SLUG}${path}`);
      await page.locator('main').first().waitFor();
      await page.waitForLoadState('networkidle');
      await expectNoA11yViolations(page);
    }
    await page.locator('.slot:not(.busy)').first().click();
    await expectNoA11yViolations(page);
  });

  test('кабинет владельца', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`);
    await expectNoA11yViolations(page);
    await login(page);
    await expectNoA11yViolations(page);
    for (const path of ['/admin/studio', '/admin/services', '/admin/photos']) {
      await page.goto(`/${SLUG}${path}`);
      await page.waitForLoadState('networkidle');
      await expectNoA11yViolations(page);
    }
  });

  test('на телефоне кнопки не меньше 44×44', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'только для сенсорных экранов');
    for (const path of ['', '/book?service=diagnostics']) {
      await page.goto(`/${SLUG}${path}`);
      await page.waitForLoadState('networkidle');
      const small = await page.locator('button:visible, a.astryx-button:visible, .bottom-nav a').evaluateAll((els) =>
        els
          .map((el) => ({ el, b: el.getBoundingClientRect() }))
          .filter(({ b }) => b.width > 0 && (b.width < 44 || b.height < 44))
          .map(({ el, b }) => `${(el.textContent || el.getAttribute('aria-label') || '').trim()} ${Math.round(b.width)}×${Math.round(b.height)}`),
      );
      expect(small).toEqual([]);
    }
  });

  test('ссылка «Перейти к содержимому» и фокус после перехода', async ({ page, isMobile }) => {
    test.skip(isMobile, 'клавиатура');
    await page.goto(`/${SLUG}`);
    await page.locator('.hero').waitFor();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Услуги' }).click();
    await expect(page.locator('#content')).toBeFocused();
  });
});
