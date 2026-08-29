const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E 測試設定
 *
 * 刻意不設定 webServer：測試直接對既有已啟動的專案（http://localhost:3001）執行，
 * 不另外啟動測試伺服器。執行前請先以 npm run dev:server 或 npm run start 啟動專案。
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // 執行前先確認專案已啟動，否則以明確訊息中止
  globalSetup: require.resolve('./tests/e2e/globalSetup.js'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 綠界測試環境回應較慢，整體與單一操作皆放寬逾時
  timeout: 5 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
    locale: 'zh-TW',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
  ],
});
