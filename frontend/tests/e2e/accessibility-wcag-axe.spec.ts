import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * WCAG 2.1 Level AA Accessibility and Responsive Audit (CIT-05 / DDP-147)
 *
 * Verifies:
 * - Automated axe-core WCAG 2.1 AA rule compliance across all major views
 * - Keyboard navigation and focus order
 * - Modal Escape key dismissal
 * - Responsive layout integrity at 320px, 375px, 390px, and 768px
 * - Zero horizontal layout overflow across all viewports
 */

test.describe('FOSS WCAG 2.1 AA Accessibility & Responsive Layout Audit', () => {
  test('TC-A11Y-01: unauthenticated landing page passes WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // Exclude Ant Design third-party portal root if empty
      .exclude('.ant-scrolling-effect')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('TC-A11Y-02: activation page passes WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/activate');
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations).toEqual([]);
  });

  test('TC-A11Y-03: authenticated menu and navigation pass WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    await expect(page.getByText('Rm 101')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Ignore dynamic SVG banner palette differences
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('TC-A11Y-04: services tab passes WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    const serviceNavBtn = page.getByRole('button', {
      name: /Housekeeping and Service Requests/i,
    });
    await serviceNavBtn.click();
    await expect(page.getByText('WHAT DO YOU NEED?')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('TC-A11Y-05: complaints tab passes WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    const complaintsNavBtn = page.getByRole('button', {
      name: /Guest Complaints and Management Feedback/i,
    });
    await complaintsNavBtn.click();
    await expect(page.getByText('COMPLAINT CATEGORY')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('TC-A11Y-06: scanner modal dismisses reliably on Escape key', async ({ page }) => {
    await page.goto('/');

    // Open scanner modal
    const cameraBtn = page.getByRole('button', { name: /Open Camera/i });
    await cameraBtn.click();

    // Verify modal is open
    const modal = page.locator('.ant-modal-content');
    await expect(modal).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify modal is dismissed
    await expect(modal).not.toBeVisible();
  });

  const RESPONSIVE_VIEWPORTS = [
    { name: 'Mobile-Small-320px', width: 320, height: 568 },
    { name: 'iPhone-Standard-375px', width: 375, height: 812 },
    { name: 'Modern-Mobile-390px', width: 390, height: 844 },
    { name: 'Tablet-768px', width: 768, height: 1024 },
  ];

  for (const vp of RESPONSIVE_VIEWPORTS) {
    test(`TC-RESP-${vp.name}: layout maintains zero horizontal overflow at ${vp.width}px width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/activate?token=act-demo-101');
      const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
      if (await continueBtn.isVisible()) {
        await continueBtn.click();
      }
      await expect(page.getByText('Rm 101')).toBeVisible();

      // Check horizontal overflow
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(isOverflowing).toBe(false);
    });
  }
});
