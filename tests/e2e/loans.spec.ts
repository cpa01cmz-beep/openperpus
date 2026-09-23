import { test, expect } from '@playwright/test';

test.describe('Loans: Checkout → Extend → Return (Kondisi Baik)', () => {
  test.beforeEach(async ({ page }) => {
    // Login as member/admin
    await page.goto('/login');
    await page.fill('input[name="email"]', 'member@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/.*login/);
  });

  test('member can checkout, extend, and return book in good condition', async ({ page }) => {
    // 1. Checkout a book
    await page.goto('/katalog');
    await expect(
      page.locator('[data-testid="book-card"], .book-card, article').first()
    ).toBeVisible({ timeout: 10000 });

    const firstBook = page.locator('[data-testid="book-card"], .book-card, article').first();
    await firstBook.click();

    // Click pinjam/checkout button
    await page.click(
      'button:has-text("Pinjam"), button:has-text("Checkout"), [data-testid="checkout-button"]'
    );
    await expect(
      page.locator('text=/peminjaman berhasil|checkout successful|berhasil/i')
    ).toBeVisible({ timeout: 10000 });

    // 2. Extend the loan
    await page.goto('/peminjaman-saya');
    await expect(page.locator('[data-testid="loan-item"], .loan-item, tr').first()).toBeVisible({
      timeout: 10000,
    });

    const firstLoan = page.locator('[data-testid="loan-item"], .loan-item, tr').first();
    await firstLoan
      .locator(
        'button:has-text("Perpanjang"), button:has-text("Extend"), [data-testid="extend-button"]'
      )
      .click();
    await expect(
      page.locator('text=/perpanjangan berhasil|extended successfully|berhasil/i')
    ).toBeVisible({ timeout: 10000 });

    // 3. Return the book (kondisi baik)
    await page.goto('/peminjaman-saya');
    await firstLoan
      .locator(
        'button:has-text("Kembalikan"), button:has-text("Return"), [data-testid="return-button"]'
      )
      .click();

    // Select condition: baik
    await page.click('label:has-text("Baik"), input[value="baik"], [data-testid="condition-baik"]');
    await page.click(
      'button:has-text("Konfirmasi Kembali"), button:has-text("Confirm Return"), [data-testid="confirm-return"]'
    );

    await expect(
      page.locator('text=/pengembalian berhasil|return successful|berhasil/i')
    ).toBeVisible({ timeout: 10000 });
  });
});
