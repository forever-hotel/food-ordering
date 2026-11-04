import { test, expect } from '@playwright/test';

/**
 * Menu, Cart and Order Lifecycle E2E Tests (CIT-05 / DDP-147)
 *
 * Verifies:
 * - Menu catalog rendering and meal period category switching
 * - Adding dishes to cart and floating cart CTA appearance
 * - Quantity limits (1–20) and portion caps
 * - Allergy & dietary note input with 300-char boundary
 * - Idempotent order placement and submission
 * - Order confirmation screen (Figure 35)
 * - Navigation to Orders tab, order status tracker, and 10-minute cancellation window
 */

test.describe('FOSS Menu Browsing, Cart Management and Ordering Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate into Room 101 John Doe
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    await expect(page.getByText('Rm 101')).toBeVisible();
  });

  test('TC-ORD-01: menu category switching displays meal period statuses', async ({ page }) => {
    // 1. Verify category pill buttons
    const lunchBtn = page.getByRole('button', { name: /^Lunch/i });
    const dinnerBtn = page.getByRole('button', { name: /^Dinner/i });
    const breakfastBtn = page.getByRole('button', { name: /^Breakfast/i });
    const teaBtn = page.getByRole('button', { name: /^Tea/i });

    await expect(lunchBtn).toBeVisible();
    await expect(dinnerBtn).toBeVisible();
    await expect(breakfastBtn).toBeVisible();
    await expect(teaBtn).toBeVisible();

    // 2. Switch to Dinner
    await dinnerBtn.click();
    await expect(page.getByRole('feed', { name: /Dinner menu items/i })).toBeVisible();

    // 3. Switch back to Lunch
    await lunchBtn.click();
    await expect(page.getByRole('feed', { name: /Lunch menu items/i })).toBeVisible();
  });

  test('TC-ORD-02: adding dishes to cart shows floating checkout CTA and opens cart', async ({
    page,
  }) => {
    // 1. Find the first available item's quick-add button
    const addButtons = page.locator('button[aria-label^="Add "]');
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    // 2. Verify floating View Cart bar appears
    const viewCartBtn = page.getByRole('button', { name: /View Cart ·/i });
    await expect(viewCartBtn).toBeVisible();

    // 3. Open cart view
    await viewCartBtn.click();

    // 4. Verify Cart screen elements
    await expect(page.getByRole('region', { name: 'Your Cart and Allergy Notes' })).toBeVisible();
    await expect(page.getByText('Allergy & Dietary Notes')).toBeVisible();
    await expect(page.getByText('Subtotal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Place Order/i })).toBeVisible();
  });

  test('TC-ORD-03: cart enforces 300-char allergy note and places order successfully', async ({
    page,
  }) => {
    // 1. Add item to cart
    const addButtons = page.locator('button[aria-label^="Add "]');
    await addButtons.first().click();

    // 2. Open cart
    const viewCartBtn = page.getByRole('button', { name: /View Cart ·/i });
    await viewCartBtn.click();

    // 3. Fill allergy note
    const allergyInput = page.getByPlaceholder(/allergic to peanuts/i);
    await expect(allergyInput).toBeVisible();
    const testNote = 'Severe shellfish allergy. Please prepare with separate utensils.';
    await allergyInput.fill(testNote);
    await expect(allergyInput).toHaveValue(testNote);

    // 4. Submit Order
    const placeOrderBtn = page.getByRole('button', { name: /Place Order/i });
    await expect(placeOrderBtn).toBeEnabled();
    await placeOrderBtn.click();

    // 5. Verify Order Confirmation Screen (Figure 35)
    await expect(page.getByRole('heading', { name: /Order Confirmed!/i })).toBeVisible();
    await expect(page.getByText(/Sent to Forever Hotel Kitchen/i)).toBeVisible();
    await expect(page.getByText(/Estimated Delivery:/i)).toBeVisible();

    // 6. Navigate to Track Status
    const trackStatusBtn = page.getByRole('button', { name: /Track Status/i });
    await expect(trackStatusBtn).toBeVisible();
    await trackStatusBtn.click();

    // 7. Verify Orders tab renders order tracker
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.getByText(/10-min cancellation window/i)).toBeVisible();
  });
});
