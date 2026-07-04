/**
 * 雷达图（蛛网图）模块 - 纯 Canvas 实现
 * 不依赖任何第三方库
 *
 * 导出函数：
 * - drawRadar: 绘制三轴雷达图（见察力/澄省力/明定力）
 * - drawShadowRadar: 绘制五遮蔽雷达图（懒/惧/贪/执/盲）
 */

/* ============================================================
 *  工具函数
 * ============================================================ */

/**
 * easeOutCubic 缓动函数
 * @param {number} t - 进度值 [0, 1]
 * @returns {number} 缓动后的值
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 根据角度和距离计算画布坐标
 * @param {number} centerX - 中心 X
 * @param {number} centerY - 中心 Y
 * @param {number} angle - 弧度
 * @param {number} distance - 距离
 * @returns {{ x: number, y: number }}
 */
function getPoint(centerX, centerY, angle, distance) {
  return {
    x: centerX + distance * Math.cos(angle),
    y: centerY + distance * Math.sin(angle),
  };
}

/**
 * 初始化 Canvas 高 DPI 支持
 * @param {HTMLCanvasElement} canvas - Canvas 元素
 * @returns {{ ctx: CanvasRenderingContext2D, width: number, height: number }}
 */
function setupHiDPI(canvas) {
  const dpr = window.devicePixelRatio || 1;
  // 如果 CSS 尚未设置宽度，则给一个默认值
  const cssWidth = parseInt(getComputedStyle(canvas).width) || canvas.clientWidth || 300;
  const cssHeight = parseInt(getComputedStyle(canvas).height) || canvas.clientHeight || 300;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width: cssWidth, height: cssHeight };
}

/* ============================================================
 *  三轴雷达图 —— 见察力 / 澄省力 / 明定力
 * ============================================================ */

/**
 * 绘制三轴雷达图
 * @param {HTMLCanvasElement|string} canvasOrId - Canvas 元素或 ID
 * @param {Object} scores - 三轴分数
 * @param {number} scores.jianCha - 见察力分数 0-100
 * @param {number} scores.chengXing - 澄省力分数 0-100
 * @param {number} scores.mingDing - 明定力分数 0-100
 * @param {Object} [options] - 可选配置
 * @param {string} [options.bgColor] - 背景色，默认 '#1a3a3a'
 * @param {string} [options.gridColor] - 网格线颜色，默认 'rgba(200,164,92,0.15)'
 * @param {string} [options.fillColor] - 数据区填充色，默认 'rgba(200,164,92,0.2)'
 * @param {string} [options.strokeColor] - 数据区边框色，默认 '#c8a45c'
 * @param {string} [options.labelColor] - 标签颜色，默认 '#e8e0d0'
 * @param {string} [options.scoreColor] - 分数颜色，默认 '#c8a45c'
 * @param {number} [options.padding] - 画布内边距，默认 40
 * @param {boolean} [options.animate] - 是否动画绘制，默认 true
 */
export function drawRadar(canvasOrId, scores, options = {}) {
  /* ---------- 1. 获取 Canvas 元素 ---------- */
  const canvas =
    typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;
  if (!canvas) {
    console.error('[drawRadar] 找不到 Canvas 元素:', canvasOrId);
    return;
  }

  /* ---------- 2. 设置高 DPI ---------- */
  const { ctx, width, height } = setupHiDPI(canvas);

  /* ---------- 3. 合并默认配置 ---------- */
  const {
    bgColor = '#FFF0D0',
    gridColor = 'rgba(200,140,60,0.2)',
    fillColor = 'rgba(220,140,50,0.25)',
    strokeColor = '#E8622E',
    labelColor = '#6A4A20',
    scoreColor = '#D04A18',
    padding = 40,
    animate = true,
  } = options;

  /* ---------- 4. 计算中心点和半径 ---------- */
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - padding;

  /* ---------- 5. 三轴数据 ---------- */
  // 等边三角形，3 个顶点角度（从正上方开始，顺时针）
  // -90°（上方）、30°（右下）、150°（左下）
  const angles = [
    -Math.PI / 2,               // 见察力 - 上方
    -Math.PI / 2 + 2 * Math.PI / 3, // 澄省力 - 左下
    -Math.PI / 2 + 4 * Math.PI / 3, // 明定力 - 右下
  ];

  // 标签信息：emoji + 名称
  const labels = [
    { emoji: '\u{1F30D}', name: '\u89c1\u5bdf\u529b' },  // 🌍 见察力
    { emoji: '\u2764\uFE0F', name: '\u6f84\u7701\u529b' }, // ❤️ 澄省力
    { emoji: '\u{1F3AF}', name: '\u660e\u5b9a\u529b' },    // 🎯 明定力
  ];

  // 对应分数数组
  const rawValues = [
    Math.max(0, Math.min(100, scores.jianCha || 0)),
    Math.max(0, Math.min(100, scores.chengXing || 0)),
    Math.max(0, Math.min(100, scores.mingDing || 0)),
  ];

  // 网格层数
  const gridLayers = 4;

  /* ---------- 6. 核心绘制函数 ---------- */

  /**
   * 按当前进度绘制一帧
   * @param {number} progress - 动画进度 [0, 1]
   */
  function renderFrame(progress) {
    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // ① 绘制背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // ② 绘制 4 层同心三角形网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let layer = 1; layer <= gridLayers; layer++) {
      const dist = (radius * layer) / gridLayers;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const pt = getPoint(centerX, centerY, angles[i], dist);
        if (i === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // ③ 绘制轴线（从中心到 3 个顶点）
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const pt = getPoint(centerX, centerY, angles[i], radius);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }

    // ④ 计算当前进度的数据点坐标
    const dataPoints = rawValues.map((val, i) => {
      const dist = (val / 100) * radius * progress;
      return getPoint(centerX, centerY, angles[i], dist);
    });

    // ⑤ 绘制数据填充区域
    if (progress > 0) {
      ctx.beginPath();
      dataPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // ⑥ 绘制数据边框
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // ⑦ 绘制顶点圆点
      dataPoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
    }

    // ⑧ 绘制标签文字（emoji + 名称 + 分数）
    // 只在动画完成后（或不需要动画时）显示分数
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < 3; i++) {
      const pt = getPoint(centerX, centerY, angles[i], radius);
      // 标签偏移方向：沿径向外推
      const labelDist = radius + padding * 0.6;
      const labelPt = getPoint(centerX, centerY, angles[i], labelDist);

      // emoji + 名称
      const nameText = labels[i].emoji + ' ' + labels[i].name;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = labelColor;
      ctx.fillText(nameText, labelPt.x, labelPt.y - 10);

      // 分数（仅在动画接近完成时显示）
      if (progress > 0.85) {
        const scoreAlpha = Math.min(1, (progress - 0.85) / 0.15);
        ctx.globalAlpha = scoreAlpha;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = scoreColor;
        ctx.fillText(Math.round(rawValues[i] * progress), labelPt.x, labelPt.y + 12);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ---------- 7. 动画控制 ---------- */
  if (animate) {
    const duration = 600; // 动画持续 600ms
    const startTime = performance.now();

    function animationLoop(now) {
      const elapsed = now - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const progress = easeOutCubic(rawProgress);
      renderFrame(progress);

      if (rawProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    }
    requestAnimationFrame(animationLoop);
  } else {
    // 无动画，直接绘制
    renderFrame(1);
  }
}

/* ============================================================
 *  五遮蔽雷达图 —— 懒 / 惧 / 贪 / 执 / 盲
 * ============================================================ */

/**
 * 绘制五遮蔽雷达图（正五边形布局）
 * @param {HTMLCanvasElement|string} canvasOrId - Canvas 元素或 ID
 * @param {Object} shadowScores - 五遮蔽分数
 * @param {number} shadowScores.lazy - 懒惰 0-100
 * @param {number} shadowScores.fear - 恐惧 0-100
 * @param {number} shadowScores.profit - 贪利 0-100
 * @param {number} shadowScores.lock - 执着 0-100
 * @param {number} shadowScores.blind - 盲目 0-100
 * @param {Object} [options] - 可选配置（与 drawRadar 相同，另有以下默认覆盖）
 * @param {string} [options.bgColor] - 背景色，默认 '#2a1a2a'
 * @param {string} [options.gridColor] - 网格线颜色，默认 'rgba(180,100,120,0.15)'
 * @param {string} [options.fillColor] - 数据区填充色，默认 'rgba(180,100,120,0.25)'
 * @param {string} [options.strokeColor] - 数据区边框色，默认 '#b46478'
 * @param {string} [options.labelColor] - 标签颜色，默认 '#e8e0d0'
 * @param {string} [options.scoreColor] - 分数颜色，默认 '#b46478'
 * @param {number} [options.padding] - 画布内边距，默认 45
 * @param {boolean} [options.animate] - 是否动画绘制，默认 true
 */
export function drawShadowRadar(canvasOrId, shadowScores, options = {}) {
  /* ---------- 1. 获取 Canvas 元素 ---------- */
  const canvas =
    typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;
  if (!canvas) {
    console.error('[drawShadowRadar] 找不到 Canvas 元素:', canvasOrId);
    return;
  }

  /* ---------- 2. 设置高 DPI ---------- */
  const { ctx, width, height } = setupHiDPI(canvas);

  /* ---------- 3. 合并默认配置 ---------- */
  const {
    bgColor = '#FFF0D0',
    gridColor = 'rgba(200,120,60,0.2)',
    fillColor = 'rgba(210,100,50,0.25)',
    strokeColor = '#E8513E',
    labelColor = '#6A4A20',
    scoreColor = '#D04A18',
    padding = 45,
    animate = true,
  } = options;

  /* ---------- 4. 计算中心点和半径 ---------- */
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(centerX, centerY) - padding;

  /* ---------- 5. 五轴数据 ---------- */
  // 正五边形，5 个顶点角度（从正上方开始，顺时针）
  const vertexCount = 5;
  const angles = Array.from({ length: vertexCount }, (_, i) => {
    return -Math.PI / 2 + (2 * Math.PI * i) / vertexCount;
  });

  // 标签信息
  const labels = [
    { emoji: '\u{1F4A4}', name: '\u61d2\u60f0' },  // 💤 懒惰
    { emoji: '\u{1F631}', name: '\u6050\u60e7' },   // 😱 恐惧
    { emoji: '\u{1F4B0}', name: '\u8d2a\u5229' },    // 💰 贪利
    { emoji: '\u{1F525}', name: '\u6267\u7740' },     // 🔥 执着
    { emoji: '\u{1F441}', name: '\u76f2\u76ee' },     // 👁 盲目
  ];

  // 对应分数数组
  const rawValues = [
    Math.max(0, Math.min(100, shadowScores.lazy || 0)),
    Math.max(0, Math.min(100, shadowScores.fear || 0)),
    Math.max(0, Math.min(100, shadowScores.profit || 0)),
    Math.max(0, Math.min(100, shadowScores.lock || 0)),
    Math.max(0, Math.min(100, shadowScores.blind || 0)),
  ];

  // 网格层数
  const gridLayers = 4;

  /* ---------- 6. 核心绘制函数 ---------- */

  /**
   * 按当前进度绘制一帧
   * @param {number} progress - 动画进度 [0, 1]
   */
  function renderFrame(progress) {
    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // ① 绘制背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // ② 绘制 4 层同心正五边形网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let layer = 1; layer <= gridLayers; layer++) {
      const dist = (radius * layer) / gridLayers;
      ctx.beginPath();
      for (let i = 0; i < vertexCount; i++) {
        const pt = getPoint(centerX, centerY, angles[i], dist);
        if (i === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // ③ 绘制轴线（从中心到 5 个顶点）
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < vertexCount; i++) {
      const pt = getPoint(centerX, centerY, angles[i], radius);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }

    // ④ 计算当前进度的数据点坐标
    const dataPoints = rawValues.map((val, i) => {
      const dist = (val / 100) * radius * progress;
      return getPoint(centerX, centerY, angles[i], dist);
    });

    // ⑤ 绘制数据填充区域
    if (progress > 0) {
      ctx.beginPath();
      dataPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // ⑥ 绘制数据边框
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // ⑦ 绘制顶点圆点
      dataPoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
    }

    // ⑧ 绘制标签文字（emoji + 名称 + 分数）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < vertexCount; i++) {
      // 标签偏移方向：沿径向外推
      const labelDist = radius + padding * 0.6;
      const labelPt = getPoint(centerX, centerY, angles[i], labelDist);

      // emoji + 名称
      const nameText = labels[i].emoji + ' ' + labels[i].name;
      ctx.font = '13px sans-serif';
      ctx.fillStyle = labelColor;
      ctx.fillText(nameText, labelPt.x, labelPt.y - 10);

      // 分数（仅在动画接近完成时显示）
      if (progress > 0.85) {
        const scoreAlpha = Math.min(1, (progress - 0.85) / 0.15);
        ctx.globalAlpha = scoreAlpha;
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = scoreColor;
        ctx.fillText(Math.round(rawValues[i] * progress), labelPt.x, labelPt.y + 12);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ---------- 7. 动画控制 ---------- */
  if (animate) {
    const duration = 600; // 动画持续 600ms
    const startTime = performance.now();

    function animationLoop(now) {
      const elapsed = now - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const progress = easeOutCubic(rawProgress);
      renderFrame(progress);

      if (rawProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    }
    requestAnimationFrame(animationLoop);
  } else {
    // 无动画，直接绘制
    renderFrame(1);
  }
}

/* ============================================================
 *  默认导出 & 全局挂载
 * ============================================================ */

export default {
  drawRadar,
  drawShadowRadar,
};

// 同时挂载到 window，方便非模块环境直接使用
window.drawRadar = drawRadar;
window.drawShadowRadar = drawShadowRadar;
