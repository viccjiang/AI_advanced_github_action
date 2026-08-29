const express = require('express');
const {
  calculateShipping,
  getShippingOptions,
  ShippingError,
  DEFAULT_SHIPPING_METHOD,
} = require('../utils/shipping');

const router = express.Router();

/**
 * @openapi
 * /api/shipping/options:
 *   get:
 *     summary: 取得配送方式與運費規則
 *     tags: [Shipping]
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     methods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           value:
 *                             type: string
 *                             enum: [home_delivery, cvs_pickup]
 *                           label:
 *                             type: string
 *                           baseFee:
 *                             type: integer
 *                     freeShippingThreshold:
 *                       type: integer
 *                     remoteAreaSurcharge:
 *                       type: integer
 *                     sameDayUrgentSurcharge:
 *                       type: integer
 *                     defaultMethod:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/options', (req, res) => {
  res.json({
    data: getShippingOptions(),
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/shipping/quote:
 *   post:
 *     summary: 試算運費（結帳前預覽，不建立訂單）
 *     tags: [Shipping]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subtotal]
 *             properties:
 *               subtotal:
 *                 type: integer
 *                 description: 商品小計
 *               shippingMethod:
 *                 type: string
 *                 enum: [home_delivery, cvs_pickup]
 *                 default: home_delivery
 *               isRemote:
 *                 type: boolean
 *                 default: false
 *               isUrgent:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 試算成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/ShippingBreakdown'
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 小計或配送方式無效
 */
router.post('/quote', (req, res) => {
  const {
    subtotal,
    shippingMethod = DEFAULT_SHIPPING_METHOD,
    isRemote = false,
    isUrgent = false,
  } = req.body;

  try {
    const quote = calculateShipping({
      subtotal,
      method: shippingMethod,
      isRemote: Boolean(isRemote),
      isUrgent: Boolean(isUrgent),
    });

    res.json({ data: quote, error: null, message: '成功' });
  } catch (err) {
    if (err instanceof ShippingError) {
      return res.status(400).json({ data: null, error: err.code, message: err.message });
    }
    throw err;
  }
});

module.exports = router;
