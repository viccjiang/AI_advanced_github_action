import fs from 'node:fs';

/**
 * Vitest globalSetup：於整個測試回合開始前與結束後刪除測試資料庫檔案
 * （含 WAL / SHM 副檔），確保每次執行都是全新的獨立資料庫，
 * 且不留下任何測試產物。
 *
 * 註：此處刻意使用 fs.unlinkSync 而非 fs.rmSync，
 * 因 rmSync 在本機 Windows 環境會使 Node 行程直接中止。
 */
function removeDbFiles() {
  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) return;

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

export default function setup() {
  removeDbFiles();

  return function teardown() {
    removeDbFiles();
  };
}
