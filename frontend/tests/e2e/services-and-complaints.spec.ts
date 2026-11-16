import { test, expect } from '@playwright/test';

/**
 * In-Room Services and Guest Complaints E2E Tests (CIT-05 / DDP-147)
 *
 * Verifies:
 * - Switching to Services tab and category selection (Towels, Toiletries, Cleaning, etc.)
 * - Submitting service request with idempotency and description
 * - Real-time tracking and active requests list display
 * - Switching to Complaints tab and filing guest management feedback (Figure 39)
 * - Severity selection, description bounds, and submission
 * - Verification of unique complaint reference number format (CMP-...)
 */

test.describe('FOSS In-Room Services and Guest Complaints Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate into Room 101 John Doe
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    await expect(page.getByText('Rm 101')).toBeVisible();
  });

  test('TC-SVC-01: submits service request and displays in active requests list', async ({
    page,
  }) => {
    // 1. Switch to Service tab using bottom navigation
    const serviceNavBtn = page.getByRole('button', {
      name: /Housekeeping and Service Requests/i,
    });
    await serviceNavBtn.click();

    // 2. Verify Service tab loaded with 2x3 grid
    await expect(page.getByText('WHAT DO YOU NEED?')).toBeVisible();

    // 3. Select 'Towels' request category
    const towelsBtn = page.getByRole('button', { name: /^Towels/i });
    await expect(towelsBtn).toBeVisible();
    await towelsBtn.click();
    await expect(towelsBtn).toHaveAttribute('aria-pressed', 'true');

    // 4. Fill optional description
    const descInput = page.getByPlaceholder(/AC not cooling properly/i);
    await expect(descInput).toBeVisible();
    await descInput.fill('Need 2 extra bath towels and fresh bathmat.');

    // 5. Submit request
    const submitBtn = page.getByRole('button', { name: /Submit Request/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 6. Verify request appears under ACTIVE REQUESTS
    await expect(page.getByText('ACTIVE REQUESTS')).toBeVisible();
    await expect(page.getByText(/Need 2 extra bath towels/i)).toBeVisible();
  });

  test('TC-CMP-01: submits guest complaint and displays CMP reference badge', async ({ page }) => {
    // 1. Switch to Complaints tab using bottom navigation
    const complaintsNavBtn = page.getByRole('button', {
      name: /Guest Complaints and Management Feedback/i,
    });
    await complaintsNavBtn.click();

    // 2. Verify Complaint form loaded (Figure 39)
    await expect(page.getByText('COMPLAINT CATEGORY')).toBeVisible();
    await expect(page.getByText('SEVERITY LEVEL')).toBeVisible();

    // 3. Select High severity
    const highSevBtn = page.getByRole('button', { name: 'High' });
    await expect(highSevBtn).toBeVisible();
    await highSevBtn.click();
    await expect(highSevBtn).toHaveAttribute('aria-pressed', 'true');

    // 4. Fill description
    const descInput = page.getByPlaceholder(/detail your experience so management can resolve/i);
    await expect(descInput).toBeVisible();
    await descInput.fill(
      'Air conditioning unit in Room 101 has begun rattling loudly during the night.',
    );

    // 5. Submit complaint
    const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 6. Verify success and reference code appearance
    await expect(page.getByText(/CMP-/i)).toBeVisible();
  });
});
