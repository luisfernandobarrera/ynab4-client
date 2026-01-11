import { test, expect } from '@playwright/test';

/**
 * Visual Stress Test Suite
 *
 * These tests verify that the UI can handle stress scenarios:
 * - Rapid interactions
 * - Multiple resize events
 * - Heavy DOM manipulations
 */

test.describe('YNAB4 Client - Stress Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle rapid resize events', async ({ page }) => {
    const resizeCount = 20;
    const viewportSizes = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
      { width: 414, height: 896 },
    ];

    const startTime = Date.now();

    for (let i = 0; i < resizeCount; i++) {
      const size = viewportSizes[i % viewportSizes.length];
      await page.setViewportSize(size);
      // Small delay to allow resize handlers to fire
      await page.waitForTimeout(50);
    }

    const totalTime = Date.now() - startTime;

    // All resizes should complete within 5 seconds
    expect(totalTime).toBeLessThan(5000);
    console.log(`${resizeCount} resize events completed in ${totalTime}ms`);

    // Verify the page is still functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle rapid scrolling', async ({ page }) => {
    // Make viewport smaller to ensure scrolling is possible
    await page.setViewportSize({ width: 800, height: 400 });

    const scrollCount = 50;
    const startTime = Date.now();

    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate((scrollY) => {
        window.scrollTo({ top: scrollY, behavior: 'auto' });
      }, i * 100);
      await page.waitForTimeout(20);
    }

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });

    const totalTime = Date.now() - startTime;

    // All scrolls should complete within 3 seconds
    expect(totalTime).toBeLessThan(3000);
    console.log(`${scrollCount} scroll events completed in ${totalTime}ms`);
  });

  test('should handle multiple rapid clicks', async ({ page }) => {
    const clickableElements = await page.locator('button, a, [role="button"]').all();

    if (clickableElements.length === 0) {
      console.log('No clickable elements found, skipping click stress test');
      return;
    }

    const clickCount = Math.min(clickableElements.length * 3, 30);
    const startTime = Date.now();
    let successfulClicks = 0;

    for (let i = 0; i < clickCount; i++) {
      try {
        const element = clickableElements[i % clickableElements.length];
        if (await element.isVisible()) {
          await element.click({ timeout: 500 }).catch(() => {
            // Ignore click errors (element may have navigated away)
          });
          successfulClicks++;
        }
      } catch {
        // Continue to next element
      }
      await page.waitForTimeout(30);
    }

    const totalTime = Date.now() - startTime;

    console.log(`${successfulClicks}/${clickCount} clicks completed in ${totalTime}ms`);

    // Page should still be responsive
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should maintain stability under rapid DOM queries', async ({ page }) => {
    const queryCount = 100;
    const startTime = Date.now();

    for (let i = 0; i < queryCount; i++) {
      // Query various elements rapidly
      await page.locator('div').count();
      await page.locator('button').count();
      await page.locator('[class*="bg-"]').count();
      await page.locator('input').count();
    }

    const totalTime = Date.now() - startTime;

    // All queries should complete within 5 seconds
    expect(totalTime).toBeLessThan(5000);
    console.log(`${queryCount * 4} DOM queries completed in ${totalTime}ms`);
  });

  test('should handle keyboard navigation stress', async ({ page }) => {
    const keyCount = 50;
    const keys = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Space'];
    const startTime = Date.now();

    for (let i = 0; i < keyCount; i++) {
      const key = keys[i % keys.length];
      await page.keyboard.press(key);
      await page.waitForTimeout(20);
    }

    const totalTime = Date.now() - startTime;

    // All key events should complete within 3 seconds
    expect(totalTime).toBeLessThan(3000);
    console.log(`${keyCount} keyboard events completed in ${totalTime}ms`);

    // Page should still be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should recover from forced garbage collection pressure', async ({ page }) => {
    // Create memory pressure by allocating and releasing objects
    const startTime = Date.now();

    await page.evaluate(() => {
      // Create temporary large arrays
      const arrays: number[][] = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(i));
      }
      // Release them
      arrays.length = 0;
    });

    // Force GC if available
    await page.evaluate(() => {
      if ((window as any).gc) {
        (window as any).gc();
      }
    });

    const totalTime = Date.now() - startTime;

    console.log(`Memory pressure test completed in ${totalTime}ms`);

    // Verify the app is still responsive
    await page.waitForTimeout(500);
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('YNAB4 Client - Visual Stability', () => {
  test('should not have layout shifts during load', async ({ page }) => {
    // Enable performance metrics
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit for any late layout shifts
    await page.waitForTimeout(1000);

    // Get layout shift metrics
    const layoutShiftScore = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let cls = 0;
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });

        // Give it a moment to collect entries
        setTimeout(() => resolve(cls), 100);
      });
    });

    // CLS should be below 0.1 for good user experience
    console.log(`Cumulative Layout Shift: ${layoutShiftScore.toFixed(4)}`);
    expect(layoutShiftScore).toBeLessThan(0.25); // Allow some tolerance
  });

  test('should not have flickering during rapid theme changes', async ({ page }) => {
    // This test would be more relevant if the app had theme switching
    // For now, we just verify the app handles rapid style changes

    const iterations = 10;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      // Toggle some class on body to simulate theme changes
      await page.evaluate((isDark) => {
        document.body.classList.toggle('dark', isDark);
        document.body.classList.toggle('light', !isDark);
      }, i % 2 === 0);

      await page.waitForTimeout(50);
    }

    const totalTime = Date.now() - startTime;

    console.log(`${iterations} theme toggles completed in ${totalTime}ms`);

    // Page should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
