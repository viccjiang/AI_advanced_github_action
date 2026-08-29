const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce Demo API',
      version: '1.0.0',
      description: '花卉電商網站 REST API'
    },
    servers: [{ url: 'http://localhost:3001' }],
    components: {
      schemas: {
        ShippingBreakdown: {
          type: 'object',
          description: '運費計算明細（由 src/utils/shipping.js 產生）',
          properties: {
            method: { type: 'string', enum: ['home_delivery', 'cvs_pickup'], description: '配送方式' },
            methodLabel: { type: 'string', description: '配送方式名稱' },
            subtotal: { type: 'integer', description: '商品小計' },
            baseFee: { type: 'integer', description: '基本運費（未套用滿額免運）' },
            thresholdReached: { type: 'boolean', description: '商品小計是否達滿額免運門檻' },
            freeShipping: { type: 'boolean', description: '是否達滿額免運門檻' },
            discount: { type: 'integer', description: '滿額免運折抵的基本運費' },
            remoteFee: { type: 'integer', description: '偏遠地區附加費' },
            urgentFee: { type: 'integer', description: '當日急件附加費' },
            surcharge: { type: 'integer', description: '附加費合計' },
            shippingFee: { type: 'integer', description: '實付運費' },
            total: { type: 'integer', description: '商品小計 + 運費' }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        sessionId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Id'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerOptions;
