const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const ADMIN = { email: 'admin@hexschool.com', password: '12345678' };

const RECIPIENT = {
  name: 'E2E 測試收件人',
  email: 'e2e@example.com',
  address: '台北市中正區重慶南路一段 122 號',
};

// 綠界測試環境選擇器
const ECPAY = {
  webAtmTab: '#liWebATM',
  bankSelect: '#selWebATMBank',
  landBankValue: '10001@2010@WebATM_LAND', // 台灣土地銀行
  paySubmit: '#WebATMPaySubmit',
  noticeClose: '#btnClose:visible', // 各付款分頁皆有同 id 的提示視窗，取當前可見者
  bankSaveButton: 'input[value="Save"]',
};

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

function screenshotPath(name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, name);
}

/**
 * 以頁面內的 JWT 呼叫 API（沿用登入後存於 localStorage 的 token）
 */
async function apiFetch(page, url, options = {}) {
  return page.evaluate(
    async ([u, opts]) => {
      const token = localStorage.getItem('flower_token');
      const res = await fetch(u, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          ...(opts.headers || {}),
        },
      });
      return { status: res.status, body: await res.json() };
    },
    [url, options]
  );
}

/** 清空購物車，避免前次未完成的測試殘留影響金額 */
async function clearCart(page) {
  const cart = await apiFetch(page, '/api/cart');
  for (const item of cart.body.data.items) {
    await apiFetch(page, `/api/cart/${item.id}`, { method: 'DELETE' });
  }
}

test.describe('E2E：結帳並透過綠界網路 ATM 完成付款', () => {
  test('登入 → 加入購物車 → 結帳 → 綠界付款 → 訂單顯示已付款', async ({ page }) => {
    // ---------- 1. 登入花卉電商 ----------
    await page.goto('/login');
    await page.getByPlaceholder('請輸入 Email').fill(ADMIN.email);
    await page.getByPlaceholder('請輸入密碼').fill(ADMIN.password);
    await page.locator('form button[type="submit"]').click();

    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30_000 });
    const token = await page.evaluate(() => localStorage.getItem('flower_token'));
    expect(token, '登入後應取得 JWT').toBeTruthy();

    await clearCart(page);

    // ---------- 2. 選擇商品並加入購物車 ----------
    await page.goto('/');
    const addToCart = page.getByRole('button', { name: '加入購物車' }).first();
    await addToCart.waitFor({ state: 'visible' });

    const [cartResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/cart') && r.request().method() === 'POST'),
      addToCart.click(),
    ]);
    expect(cartResponse.status()).toBe(200);

    // ---------- 3. 進入結帳頁面 ----------
    await page.goto('/cart');

    // 結帳頁載入時即會呼叫運費試算，先掛上監聽再導頁
    const quotePromise = page.waitForResponse(
      r => r.url().includes('/api/shipping/quote'),
      { timeout: 60_000 }
    );
    await page.getByRole('button', { name: '前往結帳' }).click();
    await page.waitForURL('**/checkout', { timeout: 30_000 });

    const quoteResponse = await quotePromise;
    expect(quoteResponse.status()).toBe(200);

    // ---------- 4. 填寫配送方式與結帳資料 ----------
    await page.getByPlaceholder('請輸入收件人姓名').fill(RECIPIENT.name);
    await page.getByPlaceholder('請輸入 Email').fill(RECIPIENT.email);
    await page.getByPlaceholder('請輸入收件地址').fill(RECIPIENT.address);
    await page.locator('input[type="radio"][value="home_delivery"]').check();

    await expect(page.getByText('運費合計')).toBeVisible();
    await expect(page.getByText('總計')).toBeVisible();

    // ---------- 5. 建立訂單 ----------
    // 送出後前端會立即導向綠界，故以 route 攔截先行取得回應內容
    let createOrderStatus = null;
    let createOrderBody = null;

    await page.route('**/api/orders', async route => {
      if (route.request().method() !== 'POST') return route.fallback();

      const response = await route.fetch();
      const text = await response.text();
      createOrderStatus = response.status();
      createOrderBody = JSON.parse(text);
      await route.fulfill({ response, body: text });
    });

    await page.getByRole('button', { name: '確認送出訂單' }).click();

    // ---------- 6. 前往綠界測試環境 ----------
    await page.waitForURL(/ecpay\.com\.tw/, { timeout: 60_000 });

    expect(createOrderStatus, '建立訂單應回傳 201').toBe(201);
    expect(createOrderBody).toMatchObject({ error: null });

    const order = createOrderBody.data;
    expect(order).toMatchObject({ status: 'pending' });
    expect(order.total_amount).toBe(order.subtotal + order.shipping_fee);

    await expect(page.locator(ECPAY.webAtmTab)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(order.order_no.replace(/-/g, ''))).toBeVisible();

    // ---------- 7. 選擇「網路 ATM」 ----------
    await page.locator(ECPAY.webAtmTab).click();
    await expect(page.locator(ECPAY.bankSelect)).toBeVisible();

    // ---------- 8. 選擇「台灣土地銀行」 ----------
    await page.selectOption(ECPAY.bankSelect, ECPAY.landBankValue);
    expect(await page.locator(ECPAY.bankSelect).inputValue()).toBe(ECPAY.landBankValue);

    // ---------- 9. 點擊「前往付款」 ----------
    await page.locator(ECPAY.paySubmit).click();

    // ---------- 10. 關閉提示視窗 ----------
    const notice = page.locator(ECPAY.noticeClose).first();
    await notice.waitFor({ state: 'visible', timeout: 60_000 });
    await notice.click();

    // ---------- 11. 於土地銀行測試頁面點擊 Save ----------
    await page.waitForURL(/LandWebAtm/i, { timeout: 60_000 });
    const saveButton = page.locator(ECPAY.bankSaveButton);
    await saveButton.waitFor({ state: 'visible', timeout: 60_000 });
    await saveButton.click();

    // ---------- 12. 等待綠界顯示付款成功 ----------
    await expect(page.getByText(/付款成功|交易成功/)).toBeVisible({ timeout: 90_000 });
    await page.screenshot({ path: screenshotPath('01-ecpay-payment-success.png'), fullPage: true });

    // ---------- 13. 點擊「返回商店」 ----------
    await page.getByRole('link', { name: /返回商店/ })
      .or(page.getByRole('button', { name: /返回商店/ }))
      .first()
      .click();

    await page.waitForURL(new RegExp(`/orders/${order.id}`), { timeout: 60_000 });

    // ---------- 14. 驗證訂單顯示「已付款」 ----------
    await expect(page.getByText('已付款')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(order.order_no)).toBeVisible();

    // 返回站點後的成功截圖
    await page.screenshot({ path: screenshotPath('02-order-paid.png'), fullPage: true });

    // ---------- 15. 驗證訂單狀態為 paid ----------
    const detail = await apiFetch(page, `/api/orders/${order.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('paid');
    expect(detail.body.data.total_amount).toBe(order.total_amount);

    console.log(
      `[E2E] 訂單 ${order.order_no} 付款完成：小計 ${order.subtotal}、運費 ${order.shipping_fee}、總額 ${order.total_amount}`
    );
  });
});
