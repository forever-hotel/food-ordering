import { test, expect } from '@playwright/test';

/**
 * Session Isolation and Lifecycle Expiry E2E Tests (CIT-05 / DDP-147)
 *
 * Verifies:
 * - Multi-context room isolation (Room 101 vs Room 102)
 * - Session token partitioning in browser storage
 * - Non-contamination between concurrent guest contexts
 * - Explicit logout flow via header room tag and Popconfirm
 */

test.describe('FOSS Session Isolation and Lifecycle', () => {
  test('TC-SESS-01: multi-browser context maintains strict room isolation', async ({ browser }) => {
    // 1. Establish Context 1 for Room 101
    const context1 = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page1 = await context1.newPage();
    await page1.goto('/activate?token=act-demo-101');
    const continueBtn1 = page1.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn1.isVisible()) {
      await continueBtn1.click();
    }
    await expect(page1.getByText(/Room 101 · John Doe/i)).toBeVisible();
    await expect(page1.getByText('Rm 101')).toBeVisible();

    // 2. Establish Context 2 for Room 102
    const context2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page2 = await context2.newPage();
    await page2.goto('/activate?token=act-demo-102');
    const continueBtn2 = page2.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn2.isVisible()) {
      await continueBtn2.click();
    }
    await expect(page2.getByText(/Room 102 · Jane Smith/i)).toBeVisible();
    await expect(page2.getByText('Rm 102')).toBeVisible();

    // 3. Inspect isolated browser session storage
    const token1 = await page1.evaluate(() => {
      return (
        window.sessionStorage.getItem('foss_guest_session_token_demo') ||
        window.sessionStorage.getItem('foss_guest_session_token')
      );
    });
    const token2 = await page2.evaluate(() => {
      return (
        window.sessionStorage.getItem('foss_guest_session_token_demo') ||
        window.sessionStorage.getItem('foss_guest_session_token')
      );
    });

    expect(token1).toContain('room-101');
    expect(token2).toContain('room-102');
    expect(token1).not.toEqual(token2);

    // 4. Verify Context 1 cannot see Room 102 details
    await expect(page1.getByText(/Jane Smith/i)).not.toBeVisible();
    await expect(page2.getByText(/John Doe/i)).not.toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('TC-SESS-02: guest sign-out clears credentials and returns to QR scan screen', async ({
    page,
  }) => {
    // 1. Authenticate Room 101
    await page.goto('/activate?token=act-demo-101');
    const continueBtn = page.getByRole('button', { name: /Continue to Dining Menu/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
    await expect(page.getByText('Rm 101')).toBeVisible();

    // 2. Click Room tag in header to open Popconfirm
    const roomTag = page.getByText('Rm 101');
    await roomTag.click();

    // 3. Confirm sign out in Popconfirm
    await expect(page.getByText('Sign out of room session?')).toBeVisible();
    const signOutBtn = page.getByRole('button', { name: 'Sign out' });
    await signOutBtn.click();

    // 4. Verify landing screen is restored
    await expect(page.getByRole('heading', { name: 'Scan Room QR Code' })).toBeVisible();

    // 5. Verify storage is wiped
    const storedToken = await page.evaluate(() => {
      return (
        window.sessionStorage.getItem('foss_guest_session_token_demo') ||
        window.sessionStorage.getItem('foss_guest_session_token')
      );
    });
    expect(storedToken).toBeNull();
  });
});
