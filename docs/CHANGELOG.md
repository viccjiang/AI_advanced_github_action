# 更新日誌

所有重大變更皆記錄於此文件。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- 測試資料庫隔離：`src/database.js` 支援 `DATABASE_PATH` 環境變數，測試一律指向 `tests/.tmp/` 下的獨立 SQLite 檔案，不再寫入專案的 `database.sqlite`
- 整合測試 `tests/integration/`（vitest + supertest，11 項）：涵蓋會員建立／登入、取得商品、加入購物車、建立含配送資訊的訂單，並驗證回應格式、訂單與品項寫入、運費與總額、庫存扣除、購物車清空；失敗情境驗證交易回滾後不留下不完整訂單、不誤扣庫存
- E2E 測試 `tests/e2e/`（Playwright）：登入 → 加入購物車 → 結帳 → 綠界網路 ATM（台灣土地銀行）付款 → 返回商店 → 驗證訂單狀態為 `paid`，並產出付款成功截圖
- `scripts/openapi-to-postman.js`：由 openapi.json 產生 Postman Collection（`{{baseUrl}}`、`token`、`sessionId` 變數，登入後自動寫入 JWT，需登入的 API 自動帶 Bearer Token）
- 新增 npm 指令：`test:unit`、`test:integration`、`test:e2e`、`postman`
- 配送費用計算功能：新增 `src/utils/shipping.js` 模組，集中處理配送方式費率、滿額免運、偏遠地區與當日急件附加費
- 費率規則：宅配基本運費 120 元、超商取貨 60 元、商品小計滿 1,500 元免基本運費（超商取貨 60 元不屬基本運費故不折抵）、偏遠地區加收 200 元、當日急件加收 250 元
- 新增 `GET /api/shipping/options` 與 `POST /api/shipping/quote` API：查詢費率規則與結帳前運費試算
- 訂單建立流程整合 Shipping 模組：`POST /api/orders` 支援 `shippingMethod`、`isRemote`、`isUrgent`，回應含 `subtotal`、`shipping_fee` 與 `shipping` 運費明細
- 訂單新增 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote`、`is_urgent` 欄位（既有資料庫以 ALTER TABLE migration 補齊）
- 新增 `tests/shipping.test.js`：Shipping 模組單元測試與運費 API／訂單整合測試（共 29 項）
- 綠界 ECPay AIO 金流串接：結帳後導向綠界付款頁面完成真實付款流程
- 新增 `src/utils/ecpay.js` 工具模組：CheckMacValue 簽章產生/驗證、ECPay 專用 URL 編碼、QueryTradeInfo API 查詢
- 新增 `GET /ecpay/payment/:orderId` 頁面路由：產生自動送出的 ECPay 付款表單
- 新增 `POST /api/orders/:id/check-payment` API：透過 QueryTradeInfo API 主動查詢付款狀態（取代本地端無法接收的 Server Notify）
- 訂單新增 `merchant_trade_no` 欄位：對應綠界 MerchantTradeNo，由 order_no 去除連字號產生

### Changed
- 結帳頁面（checkout.ejs / checkout.js）：新增配送方式與附加服務選項，運費改由 `POST /api/shipping/quote` 即時試算（原本前端硬編「滿 500 免運 / 150 元」已移除）
- 訂單詳情頁與後台訂單詳情：金額區塊改為顯示商品小計、運費（含配送方式與附加項目）與總計
- 結帳頁面（checkout.js）：送出訂單後導向綠界付款頁面，不再直接跳轉訂單詳情
- 訂單詳情頁面（order-detail.ejs / order-detail.js）：原「付款成功/失敗」模擬按鈕改為「查詢付款狀態」與「前往付款」按鈕；從綠界導回時自動觸發付款狀態查詢

## [1.0.0] - 2026-04-12

### 新增
- 使用者註冊、登入、個人資料 API
- 商品列表與詳情 API（公開）
- 購物車 CRUD API（雙模式認證：JWT / X-Session-Id）
- 訂單建立、查詢、模擬付款 API
- 後台商品管理 API（CRUD）
- 後台訂單查詢 API（含狀態篩選）
- EJS 前台頁面（首頁、商品詳情、購物車、結帳、訂單）
- EJS 後台頁面（商品管理、訂單管理）
- SQLite 資料庫自動初始化與種子資料
- Vitest 測試套件（6 個測試檔案，循序執行）
- Swagger/OpenAPI 文件生成
- Tailwind CSS 樣式系統
- 專案文件結構建立
