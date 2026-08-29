# 測試流程建置計畫（Integration / E2E / Postman）

## Context

專案原本僅有 7 支 vitest API 測試，且全部寫入專案根目錄的 `database.sqlite`，測試資料會長期累積、污染開發資料。此外缺少端到端驗證（尤其綠界付款）與可提交的 API Collection。

本次目標為建立三層測試與一份 Postman Collection，並以四道統一指令執行。

---

## 實作步驟

### Step 1: 測試資料庫隔離

`src/database.js` 改為優先讀取 `DATABASE_PATH` 環境變數決定 SQLite 檔案位置（並自動建立所屬目錄），未設定時維持原本的 `database.sqlite`。這是唯一動到既有程式邏輯之處，正式執行行為不變。

`vitest.config.js` 與 `vitest.integration.config.js` 各自指向 `tests/.tmp/unit.sqlite`、`tests/.tmp/integration.sqlite`，並在設定檔（主行程）與 `test.env`（worker）各設一次；`tests/globalSetup.js` 於回合前後刪除該檔案與 `-wal` / `-shm`。

`vitest.config.js` 另加 `include` / `exclude`，避免預設 glob 把整合測試與 E2E 掃進單元測試回合。

### Step 2: Integration Test（tests/integration/）

- `tests/helpers/testDb.js`：`resetData()`、`createProduct()` 與直接查驗訂單、品項、庫存、購物車的函式
- `orderFlow.test.js`（5 項）：建立會員 → 登入 → 取得商品 → 加入購物車 → 建立含配送資訊的訂單，驗證回應格式、訂單寫入、品項寫入、運費、總額、庫存扣除、購物車清空
- `orderFailure.test.js`（6 項）：庫存不足、交易回滾、購物車為空、配送方式無效、收件資訊缺漏、未帶 JWT

### Step 3: E2E Test（tests/e2e/）

`playwright.config.js` 刻意不設 `webServer`，直接對既有的 `http://localhost:3001` 測試。單一案例走完：登入 → 加入購物車 → 結帳 → 建立訂單 → 綠界網路 ATM → 台灣土地銀行 → 前往付款 → 關閉提示視窗 → 土地銀行測試頁 Save → 付款成功 → 返回商店 → 訂單顯示「已付款」→ API 驗證 `status === 'paid'`，並輸出兩張截圖。

### Step 4: Postman Collection

`scripts/openapi-to-postman.js` 自 `openapi.json` 產生 v2.1.0 Collection：`{{baseUrl}}` / `token` / `sessionId` 變數、登入自動存 JWT、`bearerAuth` 端點自動帶 Bearer Token、`sessionId` 端點自動帶 `X-Session-Id`、依 tag 分資料夾。

### Step 5: npm scripts 與 .gitignore

新增 `test:unit`、`test:integration`、`test:e2e`、`postman`；`tests/.tmp/`、`tests/e2e/screenshots/`、`test-results/`、`playwright-report/`、`postman/` 一律不進版控。

---

## 決策紀錄

- **不改寫既有 7 支 API 測試**：它們有隱式的跨檔資料依賴，改寫風險高於收益。改以獨立測試資料庫解決污染問題即可。
- **整合測試自建商品而非沿用種子資料**：價格與庫存可控，斷言才能寫死數字，也不受他人改動種子資料影響。
- **交易回滾以 CHECK 約束觸發**：直接插入兩筆同商品購物車列，令逐列前置檢查通過但交易內扣為負數，是不需 mock 即可觸發真實 rollback 的作法。
- **E2E 以 `page.route()` 攔截建立訂單回應**：前端收到回應後立即導向綠界，事後 `response.json()` 會因換頁而讀不到 body。
- **`fs.unlinkSync` 取代 `fs.rmSync`**：本機 Windows 環境下 `fs.rmSync` 會使 Node 行程無訊息中止（exit code 9 / 127），此為開發期間實測所得。

---

## 驗收結果

| 指令 | 結果 |
|------|------|
| `npm run test:unit` | 7 檔 61 項通過；`database.sqlite` 雜湊值未變 |
| `npm run test:integration` | 2 檔 11 項通過；`database.sqlite` 雜湊值未變，`tests/.tmp/` 執行後淨空 |
| `npm run test:e2e` | 1 項通過，綠界付款完成並返回商店，訂單狀態 `paid`，截圖已產出 |
| `npm run postman` | 7 個資料夾、22 支請求，JSON 有效 |
