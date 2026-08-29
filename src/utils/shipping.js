/**
 * 配送費用計算模組
 *
 * 集中管理配送方式、滿額免運、偏遠地區與當日急件等運費規則，
 * 不依賴 Express 或資料庫，可獨立單元測試。
 */

// 配送方式
const SHIPPING_METHODS = {
  HOME_DELIVERY: 'home_delivery',
  CVS_PICKUP: 'cvs_pickup',
};

// 費率設定（單位：新台幣元）
const SHIPPING_RATES = {
  methods: {
    // 宅配：基本運費 120 元，適用滿額免運
    [SHIPPING_METHODS.HOME_DELIVERY]: {
      label: '宅配到府',
      baseFee: 120,
      freeShippingEligible: true,
    },
    // 超商取貨：60 元，不屬於基本運費，故不適用滿額免運
    [SHIPPING_METHODS.CVS_PICKUP]: {
      label: '超商取貨',
      baseFee: 60,
      freeShippingEligible: false,
    },
  },
  // 商品小計達此金額即免基本運費（附加費不受影響）
  freeShippingThreshold: 1500,
  // 偏遠地區附加費
  remoteAreaSurcharge: 200,
  // 當日急件附加費
  sameDayUrgentSurcharge: 250,
};

const DEFAULT_SHIPPING_METHOD = SHIPPING_METHODS.HOME_DELIVERY;

/**
 * 運費計算錯誤（帶 code 供路由層轉為 API 錯誤格式）
 */
class ShippingError extends Error {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ShippingError';
    this.code = code;
  }
}

/**
 * 判斷是否為合法的配送方式
 * @param {string} method
 * @returns {boolean}
 */
function isValidShippingMethod(method) {
  return Object.prototype.hasOwnProperty.call(SHIPPING_RATES.methods, method);
}

/**
 * 取得配送方式的費率設定
 * @param {string} method 配送方式
 * @returns {{ label: string, baseFee: number, freeShippingEligible: boolean }}
 */
function getMethodRate(method) {
  if (!isValidShippingMethod(method)) {
    throw new ShippingError(`不支援的配送方式：${method}`);
  }
  return SHIPPING_RATES.methods[method];
}

/**
 * 取得配送方式的基本運費（未套用滿額免運）
 * @param {string} method 配送方式
 * @returns {number} 基本運費
 */
function getBaseFee(method) {
  return getMethodRate(method).baseFee;
}

/**
 * 商品小計是否達到免運門檻
 * @param {number} subtotal 商品小計
 * @returns {boolean}
 */
function isFreeShippingThresholdReached(subtotal) {
  return subtotal >= SHIPPING_RATES.freeShippingThreshold;
}

/**
 * 該配送方式的費用是否屬於「基本運費」（即是否適用滿額免運）
 * @param {string} method 配送方式
 * @returns {boolean}
 */
function isFreeShippingEligible(method) {
  return getMethodRate(method).freeShippingEligible;
}

/**
 * 此筆訂單是否實際免除基本運費
 * @param {number} subtotal 商品小計
 * @param {string} [method] 配送方式
 * @returns {boolean}
 */
function isFreeShipping(subtotal, method = DEFAULT_SHIPPING_METHOD) {
  return isFreeShippingThresholdReached(subtotal) && isFreeShippingEligible(method);
}

/**
 * 計算配送費用
 *
 * 規則：
 * 1. 宅配基本運費 120 元；超商取貨 60 元（不屬於基本運費）
 * 2. 商品小計滿 1,500 元免「基本運費」，故僅宅配適用；超商取貨 60 元照收
 * 3. 偏遠地區加收 200 元，當日急件加收 250 元
 * 4. 附加費不因滿額免運而折抵，且可同時成立
 *
 * @param {object} options
 * @param {number} options.subtotal 商品小計（非負數）
 * @param {string} [options.method] 配送方式，預設為宅配
 * @param {boolean} [options.isRemote] 是否為偏遠地區
 * @param {boolean} [options.isUrgent] 是否為當日急件
 * @returns {{
 *   method: string,
 *   methodLabel: string,
 *   subtotal: number,
 *   baseFee: number,
 *   thresholdReached: boolean,
 *   freeShipping: boolean,
 *   discount: number,
 *   remoteFee: number,
 *   urgentFee: number,
 *   surcharge: number,
 *   shippingFee: number,
 *   total: number
 * }}
 */
function calculateShipping(options = {}) {
  const {
    subtotal,
    method = DEFAULT_SHIPPING_METHOD,
    isRemote = false,
    isUrgent = false,
  } = options;

  if (typeof subtotal !== 'number' || !Number.isFinite(subtotal)) {
    throw new ShippingError('商品小計必須為數字');
  }
  if (subtotal < 0) {
    throw new ShippingError('商品小計不可為負數');
  }

  const rate = getMethodRate(method);
  const thresholdReached = isFreeShippingThresholdReached(subtotal);
  const freeShipping = thresholdReached && rate.freeShippingEligible;
  const discount = freeShipping ? rate.baseFee : 0;

  const remoteFee = isRemote ? SHIPPING_RATES.remoteAreaSurcharge : 0;
  const urgentFee = isUrgent ? SHIPPING_RATES.sameDayUrgentSurcharge : 0;
  const surcharge = remoteFee + urgentFee;

  const shippingFee = rate.baseFee - discount + surcharge;

  return {
    method,
    methodLabel: rate.label,
    subtotal,
    baseFee: rate.baseFee,
    thresholdReached,
    freeShipping,
    discount,
    remoteFee,
    urgentFee,
    surcharge,
    shippingFee,
    total: subtotal + shippingFee,
  };
}

/**
 * 對外揭露的費率設定（供前端顯示與 API 查詢）
 * @returns {object}
 */
function getShippingOptions() {
  return {
    methods: Object.entries(SHIPPING_RATES.methods).map(([value, rate]) => ({
      value,
      label: rate.label,
      baseFee: rate.baseFee,
      freeShippingEligible: rate.freeShippingEligible,
    })),
    freeShippingThreshold: SHIPPING_RATES.freeShippingThreshold,
    remoteAreaSurcharge: SHIPPING_RATES.remoteAreaSurcharge,
    sameDayUrgentSurcharge: SHIPPING_RATES.sameDayUrgentSurcharge,
    defaultMethod: DEFAULT_SHIPPING_METHOD,
  };
}

module.exports = {
  SHIPPING_METHODS,
  SHIPPING_RATES,
  DEFAULT_SHIPPING_METHOD,
  ShippingError,
  isValidShippingMethod,
  isFreeShippingThresholdReached,
  isFreeShippingEligible,
  isFreeShipping,
  getBaseFee,
  calculateShipping,
  getShippingOptions,
};
