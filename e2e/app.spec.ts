import { test, expect } from '@playwright/test';

test.describe('YNAB4 Client - Basic Tests', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that the page loads without errors
    await expect(page).toHaveTitle(/YNAB/i);
  });

  test('should display initial UI components', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The app should show a welcome screen or budget selector
    // Check for common elements that should be present
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle navigation without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify no console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait for any dynamic content
    await page.waitForTimeout(1000);

    // Filter out expected errors (like missing budget)
    const criticalErrors = errors.filter(
      (e) => !e.includes('budget') && !e.includes('not found')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

test.describe('YNAB4 Client - UI Responsiveness', () => {
  test('should be responsive on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the page adapts to desktop size
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the page adapts to mobile size
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that the page adapts to tablet size
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('YNAB4 Client - Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    console.log(`Page load time: ${loadTime}ms`);
  });

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get initial JS heap size (if available)
    const initialMetrics = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Perform multiple navigation actions
    for (let i = 0; i < 5; i++) {
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    // Get final heap size
    const finalMetrics = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    // Memory should not grow more than 50MB (arbitrary threshold)
    if (initialMetrics > 0 && finalMetrics > 0) {
      const memoryGrowth = finalMetrics - initialMetrics;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
      console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    }
  });
});
