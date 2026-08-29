const request = require('supertest');
const app = require('../../app');
const {
  resetData,
  createProduct,
  getProduct,
  getOrders,
  getOrder,
  getOrderItems,
  getCartItems,
} = require('../helpers/testDb');

const RECIPIENT = {
  recipientName: '整合測試收件人',
  recipientEmail: 'integration@example.com',
  recipientAddress: '台北市信義區測試路 100 號 5 樓',
};

/**
 * 建立測試會員並回傳 { token, user }
 */
async function registerMember() {
  const email = `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: '整合測試會員' });

  expect(res.status).toBe(201);
  return { token: res.body.data.token, user: res.body.data.user, email };
}

describe('Integration：購物車 → 訂單建立完整流程', () => {
  beforeEach(() => resetData());
  afterEach(() => resetData());

  it('會員登入 → 取得商品 → 加入購物車 → 建立宅配訂單（未達免運門檻）', async () => {
    // 1. 建立測試會員，並以帳密登入取得 JWT
    const { email } = await registerMember();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('error', null);
    expect(loginRes.body.data).toHaveProperty('token');

    const token = loginRes.body.data.token;
    const userId = loginRes.body.data.user.id;

    // 2. 取得商品資料
    const product = createProduct({ name: '整合測試玫瑰', price: 600, stock: 10 });

    const productsRes = await request(app).get('/api/products');
    expect(productsRes.status).toBe(200);
    expect(productsRes.body).toEqual({
      data: expect.any(Object),
      error: null,
      message: expect.any(String),
    });

    const listed = productsRes.body.data.products.find(p => p.id === product.id);
    expect(listed).toBeDefined();
    expect(listed.price).toBe(600);

    // 3. 加入購物車（2 件，小計 1,200 元 → 未達 1,500 免運門檻）
    const addRes = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 });

    expect(addRes.status).toBe(200);
    expect(getCartItems(userId)).toHaveLength(1);

    // 4. 建立含配送方式與配送資訊的訂單
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery', isRemote: false, isUrgent: false });

    // 5-1. 驗證 HTTP 狀態碼與回應格式
    expect(orderRes.status).toBe(201);
    expect(orderRes.body).toEqual({
      data: expect.any(Object),
      error: null,
      message: expect.any(String),
    });
    expect(orderRes.body.data).toMatchObject({
      order_no: expect.stringMatching(/^ORD-\d{8}-[0-9A-Z]{5}$/),
      subtotal: 1200,
      shipping_method: 'home_delivery',
      shipping_fee: 120,
      total_amount: 1320,
      status: 'pending',
    });

    // 5-2. 驗證訂單正確寫入資料庫
    const orderId = orderRes.body.data.id;
    const orders = getOrders();
    expect(orders).toHaveLength(1);

    const dbOrder = getOrder(orderId);
    expect(dbOrder).toMatchObject({
      user_id: userId,
      recipient_name: RECIPIENT.recipientName,
      recipient_email: RECIPIENT.recipientEmail,
      recipient_address: RECIPIENT.recipientAddress,
      subtotal: 1200,
      shipping_method: 'home_delivery',
      shipping_fee: 120,
      is_remote: 0,
      is_urgent: 0,
      total_amount: 1320,
      status: 'pending',
    });

    // 5-3. 驗證訂單品項正確寫入（含商品名稱與價格快照）
    const items = getOrderItems(orderId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_id: product.id,
      product_name: '整合測試玫瑰',
      product_price: 600,
      quantity: 2,
    });

    // 5-4. 驗證配送費用與訂單總額
    expect(dbOrder.shipping_fee).toBe(120);
    expect(dbOrder.total_amount).toBe(dbOrder.subtotal + dbOrder.shipping_fee);

    // 5-5. 驗證商品庫存正確扣除
    expect(getProduct(product.id).stock).toBe(8);

    // 5-6. 驗證購物車已清空
    expect(getCartItems(userId)).toHaveLength(0);

    const cartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.data.items).toHaveLength(0);
  });

  it('滿額宅配訂單免基本運費，總額等於商品小計', async () => {
    const { token } = await registerMember();
    const product = createProduct({ name: '整合測試百合', price: 750, stock: 5 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(1500);
    expect(res.body.data.shipping_fee).toBe(0);
    expect(res.body.data.total_amount).toBe(1500);

    const dbOrder = getOrder(res.body.data.id);
    expect(dbOrder.shipping_fee).toBe(0);
    expect(dbOrder.total_amount).toBe(1500);
    expect(getProduct(product.id).stock).toBe(3);
  });

  it('超商取貨 + 偏遠地區 + 當日急件的運費與總額正確', async () => {
    const { token } = await registerMember();
    const product = createProduct({ name: '整合測試向日葵', price: 750, stock: 4 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'cvs_pickup', isRemote: true, isUrgent: true });

    expect(res.status).toBe(201);

    // 小計 1,500 達門檻，但超商取貨 60 元不屬基本運費故照收；偏遠 200 + 急件 250
    expect(res.body.data.shipping_fee).toBe(510);
    expect(res.body.data.total_amount).toBe(2010);

    const dbOrder = getOrder(res.body.data.id);
    expect(dbOrder).toMatchObject({
      shipping_method: 'cvs_pickup',
      shipping_fee: 510,
      is_remote: 1,
      is_urgent: 1,
      total_amount: 2010,
    });
  });

  it('多商品訂單的品項、庫存與總額皆正確', async () => {
    const { token, user } = await registerMember();
    const rose = createProduct({ name: '整合測試玫瑰束', price: 480, stock: 6 });
    const tulip = createProduct({ name: '整合測試鬱金香', price: 320, stock: 9 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: rose.id, quantity: 2 });
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: tulip.id, quantity: 3 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(201);

    // 小計 = 480×2 + 320×3 = 1,920 → 滿額免運
    expect(res.body.data.subtotal).toBe(1920);
    expect(res.body.data.shipping_fee).toBe(0);
    expect(res.body.data.total_amount).toBe(1920);

    const items = getOrderItems(res.body.data.id);
    expect(items).toHaveLength(2);
    expect(items.map(i => i.product_name).sort()).toEqual(['整合測試玫瑰束', '整合測試鬱金香']);

    expect(getProduct(rose.id).stock).toBe(4);
    expect(getProduct(tulip.id).stock).toBe(6);
    expect(getCartItems(user.id)).toHaveLength(0);
  });

  it('訂單建立後可於列表與詳情 API 查得相同金額', async () => {
    const { token } = await registerMember();
    const product = createProduct({ name: '整合測試乾燥花', price: 900, stock: 3 });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const created = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...RECIPIENT, shippingMethod: 'cvs_pickup' });

    expect(created.status).toBe(201);
    const orderId = created.body.data.id;

    const listRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.orders).toHaveLength(1);
    expect(listRes.body.data.orders[0]).toMatchObject({ id: orderId, total_amount: 960 });

    const detailRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data).toMatchObject({
      id: orderId,
      subtotal: 900,
      shipping_fee: 60,
      total_amount: 960,
    });
    expect(detailRes.body.data.items).toHaveLength(1);
  });
});
