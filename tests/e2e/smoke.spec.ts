import { test, expect } from '@playwright/test';

test.describe('Smoke: Register → Login → Katalog → Reserve', () => {
  test('user can register, login, browse katalog, and reserve a book', async ({ page }) => {
    // 1. Register
    await page.goto('/register');
    await expect(page).toHaveURL(/.*register/);

    const email = `test-${Date.now()}@example.com`;
    const password = 'TestPass123!';

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);
    await page.fill('input[name="name"]', 'Test User');
    await page.click('button[type="submit"]');

    // Should redirect after successful registration
    await expect(page).not.toHaveURL(/.*register/);

    // 2. Login (if not auto-logged in)
    if (page.url().includes('/login')) {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
      await expect(page).not.toHaveURL(/.*login/);
    }

    // 3. Navigate to Katalog
    await page.goto('/katalog');
    await expect(page).toHaveURL(/.*katalog/);

    // Verify katalog loads with books
    await expect(
      page.locator('[data-testid="book-card"], .book-card, article').first()
    ).toBeVisible({ timeout: 10000 });

    // 4. Reserve a book
    const firstBook = page.locator('[data-testid="book-card"], .book-card, article').first();
    await firstBook.click();

    // On book detail page, click reserve
    await page.click(
      'button:has-text("Reservasi"), button:has-text("Reserve"), [data-testid="reserve-button"]'
    );

    // Verify reservation success (toast or redirect)
    await expect(
      page.locator('text=/reservasi berhasil|reservation successful|berhasil/i')
    ).toBeVisible({ timeout: 10000 });
  });
});
