const { test, expect } = require('@playwright/test');

test('verify frontend changes', async ({ page }) => {
  // Verify dashboard.html
  await page.goto('http://localhost:8000/dashboard.html_');
  await page.screenshot({ path: 'jules-scratch/verification/dashboard.png' });

  // Verify account.html
  await page.goto('http://localhost:8000/account.html_');
  await page.screenshot({ path: 'jules-scratch/verification/account.png' });

  // Verify proof.html in file request state
  await page.goto('http://localhost:8000/proof.html_');
  await page.screenshot({ path: 'jules-scratch/verification/proof.png' });
});
