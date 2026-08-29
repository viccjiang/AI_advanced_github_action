const path = require('node:path');
const { v4: uuidv4 } = require('uuid');

// 防呆：本模組的 resetData() 會清空整個資料庫，
// 故僅允許操作 tests/.tmp/ 底下的測試資料庫。
// 若 DATABASE_PATH 未設定或指向他處（例如專案的 database.sqlite），直接中止。
const dbPath = process.env.DATABASE_PATH;
if (!dbPath || path.basename(path.dirname(path.resolve(dbPath))) !== '.tmp') {
  throw new Error(
    '拒絕載入 testDb：此模組只能對 tests/.tmp/ 下的測試資料庫操作，' +
    `目前 DATABASE_PATH = ${dbPath || '(未設定，將指向專案的 database.sqlite)'}`
  );
}

// 走的是 DATABASE_PATH 指向的測試資料庫（由 vitest 設定檔注入），
// 不會碰到專案根目錄的 database.sqlite
const db = require('../../src/database');

/**
 * 清空測試資料：訂單、訂單品項、購物車、商品，以及 admin 以外的使用者。
 * 每個測試前後呼叫，確保各測試自帶乾淨資料。
 */
function resetData() {
  db.prepare('DELETE FROM order_items').run();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM cart_items').run();
  db.prepare('DELETE FROM products').run();
  db.prepare("DELETE FROM users WHERE role != 'admin'").run();
}

/**
 * 建立測試商品（價格與庫存皆由測試指定，避免依賴種子資料）
 * @param {{ name?: string, price: number, stock: number }} attrs
 * @returns {object} 商品資料列
 */
function createProduct(attrs) {
  const id = uuidv4();
  const name = attrs.name || `測試花束-${id.slice(0, 8)}`;

  db.prepare(
    'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, '整合測試專用商品', attrs.price, attrs.stock, 'https://example.com/test.jpg');

  return getProduct(id);
}

function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function getOrders() {
  return db.prepare('SELECT * FROM orders').all();
}

function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
}

function getAllOrderItems() {
  return db.prepare('SELECT * FROM order_items').all();
}

function getCartItems(userId) {
  return db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(userId);
}

/**
 * 直接寫入購物車資料列（用於製造 API 無法產生的邊界情境）
 */
function insertCartItem(userId, productId, quantity) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)'
  ).run(id, userId, productId, quantity);
  return id;
}

module.exports = {
  db,
  resetData,
  createProduct,
  getProduct,
  getOrders,
  getOrder,
  getOrderItems,
  getAllOrderItems,
  getCartItems,
  insertCartItem,
};
