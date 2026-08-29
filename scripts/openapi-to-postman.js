/**
 * 將專案的 openapi.json 轉換為 Postman Collection（v2.1.0）
 *
 * 產出特性：
 * - 所有請求網址皆使用 {{baseUrl}}
 * - Collection 變數：baseUrl（預設 http://localhost:3001）、token、sessionId
 * - 登入／註冊成功後自動將 JWT 寫入 {{token}}
 * - 標記 bearerAuth 的 API 自動帶 Bearer Token；標記 sessionId 的 API 自動帶 X-Session-Id
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OPENAPI_PATH = path.join(ROOT, 'openapi.json');
const OUTPUT_DIR = path.join(ROOT, 'postman');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'backend-project.postman_collection.json');

const DEFAULT_BASE_URL = 'http://localhost:3001';
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * 部分端點的 request body 需可直接送出（否則「登入後自動存 token」無從驗證），
 * 故以種子管理員帳號與合理範例覆寫自動生成的佔位符。
 */
const BODY_OVERRIDES = {
  'POST /api/auth/login': {
    email: 'admin@hexschool.com',
    password: '12345678',
  },
  'POST /api/auth/register': {
    email: 'postman-user@example.com',
    password: 'password123',
    name: 'Postman 測試會員',
  },
  'POST /api/orders': {
    recipientName: '測試收件人',
    recipientEmail: 'recipient@example.com',
    recipientAddress: '台北市信義區測試路 100 號',
    shippingMethod: 'home_delivery',
    isRemote: false,
    isUrgent: false,
  },
  'POST /api/shipping/quote': {
    subtotal: 1500,
    shippingMethod: 'home_delivery',
    isRemote: false,
    isUrgent: false,
  },
};

/**
 * 解析 $ref（僅支援本文件內的 #/components/... 參照）
 */
function resolveRef(spec, node, seen = new Set()) {
  if (!node || typeof node !== 'object' || !node.$ref) return node;
  if (seen.has(node.$ref)) return {};

  seen.add(node.$ref);
  const segments = node.$ref.replace(/^#\//, '').split('/');
  let target = spec;
  for (const segment of segments) {
    target = target && target[segment];
  }
  return resolveRef(spec, target, seen);
}

/**
 * 依 schema 產生範例值，作為 Postman 請求的 body 範本
 */
function schemaToExample(spec, rawSchema, propName = '') {
  const schema = resolveRef(spec, rawSchema);
  if (!schema || typeof schema !== 'object') return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case 'object': {
      const result = {};
      for (const [key, value] of Object.entries(schema.properties || {})) {
        result[key] = schemaToExample(spec, value, key);
      }
      return result;
    }
    case 'array':
      return [schemaToExample(spec, schema.items, propName)].filter(v => v !== null);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'date-time') return new Date().toISOString();
      return propName ? `<${propName}>` : 'string';
    default:
      return null;
  }
}

/**
 * 將 OpenAPI 的 /api/orders/{id} 轉為 Postman 的 /api/orders/:id
 */
function toPostmanPath(openapiPath) {
  return openapiPath
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/^\{(.+)\}$/, ':$1'));
}

function buildUrl(spec, openapiPath, parameters) {
  const segments = toPostmanPath(openapiPath);
  const url = {
    raw: `{{baseUrl}}${openapiPath.replace(/\{(.+?)\}/g, ':$1')}`,
    host: ['{{baseUrl}}'],
    path: segments,
  };

  const pathParams = parameters.filter(p => p.in === 'path');
  if (pathParams.length > 0) {
    url.variable = pathParams.map(p => ({
      key: p.name,
      value: String(schemaToExample(spec, p.schema, p.name) ?? ''),
      description: p.description || '',
    }));
  }

  const queryParams = parameters.filter(p => p.in === 'query');
  if (queryParams.length > 0) {
    url.query = queryParams.map(p => ({
      key: p.name,
      value: String(schemaToExample(spec, p.schema, p.name) ?? ''),
      description: p.description || '',
      disabled: !p.required,
    }));
    const queryString = url.query
      .filter(q => !q.disabled)
      .map(q => `${q.key}=${q.value}`)
      .join('&');
    if (queryString) url.raw += `?${queryString}`;
  }

  return url;
}

/**
 * 登入／註冊成功後把 JWT 存進 collection 變數 token
 */
function buildTokenCaptureScript() {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'const body = pm.response.json();',
        '',
        'pm.test("狀態碼為 2xx", function () {',
        '  pm.expect(pm.response.code).to.be.within(200, 299);',
        '});',
        '',
        'if (body && body.data && body.data.token) {',
        '  pm.collectionVariables.set("token", body.data.token);',
        '  console.log("token 已更新");',
        '}',
      ],
    },
  };
}

function buildRequest(spec, openapiPath, method, operation) {
  const parameters = (operation.parameters || []).map(p => resolveRef(spec, p));
  const security = operation.security || spec.security || [];
  const schemeNames = security.flatMap(entry => Object.keys(entry));

  const usesBearer = schemeNames.includes('bearerAuth');
  const usesSession = schemeNames.includes('sessionId');

  const header = [];
  if (usesSession) {
    header.push({ key: 'X-Session-Id', value: '{{sessionId}}', type: 'text' });
  }

  const request = {
    method: method.toUpperCase(),
    header,
    url: buildUrl(spec, openapiPath, parameters),
    description: operation.description || '',
  };

  // 需要登入的 API 使用 Bearer Token；公開 API 明確標記為 noauth
  request.auth = usesBearer
    ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] }
    : { type: 'noauth' };

  const jsonBody = operation.requestBody
    && resolveRef(spec, operation.requestBody).content
    && resolveRef(spec, operation.requestBody).content['application/json'];

  if (jsonBody) {
    const override = BODY_OVERRIDES[`${method.toUpperCase()} ${openapiPath}`];
    const example = override ?? schemaToExample(spec, jsonBody.schema) ?? {};

    header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(example, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  const item = {
    name: operation.summary || `${method.toUpperCase()} ${openapiPath}`,
    request,
    response: [],
  };

  if (/\/api\/auth\/(login|register)$/.test(openapiPath) && method === 'post') {
    item.event = [buildTokenCaptureScript()];
  }

  return item;
}

function build() {
  if (!fs.existsSync(OPENAPI_PATH)) {
    console.error('找不到 openapi.json，請先執行 npm run openapi');
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  const folders = new Map();

  for (const [openapiPath, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tag = (operation.tags && operation.tags[0]) || 'Default';
      if (!folders.has(tag)) folders.set(tag, []);
      folders.get(tag).push(buildRequest(spec, openapiPath, method, operation));
    }
  }

  const collection = {
    info: {
      name: (spec.info && spec.info.title) || 'API Collection',
      description: [
        (spec.info && spec.info.description) || '',
        '',
        `由 openapi.json 自動產生（scripts/openapi-to-postman.js），版本 ${(spec.info && spec.info.version) || '1.0.0'}。`,
        '使用方式：先執行「使用者認證 → 登入」，token 會自動寫入 collection 變數，其餘需登入的 API 即可直接送出。',
      ].join('\n'),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
    },
    variable: [
      { key: 'baseUrl', value: DEFAULT_BASE_URL, type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'sessionId', value: 'postman-session-001', type: 'string' },
    ],
    item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collection, null, 2) + '\n');

  const requestCount = [...folders.values()].reduce((sum, items) => sum + items.length, 0);
  console.log(`Postman Collection 已產生：${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(`  資料夾 ${folders.size} 個、請求 ${requestCount} 支`);
  console.log(`  變數：baseUrl（${DEFAULT_BASE_URL}）、token、sessionId`);
}

build();
