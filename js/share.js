/**
 * 澄明力评测 H5 应用 — Canvas 海报生成模块
 *
 * 在 /share 页面，根据用户的测评结果，用 Canvas 绘制一张精美的分享海报。
 * 海报尺寸 750x1334（2x 适配手机屏幕，CSS 显示为 375x667）。
 * 深色高端风格：墨绿/深青背景 + 金色点缀。
 */

/* ================================================================
   画布尺寸常量
   ================================================================ */

/** 画布逻辑宽度（CSS 像素） */
const CANVAS_W = 750;
/** 画布逻辑高度（CSS 像素） */
const CANVAS_H = 1334;
/** 设备像素比，用于高清屏适配 */
const DPR = 2;

/* ================================================================
   配色方案
   ================================================================ */

const COLORS = {
  /** 背景渐变起始色 */
  bgTop: '#0a1a1a',
  /** 背景渐变中间色 */
  bgMid: '#1a3a3a',
  /** 背景渐变终止色 */
  bgBottom: '#0a2a2a',
  /** 品牌标题白 */
  white: '#ffffff',
  /** 金色主色 */
  gold: '#c8a45c',
  /** 金色亮色（发光用） */
  goldLight: '#e8c96c',
  /** 见察力圆环色（青色） */
  ringJianCha: '#3d7a7a',
  /** 澄省力圆环色（金色） */
  ringChengXing: '#c8a45c',
  /** 明定力圆环色（绿色） */
  ringMingDing: '#5a9a5a',
  /** 圆环底色 */
  ringBg: 'rgba(255,255,255,0.1)',
  /** 进度条底色 */
  barBg: 'rgba(255,255,255,0.1)',
  /** 进度条填充起始色 */
  barFillStart: '#c8a45c',
  /** 进度条填充终止色 */
  barFillEnd: '#e8c96c',
  /** 灰色辅助文字 */
  gray: '#999999',
  /** 深灰辅助文字 */
  darkGray: '#666666',
};

/* ================================================================
   五大指数配置
   将实际维度分数映射到海报展示的五个指数
   ================================================================ */

/**
 * 五大指数定义
 * 每个指数定义了：中文名、对应的维度数据键、回退默认值
 */
const INDEX_CONFIG = [
  { key: 'jianchaDepth',       label: '见察深度指数', dims: ['depth'],               fallback: 0 },
  { key: 'jianchaBreadth',     label: '见察广度指数', dims: ['breadth'],             fallback: 0 },
  { key: 'chengxingClarity',   label: '澄净指数',     dims: ['clarity', 'awareness'], fallback: 0 },
  { key: 'mingingDecisiveness',label: '明断指数',     dims: ['decision', 'persistence'], fallback: 0 },
  { key: 'overallClarity',    label: '澄明综合指数', dims: [],                       fallback: 0 },
];

/* ================================================================
   字体处理
   ================================================================ */

/**
 * 等待字体加载完成
 * Canvas 不能直接使用未加载完成的 Google Fonts，需要先等待
 * @returns {Promise<void>}
 */
async function ensureFonts() {
  try {
    await document.fonts.ready;
  } catch (e) {
    // 字体 API 不可用时静默降级到 sans-serif
    console.warn('[share.js] document.fonts.ready 不可用，使用 fallback 字体');
  }
}

/**
 * 设置 Canvas 上下文的字体
 * 优先使用 Noto Serif SC，未加载时降级到 sans-serif
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {string} weight - 字重，如 'bold'、'normal'
 * @param {number} size - 字号（px）
 * @param {string} [family] - 字族，默认 'Noto Serif SC'
 */
function setFont(ctx, weight, size, family) {
  const fontStr = `${weight} ${size}px ${family || 'Noto Serif SC, sans-serif'}`;
  ctx.font = fontStr;
}


/* ================================================================
   Canvas 绘图工具函数
   ================================================================ */

/**
 * 画圆弧进度环
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {number} x - 圆心 x 坐标
 * @param {number} y - 圆心 y 坐标
 * @param {number} radius - 圆环半径
 * @param {number} progress - 进度 0-1
 * @param {string} color - 进度颜色
 * @param {string} bgColor - 底色
 * @param {number} lineWidth - 线宽，默认 8
 */
function drawProgressRing(ctx, x, y, radius, progress, color, bgColor, lineWidth) {
  lineWidth = lineWidth || 8;
  progress = Math.max(0, Math.min(1, progress));

  // 底色圆环
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 进度圆环（从顶部 12 点钟方向开始，顺时针）
  if (progress > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * progress;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/**
 * 画圆角矩形
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} w - 宽度
 * @param {number} h - 高度
 * @param {number} r - 圆角半径
 * @param {string} fillColor - 填充颜色
 */
function drawRoundRect(ctx, x, y, w, h, r, fillColor) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

/**
 * 画进度条
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {number} x - 进度条左上角 x
 * @param {number} y - 进度条左上角 y
 * @param {number} w - 进度条总宽度
 * @param {number} h - 进度条高度
 * @param {number} progress - 进度 0-1
 * @param {string} color - 填充颜色（渐变起始色）
 */
function drawProgressBar(ctx, x, y, w, h, progress, color) {
  progress = Math.max(0, Math.min(1, progress));

  // 底色背景
  drawRoundRect(ctx, x, y, w, h, h / 2, COLORS.barBg);

  // 填充进度（带渐变）
  if (progress > 0) {
    const fillW = Math.max(h, w * progress); // 最小宽度等于高度，保证圆角可见
    const gradient = ctx.createLinearGradient(x, y, x + fillW, y);
    gradient.addColorStop(0, COLORS.barFillStart);
    gradient.addColorStop(1, COLORS.barFillEnd);

    drawRoundRect(ctx, x, y, fillW, h, h / 2, gradient);
  }
}

/**
 * 文字自动换行
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {string} text - 要绘制的文本
 * @param {number} x - 起始 x 坐标
 * @param {number} y - 起始 y 坐标（第一行基线）
 * @param {number} maxWidth - 最大行宽
 * @param {number} lineHeight - 行高
 * @param {number} [maxLines] - 最多绘制行数，默认不限制
 * @returns {number} 实际绘制的行数
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  if (!text) return 0;

  // 逐字符测量宽度，遇到超出时换行
  let line = '';
  let lines = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const testLine = line + ch;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line.length > 0) {
      // 当前行已满，绘制并换行
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = ch;

      // 检查是否达到最大行数
      if (typeof maxLines === 'number' && lines >= maxLines) {
        // 超出部分省略
        if (line.length > 0 && lines < maxLines + 1) {
          ctx.fillText(line.slice(0, -1) + '...', x, y + lines * lineHeight);
        }
        break;
      }
    } else {
      line = testLine;
    }
  }

  // 绘制最后一行
  if (line.length > 0) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines++;
  }

  return lines;
}


/* ================================================================
   海报区域绘制函数
   ================================================================ */

/**
 * 绘制海报背景
 * 深色渐变 #0a1a1a → #1a3a3a → #0a2a2a
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 */
function drawBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  gradient.addColorStop(0, COLORS.bgTop);
  gradient.addColorStop(0.5, COLORS.bgMid);
  gradient.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

/**
 * 绘制顶部品牌区（y: 0-200px）
 * 品牌名 "澄明力" + 品牌句 + 装饰线
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 */
function drawBrandHeader(ctx) {
  // 品牌名 "澄明力"：居中，48px 粗体，白色
  setFont(ctx, 'bold', 48);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('澄明力', CANVAS_W / 2, 80);

  // 副标题：20px 金色
  setFont(ctx, 'normal', 20);
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('去伪，存真。看清世界，立住自己。', CANVAS_W / 2, 130);

  // 金色装饰线（居中短线）
  const lineW = 120;
  const lineY = 170;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - lineW / 2, lineY);
  ctx.lineTo(CANVAS_W / 2 + lineW / 2, lineY);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * 绘制三轴分数环（y: 220-520px）
 * 三个圆环横排等距分布，圆环半径 55px
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {Object} results - 评测结果数据
 */
function drawAxisRings(ctx, results) {
  const ringRadius = 55;
  const ringLineWidth = 10;
  const ringY = 340; // 圆心 y 坐标

  // 三个圆环横向等距分布
  const spacing = CANVAS_W / 4;
  const positions = [
    { x: spacing,     axis: 'jianCha',  label: '见察力', color: COLORS.ringJianCha },
    { x: spacing * 2, axis: 'chengXing', label: '澄省力', color: COLORS.ringChengXing },
    { x: spacing * 3, axis: 'mingDing',  label: '明定力', color: COLORS.ringMingDing },
  ];

  positions.forEach((item) => {
    const score = typeof results[item.axis] === 'number' ? results[item.axis] : 0;
    const progress = Math.max(0, Math.min(100, score)) / 100;

    // 绘制圆环
    drawProgressRing(ctx, item.x, ringY, ringRadius, progress, item.color, COLORS.ringBg, ringLineWidth);

    // 圆环内分数数字：28px 白色粗体
    setFont(ctx, 'bold', 28);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(score)), item.x, ringY);

    // 圆环下方轴名称：14px 灰色
    setFont(ctx, 'normal', 14);
    ctx.fillStyle = COLORS.gray;
    ctx.fillText(item.label, item.x, ringY + ringRadius + 30);
  });
}

/**
 * 绘制画像区（y: 540-700px）
 * 画像代码（大号金色）+ 画像名称（白色）+ 画像描述（一行简要版）
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {Object} results - 评测结果数据
 */
function drawProfileSection(ctx, results) {
  const profile = results.profile || {};
  const code = profile.code || '';
  const name = profile.name || '';
  const desc = profile.desc || '';

  // 画像代码：72px 粗体，金色，带发光效果
  const codeY = 600;
  setFont(ctx, 'bold', 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 发光效果：先绘制带模糊阴影的版本
  ctx.shadowColor = COLORS.goldLight;
  ctx.shadowBlur = 20;
  ctx.fillStyle = COLORS.gold;
  ctx.fillText(code, CANVAS_W / 2, codeY);

  // 重置阴影，再绘制一层清晰文字
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillText(code, CANVAS_W / 2, codeY);

  // 画像名称：28px 白色
  setFont(ctx, 'bold', 28);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(name, CANVAS_W / 2, codeY + 60);

  // 画像描述：简要版（截取前一行），16px 灰色
  if (desc) {
    setFont(ctx, 'normal', 16);
    ctx.fillStyle = COLORS.gray;
    // 限制最大宽度为 600px，最多两行
    wrapText(ctx, desc, CANVAS_W / 2, codeY + 105, 600, 24, 2);
  }
}

/**
 * 从结果中计算五大指数的分数
 * 适配 CJIScorer 新结果结构：从 results.fiveIndices 直接读取
 * @param {Object} results - 评测结果数据（CJIScorer 计算结果）
 * @returns {Object} 五大指数分数对象 { jianchaDepth, jianchaBreadth, chengxingClarity, mingingDecisiveness, overallClarity }
 */
function computeIndices(results) {
  // 优先从 CJIScorer 的 fiveIndices 读取
  if (results.fiveIndices) {
    const fi = results.fiveIndices;
    return {
      jianchaDepth: fi.utilizeSociety || 0,
      jianchaBreadth: fi.aiUtilization || 0,
      chengxingClarity: Math.round((fi.utilizeSociety || 0) * 0.5 + (fi.aiUtilization || 0) * 0.5),
      mingingDecisiveness: fi.sixStep || 0,
      overallClarity: results.clarityScore || 0,
    };
  }

  // 兼容旧结构：从 indices 维度中聚合计算
  const indices = results.indices || {};
  const output = {};

  INDEX_CONFIG.forEach((cfg) => {
    if (typeof indices[cfg.key] === 'number') {
      output[cfg.key] = indices[cfg.key];
      return;
    }

    if (cfg.dims.length > 0) {
      let sum = 0;
      let count = 0;
      cfg.dims.forEach((dim) => {
        if (typeof indices[dim] === 'number') {
          sum += indices[dim];
          count++;
        }
      });
      output[cfg.key] = count > 0 ? Math.round(sum / count) : cfg.fallback;
    } else {
      // overallClarity：综合三轴分数的平均值
      let jianCha = 0, chengXing = 0, mingDing = 0;
      // 适配新结果结构
      if (results.threeAxes) {
        jianCha = results.threeAxes.jianCha || 0;
        chengXing = results.threeAxes.chengXing || 0;
        mingDing = results.threeAxes.mingDing || 0;
      } else {
        jianCha = typeof results.jianCha === 'number' ? results.jianCha : 0;
        chengXing = typeof results.chengXing === 'number' ? results.chengXing : 0;
        mingDing = typeof results.mingDing === 'number' ? results.mingDing : 0;
      }
      output[cfg.key] = Math.round((jianCha + chengXing + mingDing) / 3);
    }
  });

  return output;
}

/**
 * 绘制五大指数区（y: 720-1050px）
 * 5 个进度条纵向排列，间距 50px
 * 每个指数：标签名 + 进度条 + 分数
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {Object} results - 评测结果数据
 */
function drawIndicesSection(ctx, results) {
  const indexScores = computeIndices(results);

  const startY = 740;      // 起始 y
  const spacing = 50;       // 每行间距
  const barWidth = 440;     // 进度条宽度
  const barHeight = 12;     // 进度条高度
  const labelX = 80;        // 标签左侧 x
  const barX = 200;         // 进度条左侧 x
  const scoreX = 650;       // 分数右侧 x

  // 区块标题
  setFont(ctx, 'bold', 20);
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  ctx.fillText('五大指数', CANVAS_W / 2, startY - 10);

  // 分割装饰线
  const sepLineY = startY + 10;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 100, sepLineY);
  ctx.lineTo(CANVAS_W / 2 + 100, sepLineY);
  ctx.strokeStyle = 'rgba(200,164,92,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  INDEX_CONFIG.forEach((cfg, i) => {
    const rowY = startY + 40 + i * spacing;
    const score = indexScores[cfg.key] || 0;
    const progress = score / 100;

    // 指数标签名：16px 白色，左对齐
    setFont(ctx, 'normal', 16);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.label, labelX, rowY);

    // 进度条
    drawProgressBar(ctx, barX, rowY - barHeight / 2, barWidth, barHeight, progress);

    // 分数：16px 金色，右对齐
    setFont(ctx, 'bold', 16);
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'right';
    ctx.fillText(String(score), scoreX, rowY);
  });
}

/**
 * 绘制底部区域（y: 1080-1334px）
 * 二维码占位区域 + 小字提示
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 */
function drawFooter(ctx) {
  const qrSize = 120;
  const qrX = (CANVAS_W - qrSize) / 2;
  const qrY = 1100;

  // 二维码占位：白色方框 + 虚线边框
  drawRoundRect(ctx, qrX, qrY, qrSize, qrSize, 8, '#ffffff');

  // 虚线内边框
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  drawRoundRect(ctx, qrX + 10, qrY + 10, qrSize - 20, qrSize - 20, 4, null);
  ctx.stroke();
  ctx.setLineDash([]); // 重置虚线

  // 二维码占位文字
  setFont(ctx, 'normal', 18);
  ctx.fillStyle = '#999999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('二维码', qrX + qrSize / 2, qrY + qrSize / 2);

  // 小字提示
  setFont(ctx, 'normal', 14);
  ctx.fillStyle = COLORS.gray;
  ctx.fillText('扫码开启你的澄明力之旅', CANVAS_W / 2, qrY + qrSize + 40);

  // 底部版权小字
  setFont(ctx, 'normal', 12);
  ctx.fillStyle = COLORS.darkGray;
  ctx.fillText('澄明力评测 · 发现你的认知力量', CANVAS_W / 2, CANVAS_H - 30);
}


/* ================================================================
   主函数：生成分享海报
   ================================================================ */

/**
 * 生成分享海报
 * 根据用户的测评结果，用 Canvas 绘制一张精美的分享海报，导出为 PNG base64。
 *
 * @param {Object} results - 评测结果数据
 * @param {string} results.profile - 画像代码 'AAA'~'BBB'
 *   （实际为 results.profile.code，此处兼容直接传入 code 字符串的情况）
 * @param {Object} [results.jianCha] - 见察力分数 { score, grade } 或直接 number
 * @param {Object} [results.chengXing] - 澄省力分数 { score, grade } 或直接 number
 * @param {Object} [results.mingDing] - 明定力分数 { score, grade } 或直接 number
 * @param {Object} [results.indices] - 五大指数
 * @param {Object} [results.indices.jianchaDepth] - 见察深度指数
 * @param {Object} [results.indices.jianchaBreadth] - 见察广度指数
 * @param {Object} [results.indices.chengxingClarity] - 澄净指数
 * @param {Object} [results.indices.mingingDecisiveness] - 明断指数
 * @param {Object} [results.indices.overallClarity] - 澄明综合指数
 * @param {Function} [callback] - 可选的回调函数，接收 base64 字符串
 * @returns {Promise<string>} base64 图片数据（如果提供了 callback 则通过回调返回）
 */
async function generateShareCanvas(results, callback) {
  // 等待字体加载
  await ensureFonts();

  // ── 数据规范化 ──
  // 兼容两种数据格式：
  //   1. app.js 实际传入的 { jianCha: number, profile: { code, name, desc }, indices: {...} }
  //   2. 文档描述的 { jianCha: { score, grade }, ... }
  const normalizedResults = normalizeResults(results);

  // ── 创建 Canvas ──
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;

  const ctx = canvas.getContext('2d');

  // 应用 DPR 缩放，使绘制坐标保持 750x1334 的逻辑空间
  ctx.scale(DPR, DPR);

  // ── 逐区域绘制 ──
  drawBackground(ctx);
  drawBrandHeader(ctx);
  drawAxisRings(ctx, normalizedResults);
  drawProfileSection(ctx, normalizedResults);
  drawIndicesSection(ctx, normalizedResults);
  drawFooter(ctx);

  // ── 导出为 PNG base64 ──
  const base64 = canvas.toDataURL('image/png');

  // 如果提供了回调函数，通过回调返回
  if (typeof callback === 'function') {
    callback(base64);
  }

  return base64;
}

/**
 * 规范化评测结果数据
 * 兼容三种格式：
 *   1. CJIScorer 新结构：{ threeAxes: { jianCha, mingDing, chengXing }, portrait: 'AAA' }
 *   2. app.js 旧格式：{ jianCha: number, profile: { code, name, desc }, indices: {...} }
 *   3. 文档描述的：{ jianCha: { score, grade }, ... }
 * @param {Object} results - 原始结果
 * @returns {Object} 规范化后的结果
 */
function normalizeResults(results) {
  const normalized = { ...results };

  // 规范化三轴分数：CJIScorer 新结构
  if (normalized.threeAxes) {
    ['jianCha', 'chengXing', 'mingDing'].forEach((axis) => {
      normalized[axis] = typeof normalized.threeAxes[axis] === 'number'
        ? normalized.threeAxes[axis]
        : 0;
    });
  } else {
    // 旧结构或 { score, grade } 对象格式
    ['jianCha', 'chengXing', 'mingDing'].forEach((axis) => {
      if (normalized[axis] && typeof normalized[axis] === 'object' && typeof normalized[axis].score === 'number') {
        normalized[axis] = normalized[axis].score;
      }
      if (typeof normalized[axis] !== 'number') {
        normalized[axis] = 0;
      }
    });
  }

  // 规范化 profile 对象
  if (typeof normalized.profile === 'string') {
    // 如果 profile 是画像代码字符串（如 'AAA'），尝试从 Data 中获取
    normalized.profile = {
      code: normalized.profile,
      name: '',
      desc: '',
    };
  }

  // CJIScorer 新结构中 portrait 是字符串，需要转为 profile 对象
  if (normalized.portrait && typeof normalized.portrait === 'string') {
    normalized.profile = {
      code: normalized.portrait,
      name: '',
      desc: '',
    };
  }

  // 确保 profile 对象存在
  if (!normalized.profile || typeof normalized.profile !== 'object') {
    normalized.profile = { code: '', name: '', desc: '' };
  }

  return normalized;
}


/* ================================================================
   导出
   ================================================================ */

export { generateShareCanvas };

// 同时挂载到 window 供 app.js 调用
window.generateShareCanvas = generateShareCanvas;
