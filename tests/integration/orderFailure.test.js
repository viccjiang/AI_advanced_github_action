const request = require('supertest');
const app = require('../../app');
const {
  db,
  resetData,
  createProduct,
  getProduct,
  getOrders,
  getAllOrderItems,
  getCartItems,
  insertCartItem,
} = require('../helpers/testDb');

const RECIPIENT = {
  recipientName: '整合測試收件人',
  recipientEmail: 'integration@example.com',
  recipientAddress: '台北市信義區測試路 100 號 5 樓',
};

async function registerMember() {
  const email = `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: '整合測試會員' });
  return { token: res.body.data.token, user: res.body.data.user };
}

describe('Integration：訂單建立失敗時的資料一致性', () => {
  beforeEach(() => resetData());
  afterEach(() => resetData());

  it('庫存不足時回傳 400，且不留下訂單、不扣庫存、不清空購物車', async () => {
    const { token, user } = await registerMember();
    const product = createProduct({ name: '庫存不足測試花', price: 500, stock: 5 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 5 });

    // 模擬他人先行下單，購物車放入後庫存才變得不足
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(2, product.id);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: expect.stringContaining('庫存不足'),
    });

    expect(getOrders()).toHaveLength(0);
    expect(getAllOrderItems()).toHaveLength(0);
    expect(getProduct(product.id).stock).toBe(2);
    expect(getCartItems(user.id)).toHaveLength(1);
  });

  it('Transaction 中途失敗（庫存被扣為負數）時整筆回滾，不留下不完整訂單', async () => {
    const { token, user } = await registerMember();
    const product = createProduct({ name: '交易回滾測試花', price: 400, stock: 3 });

    // 製造兩筆同商品購物車列，各 3 件：
    // 逐列的庫存前置檢查皆通過（3 <= 3），但 transaction 內會扣兩次共 6 件，
    // 觸發 products.stock CHECK(stock >= 0) 約束失敗 → 整筆 rollback
    insertCartItem(user.id, product.id, 3);
    insertCartItem(user.id, product.id, 3);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    // 交易失敗由全域 errorHandler 接手
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).not.toBeNull();

    // 不留下不完整訂單
    expect(getOrders()).toHaveLength(0);
    expect(getAllOrderItems()).toHaveLength(0);

    // 不會錯誤扣除庫存
    expect(getProduct(product.id).stock).toBe(3);

    // 購物車維持原狀，使用者可修正後重送
    expect(getCartItems(user.id)).toHaveLength(2);
  });

  it('購物車為空時回傳 400 CART_EMPTY，且不建立訂單', async () => {
    const { token } = await registerMember();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      data: null,
      error: 'CART_EMPTY',
      message: expect.any(String),
    });
    expect(getOrders()).toHaveLength(0);
  });

  it('配送方式不支援時回傳 400，且不扣庫存、不清空購物車', async () => {
    const { token, user } = await registerMember();
    const product = createProduct({ name: '配送方式測試花', price: 500, stock: 5 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'drone' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ data: null, error: 'VALIDATION_ERROR' });

    expect(getOrders()).toHaveLength(0);
    expect(getProduct(product.id).stock).toBe(5);
    expect(getCartItems(user.id)).toHaveLength(1);
  });

  it('收件資訊缺漏時回傳 400，且不建立訂單', async () => {
    const { token, user } = await registerMember();
    const product = createProduct({ name: '收件資訊測試花', price: 500, stock: 5 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientName: '只有姓名', shippingMethod: 'home_delivery' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ data: null, error: 'VALIDATION_ERROR' });
    expect(getOrders()).toHaveLength(0);
    expect(getProduct(product.id).stock).toBe(5);
    expect(getCartItems(user.id)).toHaveLength(1);
  });

  it('未帶 JWT 時回傳 401，且不建立訂單', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('data', null);
    expect(getOrders()).toHaveLength(0);
  });
});
