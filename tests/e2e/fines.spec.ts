import { test, expect } from '@playwright/test';

test.describe('Fines: Lihat Denda → Bayar QRIS → Unduh Bukti', () => {
  test.beforeEach(async ({ page }) => {
    // Login as member with fines
    await page.goto('/login');
    await page.fill('input[name="email"]', 'member-with-fines@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/.*login/);
  });

  test('member can view fines, pay via QRIS, and download receipt', async ({ page }) => {
    // 1. View fines
    await page.goto('/denda-saya');
    await expect(page).toHaveURL(/.*denda-saya/);

    // Verify fines list loads
    await expect(page.locator('[data-testid="fine-item"], .fine-item, tr').first()).toBeVisible({
      timeout: 10000,
    });

    const firstFine = page.locator('[data-testid="fine-item"], .fine-item, tr').first();
    // const fineAmount = await firstFine.locator('[data-testid="fine-amount"], .fine-amount').textContent();

    // 2. Click bayar (QRIS)
    await firstFine
      .locator('button:has-text("Bayar"), button:has-text("Pay"), [data-testid="pay-button"]')
      .click();

    // Wait for QRIS modal/page
    await expect(
      page.locator('[data-testid="qris-modal"], .qris-modal, img[alt*="QRIS"], img[alt*="qris"]')
    ).toBeVisible({ timeout: 10000 });

    // Simulate QRIS payment (click bayar button in modal)
    await page.click(
      'button:has-text("Saya Sudah Bayar"), button:has-text("I Have Paid"), [data-testid="confirm-payment"]'
    );

    // Wait for payment confirmation
    await expect(
      page.locator('text=/pembayaran berhasil|payment successful|berhasil/i')
    ).toBeVisible({ timeout: 15000 });

    // 3. Download receipt (bukti)
    await page.goto('/denda-saya');
    await firstFine
      .locator(
        'button:has-text("Unduh Bukti"), button:has-text("Download Receipt"), [data-testid="download-receipt"]'
      )
      .click();

    // Verify download starts (check for download event or success message)
    await expect(page.locator('text=/bukti diunduh|receipt downloaded|diunduh/i')).toBeVisible({
      timeout: 10000,
    });
  });
});
