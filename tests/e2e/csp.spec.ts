import { expect, test, type ConsoleMessage, type Page, type Response } from '@playwright/test';

const PAGES = ['/', '/katalog', '/kontak', '/katalog/clean-code-id'];

function trackCspViolations(page: Page): string[] {
  const violations: string[] = [];
  const isCspNoise = (text: string): boolean =>
    /Content Security Policy|Refused to (execute|load|apply)|blocked/i.test(text);
  const onConsole = (msg: ConsoleMessage): void => {
    if (isCspNoise(msg.text())) violations.push(`console.${msg.type()}: ${msg.text()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', (err) => {
    if (isCspNoise(String(err))) violations.push(`pageerror: ${String(err)}`);
  });
  return violations;
}

async function cspHeaders(resp: Response): Promise<{ name: string; value: string }[]> {
  const headers = await resp.headersArray();
  return headers.filter((h) => h.name.toLowerCase() === 'content-security-policy');
}

for (const path of PAGES) {
  test(`prod HTML on ${path} forbids unsafe-inline scripts and runs every script`, async ({
    page,
  }) => {
    const violations = trackCspViolations(page);
    const resp = await page.goto(path, { waitUntil: 'load' });
    expect(resp?.status(), `GET ${path} status`).toBe(200);

    const headers = await cspHeaders(resp!);
    expect(headers.length, `exactly one CSP header on ${path}`).toBe(1);
    const scriptSrc =
      headers[0].value
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src ')) ?? '';
    expect(scriptSrc, `script-src present on ${path}`).not.toBe('');
    expect(scriptSrc, `no unsafe-inline on ${path}`).not.toContain("'unsafe-inline'");
    expect(scriptSrc, `no unsafe-eval on ${path}`).not.toContain("'unsafe-eval'");
    expect(scriptSrc, `nonce present on ${path}`).toMatch(/'nonce-/);

    // Hydration marker: self.__next_f is pushed by Next's inline bootstrap scripts.
    await page.waitForFunction(
      () => Array.isArray((window as unknown as { __next_f?: unknown[] }).__next_f),
      undefined,
      { timeout: 10_000 }
    );
    // Wait for hydration-driven console activity to settle before asserting.
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await expect(page.locator('#main-content')).toBeVisible();
    expect((await page.locator('body').innerText()).length).toBeGreaterThan(100);

    expect(violations, `zero CSP violations on ${path}`).toEqual([]);
  });
}

test('/api/docs keeps its scripts running under hash-based CSP', async ({ page }) => {
  const violations = trackCspViolations(page);
  const resp = await page.goto('/api/docs', { waitUntil: 'load' });
  expect(resp?.status()).toBe(200);
  const headers = await cspHeaders(resp!);
  expect(headers.length).toBe(1);
  expect(headers[0].value).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(violations).toEqual([]);
});
