const { app, request, registerUser } = require('./setup');
const {
  calculateShipping,
  getShippingOptions,
  isValidShippingMethod,
  isFreeShipping,
  getBaseFee,
  ShippingError,
  SHIPPING_METHODS,
  SHIPPING_RATES,
} = require('../src/utils/shipping');

const HOME = SHIPPING_METHODS.HOME_DELIVERY;
const CVS = SHIPPING_METHODS.CVS_PICKUP;

describe('Shipping module', () => {
  describe('基本運費', () => {
    it('宅配應收取 120 元基本運費', () => {
      const result = calculateShipping({ subtotal: 1000, method: HOME });

      expect(result.baseFee).toBe(120);
      expect(result.freeShipping).toBe(false);
      expect(result.surcharge).toBe(0);
      expect(result.shippingFee).toBe(120);
      expect(result.total).toBe(1120);
    });

    it('超商取貨應收取 60 元', () => {
      const result = calculateShipping({ subtotal: 1000, method: CVS });

      expect(result.baseFee).toBe(60);
      expect(result.shippingFee).toBe(60);
      expect(result.total).toBe(1060);
    });

    it('未指定配送方式時預設為宅配', () => {
      const result = calculateShipping({ subtotal: 1000 });

      expect(result.method).toBe(HOME);
      expect(result.shippingFee).toBe(120);
    });
  });

  describe('滿額免運門檻', () => {
    it('商品小計 1,499 元未達門檻，宅配仍收 120 元', () => {
      const result = calculateShipping({ subtotal: 1499, method: HOME });

      expect(result.thresholdReached).toBe(false);
      expect(result.freeShipping).toBe(false);
      expect(result.discount).toBe(0);
      expect(result.shippingFee).toBe(120);
      expect(result.total).toBe(1619);
    });

    it('商品小計 1,500 元達門檻，宅配免基本運費', () => {
      const result = calculateShipping({ subtotal: 1500, method: HOME });

      expect(result.thresholdReached).toBe(true);
      expect(result.freeShipping).toBe(true);
      expect(result.discount).toBe(120);
      expect(result.shippingFee).toBe(0);
      expect(result.total).toBe(1500);
    });

    it('超商取貨 60 元不屬於基本運費，滿 1,500 元仍照收', () => {
      const result = calculateShipping({ subtotal: 1500, method: CVS });

      expect(result.thresholdReached).toBe(true);
      expect(result.freeShipping).toBe(false);
      expect(result.discount).toBe(0);
      expect(result.shippingFee).toBe(60);
      expect(result.total).toBe(1560);
    });
  });

  describe('附加費', () => {
    it('偏遠地區加收 200 元', () => {
      const result = calculateShipping({ subtotal: 1000, method: HOME, isRemote: true });

      expect(result.remoteFee).toBe(200);
      expect(result.urgentFee).toBe(0);
      expect(result.surcharge).toBe(200);
      expect(result.shippingFee).toBe(320);
      expect(result.total).toBe(1320);
    });

    it('當日急件加收 250 元', () => {
      const result = calculateShipping({ subtotal: 1000, method: HOME, isUrgent: true });

      expect(result.remoteFee).toBe(0);
      expect(result.urgentFee).toBe(250);
      expect(result.surcharge).toBe(250);
      expect(result.shippingFee).toBe(370);
      expect(result.total).toBe(1370);
    });

    it('偏遠地區與當日急件同時成立時附加費累加', () => {
      const result = calculateShipping({
        subtotal: 1000,
        method: HOME,
        isRemote: true,
        isUrgent: true,
      });

      expect(result.surcharge).toBe(450);
      expect(result.shippingFee).toBe(570);
      expect(result.total).toBe(1570);
    });

    it('超商取貨也適用偏遠地區與當日急件附加費', () => {
      const result = calculateShipping({
        subtotal: 1000,
        method: CVS,
        isRemote: true,
        isUrgent: true,
      });

      expect(result.shippingFee).toBe(510);
      expect(result.total).toBe(1510);
    });
  });

  describe('滿額免運與附加費同時成立', () => {
    it('宅配滿額免基本運費，但附加費照收', () => {
      const result = calculateShipping({
        subtotal: 2000,
        method: HOME,
        isRemote: true,
        isUrgent: true,
      });

      expect(result.freeShipping).toBe(true);
      expect(result.discount).toBe(120);
      expect(result.surcharge).toBe(450);
      expect(result.shippingFee).toBe(450);
      expect(result.total).toBe(2450);
    });

    it('宅配滿額免運且僅偏遠地區時只收 200 元', () => {
      const result = calculateShipping({ subtotal: 1500, method: HOME, isRemote: true });

      expect(result.shippingFee).toBe(200);
      expect(result.total).toBe(1700);
    });

    it('超商取貨滿額時 60 元與附加費一併收取', () => {
      const result = calculateShipping({
        subtotal: 2000,
        method: CVS,
        isRemote: true,
        isUrgent: true,
      });

      expect(result.freeShipping).toBe(false);
      expect(result.shippingFee).toBe(510);
      expect(result.total).toBe(2510);
    });
  });

  describe('參數驗證', () => {
    it('不支援的配送方式應拋出 ShippingError', () => {
      expect(() => calculateShipping({ subtotal: 1000, method: 'drone' }))
        .toThrow(ShippingError);
    });

    it('小計為負數應拋出 ShippingError', () => {
      expect(() => calculateShipping({ subtotal: -1 })).toThrow(ShippingError);
    });

    it('小計非數字應拋出 ShippingError', () => {
      expect(() => calculateShipping({ subtotal: '1000' })).toThrow(ShippingError);
    });

    it('小計為 0 時仍計算基本運費', () => {
      const result = calculateShipping({ subtotal: 0, method: HOME });

      expect(result.shippingFee).toBe(120);
      expect(result.total).toBe(120);
    });
  });

  describe('輔助函式', () => {
    it('isValidShippingMethod 應辨識合法與非法配送方式', () => {
      expect(isValidShippingMethod(HOME)).toBe(true);
      expect(isValidShippingMethod(CVS)).toBe(true);
      expect(isValidShippingMethod('drone')).toBe(false);
    });

    it('getBaseFee 應回傳各配送方式的基本運費', () => {
      expect(getBaseFee(HOME)).toBe(120);
      expect(getBaseFee(CVS)).toBe(60);
    });

    it('isFreeShipping 僅在宅配達門檻時為 true', () => {
      expect(isFreeShipping(1500, HOME)).toBe(true);
      expect(isFreeShipping(1499, HOME)).toBe(false);
      expect(isFreeShipping(1500, CVS)).toBe(false);
    });

    it('getShippingOptions 應揭露費率設定', () => {
      const options = getShippingOptions();

      expect(options.freeShippingThreshold).toBe(SHIPPING_RATES.freeShippingThreshold);
      expect(options.remoteAreaSurcharge).toBe(200);
      expect(options.sameDayUrgentSurcharge).toBe(250);
      expect(options.defaultMethod).toBe(HOME);
      expect(options.methods).toHaveLength(2);
      expect(options.methods.find(m => m.value === CVS).freeShippingEligible).toBe(false);
    });
  });
});

describe('Shipping API', () => {
  it('should get shipping options', async () => {
    const res = await request(app).get('/api/shipping/options');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('freeShippingThreshold', 1500);
    expect(Array.isArray(res.body.data.methods)).toBe(true);
  });

  it('should quote shipping fee', async () => {
    const res = await request(app)
      .post('/api/shipping/quote')
      .send({ subtotal: 1500, shippingMethod: 'cvs_pickup', isUrgent: true });

    expect(res.status).toBe(200);
    expect(res.body.data.shippingFee).toBe(310);
    expect(res.body.data.total).toBe(1810);
  });

  it('should reject invalid shipping method on quote', async () => {
    const res = await request(app)
      .post('/api/shipping/quote')
      .send({ subtotal: 1000, shippingMethod: 'drone' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
});

describe('Orders API - shipping fee integration', () => {
  let userToken;
  let products;

  const recipient = {
    recipientName: '運費測試收件人',
    recipientEmail: 'shipping@example.com',
    recipientAddress: '台北市測試路 1 號',
  };

  function findProduct(name) {
    return products.find(p => p.name === name);
  }

  async function addToCart(productId, quantity) {
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity });
  }

  beforeAll(async () => {
    const { token } = await registerUser();
    userToken = token;

    const prodRes = await request(app).get('/api/products?limit=100');
    products = prodRes.body.data.products;
  });

  it('未達免運門檻的宅配訂單應加收 120 元運費', async () => {
    const product = findProduct('迷你多肉組合盆'); // 580 元
    await addToCart(product.id, 1);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...recipient, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(580);
    expect(res.body.data.shipping_method).toBe('home_delivery');
    expect(res.body.data.shipping_fee).toBe(120);
    expect(res.body.data.total_amount).toBe(700);
    expect(res.body.data.shipping.freeShipping).toBe(false);
  });

  it('滿額宅配訂單應免運費', async () => {
    const product = findProduct('紫色鬱金香盆栽'); // 750 元
    await addToCart(product.id, 2);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...recipient, shippingMethod: 'home_delivery' });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(1500);
    expect(res.body.data.shipping_fee).toBe(0);
    expect(res.body.data.total_amount).toBe(1500);
    expect(res.body.data.shipping.freeShipping).toBe(true);
  });

  it('滿額超商取貨且偏遠急件時應收 510 元運費', async () => {
    const product = findProduct('紫色鬱金香盆栽'); // 750 元
    await addToCart(product.id, 2);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...recipient, shippingMethod: 'cvs_pickup', isRemote: true, isUrgent: true });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(1500);
    expect(res.body.data.shipping_method).toBe('cvs_pickup');
    expect(res.body.data.shipping_fee).toBe(510);
    expect(res.body.data.is_remote).toBe(1);
    expect(res.body.data.is_urgent).toBe(1);
    expect(res.body.data.total_amount).toBe(2010);
  });

  it('訂單詳情應回傳商品小計與運費', async () => {
    const product = findProduct('迷你多肉組合盆'); // 580 元
    await addToCart(product.id, 1);

    const created = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...recipient, shippingMethod: 'cvs_pickup', isUrgent: true });

    const res = await request(app)
      .get(`/api/orders/${created.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(580);
    expect(res.body.data.shipping_fee).toBe(310);
    expect(res.body.data.total_amount).toBe(890);
  });

  it('不支援的配送方式應回傳 400', async () => {
    const product = findProduct('迷你多肉組合盆');
    await addToCart(product.id, 1);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...recipient, shippingMethod: 'drone' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
});
