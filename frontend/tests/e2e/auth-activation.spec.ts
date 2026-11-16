import { test, expect } from '@playwright/test';

/**
 * Authentication and QR Activation E2E Tests (CIT-05 / DDP-147)
 *
 * Covers:
 * - Figure 31 Unauthenticated Landing Page verification
 * - Single-use QR token redemption on /activate?token=...
 * - URL token scrubbing via window.history.replaceState
 * - Activation failure handling (expired / non-existent tokens)
 * - Missing token state
 * - Manual code entry and guest session establishment
 */

test.describe('FOSS Guest Authentication and QR Activation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and local storage to guarantee clean unauthenticated state
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
    await page.reload();
  });

  test('TC-AUTH-01: unauthenticated landing page matches Figure 31 specifications', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify Brand Heading
    await expect(page.getByText('FOREVER HOTEL')).toBeVisible();

    // 2. Verify Primary Instruction
    await expect(page.getByRole('heading', { name: 'Scan Room QR Code' })).toBeVisible();
    await expect(
      page.getByText('Point your camera at the QR on your room desk to begin'),
    ).toBeVisible();

    // 3. Verify Camera Button
    const cameraBtn = page.getByRole('button', { name: /Open Camera/i });
    await expect(cameraBtn).toBeVisible();
    await expect(cameraBtn).toBeEnabled();

    // 4. Verify Manual Entry Input and Action
    const input = page.getByPlaceholder('Enter room code manually');
    await expect(input).toBeVisible();
    const goBtn = page.getByRole('button', { name: 'Go' });
    await expect(goBtn).toBeVisible();

    // 5. Verify Policy Footer
    await expect(
      page.getByText('Session expires at check-out. No app install required.'),
    ).toBeVisible();
  });

  test('TC-AUTH-02: successful QR redemption on /activate redirects to dining menu', async ({
    page,
  }) => {
    // Navigate with valid demo QR activation token for Room 101
    await page.goto('/activate?token=act-demo-101');

    // 1. Verify welcome banner
    await expect(page.getByRole('heading', { name: /Welcome to Room 101!/i })).toBeVisible();
    await expect(page.getByText('John Doe')).toBeVisible();

    // 2. Verify URL token scrubbing (single-use credential security)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('act-demo-101');
    expect(currentUrl).not.toContain('token=');

    // 3. Continue to menu or wait for auto-redirect
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    // 4. Verify authenticated home menu view
    await expect(page.getByText(/Room 101 · John Doe/i)).toBeVisible();
    await expect(page.getByText('Rm 101')).toBeVisible();
  });

  test('TC-AUTH-03: invalid or expired QR activation presents actionable failure state', async ({
    page,
  }) => {
    // Navigate with expired or invalid QR token
    await page.goto('/activate?token=act-demo-expired');

    // 1. Verify failure alert
    await expect(page.getByText(/Activation Failed/i)).toBeVisible();
    await expect(
      page.getByText(/For guest security, each printed QR code is valid for single use only/i),
    ).toBeVisible();

    // 2. Click return button
    const returnBtn = page.getByRole('button', { name: /Return to Login Screen/i });
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();

    // 3. Verify returned to unauthenticated landing page
    await expect(page.getByRole('heading', { name: 'Scan Room QR Code' })).toBeVisible();
  });

  test('TC-AUTH-04: missing token on /activate prompts for QR slip', async ({ page }) => {
    await page.goto('/activate');

    // 1. Verify missing token banner
    await expect(page.getByRole('heading', { name: /Missing Activation Code/i })).toBeVisible();
    await expect(
      page.getByText(/No QR activation credential was detected in this link/i),
    ).toBeVisible();

    // 2. Verify scanner return button
    const openScannerBtn = page.getByRole('button', { name: /Open Camera Scanner/i });
    await expect(openScannerBtn).toBeVisible();
    await openScannerBtn.click();

    // 3. Returned to home landing page
    await expect(page.getByRole('heading', { name: 'Scan Room QR Code' })).toBeVisible();
  });

  test('TC-AUTH-05: manual entry authenticates guest with valid room code', async ({ page }) => {
    await page.goto('/');

    const input = page.getByPlaceholder('Enter room code manually');
    await input.fill('act-demo-102');

    const goBtn = page.getByRole('button', { name: 'Go' });
    await goBtn.click();

    // Verify authenticated state for Room 102 (Jane Smith)
    await expect(page.getByText(/Room 102 · Jane Smith/i)).toBeVisible();
    await expect(page.getByText('Rm 102')).toBeVisible();
  });
});
