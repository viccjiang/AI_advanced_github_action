# 配送費用計算模組（Shipping）實作計畫

## Context

花卉電商專案已有完整的購物車 → 結帳 → 建立訂單流程，但訂單金額僅為商品小計，未計入運費；結帳頁的運費更是前端硬編的假資料（「滿 500 免運，否則 150 元」），與後端完全脫節。

本次需求為導入配送費用計算，並將運費規則封裝為可獨立測試的模組，避免規則散落於路由與前端。

**費率規則**（已與需求方確認）：

| 項目 | 金額 | 備註 |
|------|------|------|
| 宅配基本運費 | 120 元 | 適用滿額免運 |
| 超商取貨 | 60 元 | **不屬於基本運費**，故不適用滿額免運 |
| 滿額免運門檻 | 商品小計 1,500 元 | 僅折抵「基本運費」 |
| 偏遠地區 | +200 元 | 附加費，不受滿額免運影響 |
| 當日急件 | +250 元 | 附加費，不受滿額免運影響 |

計算公式：

```
運費 = 基本運費 − 滿額折抵 + 偏遠附加費 + 急件附加費
訂單總額 = 商品小計 + 運費
```

---

## 實作步驟

### Step 1: 新增 `src/utils/shipping.js` — 運費計算模組

純函式模組，不依賴 Express 與資料庫：

- **`calculateShipping({ subtotal, method, isRemote, isUrgent })`** — 主計算函式，回傳含 `baseFee`、`thresholdReached`、`freeShipping`、`discount`、`remoteFee`、`urgentFee`、`surcharge`、`shippingFee`、`total` 的明細物件
- **`getShippingOptions()`** — 回傳費率設定，供前端與 API 顯示
- **`isValidShippingMethod` / `isFreeShippingThresholdReached` / `isFreeShippingEligible` / `isFreeShipping` / `getBaseFee`** — 輔助判斷函式
- **`SHIPPING_METHODS` / `SHIPPING_RATES` / `DEFAULT_SHIPPING_METHOD`** — 常數與費率設定，各配送方式以 `freeShippingEligible` 標記是否適用滿額免運
- **`ShippingError`** — 帶 `code` 的錯誤類別，供路由層轉為統一 API 錯誤格式

### Step 2: 修改 `src/database.js` — 新增運費欄位

`orders` 表新增 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote`、`is_urgent` 五個欄位；既有資料庫以 ALTER TABLE migration 補齊（沿用 `merchant_trade_no` 的 try/catch 模式，改為集中於 `orderColumnMigrations` 陣列逐一執行）。

### Step 3: 整合至 `src/routes/orderRoutes.js`

`POST /api/orders` 新增 `shippingMethod`、`isRemote`、`isUrgent` 三個選填欄位：

1. Email 驗證後加入配送方式驗證（不支援 → 400 VALIDATION_ERROR）
2. 原 `totalAmount` 拆為 `subtotal` + `calculateShipping()` 的 `shippingFee`
3. Transaction 中的 INSERT 寫入運費欄位
4. 201 回應加入 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote`、`is_urgent` 與 `shipping` 明細物件

### Step 4: 新增 `src/routes/shippingRoutes.js` — 運費查詢與試算

公開端點，掛載於 `/api/shipping`：

- `GET /api/shipping/options` — 回傳費率設定
- `POST /api/shipping/quote` — 結帳前試算運費，不建立訂單

目的是讓前端不必重複實作費率邏輯，維持單一真相來源。

### Step 5: 前端整合

- `views/pages/checkout.ejs` — 新增配送方式（radio）與偏遠／急件（checkbox）選項；訂單摘要改為顯示運費明細與附加費
- `public/js/pages/checkout.js` — 移除硬編運費，改為載入 `/api/shipping/options` 渲染選項，並在條件變動時呼叫 `/api/shipping/quote` 即時試算；送出訂單時一併帶上配送欄位
- `views/pages/order-detail.ejs`、`views/pages/admin/orders.ejs` — 金額區塊改為商品小計 / 運費 / 總計三列（舊訂單 `subtotal` 為 0 時自動隱藏明細）

### Step 6: 新增 `tests/shipping.test.js`

單元測試涵蓋：宅配基本運費、超商取貨費用、小計 1,499、小計 1,500 免運、偏遠地區、當日急件、多項附加費同時成立、滿額免運與附加費同時成立、參數驗證與輔助函式；另含運費 API 與訂單建立的整合測試。並於 `vitest.config.js` 的 `sequence.files` 註冊執行順序（置於 `orders.test.js` 之後）。

### Step 7: 文件與 OpenAPI

- `swagger-config.js` 新增 `ShippingBreakdown` schema，於路由 JSDoc 以 `$ref` 引用；執行 `npm run openapi` 重新生成 `openapi.json`
- 更新 `docs/ARCHITECTURE.md`（目錄結構、API 表、orders 資料表、訂單建立資料流）、`docs/FEATURES.md`（新增「配送費用計算」章節）、`docs/TESTING.md`（測試檔案表與執行順序）、`docs/CHANGELOG.md`、`docs/README.md` 與 `CLAUDE.md`

---

## 決策紀錄

- **超商取貨 60 元不適用滿額免運**：需求規格明確標註「這不是基本運費」，而免運條件寫的是「免基本運費」，故滿 1,500 元時宅配運費歸零、超商取貨仍收 60 元。此規則以各配送方式的 `freeShippingEligible` 旗標表示，日後若要改為兩者皆免，只需改動該旗標。
- **附加費不受滿額免運影響**：偏遠地區與當日急件屬額外服務成本，與基本運費分離計算。
- **新增運費試算 API**：若讓前端自行依費率表計算，規則會有兩份實作而容易分歧；改由後端試算，前端僅負責顯示。

---

## 驗收結果

- `npm run test` — 7 個測試檔案、61 項測試全數通過（其中 `tests/shipping.test.js` 29 項）
- `npm run openapi` — 成功生成，含 `/api/shipping/options`、`/api/shipping/quote` 與 `ShippingBreakdown` schema
