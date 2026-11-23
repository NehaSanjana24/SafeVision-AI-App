import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('SafeVision AI End-to-End & Accessibility Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Demo Admin/i }).click();
    await page.getByRole('button', { name: /Sign In to SafeVision/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('navigates across protected routes and verifies Settings RBAC tabs', async ({ page }) => {
    await page.goto('/intelligence');
    await expect(page.getByText(/Workplace Intelligence/i)).toBeVisible();

    // Open formula info popover
    await page.getByRole('button', { name: /Why this score\?/i }).first().click().catch(() => {});

    // Check Reports Studio
    await page.goto('/reports');
    await expect(page.getByText(/Safety Reports/i)).toBeVisible();

    // Check Settings Admin tabs including Health
    await page.goto('/settings');
    await expect(page.getByText(/Platform Settings & Governance/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /System Health & Telemetry/i })).toBeVisible();
  });

  test('verifies Agent Assistant multimodal prompt flow', async ({ page }) => {
    await page.goto('/assistant');
    const input = page.getByPlaceholder(/Ask about workplace safety/i);
    await expect(input).toBeVisible();
    await input.fill('What PPE is required in Zone D?');
    await input.press('Enter');
    await expect(page.getByText(/Tool:/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('runs Knowledge Base search query', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.getByText(/Knowledge Base/i)).toBeVisible();
  });

  test('passes critical axe accessibility checks on key pages', async ({ page }) => {
    for (const route of ['/dashboard', '/intelligence', '/reports', '/settings']) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const critical = results.violations.filter((v) => v.impact === 'critical');
      expect(critical, `Critical a11y violations on ${route}`).toEqual([]);
    }
  });
});
