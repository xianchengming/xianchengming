/**
 * 澄明力训练模块 - 后端代理服务
 * 代理前端调用豆包大模型 API，避免在前端暴露 API Key
 * 
 * 使用方式：
 *   1. 设置环境变量 ARK_API_KEY（火山引擎 API Key）
 *   2. 可选：设置 DOUBAO_MODEL（默认 doubao-1-5-pro-32k）
 *   3. node server.js
 */

const http = require('http');
const https = require('https');

// ── 配置 ──
const PORT = parseInt(process.env.PORT || '3001', 10);
const ARK_API_KEY = process.env.ARK_API_KEY || '';
const ARK_BASE_URL = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
const DOUBAO_MODEL = process.env.DOUBAO_MODEL || 'doubao-1-5-pro-32k';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';

if (!ARK_API_KEY) {
  console.warn('[server] ⚠️  未设置 ARK_API_KEY 环境变量。请执行:');
  console.warn('  export ARK_API_KEY=your-api-key-here');
  console.warn('  node server.js');
  console.warn('');
  console.warn('[server] 服务将以 fallback 模式启动（不调用模型 API）');
}

/**
 * 发送 HTTPS POST 请求到火山引擎
 */
function requestArkAPI(messages) {
  return new Promise((resolve, reject) => {
    const url = new URL(ARK_BASE_URL + '/chat/completions');
    const payload = JSON.stringify({
      model: DOUBAO_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * 处理 /api/chat 请求
 */
async function handleChat(req, res) {
  const body = await parseBody(req);
  const { messages, temperature, max_tokens } = body;

  if (!messages || !Array.isArray(messages)) {
    writeJson(res, 400, { error: 'messages 必须是数组' });
    return;
  }

  // 限制消息数量（防止滥用）
  if (messages.length > 30) {
    writeJson(res, 400, { error: '消息数量不能超过 30 条' });
    return;
  }

  // API Key 未配置时返回提示
  if (!ARK_API_KEY) {
    writeJson(res, 200, {
      choices: [],
      fallback: true,
      message: 'API Key 未配置，请设置 ARK_API_KEY 环境变量',
    });
    return;
  }

  try {
    const result = await requestArkAPI(messages);
    writeJson(res, 200, result);
  } catch (e) {
    console.error('[server] API 调用失败:', e.message);
    writeJson(res, 500, { error: '模型调用失败: ' + e.message });
  }
}

/**
 * 健康检查
 */
function handleHealth(req, res) {
  writeJson(res, 200, {
    status: 'ok',
    model: DOUBAO_MODEL,
    apiConfigured: !!ARK_API_KEY,
  });
}

/**
 * 解析请求体
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 写入 JSON 响应
 */
function writeJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * 路由
 */
async function handleRequest(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res);
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return handleHealth(req, res);
  }

  writeJson(res, 404, { error: 'Not Found' });
}

// ── 启动 ──
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[server] 澄明力训练后端已启动`);
  console.log(`[server] 端口: ${PORT}`);
  console.log(`[server] 模型: ${DOUBAO_MODEL}`);
  console.log(`[server] API Key: ${ARK_API_KEY ? '已配置 ✓' : '未配置 ✗'}`);
  console.log(`[server] 端点: http://localhost:${PORT}`);
});
