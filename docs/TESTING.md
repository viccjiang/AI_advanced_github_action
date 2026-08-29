# 測試規範與指南

## 測試層級總覽

| 層級 | 位置 | 工具 | 資料庫 | 指令 |
|------|------|------|--------|------|
| 單元／API | `tests/*.test.js` | Vitest + supertest | `tests/.tmp/unit.sqlite`（獨立） | `npm run test:unit` |
| 整合 | `tests/integration/` | Vitest + supertest | `tests/.tmp/integration.sqlite`（獨立） | `npm run test:integration` |
| E2E | `tests/e2e/` | Playwright | 專案正式 `database.sqlite`（真實寫入） | `npm run test:e2e` |

## 測試框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev/) | 測試執行器（相容 Jest API） |
| [supertest](https://github.com/ladjs/supertest) | HTTP 請求測試（直接對 Express app 發請求，不啟動伺服器） |
| [Playwright](https://playwright.dev/) | 瀏覽器 E2E 測試，涵蓋真實綠界付款流程 |

## 執行指令

```bash
npm run test:unit          # 單元／API 測試
npm run test:integration   # 整合測試
npm run test:e2e           # E2E 測試（需先啟動專案）
npm run postman            # 重新生成 openapi.json 並輸出 Postman Collection

npm run test               # 等同 test:unit（沿用舊指令）
```

## 測試資料庫隔離

`src/database.js` 會優先讀取 `DATABASE_PATH` 環境變數決定資料庫檔案位置，未設定時才使用專案根目錄的 `database.sqlite`。

兩份 vitest 設定檔各自指定獨立的測試資料庫，並透過 `tests/globalSetup.js` 於測試回合開始前與結束後刪除該檔案（含 `-wal` / `-shm`）：

```javascript
const testDbPath = path.resolve(process.cwd(), 'tests/.tmp/integration.sqlite');
process.env.DATABASE_PATH = testDbPath;      // 主行程（globalSetup 用）

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.js'],
    env: { DATABASE_PATH: testDbPath },      // worker 行程
  },
});
```

因此執行 `npm run test:unit` 或 `npm run test:integration` **不會更動專案的 `database.sqlite`**，且測試結束後 `tests/.tmp/` 不留任何檔案。

> **注意**：`tests/globalSetup.js` 刻意使用 `fs.unlinkSync` 而非 `fs.rmSync` —— 在本專案的 Windows 環境下 `fs.rmSync` 會使 Node 行程無訊息中止。

## 測試設定

**設定檔**：`vitest.config.js`

```javascript
export default defineConfig({
  test: {
    globals: true,          // describe/it/expect 為全域變數，無需 import
    fileParallelism: false, // 停用檔案平行執行（循序執行）
    sequence: {
      files: [              // 指定執行順序
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/shipping.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,     // beforeAll/afterAll 等 hook 的逾時時間（10 秒）
  },
});
```

## 測試檔案表

| 檔案 | 測試範圍 | 依賴 |
|------|----------|------|
| `tests/setup.js` | 輔助函式（非測試檔案） | — |
| `tests/auth.test.js` | 註冊、登入、重複 email、個人資料 | 無（首先執行，建立種子資料） |
| `tests/products.test.js` | 商品列表、分頁、詳情、404 | 依賴種子商品存在 |
| `tests/cart.test.js` | 加入購物車、查看、更新數量、刪除、訪客 vs 登入 | 依賴商品存在 + 使用者認證 |
| `tests/orders.test.js` | 建立訂單、空購物車、認證要求、訂單列表、詳情、付款 | 依賴購物車有品項 |
| `tests/shipping.test.js` | Shipping 模組單元測試（費率、滿額免運、附加費、參數驗證）+ 運費 API + 訂單運費整合 | 單元測試無依賴；整合測試依賴種子商品與認證 |
| `tests/adminProducts.test.js` | 後台商品列表、新增、更新、刪除、權限檢查 | 依賴 admin 帳號 |
| `tests/adminOrders.test.js` | 後台訂單列表、詳情、狀態篩選 | 依賴訂單存在 + admin 帳號 |
| `tests/integration/orderFlow.test.js` | 會員 → 商品 → 購物車 → 建立訂單完整流程；驗證回應格式、訂單與品項寫入、運費與總額、庫存扣除、購物車清空 | 自建測試資料，無跨檔依賴 |
| `tests/integration/orderFailure.test.js` | 庫存不足、交易回滾、購物車為空、配送方式無效、收件資訊缺漏、未帶 JWT；驗證失敗時不留下不完整訂單且不誤扣庫存 | 自建測試資料，無跨檔依賴 |
| `tests/e2e/checkout-payment.spec.js` | 瀏覽器操作：登入 → 加入購物車 → 結帳 → 綠界網路 ATM 付款 → 返回商店 → 訂單狀態 paid | 需專案已啟動於 3001 埠 |

## 執行順序與依賴關係

```
auth.test.js          ← 第 1 順位：建立使用者，驗證認證機制
    ↓
products.test.js      ← 第 2 順位：驗證種子商品（依賴 DB 初始化）
    ↓
cart.test.js          ← 第 3 順位：需要商品 + 認證 token
    ↓
orders.test.js        ← 第 4 順位：需要購物車有品項
   │
shipping.test.js      ← 第 5 順位：單元測試無依賴，整合測試需要商品 + 認證 token
    ↓
adminProducts.test.js ← 第 6 順位：需要 admin token
    ↓
adminOrders.test.js   ← 第 7 順位：需要訂單存在 + admin token
```

**為何要循序執行**：測試間存在資料依賴（例如 cart 測試新增的品項會在 orders 測試中用來建立訂單）。`fileParallelism: false` 確保測試檔案依序執行，避免競態條件。

## 輔助函式說明

**檔案**：`tests/setup.js`

### `getAdminToken()`

```javascript
async function getAdminToken()
```

- **用途**：以種子管理員帳號（`admin@hexschool.com` / `12345678`）登入，回傳 JWT token
- **回傳**：`string`（JWT token）
- **使用場景**：所有需要 admin 權限的測試

### `registerUser(overrides?)`

```javascript
async function registerUser(overrides = {})
```

- **用途**：註冊新測試使用者並回傳認證資訊
- **參數**：
  - `overrides.email`：自訂 email（預設：`test-{timestamp}-{random}@example.com`）
  - `overrides.password`：自訂密碼（預設：`password123`）
  - `overrides.name`：自訂名稱（預設：`測試使用者`）
- **回傳**：`{ token: string, user: { id, email, name, role } }`
- **使用場景**：需要一般使用者 token 的測試

### 共用匯出

```javascript
module.exports = { app, request, getAdminToken, registerUser };
```

- `app`：Express 應用實例（從 `../app` 引入）
- `request`：supertest 函式（已綁定 app）

## 撰寫新測試的步驟

### 1. 建立測試檔案

在 `tests/` 下建立 `yourFeature.test.js`：

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');

describe('Your Feature', () => {
  let token;
  let adminToken;

  beforeAll(async () => {
    // 取得測試用 token
    const { token: userToken } = await registerUser();
    token = userToken;
    adminToken = await getAdminToken();
  });

  describe('GET /api/your-endpoint', () => {
    it('should return data successfully', async () => {
      const res = await request(app)
        .get('/api/your-endpoint')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.error).toBeNull();
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/your-endpoint');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });
});
```

### 2. 註冊測試執行順序

在 `vitest.config.js` 的 `sequence.files` 陣列中加入新檔案路徑，確保放在其依賴的測試之後：

```javascript
sequence: {
  files: [
    'tests/auth.test.js',
    'tests/products.test.js',
    'tests/cart.test.js',
    'tests/orders.test.js',
    'tests/shipping.test.js',
    'tests/adminProducts.test.js',
    'tests/adminOrders.test.js',
    'tests/yourFeature.test.js',  // ← 新增
  ],
},
```

### 3. 測試模式

```javascript
// 測試成功案例
it('should create resource', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'test', value: 123 });

  expect(res.status).toBe(201);
  expect(res.body.data.name).toBe('test');
});

// 測試驗證錯誤
it('should return 400 for missing fields', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({});

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// 測試權限
it('should return 403 for non-admin', async () => {
  const res = await request(app)
    .get('/api/admin/resource')
    .set('Authorization', `Bearer ${token}`);  // 一般使用者

  expect(res.status).toBe(403);
  expect(res.body.error).toBe('FORBIDDEN');
});

// 測試訪客模式（X-Session-Id）
it('should work with session ID', async () => {
  const sessionId = 'test-session-' + Date.now();
  const res = await request(app)
    .get('/api/cart')
    .set('X-Session-Id', sessionId);

  expect(res.status).toBe(200);
});
```

## 常見陷阱

### 1. 測試順序依賴

測試檔案之間有隱式資料依賴。若調整 `sequence.files` 順序，可能導致後續測試因缺少前置資料而失敗。例如 `orders.test.js` 預期購物車中已有品項（由 `cart.test.js` 新增）。

### 2. 共用資料庫狀態

所有測試共用同一個 SQLite 資料庫檔案。測試中建立的資料不會自動清除，且可能影響後續測試。設計測試時應考慮：
- 使用唯一的 email/名稱，避免衝突
- `registerUser()` 已自動生成唯一 email（含 timestamp + random）

### 3. bcrypt 速度

測試環境下 `NODE_ENV=test` 會將 bcrypt salt rounds 降至 1，加速密碼雜湊。若未設定 `NODE_ENV=test`，每次註冊/登入會使用 10 rounds，顯著拖慢測試速度。

> **注意**：seed admin 的 bcrypt rounds 取決於 `database.js` 首次執行時的 `NODE_ENV`。但 `authRoutes.js` 中的 `register` 端點固定使用 `bcrypt.hashSync(password, 10)`（寫死 10 rounds），不受 NODE_ENV 影響。

### 4. hookTimeout 設定

`hookTimeout: 10000`（10 秒）。若 `beforeAll` 中需要多次 HTTP 請求（如註冊 + 登入 + 加入購物車），應注意是否超時。

### 5. 無 afterAll 清理

目前測試未實作資料清理。每次完整測試運行會累積測試資料在 `database.sqlite` 中。這通常不影響測試結果（因為使用唯一識別碼），但長期可能使測試資料庫膨脹。

### 6. 整合測試自帶資料，單元測試沿用舊有依賴

`tests/integration/` 下的測試以 `tests/helpers/testDb.js` 的 `resetData()` 於每個測試前後清空資料，並用 `createProduct()` 自建商品，因此不依賴種子資料與執行順序。`tests/*.test.js` 則維持原有的跨檔依賴。

### 7. supertest 直接使用 app

測試透過 `request(app)` 直接對 Express 實例發送請求，不會啟動實際 HTTP 伺服器。這意味著：
- 不需要管理埠號衝突
- 不會觸發 `server.js` 中的 `app.listen()`
- `database.js` 在 `require('../app')` 時即初始化（建表 + 種子資料）

---

## 整合測試（tests/integration/）

以 supertest 直接對 Express app 發請求，搭配 `tests/helpers/testDb.js` 直接查驗資料庫，驗證 API 行為與資料寫入是否一致。

### 輔助函式（tests/helpers/testDb.js）

| 函式 | 說明 |
|------|------|
| `resetData()` | 清空訂單、訂單品項、購物車、商品與非 admin 使用者 |
| `createProduct({ name, price, stock })` | 建立價格與庫存皆可控的測試商品 |
| `getOrders()` / `getOrder(id)` / `getOrderItems(orderId)` | 直接查詢訂單與品項 |
| `getProduct(id)` / `getCartItems(userId)` | 驗證庫存扣除與購物車清空 |
| `insertCartItem(userId, productId, quantity)` | 直接寫入購物車列，用於製造 API 無法產生的邊界情境 |

> **防呆**：`testDb.js` 載入時會檢查 `DATABASE_PATH` 是否位於 `tests/.tmp/` 之下，否則直接拋錯拒絕載入 —— 因 `resetData()` 會清空整個資料庫，須杜絕誤指向專案正式資料庫的可能。

### 交易回滾情境如何構造

`orderFailure.test.js` 以 `insertCartItem()` 為同一商品插入兩筆各 3 件的購物車列（庫存 3）。逐列的前置庫存檢查皆通過（3 ≤ 3），但 transaction 內會扣兩次共 6 件，觸發 `products.stock CHECK(stock >= 0)` 約束失敗，整筆交易回滾。藉此驗證：

- 不留下不完整訂單（`orders` 與 `order_items` 皆為空）
- 不會錯誤扣除庫存（仍為 3）
- 購物車維持原狀

---

## E2E 測試（tests/e2e/）

### 前置條件

E2E **不會自行啟動測試伺服器**（`playwright.config.js` 未設定 `webServer`），請先另開終端機啟動專案：

```bash
npm run start        # 或 npm run dev:server
npm run test:e2e
```

首次執行前需安裝瀏覽器：`npx playwright install chromium`。

若專案未啟動，`tests/e2e/globalSetup.js` 會在測試開始前偵測並以明確訊息中止，不會讓人只看到 `net::ERR_CONNECTION_REFUSED`。

登入帳號使用種子管理員 `admin@hexschool.com` / `12345678`。

> **注意**：E2E 走的是專案正式資料庫與綠界測試環境，每次執行都會**真實新增一筆已付款訂單並扣除庫存**。

### 綠界測試環境選擇器

| 步驟 | 選擇器 |
|------|--------|
| 網路 ATM 分頁 | `#liWebATM` |
| 銀行下拉選單 | `#selWebATMBank` |
| 台灣土地銀行 | value = `10001@2010@WebATM_LAND` |
| 前往付款 | `#WebATMPaySubmit` |
| 提示視窗關閉鈕 | `#btnClose:visible`（各付款分頁皆有同 id，須取當前可見者） |
| 土地銀行測試頁送出 | `input[value="Save"]` |

### 兩個容易踩到的非同步陷阱

1. **建立訂單的回應內容**：前端收到回應後立即 `window.location.href` 導向綠界，`response.json()` 會因換頁而讀不到 body。改以 `page.route()` 攔截 `POST /api/orders`，於 `route.fetch()` 後先讀出內容再 `fulfill`。
2. **運費試算回應**：`/api/shipping/quote` 在結帳頁載入時即送出，`waitForResponse` 必須在導頁**之前**掛上。

### 產出截圖

| 檔案 | 內容 |
|------|------|
| `tests/e2e/screenshots/01-ecpay-payment-success.png` | 綠界顯示付款成功 |
| `tests/e2e/screenshots/02-order-paid.png` | 返回商店後訂單詳情顯示「已付款」 |

---

## Postman Collection（npm run postman）

`npm run postman` 會先執行 `npm run openapi` 重新生成 `openapi.json`，再由 `scripts/openapi-to-postman.js` 轉出 `postman/backend-project.postman_collection.json`（Collection Format v2.1.0）。

產出特性：

| 項目 | 內容 |
|------|------|
| 網址 | 全部使用 `{{baseUrl}}` |
| 變數 | `baseUrl`（預設 `http://localhost:3001`）、`token`、`sessionId` |
| 登入自動存 token | `POST /api/auth/login` 與 `/register` 帶有 test script，成功後寫入 collection 變數 `token` |
| 認證 | 標記 `bearerAuth` 的請求自動帶 `Bearer {{token}}`；公開端點標記為 `noauth` |
| 雙模式認證 | 標記 `sessionId` 的購物車請求另帶 `X-Session-Id: {{sessionId}}` |
| 分組 | 依 OpenAPI tag 分資料夾（Auth、Products、Cart、Orders、Shipping、Admin Products、Admin Orders） |

匯入 Postman 後，先執行 Auth 資料夾的「登入」，其餘需登入的 API 即可直接送出。

> `postman/`、`tests/e2e/screenshots/`、`test-results/`、`playwright-report/`、`tests/.tmp/` 皆已列入 `.gitignore`，測試衍生物不進版控。
