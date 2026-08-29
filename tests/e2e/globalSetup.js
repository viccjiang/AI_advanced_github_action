const { request } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';

/**
 * E2E 前置檢查
 *
 * 本測試依設計不自行啟動伺服器（playwright.config.js 未設 webServer），
 * 故先確認專案已在執行，否則以明確訊息中止，
 * 避免只看到 net::ERR_CONNECTION_REFUSED 而不知所措。
 */
module.exports = async function globalSetup() {
  const context = await request.newContext();

  try {
    const res = await context.get(`${BASE_URL}/api/products`, { timeout: 5000 });
    if (!res.ok()) {
      throw new Error(`回應狀態碼 ${res.status()}`);
    }
  } catch (err) {
    throw new Error(
      [
        '',
        '─'.repeat(60),
        `E2E 無法連線至 ${BASE_URL}`,
        '',
        'E2E 測試不會自行啟動伺服器，請先於另一個終端機啟動專案：',
        '',
        '    npm run dev:server        # 僅啟動伺服器',
        '    npm run start             # 編譯 CSS 後啟動（截圖需要樣式時用此）',
        '',
        `原始錯誤：${err.message}`,
        '─'.repeat(60),
        '',
      ].join('\n')
    );
  } finally {
    await context.dispose();
  }
};
