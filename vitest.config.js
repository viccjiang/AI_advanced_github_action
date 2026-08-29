import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 單元／API 測試同樣使用獨立的 SQLite 檔案，不影響專案根目錄的 database.sqlite
const testDbPath = path.resolve(process.cwd(), 'tests/.tmp/unit.sqlite');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/*.test.js'],
    exclude: ['**/node_modules/**', 'tests/integration/**', 'tests/e2e/**'],
    fileParallelism: false,
    globalSetup: ['./tests/globalSetup.js'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: testDbPath,
      JWT_SECRET: process.env.JWT_SECRET,
    },
    sequence: {
      files: [
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/shipping.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
