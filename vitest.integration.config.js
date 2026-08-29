import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 整合測試使用獨立的 SQLite 檔案，絕不碰專案根目錄的 database.sqlite。
// 在設定檔（主行程）與 test.env（worker）各設一次，globalSetup 才讀得到路徑。
const testDbPath = path.resolve(process.cwd(), 'tests/.tmp/integration.sqlite');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    fileParallelism: false,
    globalSetup: ['./tests/globalSetup.js'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: testDbPath,
      JWT_SECRET: process.env.JWT_SECRET,
    },
    sequence: {
      files: [
        'tests/integration/orderFlow.test.js',
        'tests/integration/orderFailure.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
