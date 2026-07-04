/**
 * 澄明力评测 H5 应用 — 核心逻辑层
 *
 * 本文件包含：
 *   1. 路由系统 Router（hash 路由 + 页面切换动画）
 *   2. 状态管理 AppState（内存 + localStorage + 默认兜底）
 *   3. 页面控制器 PageControllers（每个页面的 enter / leave 钩子）
 *   4. 核心业务函数（答题、评分、教练、分享）
 *   5. 工具函数（防抖、格式化、动画、提示）
 */

import Data, { AXES_MAP, TYPE_MAP, SEGMENT_MAP, loadQuestions } from './data.js';
import { CJIScorer } from './scoring.js';
import * as ReportData from './report-data.js';
import * as CoachConfig from './coach-config.js';
import { drawRadar, drawShadowRadar } from './radar.js';

/* ================================================================
   1. 路由系统 Router
   基于 hash 路由，支持页面切换动画和三级数据传递
   ================================================================ */

/** 路由配置表 */
const routes = [
  { path: '/', name: 'home', title: '澄明力评测' },
  { path: '/quiz', name: 'quiz', title: '澄明力测评' },
  { path: '/generating', name: 'generating', title: '生成报告中' },
  { path: '/report', name: 'report', title: '澄明力报告' },
  { path: '/coach', name: 'coach', title: 'AI澄明教练' },
  { path: '/coach-summary', name: 'coach-summary', title: '训练总结' },
  { path: '/share', name: 'share', title: '分享你的澄明力' },
];

/**
 * 路由管理器
 * 监听 hashchange 事件，负责页面切换、动画控制和生命周期调用
 */
const Router = {
  /** 当前路由名称 */
  current: null,

  /** 上一个路由名称（用于判断动画方向） */
  previous: null,

  /** 页面容器 DOM 元素 */
  container: null,

  /** 路由索引映射，方便通过名称查找路由顺序 */
  _indexMap: {},

  /** 初始化路由 */
  init() {
    // 构建路由索引，用于判断前进/后退方向
    routes.forEach((r, i) => {
      this._indexMap[r.name] = i;
    });

    // 缓存页面容器
    this.container = document.getElementById('app') || document.querySelector('#app');

    // 监听 hash 变化
    window.addEventListener('hashchange', () => {
      this._handleRouteChange();
    });

    // 初始加载时触发一次路由匹配
    this._handleRouteChange();
  },

  /** 处理路由变化 */
  _handleRouteChange() {
    const hash = window.location.hash.slice(1) || '/'; // 去掉 # 前缀
    const route = routes.find(r => r.path === hash);

    if (!route) {
      // 未匹配到路由，回退到首页
      this.navigate('/');
      return;
    }

    const prevName = this.current;
    this.previous = prevName;

    // 判断页面切换方向
    const direction = this._getDirection(prevName, route.name);

    // 离开旧页面
    if (prevName && PageControllers[prevName] && PageControllers[prevName].leave) {
      PageControllers[prevName].leave();
    }

    // 渲染新页面（带动画）
    this._renderPage(route, direction);

    // 更新当前路由
    this.current = route.name;

    // 更新页面标题
    document.title = route.title;

    // 进入新页面
    if (PageControllers[route.name] && PageControllers[route.name].enter) {
      // 通过 AppState 传递数据，同时也可接收手动传入的数据
      const data = AppState.pendingData || null;
      AppState.pendingData = null;
      PageControllers[route.name].enter(data);
    }
  },

  /**
   * 判断页面切换方向
   * @param {string} fromName - 来源页面名称
   * @param {string} toName - 目标页面名称
   * @returns {'slide-left'|'slide-right'|'none'} - 动画方向
   */
  _getDirection(fromName, toName) {
    if (!fromName) return 'none';
    const fromIndex = this._indexMap[fromName];
    const toIndex = this._indexMap[toName];
    // 目标页在路由表中靠后 → 向左滑（前进）
    // 目标页在路由表中靠前 → 向右滑（后退）
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return 'none';
    return toIndex > fromIndex ? 'slide-left' : 'slide-right';
  },

  /**
   * 渲染页面（带 CSS 动画）
   * @param {Object} route - 路由配置对象
   * @param {string} direction - 动画方向
   */
  _renderPage(route, direction) {
    if (!this.container) return;

    // 创建新页面容器
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.setAttribute('data-page', route.name);
    pageEl.innerHTML = this._getPageHTML(route.name);

    // 设置初始动画位置
    if (direction === 'slide-left') {
      pageEl.style.transform = 'translateX(100%)';
    } else if (direction === 'slide-right') {
      pageEl.style.transform = 'translateX(-100%)';
    }

    // 追加到容器
    this.container.appendChild(pageEl);

    // 获取旧的页面元素
    const oldPage = this.container.querySelector('.page.active');
    if (oldPage) {
      // 移除旧页面的 active 状态
      oldPage.classList.remove('active');
      oldPage.classList.add('leaving');

      if (direction === 'slide-left') {
        oldPage.style.transform = 'translateX(-30%)';
      } else if (direction === 'slide-right') {
        oldPage.style.transform = 'translateX(30%)';
      }

      // 动画结束后移除旧页面
      setTimeout(() => {
        if (oldPage.parentNode) {
          oldPage.parentNode.removeChild(oldPage);
        }
      }, 350);
    }

    // 触发新页面入场动画
    requestAnimationFrame(() => {
      pageEl.style.transform = 'translateX(0)';
      pageEl.classList.add('active');
    });

    // 更新 body 滚动位置
    window.scrollTo(0, 0);
  },

  /**
   * 获取页面 HTML 模板
   * 实际项目中通常由模板引擎或组件渲染，此处返回占位结构
   * @param {string} pageName - 页面名称
   * @returns {string} HTML 字符串
   */
  _getPageHTML(pageName) {
    return `<div class="page-inner page-${pageName}" id="page-${pageName}"></div>`;
  },

  /**
   * 导航到指定路由
   * @param {string} path - 路由路径，如 '/quiz'
   * @param {Object} [data] - 需要传递的数据，存入 AppState.pendingData
   */
  navigate(path, data = null) {
    if (data) {
      AppState.pendingData = data;
    }
    window.location.hash = path;
  },

  /**
   * 替换当前路由（不产生历史记录）
   * @param {string} path - 路由路径
   * @param {Object} [data] - 传递数据
   */
  replace(path, data = null) {
    if (data) {
      AppState.pendingData = data;
    }
    window.location.replace(window.location.pathname + '#' + path);
  },
};


/* ================================================================
   2. 状态管理 AppState
   三级数据传递：内存 → localStorage → 默认兜底
   ================================================================ */

/** 应用状态对象 */
const AppState = {
  /* ── 测评模式 ── */
  mode: 'standard', // 'standard'（标准版32题）| 'quick'（快速版22题）

  /* ── 答题进度 ── */
  currentQuestion: 0,     // 当前题目索引
  answers: [],            // 作答记录 [{ questionId, selectedId }]
  startTime: null,        // 开始答题时间戳
  quizData: null,          // 加载的题库JSON数据

  /* ── 评分结果 ── */
  results: null,          // { jianCha, chengXing, mingDing, profile, blinders, indices, se, ... }

  /* ── 教练状态 ── */
  coachRound: 0,           // 当前教练轮次（0-6）
  coachHistory: [],        // 对话历史 [{ role: 'coach'|'user', text, round }]
  coachComplete: false,     // 教练对话是否完成

  /* ── 分享 ── */
  shareImage: null,         // 分享图片 base64 数据

  /* ── 导航传递数据的暂存区 ── */
  pendingData: null,

  /** localStorage 存储键名 */
  _storageKey: 'chengming_app_state',

  /**
   * 保存状态到 localStorage
   * 每次状态变化后自动调用
   */
  save() {
    try {
      const state = {
        mode: this.mode,
        currentQuestion: this.currentQuestion,
        answers: this.answers,
        startTime: this.startTime,
        quizData: this.quizData,
        results: this.results,
        coachRound: this.coachRound,
        coachHistory: this.coachHistory,
        coachComplete: this.coachComplete,
        shareImage: this.shareImage,
      };
      localStorage.setItem(this._storageKey, JSON.stringify(state));
    } catch (e) {
      // localStorage 已满或不可用时静默失败
      console.warn('[AppState] 保存状态失败：', e);
    }
  },

  /**
   * 从 localStorage 恢复状态
   * @returns {boolean} 是否成功恢复
   */
  load() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return false;

      const saved = JSON.parse(raw);

      // 逐字段恢复，避免未定义字段覆盖默认值
      if (saved.mode) this.mode = saved.mode;
      if (typeof saved.currentQuestion === 'number') this.currentQuestion = saved.currentQuestion;
      if (Array.isArray(saved.answers)) this.answers = saved.answers;
      if (saved.startTime) this.startTime = saved.startTime;
      if (saved.quizData) this.quizData = saved.quizData;
      if (saved.results) this.results = saved.results;
      if (typeof saved.coachRound === 'number') this.coachRound = saved.coachRound;
      if (Array.isArray(saved.coachHistory)) this.coachHistory = saved.coachHistory;
      if (typeof saved.coachComplete === 'boolean') this.coachComplete = saved.coachComplete;
      if (saved.shareImage) this.shareImage = saved.shareImage;

      return true;
    } catch (e) {
      console.warn('[AppState] 恢复状态失败：', e);
      return false;
    }
  },

  /**
   * 清空所有状态
   */
  reset() {
    this.mode = 'standard';
    this.currentQuestion = 0;
    this.answers = [];
    this.startTime = null;
    this.quizData = null;
    this.results = null;
    this.coachRound = 0;
    this.coachHistory = [];
    this.coachComplete = false;
    this.shareImage = null;
    this.pendingData = null;

    try {
      localStorage.removeItem(this._storageKey);
    } catch (e) {
      // 忽略清理失败
    }
  },

  /**
   * 获取当前状态（三级 fallback：内存 → localStorage → 默认值）
   * 确保任何情况下都能拿到有效数据，不会崩溃
   * @returns {Object} 当前状态快照
   */
  getState() {
    // 第一级：直接从内存获取
    const memoryState = {
      mode: this.mode,
      currentQuestion: this.currentQuestion,
      answers: this.answers,
      startTime: this.startTime,
      quizData: this.quizData,
      results: this.results,
      coachRound: this.coachRound,
      coachHistory: this.coachHistory,
      coachComplete: this.coachComplete,
      shareImage: this.shareImage,
    };

    // 验证内存状态是否完整
    if (this._validateState(memoryState)) {
      return memoryState;
    }

    // 第二级：从 localStorage 恢复
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (this._validateState(saved)) {
          // 恢复到内存中
          Object.assign(this, saved);
          return saved;
        }
      }
    } catch (e) {
      // localStorage 读取失败，继续到第三级
    }

    // 第三级：返回默认值兜底，确保不崩溃、不跳回首页
    return {
      mode: 'standard',
      currentQuestion: 0,
      answers: [],
      startTime: null,
      quizData: null,
      results: null,
      coachRound: 0,
      coachHistory: [],
      coachComplete: false,
      shareImage: null,
    };
  },

  /**
   * 验证状态数据的基本完整性
   * @param {Object} state - 待验证的状态对象
   * @returns {boolean} 是否有效
   */
  _validateState(state) {
    if (!state || typeof state !== 'object') return false;
    // 至少需要有 mode 和 answers 字段
    return 'mode' in state && 'answers' in state;
  },

  /**
   * 导航并传递数据
   * 同时将数据存入 pendingData，页面 enter 时自动取出
   * @param {string} routePath - 路由路径
   * @param {Object} [data] - 传递数据
   */
  navigate(routePath, data = null) {
    this.pendingData = data;
    Router.navigate(routePath, data);
  },
};


/* ================================================================
   3. 页面控制器 PageControllers
   每个路由对应一个控制器，负责页面的初始化和清理
   ================================================================ */

const PageControllers = {

  /* ── 首页 ── */
  home: {
    /** 当前展开的手风琴面板：'eval' | 'train' | null */
    _expandedPanel: null,

    /**
     * 进入首页
     * @param {Object} data - 导航传递的数据（首页通常不需要）
     */
    enter(data) {
      const state = AppState.getState();
      const pageEl = document.getElementById('page-home');
      if (pageEl) {
        pageEl.innerHTML = this._render(state);
        this._bindEvents(pageEl, state);
      }
    },

    /** 离开首页 */
    leave() {
      this._expandedPanel = null;
    },

    /**
     * 检查 localStorage 中的未完成评测草稿
     * @returns {Object|null} { mode, questionIndex, totalQuestions, updatedAt }
     */
    _getEvalDraft() {
      try {
        const state = AppState.getState();
        // 有题目数据 + 有作答记录 + 未完成
        if (state.quizData && state.answers && state.answers.length > 0 && !state.results) {
          return {
            mode: state.mode,
            currentQuestion: state.currentQuestion,
            totalQuestions: (state.quizData.questions || []).length,
          };
        }
        return null;
      } catch (e) { return null; }
    },

    /**
     * 检查 localStorage 中的训练备份
     * @returns {Object|null} { round, totalRounds, updatedAt }
     */
    _getTrainingBackup() {
      try {
        const raw = localStorage.getItem('cji_training_backup');
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { return null; }
    },

    /** 渲染首页 HTML */
    _render(state) {
      const evalDraft = this._getEvalDraft();
      const trainingBackup = this._getTrainingBackup();
      const hasResults = !!state.results;

      // 未完成评测提示文案
      const evalNotice = evalDraft && !hasResults
        ? `<div class="home-panel__notice">你有未完成的评测</div>`
        : '';

      // 已完成评测 → 查看报告链接
      const evalReportLink = hasResults
        ? `<div class="home-panel__report-link" data-action="view-report">查看报告</div>`
        : '';

      // 测评二级菜单底部：继续评测 / 查看报告
      let evalResumeCard = '';
      if (hasResults) {
        evalResumeCard = `
          <div class="home-panel__version" data-action="view-report">
            <div class="home-panel__version-info">
              <span class="home-panel__version-badge">📋 查看评测报告</span>
              <span class="home-panel__version-desc">你的三轴分析、五维指数、认知遮蔽与行动建议</span>
            </div>
            <span class="home-panel__version-arrow">›</span>
          </div>`;
      } else if (evalDraft) {
        evalResumeCard = `
          <div class="home-panel__version" data-action="start-eval" data-mode="${evalDraft.mode || 'standard'}">
            <div class="home-panel__version-info">
              <span class="home-panel__version-badge">📝 继续未完成的评测</span>
              <span class="home-panel__version-desc">上次答到第${evalDraft.currentQuestion + 1}题，继续作答</span>
            </div>
            <span class="home-panel__version-arrow">›</span>
          </div>`;
      }

      // 训练备份信息
      const trainingInfo = trainingBackup
        ? `<div class="home-panel__backup-info">上次：第${trainingBackup.round}/${trainingBackup.totalRounds}轮 · ${trainingBackup.updatedAt}</div>`
        : '';

      return `
        <div class="home-container">
          <!-- 品牌头部 -->
          <div class="home-hero">
            <img class="home-hero__avatar" src="assets/avatar.jpg" alt="见澄明" />
            <h1 class="home-hero__title">澄明力</h1>
            <p class="home-hero__subtitle">看清世界 · 立住自己</p>
          </div>

          <!-- 测评长条按钮（手风琴） -->
          <div class="home-panel" id="panel-eval" data-panel="eval">
            ${evalNotice}
            <div class="home-panel__trigger" data-panel="eval">
              <span class="home-panel__trigger-left">
                <span class="home-panel__trigger-emoji">🔍</span>
                <span class="home-panel__trigger-texts">
                  <span class="home-panel__trigger-title">测评</span>
                  <span class="home-panel__trigger-sub">定位你的光和山</span>
                </span>
              </span>
              <span class="home-panel__arrow">▼</span>
            </div>
            <div class="home-panel__body">
              <div class="home-panel__content">
                <!-- 快速测评 -->
                <div class="home-panel__version" data-mode="quick" data-action="start-eval">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">⚡ 快速测评 20题</span>
                    <span class="home-panel__version-desc">引流钩子 · 朋友圈转发、初次接触。三轴坐标+一句话画像+基础遮蔽提示</span>
                  </div>
                  <span class="home-panel__version-arrow">›</span>
                </div>
                <!-- 标准测评 -->
                <div class="home-panel__version" data-mode="standard" data-action="start-eval">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">📐 标准测评 30题</span>
                    <span class="home-panel__version-desc">核心产品 · 认真想了解自己的人。光+山+遮蔽+深度诊断+第一步完整报告</span>
                  </div>
                  <span class="home-panel__version-arrow">›</span>
                </div>
                <!-- 深度测评（锁定） -->
                <div class="home-panel__version home-panel__version--locked">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">🔬 深度测评 72题</span>
                    <span class="home-panel__version-desc">付费入口 · L2训练营前测。全维度+遮蔽深度+30天训练路径</span>
                  </div>
                  <span class="home-panel__version-lock">🔒</span>
                </div>
                ${evalResumeCard}
              </div>
            </div>
            ${evalReportLink}
          </div>

          <!-- 训练长条按钮（手风琴） -->
          <div class="home-panel" id="panel-train" data-panel="train">
            <div class="home-panel__trigger" data-panel="train">
              <span class="home-panel__trigger-left">
                <span class="home-panel__trigger-emoji">🎯</span>
                <span class="home-panel__trigger-texts">
                  <span class="home-panel__trigger-title">训练</span>
                  <span class="home-panel__trigger-sub">每天5分钟，让澄明变成本能</span>
                </span>
              </span>
              <span class="home-panel__arrow">▼</span>
            </div>
            <div class="home-panel__body">
              <div class="home-panel__content">
                <div class="home-panel__version" data-action="start-train">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">⚡ 快速训练</span>
                    <span class="home-panel__version-desc">限时挑战，5分钟感受澄明力</span>
                  </div>
                  <span class="home-panel__version-arrow">›</span>
                </div>
                <div class="home-panel__version home-panel__version--locked">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">🔍 见察训练</span>
                    <span class="home-panel__version-desc">看清世界·信息溯源训练</span>
                  </div>
                  <span class="home-panel__version-status">即将推出</span>
                </div>
                <div class="home-panel__version home-panel__version--locked">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">❤️ 澄省训练</span>
                    <span class="home-panel__version-desc">了解自己·驱动识别训练</span>
                  </div>
                  <span class="home-panel__version-status">即将推出</span>
                </div>
                <div class="home-panel__version home-panel__version--locked">
                  <div class="home-panel__version-info">
                    <span class="home-panel__version-badge">🎯 明定训练</span>
                    <span class="home-panel__version-desc">找到路径·最小启动训练</span>
                  </div>
                  <span class="home-panel__version-status">即将推出</span>
                </div>
              </div>
            </div>
            ${trainingInfo}
          </div>

          <!-- 底部版权 -->
          <div class="home-footer">见澄明2026</div>
        </div>
      `;
    },

    /** 绑定首页事件 */
    _bindEvents(el, state) {
      const self = this;

      // ── 手风琴展开/收起 ──
      el.querySelectorAll('.home-panel__trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
          const panelId = trigger.getAttribute('data-panel');
          self._togglePanel(panelId, el);
        });
      });

      // ── 开始/继续评测（整个版本卡片可点击） ──
      el.querySelectorAll('.home-panel__version[data-action="start-eval"]').forEach(card => {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          const mode = card.getAttribute('data-mode');
          initQuiz(mode);
        });
      });

      // ── 开始/继续训练（整个版本卡片可点击） ──
      el.querySelectorAll('.home-panel__version[data-action="start-train"]').forEach(card => {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          startCoach();
        });
      });

      // ── 查看报告 ──
      el.querySelectorAll('[data-action="view-report"]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          Router.navigate('/report');
        });
      });
    },

    /**
     * 切换手风琴面板
     * @param {string} panelId - 'eval' | 'train'
     * @param {HTMLElement} containerEl - 页面容器
     */
    _togglePanel(panelId, containerEl) {
      const panel = containerEl.querySelector(`#panel-${panelId}`);
      if (!panel) return;

      const isExpanding = !panel.classList.contains('expanded');

      // 互斥：先收起另一个面板
      containerEl.querySelectorAll('.home-panel.expanded').forEach(openPanel => {
        if (openPanel.id !== `panel-${panelId}`) {
          openPanel.classList.remove('expanded');
        }
      });

      // 切换当前面板
      panel.classList.toggle('expanded', isExpanding);
      this._expandedPanel = isExpanding ? panelId : null;
    },
  },

  /* ── 答题页 ── */
  quiz: {
    /**
     * 进入答题页
     * 从 AppState.quizData 获取题目列表
     * @param {Object} data - { resume? }
     */
    enter(data) {
      const state = AppState.getState();

      // 从 quizData 获取题目列表
      const questions = (state.quizData && state.quizData.questions) || [];

      if (questions.length === 0) {
        showToast('题目加载失败，请返回重试', 'error');
        Router.navigate('/');
        return;
      }

      this._questions = questions;

      // 如果是恢复答题，从上次的位置继续
      if (data && data.resume) {
        // 保持 currentQuestion 不变
      } else if (state.currentQuestion >= this._questions.length) {
        // 已经答完了，直接去结果页
        finishQuiz();
        return;
      }

      // 记录开始时间（首次进入时）
      if (!state.startTime) {
        AppState.startTime = Date.now();
        AppState.save();
      }

      // 渲染当前题目
      this._renderCurrentQuestion();
    },

    /** 离开答题页，保存进度 */
    leave() {
      // 清除计时器
      if (this._questionTimer) {
        clearInterval(this._questionTimer);
        this._questionTimer = null;
      }
      // 自动保存进度
      AppState.save();
    },

    /** 当前题目列表 */
    _questions: [],

    /** 当前题目计时器 */
    _questionTimer: null,

    /** 渲染当前题目（根据题型分发） */
    _renderCurrentQuestion() {
      const state = AppState.getState();
      const idx = state.currentQuestion;
      const questions = this._questions;
      const question = questions[idx];

      if (!question) {
        // 没有更多题目，完成答题
        finishQuiz();
        return;
      }

      const pageEl = document.getElementById('page-quiz');
      if (!pageEl) return;

      // 计算进度
      const progress = ((idx + 1) / questions.length * 100).toFixed(1);

      // 段落名称（标准版有 segments，快速版只显示题号）
      const segmentName = this._getSegmentName(state, idx, question);

      // 顶部标签（axisTag + domainTag + methodologyRef）
      const metaTags = this._renderMetaTags(question);

      // 根据题型渲染不同内容
      let bodyHtml = '';
      const qType = question.type;

      if (qType === 'binary' || qType === 'quickBinary') {
        bodyHtml = this._renderBinary(question);
      } else if (qType === 'chat') {
        bodyHtml = this._renderChat(question);
      } else if (qType === 'situational') {
        bodyHtml = this._renderSituational(question);
      } else if (qType === 'ifTomorrow') {
        bodyHtml = this._renderIfTomorrow(question);
      } else if (qType === 'sort') {
        bodyHtml = this._renderSort(question);
      } else if (qType === 'selfReflection') {
        bodyHtml = this._renderSelfReflection(question);
      } else if (qType === 'socialDesirability') {
        bodyHtml = this._renderSocialDesirability(question);
      } else {
        // 兜底：按通用选项题型渲染
        bodyHtml = this._renderOptions(question);
      }

      pageEl.innerHTML = `
        <div class="quiz-container">
          <div class="quiz-header">
            <div class="quiz-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
              </div>
            </div>
          </div>
          ${segmentName ? `<div class="quiz-segment-name">${segmentName}</div>` : ''}
          <div class="quiz-body">
            ${metaTags}
            ${bodyHtml}
          </div>
          <div class="quiz-footer">
            <button class="btn-back" id="quiz-back">返回</button>
          </div>
        </div>
      `;

      this._bindQuestionEvents(pageEl, question);
    },

    /**
     * 获取当前段落名称
     * 标准版：从 segments 数组匹配当前题目的 segment 字段
     * 快速版：只显示题号
     * @param {Object} state - 应用状态
     * @param {number} idx - 当前题目索引
     * @param {Object} question - 当前题目
     * @returns {string} 段落名称或空字符串
     */
    _getSegmentName(state, idx, question) {
      const segments = (state.quizData && state.quizData.segments) || [];
      if (segments.length === 0) return '';

      // 如果题目有 segment 字段，直接匹配
      if (question.segment) {
        const segInfo = SEGMENT_MAP[question.segment];
        return segInfo ? segInfo.name : '';
      }

      // 根据索引从 segments 数组中查找
      for (const seg of segments) {
        if (idx >= (seg.startIndex || 0) && idx < (seg.endIndex || Infinity)) {
          return seg.name || '';
        }
      }

      return '';
    },

    /**
     * 渲染题目元数据标签
     * 显示 axisTag、domainTag、methodologyRef
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderMetaTags(question) {
      const tags = [];
      if (question.axisTag) {
        const axisInfo = AXES_MAP[question.axisTag];
        tags.push(`<span class="meta-tag meta-tag--axis">${axisInfo ? axisInfo.icon + ' ' : ''}${question.axisTag}</span>`);
      }
      if (question.domainTag) {
        tags.push(`<span class="meta-tag meta-tag--domain">${question.domainTag}</span>`);
      }
      if (question.methodologyRef) {
        tags.push(`<span class="meta-tag meta-tag--method">${question.methodologyRef}</span>`);
      }
      if (tags.length === 0) return '';
      return `<div class="question-meta-tags">${tags.join('')}</div>`;
    },

    /**
     * 渲染二选一/极速二选一（左右分卡片）
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderBinary(question) {
      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <h2 class="question-text">${question.text}</h2>
        <div class="binary-container">
          <button class="binary-btn binary-btn--left" data-selected="left">
            <span class="binary-text">${question.leftText || '左'}</span>
          </button>
          <div class="binary-vs">VS</div>
          <button class="binary-btn binary-btn--right" data-selected="right">
            <span class="binary-text">${question.rightText || '右'}</span>
          </button>
        </div>
      `;
    },

    /**
     * 渲染聊天记录场景
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderChat(question) {
      let chatHtml = '';
      const ctx = question.chatContext;
      if (Array.isArray(ctx)) {
        chatHtml = ctx.map(msg => {
          const roleClass = msg.role === 'self' ? 'chat-bubble--self' : 'chat-bubble--other';
          return `<div class="chat-bubble ${roleClass}">${msg.text}</div>`;
        }).join('');
      } else if (typeof ctx === 'string' && ctx) {
        chatHtml = `<div class="chat-bubble chat-bubble--other">${ctx}</div>`;
      }

      const optionsHtml = (question.options || []).map(opt => `
        <button class="option-btn option-btn--chat" data-selected="${opt.value || opt.id}">
          <span class="option-emoji">${opt.emoji || ''}</span>
          <span class="option-text">${opt.text}</span>
        </button>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <div class="chat-context">
          ${chatHtml}
        </div>
        <div class="options-list">
          ${optionsHtml}
        </div>
      `;
    },

    /**
     * 渲染情境卡
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderSituational(question) {
      const sceneHtml = `
        <div class="scene-card">
          <h3 class="scene-title">${question.sceneTitle || ''}</h3>
        </div>
      `;

      const optionsHtml = (question.options || []).map(opt => `
        <button class="option-btn" data-selected="${opt.value || opt.id}">
          <span class="option-emoji">${opt.emoji || ''}</span>
          <span class="option-text">${opt.text}</span>
        </button>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        ${sceneHtml}
        <h2 class="question-text">${question.text}</h2>
        <div class="options-list">
          ${optionsHtml}
        </div>
      `;
    },

    /**
     * 渲染"如果明天"
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderIfTomorrow(question) {
      const optionsHtml = (question.options || []).map(opt => `
        <button class="option-btn" data-selected="${opt.value || opt.id}">
          <span class="option-emoji">${opt.emoji || ''}</span>
          <span class="option-text">${opt.text}</span>
        </button>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <h2 class="question-text">${question.text}</h2>
        <div class="options-list">
          ${optionsHtml}
        </div>
      `;
    },

    /**
     * 渲染排序题（上下箭头按钮调整顺序）
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderSort(question) {
      const items = (question.items || []).map((item, i) => `
        <div class="sort-card" data-item-id="${item.value || item.id}" data-index="${i}">
          <div class="handle">
            <div class="handle-bar"></div>
            <div class="handle-bar"></div>
            <div class="handle-bar"></div>
          </div>
          <span class="emoji">${item.emoji || ''}</span>
          <span class="text">${item.text}</span>
          <div class="arrows">
            <button class="sort-arrow-btn" data-dir="up" data-item-id="${item.value || item.id}" title="上移">&#9650;</button>
            <button class="sort-arrow-btn" data-dir="down" data-item-id="${item.value || item.id}" title="下移">&#9660;</button>
          </div>
        </div>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <h2 class="question-text">${question.text}</h2>
        ${question.subtitle ? `<p class="sort-subtitle">${question.subtitle}</p>` : ''}
        <div class="question-sort" id="sort-list">
          ${items}
        </div>
        <button class="sort-confirm" id="btn-confirm-sort">确认排序</button>
      `;
    },

    /**
     * 渲染自我反思题（滑块 1-7）
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderSelfReflection(question) {
      const meta = (question.meta && question.meta.slider) ? question.meta : {};
      const min = meta.min || 1;
      const max = meta.max || 7;
      const labels = meta.labels || [];
      const description = meta.description || '';

      const stepsHtml = labels.map((label, i) => {
        const val = min + i;
        return `<div class="slider-step" data-value="${val}"><span class="slider-step-dot"></span><span class="slider-step-label">${label}</span></div>`;
      }).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <h2 class="question-text">${question.text}</h2>
        ${description ? `<p class="question-subtitle">${description}</p>` : ''}
        <div class="slider-container" id="slider-container">
          <div class="slider-track">
            <div class="slider-fill" id="slider-fill"></div>
            <div class="slider-thumb" id="slider-thumb" data-value="${min}"></div>
          </div>
          <div class="slider-steps">
            ${stepsHtml}
          </div>
        </div>
        <button class="sort-confirm" id="btn-confirm-slider">确认</button>
      `;
    },

    /**
     * 渲染效度检验题（社会期望）
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderSocialDesirability(question) {
      const statement = (question.meta && question.meta.statement) || question.text || '';
      const btns = [
        { value: 'stronglyAgree', label: '非常同意' },
        { value: 'agree', label: '同意' },
        { value: 'disagree', label: '不同意' },
        { value: 'stronglyDisagree', label: '非常不同意' },
      ];
      const btnsHtml = btns.map(b => `
        <button class="option-btn option-btn--scale" data-selected="${b.value}">${b.label}</button>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <p class="question-statement">${statement}</p>
        <div class="options-list options-list--scale">
          ${btnsHtml}
        </div>
      `;
    },

    /**
     * 兜底：通用选项题型渲染
     * @param {Object} question - 题目对象
     * @returns {string} HTML
     */
    _renderOptions(question) {
      const optionsHtml = (question.options || []).map(opt => `
        <button class="option-btn" data-selected="${opt.value || opt.id}">
          <span class="option-emoji">${opt.emoji || ''}</span>
          <span class="option-text">${opt.text}</span>
        </button>
      `).join('');

      return `
        <div class="question-type-badge">${this._getTypeLabel(question.type)}</div>
        <h2 class="question-text">${question.text}</h2>
        ${question.subtitle ? `<p class="question-subtitle">${question.subtitle}</p>` : ''}
        <div class="options-list">
          ${optionsHtml}
        </div>
      `;
    },

    /**
     * 绑定题目交互事件
     * @param {HTMLElement} el - 页面元素
     * @param {Object} question - 当前题目对象
     */
    _bindQuestionEvents(el, question) {
      // 返回按钮
      const backBtn = el.querySelector('#quiz-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          Router.navigate('/');
        });
      }

      const qType = question.type;

      // ── 二选一/极速二选一 ──
      if (qType === 'binary' || qType === 'quickBinary') {
        el.querySelectorAll('.binary-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const selectedId = btn.getAttribute('data-selected');
            submitAnswer(question.id, selectedId);
          });
        });
        return;
      }

      // ── 排序题 ──
      if (qType === 'sort') {
        const sortList = el.querySelector('#sort-list');
        if (sortList) {
          // 上移按钮
          sortList.querySelectorAll('.sort-arrow-btn[data-dir="up"]').forEach(btn => {
            btn.addEventListener('click', () => {
              this._moveSortItem(sortList, btn.getAttribute('data-item-id'), 'up');
            });
          });
          // 下移按钮
          sortList.querySelectorAll('.sort-arrow-btn[data-dir="down"]').forEach(btn => {
            btn.addEventListener('click', () => {
              this._moveSortItem(sortList, btn.getAttribute('data-item-id'), 'down');
            });
          });

          // ── 拖拽排序 ──
          this._initSortDrag(sortList);
        }
        // 确认排序按钮
        const confirmBtn = el.querySelector('#btn-confirm-sort');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', () => {
            const order = this._getSortOrder(sortList);
            submitAnswer(question.id, order);
          });
        }
        return;
      }

      // ── 自我反思滑块题 ──
      if (qType === 'selfReflection') {
        this._bindSlider(el, question);
        return;
      }

      // ── 通用选项点击（chat / situational / ifTomorrow / socialDesirability / 其他） ──
      el.querySelectorAll('.option-btn[data-selected]').forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedId = btn.getAttribute('data-selected');
          submitAnswer(question.id, selectedId);
        });
      });
    },

    /**
     * 移动排序项
     * @param {HTMLElement} sortList - 排序列表容器
     * @param {string} itemId - 项目 ID
     * @param {string} direction - 'up' | 'down'
     */
    _moveSortItem(sortList, itemId, direction) {
      const items = Array.from(sortList.querySelectorAll('.sort-card'));
      const idx = items.findIndex(item => item.getAttribute('data-item-id') === itemId);
      if (idx < 0) return;

      if (direction === 'up' && idx > 0) {
        sortList.insertBefore(items[idx], items[idx - 1]);
      } else if (direction === 'down' && idx < items.length - 1) {
        sortList.insertBefore(items[idx + 1], items[idx]);
      }
    },

    /**
     * 获取排序后的顺序字符串
     * @param {HTMLElement} sortList - 排序列表容器
     * @returns {string} 排序后的 item id 用逗号拼接，如 'A,C,B,D'
     */
    _getSortOrder(sortList) {
      const items = sortList.querySelectorAll('.sort-card');
      return Array.from(items).map(item => item.getAttribute('data-item-id')).join(',');
    },

    /**
     * 初始化排序拖拽（触控 + 鼠标）
     * @param {HTMLElement} sortList - 排序列表容器
     */
    _initSortDrag(sortList) {
      const cards = sortList.querySelectorAll('.sort-card');
      if (cards.length === 0) return;

      let dragEl = null;
      let placeholder = null;
      let startY = 0;
      let dragOffsetY = 0;

      function createPlaceholder(el) {
        const ph = document.createElement('div');
        ph.className = 'sort-card sort-card--placeholder';
        ph.style.height = el.offsetHeight + 'px';
        ph.style.marginBottom = getComputedStyle(el).marginBottom;
        return ph;
      }

      function getY(e) {
        return e.touches ? e.touches[0].clientY : e.clientY;
      }

      function onStart(e) {
        const card = e.target.closest('.sort-card');
        if (!card || e.target.closest('.sort-arrow-btn') || e.target.closest('.arrows')) return;

        dragEl = card;
        startY = getY(e);
        const rect = card.getBoundingClientRect();
        dragOffsetY = startY - rect.top;

        card.classList.add('sort-card--dragging');
        placeholder = createPlaceholder(card);
        card.parentNode.insertBefore(placeholder, card);
        document.body.appendChild(card);
        card.style.position = 'fixed';
        card.style.width = rect.width + 'px';
        card.style.left = rect.left + 'px';
        card.style.top = (startY - dragOffsetY) + 'px';
        card.style.zIndex = '9999';
        card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
        card.style.transition = 'none';
        card.style.opacity = '0.92';

        e.preventDefault();
      }

      function onMove(e) {
        if (!dragEl) return;
        const y = getY(e);
        dragEl.style.top = (y - dragOffsetY) + 'px';

        const siblings = Array.from(sortList.querySelectorAll('.sort-card:not(.sort-card--dragging)'));
        let insertBefore = null;
        for (const sibling of siblings) {
          const rect = sibling.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (y < midY) {
            insertBefore = sibling;
            break;
          }
        }

        if (insertBefore) {
          sortList.insertBefore(placeholder, insertBefore);
        } else {
          sortList.appendChild(placeholder);
        }

        e.preventDefault();
      }

      function onEnd() {
        if (!dragEl) return;

        dragEl.style.position = '';
        dragEl.style.width = '';
        dragEl.style.left = '';
        dragEl.style.top = '';
        dragEl.style.zIndex = '';
        dragEl.style.boxShadow = '';
        dragEl.style.transition = '';
        dragEl.style.opacity = '';
        dragEl.classList.remove('sort-card--dragging');

        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(dragEl, placeholder);
          placeholder.remove();
        }

        dragEl = null;
        placeholder = null;
      }

      sortList.addEventListener('touchstart', onStart, { passive: false });
      sortList.addEventListener('touchmove', onMove, { passive: false });
      sortList.addEventListener('touchend', onEnd);
      sortList.addEventListener('touchcancel', onEnd);
      sortList.addEventListener('mousedown', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    },

    /**
     * 绑定滑块交互（触控 + 鼠标）
     * @param {HTMLElement} el - 页面容器
     * @param {Object} question - 题目对象
     */
    _bindSlider(el, question) {
      const container = el.querySelector('#slider-container');
      if (!container) return;

      const track = container.querySelector('.slider-track');
      const fill = container.querySelector('#slider-fill');
      const thumb = container.querySelector('#slider-thumb');
      const confirmBtn = el.querySelector('#btn-confirm-slider');

      const meta = (question.meta && question.meta.slider) ? question.meta : {};
      const min = meta.min || 1;
      const max = meta.max || 7;
      const totalSteps = max - min;

      let currentVal = min;

      function updateSlider(val) {
        val = Math.max(min, Math.min(max, Math.round(val)));
        currentVal = val;
        const pct = ((val - min) / totalSteps) * 100;
        fill.style.width = pct + '%';
        thumb.style.left = pct + '%';
        thumb.setAttribute('data-value', val);

        container.querySelectorAll('.slider-step').forEach(step => {
          const sv = parseInt(step.getAttribute('data-value'));
          step.classList.toggle('active', sv === val);
        });
      }

      function getValueFromEvent(e) {
        const rect = track.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        return min + Math.round(pct * totalSteps);
      }

      function onTrackClick(e) {
        if (e.target.closest('.slider-thumb')) return;
        updateSlider(getValueFromEvent(e));
      }

      let dragging = false;
      function onThumbStart(e) {
        dragging = true;
        e.preventDefault();
        e.stopPropagation();
      }
      function onThumbMove(e) {
        if (!dragging) return;
        updateSlider(getValueFromEvent(e));
        e.preventDefault();
      }
      function onThumbEnd() { dragging = false; }

      track.addEventListener('click', onTrackClick);
      thumb.addEventListener('touchstart', onThumbStart, { passive: false });
      thumb.addEventListener('mousedown', onThumbStart);
      document.addEventListener('touchmove', onThumbMove, { passive: false });
      document.addEventListener('mousemove', onThumbMove);
      document.addEventListener('touchend', onThumbEnd);
      document.addEventListener('mouseup', onThumbEnd);

      container.querySelectorAll('.slider-step').forEach(step => {
        step.addEventListener('click', () => {
          updateSlider(parseInt(step.getAttribute('data-value')));
        });
      });

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          submitAnswer(question.id, String(currentVal));
        });
      }

      updateSlider(min);
    },

    /**
     * 获取题型中文名称
     * @param {string} type - 题型标识
     * @returns {string} 中文名称
     */
    _getTypeLabel(type) {
      // 优先从 TYPE_MAP 查找
      if (TYPE_MAP[type]) {
        return `${TYPE_MAP[type].icon} ${TYPE_MAP[type].name}`;
      }
      const labels = {
        choice: '单选',
        scale: '量表',
        scenario: '情境分析',
        pairwise: '两难对比',
        ranking: '排序',
        binary: '二选一',
        timed: '限时反应',
        situational: '情境判断',
        reflection: '反思觉察',
        selfReflection: '自我反思',
      };
      return labels[type] || type;
    },
  },

  /* ── 生成报告页（加载过渡） ── */
  generating: {
    /** 进入生成报告页 */
    enter(data) {
      const pageEl = document.getElementById('page-generating');
      if (!pageEl) return;

      pageEl.innerHTML = `
        <div class="generating-container">
          <div class="generating-animation">
            <div class="pulse-ring"></div>
            <div class="pulse-ring delay-1"></div>
            <div class="pulse-ring delay-2"></div>
          </div>
          <h2 class="generating-title">正在生成你的澄明力报告</h2>
          <p class="generating-desc">分析三维数据、计算认知遮蔽、匹配画像模型...</p>
          <div class="generating-steps">
            <div class="step active" data-step="1">计算三轴分数</div>
            <div class="step" data-step="2">匹配澄明画像</div>
            <div class="step" data-step="3">检测认知遮蔽</div>
            <div class="step" data-step="4">生成报告</div>
          </div>
        </div>
      `;

      // 模拟生成过程（带动画）
      this._simulateGeneration(pageEl);
    },

    /** 离开生成页 */
    leave() {
      // 无需特殊清理
    },

    /**
     * 模拟报告生成过程
     * 实际计算是即时的，此处添加视觉效果提升体验
     * @param {HTMLElement} el - 页面元素
     */
    _simulateGeneration(el) {
      const steps = el.querySelectorAll('.step');
      const delays = [600, 1200, 1800, 2400]; // 每步延迟

      steps.forEach((step, i) => {
        setTimeout(() => {
          // 激活当前步骤
          step.classList.add('active');

          // 所有步骤完成后跳转到报告页
          if (i === steps.length - 1) {
            setTimeout(() => {
              Router.navigate('/report');
            }, 600);
          }
        }, delays[i]);
      });
    },
  },

  /* ── 报告页（标准版11区块 / 快速版8区块） ── */
  report: {
    /**
     * 进入报告页
     * @param {Object} data - 可包含 results 数据
     */
    enter(data) {
      const state = AppState.getState();

      // 三级 fallback：传入数据 → 内存 → localStorage
      if (!state.results) {
        showToast('没有评测结果', 'error');
        Router.navigate('/');
        return;
      }

      const pageEl = document.getElementById('page-report');
      if (pageEl) {
        pageEl.innerHTML = this._render(state.results);

        // 绘制雷达图（Canvas 异步绘制）
        this._drawRadars(state.results);

        // 绑定按钮事件
        this._bindEvents(pageEl);

        // 分数数字动画
        this._animateScores(pageEl);
      }
    },

    /** 离开报告页 */
    leave() {
      // 无需特殊清理
    },

    /**
     * 渲染报告页面 HTML（标准版 / 快速版 双模式）
     * @param {Object} results - CJIScorer 计算结果
     * @returns {string} HTML
     */
    _render(results) {
      const isFast = results.mode === 'fast' || results.mode === 'quick';
      const axes = results.threeAxes || {};
      const portrait = ReportData.PORTRAIT_DATA[results.portrait] || {};
      const oneLiner = ReportData.PORTRAIT_ONE_LINER[results.portrait] || '';
      const shadow = results.shadow || {};
      const fiveIdx = results.fiveIndices || {};

      /** 根据三轴分数获取等级文案 */
      function getAxisText(axisKey, score) {
        const axisData = ReportData.AXIS_DATA[axisKey];
        if (!axisData) return '';
        const level = axisData.levels.find(l => score <= l.max);
        return level ? level.text : '';
      }

      /** 根据五指数分数获取分档文案 */
      function getIndexText(idxKey, score) {
        const idxData = ReportData.INDEX_DATA[idxKey];
        if (!idxData) return { label: '', text: '' };
        const level = idxData.levels.find(l => score <= l.max);
        return level ? { label: level.label, text: level.text } : { label: '', text: '' };
      }

      /** 根据五指数高低组合，获取位置卡片文案 */
      function getPositionText(cardKey) {
        const posData = ReportData.POSITION_DATA[cardKey];
        if (!posData) return { title: '', text: '' };
        let modeKey = 'lowLow'; // 默认模式
        if (cardKey === 'world') {
          modeKey = fiveIdx.utilizeSociety >= 50 ? 'highLow' : (fiveIdx.beatenBySociety >= 50 ? 'lowHigh' : 'lowLow');
          if (fiveIdx.utilizeSociety >= 50 && fiveIdx.beatenBySociety >= 50) modeKey = 'highHigh';
        } else if (cardKey === 'ai') {
          modeKey = fiveIdx.aiUtilization >= 50 ? 'highLow' : (fiveIdx.aiRisk >= 50 ? 'lowHigh' : 'lowLow');
          if (fiveIdx.aiUtilization >= 50 && fiveIdx.aiRisk >= 50) modeKey = 'highHigh';
        } else if (cardKey === 'choice') {
          modeKey = fiveIdx.sixStep >= 50 ? 'highLow' : 'lowLow';
          if (fiveIdx.sixStep >= 50 && fiveIdx.aiUtilization >= 50) modeKey = 'highHigh';
        }
        return { title: posData.title, text: posData.modes[modeKey] || '' };
      }

      // 快速版走独立渲染
      if (isFast) {
        return this._renderFast(results, axes, portrait, oneLiner, shadow, getAxisText);
      }

      // ── 标准版 11 区块 ──
      const lightParagraphs = (portrait.light || '').split('\n\n').filter(p => p.trim());
      const mountainParagraphs = (portrait.mountain || '').split('\n\n').filter(p => p.trim());

      // 交叉判定引导文案（根据诊断数量选择）
      const crossCountTotal = results.deepDiag ? results.deepDiag.length : 0;
      let crossIntro = '';
      if (crossCountTotal === 1) crossIntro = ReportData.CROSS_INTRO_TEXT.one;
      else if (crossCountTotal === 2) crossIntro = ReportData.CROSS_INTRO_TEXT.two;
      else if (crossCountTotal === 3) crossIntro = ReportData.CROSS_INTRO_TEXT.three;
      else if (crossCountTotal > 3) crossIntro = ReportData.CROSS_INTRO_TEXT.many;

      return `
        <div class="report-container">
          <!-- 1. 标题 + TOO_FAST + SE警告 -->
          <div class="report-header">
            <h1 class="report-title">澄明力报告</h1>
            ${results.tooFast && results.tooFast.flagged ? `<div class="report-too-fast">⚡ 作答速度过快（${results.tooFast.elapsedSec}秒），结果可能不够准确</div>` : ''}
            ${axes.seWarning ? `<div class="report-se-warning">部分回答可能受到社会期望影响，分数已自动调整</div>` : ''}
          </div>

          <!-- 2. 雷达图 -->
          <div class="report-radar">
            <canvas id="radar-canvas" width="600" height="600" style="width:300px;height:300px;margin:0 auto;display:block;"></canvas>
          </div>

          <!-- 3. 你的光 -->
          <div class="report-section report-section--light">
            <div class="report-section__tag">✨ 你的光</div>
            <div class="report-section__body">
              ${lightParagraphs.map(p => `<p>${p}</p>`).join('')}
            </div>
          </div>

          <!-- 5. 你的山 -->
          <div class="report-section report-section--mountain">
            <div class="report-section__tag">⛰️ 你的山</div>
            <div class="report-section__body">
              ${mountainParagraphs.map(p => `<p>${p}</p>`).join('')}
            </div>
          </div>

          <!-- 6. 得分区：三轴得分条 + 你被测了什么 + 澄明度总分 + 五指数 -->
          <div class="report-section report-section--axes">
            <div class="report-section__tag">📊 三轴分析</div>
            <div class="report-section__body">
              ${['jianCha','chengXing','mingDing'].map(axisKey => {
                const axisInfo = ReportData.AXIS_DATA[axisKey] || {};
                const score = axes[axisKey] || 0;
                const grade = score >= 70 ? 'A' : 'B';
                const activeBlocks = Math.round(score / 10);
                return `
                  <div class="axis-bar-card">
                    <div class="axis-bar-top">
                      <div class="axis-bar-info">
                        <span class="axis-bar-emoji">${axisInfo.emoji || ''}</span>
                        <div class="axis-bar-label">
                          <span class="axis-bar-name">${axisInfo.name || ''}</span>
                          <span class="axis-bar-sub">等级 ${grade}</span>
                        </div>
                      </div>
                      <div class="axis-bar-score">${score}<span class="axis-bar-unit">分</span></div>
                    </div>
                    <div class="axis-bar-blocks">
                      ${Array.from({length: 10}, (_, i) => `<div class="axis-block ${i < activeBlocks ? 'active' : ''}"></div>`).join('')}
                    </div>
                    <div class="axis-bar-text">${getAxisText(axisKey, score)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 澄明度总分 -->
          <div class="report-clarity">
            <span>认知澄明度</span>
            <span class="report-clarity-score">${results.clarityScore || 0}</span>
          </div>

          <!-- 你被测了什么（理论依据） -->
          <div class="report-section report-section--theory">
            <div class="report-section__tag">📚 你被测了什么</div>
            <div class="report-section__body">
              <p>${ReportData.THEORY_DATA.intro}</p>
              ${(ReportData.THEORY_DATA.axes || []).map(a => `
                <div class="theory-axis-card">
                  <strong>${a.emoji} ${a.name} · ${a.subtitle}</strong>
                  <p>测什么：${a.what}</p>
                  <p>理论：${a.theory}</p>
                  <p>举例：${a.example}</p>
                </div>
              `).join('')}
              <p class="theory-closing">${ReportData.THEORY_DATA.closing}</p>
            </div>
          </div>

          <!-- 五指数 -->
          <div class="report-section report-section--indices">
            <div class="report-section__tag">📈 五维指数</div>
            <div class="report-section__body">
              ${['utilizeSociety','beatenBySociety','aiUtilization','aiRisk','sixStep'].map(idxKey => {
                const idxInfo = ReportData.INDEX_DATA[idxKey] || {};
                const score = Math.round(fiveIdx[idxKey] || 0);
                const { label, text } = getIndexText(idxKey, score);
                const isRisk = idxInfo.isRisk;
                const activeBlocks = Math.round(score / 10);
                return `
                  <div class="index-detail-card ${isRisk ? 'index-detail-card--risk' : ''}">
                    <div class="index-detail-card__header">
                      <span>${idxInfo.emoji || ''} ${idxInfo.title || ''}</span>
                      <span class="index-detail-card__score">${score}</span>
                    </div>
                    ${label ? `<div class="index-detail-card__label">${label}</div>` : ''}
                    <div class="axis-bar-blocks">
                      ${Array.from({length: 10}, (_, i) => `<div class="axis-block ${i < activeBlocks ? 'active' : ''}"></div>`).join('')}
                    </div>
                    <div class="index-detail-card__text">${text}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 7. 位置3卡 -->
          <div class="report-section report-section--position">
            <div class="report-section__tag">📍 你的位置</div>
            <div class="report-section__body report-position-grid">
              ${['world','ai','choice'].map(cardKey => {
                const pos = getPositionText(cardKey);
                return `
                  <div class="position-card">
                    <h4>${pos.title}</h4>
                    <p>${pos.text}</p>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 8. 深度洞察：遮蔽雷达 + 主遮蔽 + 交叉发现 -->
          <div class="report-section report-section--shadow">
            <div class="report-section__tag">🌑 认知遮蔽</div>
            <div class="report-section__body">
              <canvas id="shadow-radar-canvas" width="600" height="600" style="width:300px;height:300px;margin:0 auto;display:block;"></canvas>
              ${_renderShadowCards(shadow, ReportData.SHADOW_DATA)}
            </div>
          </div>

          <!-- 交叉发现 -->
          ${results.deepDiag && results.deepDiag.length > 0 ? `
            <div class="report-section report-section--cross">
              <div class="report-section__tag">🔀 交叉发现</div>
              <div class="report-section__body">
                <p class="cross-intro">${crossIntro}</p>
                ${results.deepDiag.map(d => {
                  const diagData = ReportData.DEEP_DIAG_DATA[d.type];
                  const tag = d.tag || diagData?.tag || d.title || d.type;
                  const desc = d.desc || diagData?.desc || d.description || '';
                  return `
                    <div class="cross-card">
                      <strong>${tag}</strong>
                      <p>${desc}</p>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 9. 一致性 -->
          ${results.consistency && results.consistency.checked ? `
            <div class="consistency-note" style="margin-bottom:12px;">
              ${results.consistency.stable ? '✅ 你的作答前后一致，结果可信。' : '⚠️ 前后作答略有偏差，已纳入考量。'}
            </div>
          ` : ''}

          <!-- 10. 48h第一步 -->
          <div class="report-section report-section--action">
            <div class="report-section__tag">🚀 第一步</div>
            <div class="report-section__body">
              <div class="first-step-card">
                <div class="first-step-card__tag">48h 一步</div>
                <p>${portrait.firstStep || ''}</p>
              </div>
            </div>
          </div>

          <!-- 11. CTA + 反馈 -->
          <div class="report-actions">
            <button class="btn btn-primary btn-start-coach">开始 AI 教练训练</button>
            <button class="btn btn-secondary btn-share">分享我的澄明力</button>
            <button class="btn btn-outline btn-retest">重新评测</button>
          </div>
        </div>
      `;
    },

    /**
     * 快速版报告渲染（8区块）
     * @param {Object} results - CJIScorer 计算结果
     * @param {Object} axes - 三轴分数
     * @param {Object} portrait - 画像数据
     * @param {string} oneLiner - 画像一句话
     * @param {Object} shadow - 遮蔽数据
     * @param {Function} getAxisText - 获取轴等级文案
     * @returns {string} HTML
     */
    _renderFast(results, axes, portrait, oneLiner, shadow, getAxisText) {
      const lightText = (portrait.light || '').split('\n\n').filter(p => p.trim()).slice(0, 3).join('\n\n');
      const mountainText = (portrait.mountain || '').split('\n\n').filter(p => p.trim()).slice(0, 3).join('\n\n');
      const fastCross = ReportData.FAST_CROSS_DATA;

      return `
        <div class="report-container report-container--fast">
          <!-- 1. 标题 + TOO_FAST -->
          <div class="report-header">
            <h1 class="report-title">澄明力报告</h1>
            ${results.tooFast && results.tooFast.flagged ? `<div class="report-too-fast">⚡ 作答速度过快（${results.tooFast.elapsedSec}秒），结果可能不够准确</div>` : ''}
          </div>

          <!-- 2. 三轴得分条 -->
          <div class="report-section">
            ${['jianCha','chengXing','mingDing'].map(axisKey => {
              const axisInfo = ReportData.AXIS_DATA[axisKey] || {};
              const score = axes[axisKey] || 0;
              const activeBlocks = Math.round(score / 10);
              return `
                <div class="axis-bar-card">
                  <div class="axis-bar-top">
                    <div class="axis-bar-info">
                      <span class="axis-bar-emoji">${axisInfo.emoji || ''}</span>
                      <div class="axis-bar-label">
                        <span class="axis-bar-name">${axisInfo.name || ''}</span>
                      </div>
                    </div>
                    <div class="axis-bar-score">${score}<span class="axis-bar-unit">分</span></div>
                  </div>
                  <div class="axis-bar-blocks">
                    ${Array.from({length: 10}, (_, i) => `<div class="axis-block ${i < activeBlocks ? 'active' : ''}"></div>`).join('')}
                  </div>
                  <div class="axis-bar-text">${getAxisText(axisKey, score)}</div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- 2. 雷达图 -->
          <div class="report-radar">
            <canvas id="radar-canvas" width="600" height="600" style="width:300px;height:300px;margin:0 auto;display:block;"></canvas>
          </div>

          <!-- 3. 画像名 -->
          <div class="report-portrait">
            <div class="report-portrait__name">${portrait.name || ''}</div>
            <div class="report-portrait__oneliner">${oneLiner}</div>
          </div>

          <!-- 4. 光(前3段) -->
          <div class="report-section report-section--light">
            <div class="report-section__tag">✨ 你的光</div>
            <div class="report-section__body">
              ${lightText.split('\n\n').filter(p=>p.trim()).map(p => `<p>${p}</p>`).join('')}
            </div>
          </div>

          <!-- 5. 一句话提醒(前3段) -->
          <div class="report-section report-section--mountain">
            <div class="report-section__tag">⛰️ 一句话提醒</div>
            <div class="report-section__body">
              ${mountainText.split('\n\n').filter(p=>p.trim()).map(p => `<p>${p}</p>`).join('')}
            </div>
          </div>

          <!-- 6. 交叉判定简版 -->
          ${fastCross && Object.keys(fastCross).length > 0 ? `
            <div class="report-section report-section--cross-fast">
              <div class="report-section__tag">🔀 交叉发现</div>
              <div class="report-section__body">
                ${Object.values(fastCross).map(text => `<p>${text}</p>`).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 7. 遮蔽提示 -->
          ${shadow.mainShadow && shadow.mainShadow !== 'null' ? `
            <div class="report-section report-section--shadow-fast">
              <div class="report-section__tag">🌑 遮蔽提示</div>
              <div class="report-section__body">
                ${_renderShadowCards(shadow, ReportData.SHADOW_DATA)}
              </div>
            </div>
          ` : ''}

          <!-- 8. CTA + 反馈 -->
          <div class="report-actions">
            <button class="btn btn-primary btn-start-standard">开始标准评测</button>
            <button class="btn btn-secondary btn-share">分享</button>
          </div>
        </div>
      `;
    },

    /**
     * 绘制雷达图（三轴 + 遮蔽雷达）
     * @param {Object} results - CJIScorer 计算结果
     */
    _drawRadars(results) {
      const axes = results.threeAxes || {};

      // 三轴雷达图
      const radarCanvas = document.getElementById('radar-canvas');
      if (radarCanvas) {
        setTimeout(() => {
          drawRadar(radarCanvas, {
            jianCha: axes.jianCha || 0,
            chengXing: axes.chengXing || 0,
            mingDing: axes.mingDing || 0,
          });
        }, 300);
      }

      // 标准版才绘制遮蔽雷达
      if (results.mode !== 'fast') {
        const shadowCanvas = document.getElementById('shadow-radar-canvas');
        if (shadowCanvas) {
          setTimeout(() => {
            // 将遮蔽类型转为 0-100 分数（用于雷达图可视化）
            const shadowScores = { lazy: 0, fear: 0, profit: 0, lock: 0, blind: 0 };
            const main = results.shadow?.mainShadow;
            const second = results.shadow?.secondShadow;
            if (main && shadowScores.hasOwnProperty(main)) shadowScores[main] = 80;
            if (second && shadowScores.hasOwnProperty(second)) shadowScores[second] = 55;
            drawShadowRadar(shadowCanvas, shadowScores);
          }, 500);
        }
      }
    },

    /**
     * 绑定报告页按钮事件
     * @param {HTMLElement} el - 页面元素
     */
    _bindEvents(el) {
      // 开始教练训练
      const coachBtn = el.querySelector('.btn-start-coach');
      if (coachBtn) {
        coachBtn.addEventListener('click', () => {
          startCoach();
        });
      }

      // 快速版：开始标准评测
      const standardBtn = el.querySelector('.btn-start-standard');
      if (standardBtn) {
        standardBtn.addEventListener('click', () => {
          initQuiz('standard');
        });
      }

      // 分享
      const shareBtn = el.querySelector('.btn-share');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          Router.navigate('/share');
        });
      }

      // 重新评测
      const retestBtn = el.querySelector('.btn-retest');
      if (retestBtn) {
        retestBtn.addEventListener('click', () => {
          AppState.reset();
          Router.navigate('/');
        });
      }
    },

    /**
     * 分数数字动画（通用）
     * @param {HTMLElement} el - 页面元素
     */
    _animateScores(el) {
      // 所有带 data-target 的分数元素执行数字递增动画
      const scoreEls = el.querySelectorAll('[data-target]');
      scoreEls.forEach(scoreEl => {
        const target = parseInt(scoreEl.getAttribute('data-target'), 10);
        if (!isNaN(target)) {
          animateNumber(scoreEl, target, 1200);
        }
      });
    },
  },

  /* ── AI 教练对话页 ── */
  coach: {
    _apiAvailable: null, // 缓存API可用性
    _isLoading: false,  // 防止重复发送

    /**
     * 进入教练页（三级fallback：AppState → localStorage → 默认数据）
     */
    enter(data) {
      const state = AppState.getState();
      
      // 三级fallback：即使没有results也能进入
      const results = state.results || this._getDefaultResults();
      const portrait = results.portrait || 'BBB';
      const round = state.coachRound || 0;
      const history = state.coachHistory || [];

      const pageEl = document.getElementById('page-coach');
      if (!pageEl) return;

      // 如果教练已完成，直接去总结页
      if (state.coachComplete) {
        Router.navigate('/coach-summary');
        return;
      }

      pageEl.innerHTML = this._render(state, portrait, round);
      this._bindEvents(pageEl, state, results, portrait);

      // 恢复历史消息
      const messagesEl = document.getElementById('coach-messages');
      if (messagesEl && history.length > 0) {
        history.forEach(msg => {
          this._appendMessage(messagesEl, msg.role, msg.text);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (history.length === 0) {
        // 首次进入，发送Round 1开场白（本地生成，不依赖API）
        this._sendLocalOpening(messagesEl, state, portrait, results);
      }
    },

    /** 离开教练页，保存对话进度 */
    leave() {
      AppState.save();
    },

    /** 三级fallback默认数据 */
    _getDefaultResults() {
      return { portrait: 'BBB', deepDiag: [], driveShadowAlignment: { isAligned: false }, threeAxes: { jianCha: 50, chengXing: 50, mingDing: 50 } };
    },

    /**
     * 渲染教练对话页
     */
    _render(state, portrait, round) {
      return `
        <div class="coach-container">
          <!-- 顶部栏 -->
          <div class="coach-topbar">
            <button class="btn-back" id="coach-back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
              返回
            </button>
            <div class="coach-topbar__center">
              <span class="coach-topbar__title">快速训练 · 澄明</span>
              <span class="coach-topbar__demo">Demo</span>
            </div>
            <span class="coach-topbar__round">第 ${Math.min(round + 1, 6)} / 6 轮</span>
          </div>

          <!-- 聊天消息区 -->
          <div class="coach-messages" id="coach-messages">
            <!-- 消息气泡在这里动态渲染 -->
          </div>

          <!-- 底部输入区 -->
          <div class="coach-input-area">
            <textarea
              class="coach-input"
              id="coach-input"
              placeholder="输入你的思考..."
              rows="2"
            ></textarea>
            <button class="btn btn-primary coach-send-btn" id="btn-send-reply" ${this._isLoading ? 'disabled' : ''}>
              ${this._isLoading ? '思考中...' : '发送'}
            </button>
          </div>

          <!-- 退出确认弹窗（默认隐藏） -->
          <div class="coach-exit-modal" id="coach-exit-modal">
            <div class="coach-exit-modal__overlay"></div>
            <div class="coach-exit-modal__content">
              <h3>确定退出训练？</h3>
              <p>当前进度已保存，下次可以继续。</p>
              <div class="coach-exit-modal__actions">
                <button class="btn btn-secondary" id="btn-exit-cancel">继续训练</button>
                <button class="btn btn-primary" id="btn-exit-confirm">退出</button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    /** 绑定教练页事件 */
    _bindEvents(el, state, results, portrait) {
      const self = this;
      const sendBtn = el.querySelector('#btn-send-reply');
      const input = el.querySelector('#coach-input');
      const backBtn = el.querySelector('#coach-back');
      const exitModal = el.querySelector('#coach-exit-modal');
      const exitCancel = el.querySelector('#btn-exit-cancel');
      const exitConfirm = el.querySelector('#btn-exit-confirm');

      // 发送消息
      const handleSend = () => {
        if (self._isLoading) return;
        const text = (input && input.value.trim()) || '';
        if (!text) return;
        input.value = '';
        self._handleUserReply(text, state, results, portrait);
      };

      if (sendBtn) sendBtn.addEventListener('click', handleSend);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        });
      }

      // 返回按钮 → 显示退出弹窗
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          if (exitModal) exitModal.classList.add('active');
        });
      }

      // 退出弹窗操作
      if (exitCancel) {
        exitCancel.addEventListener('click', () => {
          exitModal.classList.remove('active');
        });
      }
      if (exitConfirm) {
        exitConfirm.addEventListener('click', () => {
          exitModal.classList.remove('active');
          Router.navigate('/');
        });
      }
      if (exitModal) {
        const overlay = exitModal.querySelector('.coach-exit-modal__overlay');
        if (overlay) overlay.addEventListener('click', () => exitModal.classList.remove('active'));
      }
    },

    /**
     * 发送本地开场白（Round 1，不依赖API）
     */
    _sendLocalOpening(messagesEl, state, portrait, results) {
      const opening = CoachConfig.getOpeningByPortrait(portrait);
      
      // 先显示期望管理文案
      const expectEl = document.createElement('div');
      expectEl.className = 'message message-coach message-system';
      expectEl.innerHTML = `<div class="message-bubble">${CoachConfig.EXPECTATION_TEXT}</div>`;
      messagesEl.appendChild(expectEl);
      
      // 延迟显示开场白
      setTimeout(() => {
        this._appendMessage(messagesEl, 'coach', opening);
        
        // 保存到历史
        AppState.coachHistory.push({ role: 'coach', text: CoachConfig.EXPECTATION_TEXT, round: 1 });
        AppState.coachHistory.push({ role: 'coach', text: opening, round: 1 });
        AppState.save();
      }, 600);
    },

    /**
     * 处理用户回复（核心逻辑）
     */
    async _handleUserReply(text, state, results, portrait) {
      this._isLoading = true;
      this._updateSendBtn(true);

      const messagesEl = document.getElementById('coach-messages');
      if (!messagesEl) return;

      // 添加用户消息气泡
      this._appendMessage(messagesEl, 'user', text);
      AppState.coachHistory.push({ role: 'user', text, round: AppState.coachRound + 1 });

      // 推进轮次
      AppState.coachRound += 1;
      const currentRound = AppState.coachRound; // 现在是1-based（1-6）
      AppState.save();

      // 检查是否完成6轮
      if (currentRound > 6) {
        this._finishTraining();
        return;
      }

      // 显示打字指示器
      const typingEl = this._showTypingIndicator(messagesEl);

      try {
        // 尝试调用后端API（wenxin-text-generation）
        let reply = await this._callBackendAPI(text, state, results, currentRound, portrait);
        
        // 检查是否需要注入条件追问
        const conditional = CoachConfig.getConditionalPrompt(results, currentRound);
        
        if (reply) {
          // API返回了结果
          this._removeTypingIndicator(typingEl);
          this._appendMessage(messagesEl, 'coach', reply);
          AppState.coachHistory.push({ role: 'coach', text: reply, round: currentRound });
          
          // 如果有条件追问且当前轮次匹配，在下一轮或稍后注入
          if (conditional) {
            // 条件追问作为教练的追加消息
            setTimeout(() => {
              this._appendMessage(messagesEl, 'coach', conditional);
              AppState.coachHistory.push({ role: 'coach', text: conditional, round: currentRound, isConditional: true });
              AppState.save();
            }, 1500);
          }
        } else {
          // API不可用，使用本地fallback
          this._removeTypingIndicator(typingEl);
          const fallback = CoachConfig.getFallbackReply(currentRound, portrait);
          this._appendMessage(messagesEl, 'coach', fallback);
          AppState.coachHistory.push({ role: 'coach', text: fallback, round: currentRound });
          
          // fallback模式下也检查条件追问
          if (conditional) {
            setTimeout(() => {
              this._appendMessage(messagesEl, 'coach', conditional);
              AppState.coachHistory.push({ role: 'coach', text: conditional, round: currentRound, isConditional: true });
              AppState.save();
            }, 1500);
          }
        }
      } catch (e) {
        // 任何错误都fallback到本地
        this._removeTypingIndicator(typingEl);
        const fallback = CoachConfig.getFallbackReply(currentRound, portrait);
        this._appendMessage(messagesEl, 'coach', fallback);
        AppState.coachHistory.push({ role: 'coach', text: fallback, round: currentRound });
        console.warn('[coach] API调用失败，使用本地fallback:', e);
      }

      AppState.save();
      this._isLoading = false;
      this._updateSendBtn(false);
      
      // 如果是第6轮且已收到回复，延迟结束训练
      if (currentRound >= 6) {
        // 添加飞轮提醒
        setTimeout(() => {
          this._appendMessage(messagesEl, 'coach', CoachConfig.PERSISTENCE_TEXT);
          AppState.coachHistory.push({ role: 'coach', text: CoachConfig.PERSISTENCE_TEXT, round: 6, isClosing: true });
          AppState.save();
          
          // 再延迟跳转总结页
          setTimeout(() => this._finishTraining(), 2000);
        }, 2000);
      }
    },

    /**
     * 调用后端API（本地 Node.js 代理 → 豆包大模型）
     * 返回教练回复文本，如果不可用返回null
     */
    async _callBackendAPI(userText, state, results, round, portrait) {
      // 构建对话历史（最近几轮）
      const history = (AppState.coachHistory || []).slice(-10).map(m => ({
        role: m.role === 'coach' ? 'assistant' : 'user',
        content: m.text,
      }));

      // 添加当前用户消息
      history.push({ role: 'user', content: userText });

      // 构建system消息（结合画像信息）
      const axes = (results && results.threeAxes) || { jianCha: 50, chengXing: 50, mingDing: 50 };
      const portraitName = (ReportData.PORTRAIT_DATA[portrait] || {}).name || '';
      const systemContent = CoachConfig.SYSTEM_PROMPT
        + `\n\n## 当前用户画像：${portrait}（${portraitName}）`
        + `\n## 三轴分数：见察${axes.jianCha}、澄省${axes.chengXing}、明定${axes.mingDing}`
        + `\n## 当前轮次：第${round}轮（共6轮）`;

      const messages = [{ role: 'system', content: systemContent }, ...history];

      try {
        // API 地址：支持环境变量或自定义配置
        // 在 package.json 中配置 COACH_API_BASE，或使用独立部署的后端地址
        // 默认使用本地 server.js（端口 3001）
        const apiBase = (window.__COACH_API_BASE__) || '';
        if (!apiBase) {
          // 没有配置 API 地址，直接使用 fallback
          return null;
        }
        const response = await fetch(`${apiBase}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature: 0.7, max_tokens: 300 }),
        });

        if (!response.ok) {
          console.warn('[coach] 后端返回错误:', response.status);
          return null;
        }

        const data = await response.json();

        // API Key 未配置时返回 fallback 标记
        if (data.fallback) {
          console.warn('[coach] 后端提示:', data.message);
          return null;
        }

        // 解析返回结果（OpenAI 兼容格式）
        if (data.choices && data.choices[0]) {
          let reply = data.choices[0].message?.content || '';
          reply = this._cleanReply(reply);
          if (reply.length > 0) return reply;
        }
        return null;
      } catch (e) {
        console.warn('[coach] 后端连接失败:', e.message);
        return null;
      }
    },

    /** 清理AI回复（过滤学术词、过长内容等） */
    _cleanReply(text) {
      const academicWords = ['约束映射', '遮蔽剥离', '最小验证', '稳态自锁', '差序格局', '退出代价'];
      let cleaned = text;
      academicWords.forEach(w => { cleaned = cleaned.replace(new RegExp(w, 'g'), ''); });
      // 截取前3句话
      const sentences = cleaned.split(/[。！？]/).filter(s => s.trim());
      cleaned = sentences.slice(0, 3).join('。').trim();
      if (!cleaned.endsWith('。') && !cleaned.endsWith('！') && !cleaned.endsWith('？')) {
        cleaned += '。';
      }
      return cleaned;
    },

    /** 完成训练，跳转总结页 */
    _finishTraining() {
      AppState.coachComplete = true;
      AppState.save();
      Router.navigate('/coach-summary');
    },

    /* ── UI辅助方法 ── */

    _appendMessage(container, role, text) {
      const msgEl = document.createElement('div');
      msgEl.className = `message message-${role}`;
      
      if (role === 'coach') {
        msgEl.innerHTML = `
          <div class="message-avatar"><img src="assets/avatar.jpg" alt="澄明" /></div>
          <div class="message-content">
            <div class="message-bubble">${this._formatText(text)}</div>
          </div>
        `;
      } else {
        msgEl.innerHTML = `
          <div class="message-content">
            <div class="message-bubble">${this._formatText(text)}</div>
          </div>
        `;
      }
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    },

    /** 格式化文本：换行符转<br> */
    _formatText(text) {
      return text.replace(/\n/g, '<br>');
    },

    _showTypingIndicator(container) {
      const el = document.createElement('div');
      el.className = 'message message-coach typing-indicator';
      el.innerHTML = `
        <div class="message-avatar"><img src="assets/avatar.jpg" alt="澄明" /></div>
        <div class="message-content">
          <div class="message-bubble">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      `;
      container.appendChild(el);
      container.scrollTop = container.scrollHeight;
      return el;
    },

    _removeTypingIndicator(el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },

    _updateSendBtn(disabled) {
      const btn = document.getElementById('btn-send-reply');
      if (btn) {
        btn.disabled = disabled;
        btn.textContent = disabled ? '思考中...' : '发送';
      }
    },
  },

  /* ── 教练训练总结页 ── */
  'coach-summary': {
    enter(data) {
      const state = AppState.getState();
      const results = state.results || { portrait: 'BBB', threeAxes: { jianCha: 50, chengXing: 50, mingDing: 50 } };
      const portrait = results.portrait || 'BBB';

      // 三级fallback：不跳回首页
      if (!state.coachComplete && (!state.coachHistory || state.coachHistory.length === 0)) {
        // 没有完成也没有历史，不跳回首页，显示提示
      }

      const pageEl = document.getElementById('page-coach-summary');
      if (!pageEl) return;

      pageEl.innerHTML = this._render(state, results, portrait);
      this._bindEvents(pageEl);
    },

    leave() {},

    _render(state, results, portrait) {
      const portraitData = ReportData.PORTRAIT_DATA[portrait] || {};
      const oneLiner = ReportData.PORTRAIT_ONE_LINER[portrait] || '';
      const axes = results.threeAxes || {};
      const history = state.coachHistory || [];

      // 提取用户输入的话题（第一条用户消息）
      const firstUserMsg = history.find(m => m.role === 'user');
      const topic = firstUserMsg ? firstUserMsg.text : '（未选择话题）';

      // 生成认知锚点（从最后一条教练消息提取关键信息）
      const lastCoachMsgs = history.filter(m => m.role === 'coach' && !m.isConditional && !m.isClosing);
      const lastInsight = lastCoachMsgs.length > 0 ? lastCoachMsgs[lastCoachMsgs.length - 1].text : '';

      return `
        <div class="coach-summary-container">
          <h2 class="summary-title">训练完成</h2>
          
          <!-- 认知锚点 -->
          <div class="summary-anchor">
            <div class="summary-anchor__tag">你的认知锚点</div>
            <p class="summary-anchor__text">${lastInsight || '通过这次训练，你开始觉察自己看世界的方式。'}</p>
          </div>

          <!-- 话题 -->
          <div class="summary-topic">
            <div class="summary-topic__tag">训练话题</div>
            <p>${topic}</p>
          </div>

          <!-- 三轴发现 -->
          <div class="summary-axes-findings">
            <div class="summary-axes-findings__tag">三轴发现</div>
            <div class="summary-axis-finding">
              <span>🌍 见察力 · 看清世界</span>
              <span class="summary-axis-score">${axes.jianCha || 0}</span>
            </div>
            <div class="summary-axis-finding">
              <span>❤️ 澄省力 · 了解自己</span>
              <span class="summary-axis-score">${axes.chengXing || 0}</span>
            </div>
            <div class="summary-axis-finding">
              <span>🎯 明定力 · 找到路径</span>
              <span class="summary-axis-score">${axes.mingDing || 0}</span>
            </div>
          </div>

          <!-- 对话回顾 -->
          <div class="summary-history">
            <div class="summary-history__tag">对话回顾</div>
            ${history.slice(-12).map(msg => `
              <div class="summary-msg summary-msg--${msg.role}">
                <span class="summary-msg__role">${msg.role === 'coach' ? '澄明' : '你'}</span>
                <p class="summary-msg__text">${msg.text.replace(/\n/g, '<br>')}</p>
              </div>
            `).join('')}
          </div>

          <!-- 反馈表单 -->
          <div class="summary-feedback">
            <div class="summary-feedback__tag">训练反馈</div>
            <div class="summary-feedback__rating">
              <span>这次训练对你有帮助吗？</span>
              <div class="star-rating" id="star-rating">
                ${[1,2,3,4,5].map(i => `<span class="star" data-value="${i}">★</span>`).join('')}
              </div>
            </div>
            <textarea class="summary-feedback__input" id="summary-feedback-text" placeholder="还有什么想说的？" rows="2"></textarea>
            <button class="btn btn-primary" id="btn-submit-feedback">提交反馈</button>
          </div>

          <!-- 操作按钮 -->
          <div class="summary-actions">
            <button class="btn btn-primary btn-back-report">返回报告</button>
            <button class="btn btn-secondary btn-share-from-summary">分享</button>
            <button class="btn btn-outline btn-home">回到首页</button>
          </div>
        </div>
      `;
    },

    _bindEvents(el) {
      // 返回报告
      const reportBtn = el.querySelector('.btn-back-report');
      if (reportBtn) reportBtn.addEventListener('click', () => Router.navigate('/report'));

      // 分享
      const shareBtn = el.querySelector('.btn-share-from-summary');
      if (shareBtn) shareBtn.addEventListener('click', () => Router.navigate('/share'));

      // 回到首页
      const homeBtn = el.querySelector('.btn-home');
      if (homeBtn) homeBtn.addEventListener('click', () => Router.navigate('/'));

      // 星级评分
      const starRating = el.querySelector('#star-rating');
      let selectedRating = 0;
      if (starRating) {
        const stars = starRating.querySelectorAll('.star');
        stars.forEach(star => {
          star.addEventListener('click', () => {
            selectedRating = parseInt(star.getAttribute('data-value'));
            stars.forEach((s, i) => {
              s.classList.toggle('active', i < selectedRating);
            });
          });
        });
      }

      // 提交反馈
      const feedbackBtn = el.querySelector('#btn-submit-feedback');
      if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
          const text = (el.querySelector('#summary-feedback-text')?.value || '').trim();
          // 保存反馈到localStorage
          try {
            const feedback = { rating: selectedRating, text, timestamp: Date.now() };
            localStorage.setItem('cji_coach_feedback', JSON.stringify(feedback));
          } catch (e) {}
          showToast('感谢你的反馈', 'success');
          feedbackBtn.disabled = true;
          feedbackBtn.textContent = '已提交';
        });
      }
    },
  },

  /* ── 分享页 ── */
  share: {
    /**
     * 进入分享页
     * @param {Object} data - 可包含 results 或 shareImage
     */
    enter(data) {
      const state = AppState.getState();
      const results = (data && data.results) || state.results;

      if (!results) {
        showToast('未找到评测结果，请先完成评测', 'error');
        Router.navigate('/');
        return;
      }

      const pageEl = document.getElementById('page-share');
      if (!pageEl) return;

      // 直接用结果数据渲染分享页
      pageEl.innerHTML = this._renderShareContent(state.results);
      this._bindEvents(pageEl);
    },

    /** 离开分享页 */
    leave() {
      // 无需特殊清理
    },

    /** 渲染加载状态 */
    _renderLoading() {
      return `
        <div class="share-container">
          <h2 class="share-title">正在生成分享图片</h2>
          <div class="share-loading">
            <div class="spinner"></div>
            <p>请稍候...</p>
          </div>
        </div>
      `;
    },

    /**
     * 直接渲染分享内容（HTML，显示在暖黄渐变背景上）
     */
    _renderShareContent(results) {
      const axes = results.threeAxes || {};
      const portraitKey = results.portrait || '';
      const portrait = ReportData.PORTRAIT_DATA[portraitKey] || {};
      const oneLiner = ReportData.PORTRAIT_ONE_LINER[portraitKey] || '';
      const clarityScore = results.clarityScore || 0;
      const shadow = results.shadow || {};
      const mainShadowKey = shadow.mainShadow || '';

      // 主遮蔽名称
      const shadowNames = { lazy:'懒·惰性', fear:'怕·恐惧', profit:'利·贪婪', lock:'执·固守', blind:'盲·盲区' };
      const mainShadowName = shadowNames[mainShadowKey] || '';

      // 画像code里三轴的字母
      const jianChaLevel = (axes.jianCha || 0) >= 70 ? 'A' : 'B';
      const chengXingLevel = (axes.chengXing || 0) >= 70 ? 'A' : 'B';
      const mingDingLevel = (axes.mingDing || 0) >= 70 ? 'A' : 'B';

      // light的第一段（精华句）
      const lightFirst = (portrait.light || '').split('\n\n')[0] || '';

      // firstStep
      const firstStep = portrait.firstStep || '';

      return `
        <div class="share-container">
          <div class="share-card">
            <!-- 品牌标识 -->
            <div class="share-card__brand">见澄明</div>

            <!-- 画像标题区 -->
            <div class="share-card__portrait-code">${portraitKey}</div>
            <div class="share-card__portrait-name">${portrait.name || ''}</div>
            <div class="share-card__oneliner">"${oneLiner}"</div>

            <!-- 三轴概览 -->
            <div class="share-card__axes">
              <div class="share-card__axis">
                <div class="share-card__axis-left">
                  <span class="share-card__axis-emoji">🌍</span>
                  <span class="share-card__axis-name">见察力<span class="share-card__axis-level ${jianChaLevel === 'A' ? 'level-a' : 'level-b'}">${jianChaLevel}</span></span>
                </div>
                <span class="share-card__axis-score">${axes.jianCha || 0}</span>
              </div>
              <div class="share-card__axis">
                <div class="share-card__axis-left">
                  <span class="share-card__axis-emoji">❤️</span>
                  <span class="share-card__axis-name">澄省力<span class="share-card__axis-level ${chengXingLevel === 'A' ? 'level-a' : 'level-b'}">${chengXingLevel}</span></span>
                </div>
                <span class="share-card__axis-score">${axes.chengXing || 0}</span>
              </div>
              <div class="share-card__axis">
                <div class="share-card__axis-left">
                  <span class="share-card__axis-emoji">🎯</span>
                  <span class="share-card__axis-name">明定力<span class="share-card__axis-level ${mingDingLevel === 'A' ? 'level-a' : 'level-b'}">${mingDingLevel}</span></span>
                </div>
                <span class="share-card__axis-score">${axes.mingDing || 0}</span>
              </div>
            </div>

            <!-- 核心洞察 -->
            ${lightFirst ? `
              <div class="share-card__insight">
                <div class="share-card__insight-tag">你的光</div>
                <div class="share-card__insight-text">${lightFirst}</div>
              </div>
            ` : ''}

            <!-- 遮蔽提示 -->
            ${mainShadowName ? `
              <div class="share-card__shadow">
                <span class="share-card__shadow-label">最大遮蔽</span>
                <span class="share-card__shadow-name">${mainShadowName}</span>
              </div>
            ` : ''}

            <!-- 第一步行动 -->
            ${firstStep ? `
              <div class="share-card__action">
                <div class="share-card__action-tag">48小时第一步</div>
                <div class="share-card__action-text">${firstStep}</div>
              </div>
            ` : ''}

            <!-- 澄明度 -->
            <div class="share-card__clarity">
              <span class="share-card__clarity-label">认知澄明度</span>
              <span class="share-card__clarity-score">${clarityScore}</span>
            </div>

            <!-- 底部 -->
            <div class="share-card__qr-area">
              <div class="share-card__qr-box">
                <img src="assets/qr-code.png" alt="扫码测测你的澄明力" />
              </div>
              <div class="share-card__qr-hint">扫码测测你的澄明力</div>
            </div>
            <div class="share-card__footer">见澄明 · 发现你的认知力量</div>
          </div>
          <div class="share-actions">
            <button class="btn btn-primary btn-save-image">保存图片分享</button>
            <button class="btn btn-outline btn-back-report">返回报告</button>
          </div>
        </div>
      `;
    },

    /**
     * 渲染已有分享图片（保留供保存图片功能使用）
     * @param {string} imageBase64 - base64 图片数据
     * @returns {string} HTML
     */
    _renderWithImage(imageBase64) {
      return `
        <div class="share-container">
          <div class="share-image-wrapper">
            <img class="share-image" src="${imageBase64}" alt="我的澄明力报告" />
          </div>
          <div class="share-actions">
            <button class="btn btn-primary btn-save-image">保存图片</button>
            <button class="btn btn-outline btn-back-report">返回报告</button>
          </div>
        </div>
      `;
    },

    /** 绑定分享页事件 */
    _bindEvents(el) {
      // 保存图片
      const saveBtn = el.querySelector('.btn-save-image');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const state = AppState.getState();
          if (!state.shareImage) {
            showToast('分享图片尚未生成', 'warning');
            return;
          }
          // 创建下载链接
          const link = document.createElement('a');
          link.download = '澄明力报告.png';
          link.href = state.shareImage;
          link.click();
          showToast('图片已保存', 'success');
        });
      }

      // 返回报告
      const backBtn = el.querySelector('.btn-back-report');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          Router.navigate('/report');
        });
      }
    },
  },
};


/* ================================================================
   辅助函数：报告渲染
   ================================================================ */

/**
 * 渲染遮蔽卡片（模块级辅助函数）
 * 从 SHADOW_DATA 查找遮蔽详情，支持主遮蔽 / 复合遮蔽 / 无明显遮蔽
 * @param {Object} shadow - CJIScorer 返回的 shadow 对象
 * @param {Object} SHADOW_DATA - report-data.js 中的遮蔽诊断数据
 * @returns {string} HTML
 */
function _renderShadowCards(shadow, SHADOW_DATA) {
  const mainKey = shadow.mainShadow;
  const secondKey = shadow.secondShadow;
  let html = '';

  // 主遮蔽
  if (mainKey && mainKey !== 'null' && SHADOW_DATA[mainKey]) {
    const d = SHADOW_DATA[mainKey];
    html += `
      <div class="shadow-card shadow-card--main">
        <div class="shadow-card__name">${d.name}</div>
        <div class="shadow-card__desc">${(d.desc || '').replace(/\n/g, '<br>')}</div>
        <div class="shadow-card__tag">${d.tag || ''}</div>
      </div>
    `;
  } else if (SHADOW_DATA['null']) {
    // 无明显遮蔽
    const d = SHADOW_DATA['null'];
    html += `
      <div class="shadow-card shadow-card--none">
        <div class="shadow-card__name">${d.name}</div>
        <div class="shadow-card__desc">${(d.desc || '').replace(/\n/g, '<br>')}</div>
        <div class="shadow-card__tag">${d.tag || ''}</div>
      </div>
    `;
  }

  // 复合遮蔽（第二遮蔽）
  if (secondKey && shadow.shadowMode === 'compound' && SHADOW_DATA[secondKey]) {
    const d = SHADOW_DATA[secondKey];
    html += `
      <div class="shadow-card shadow-card--secondary">
        <div class="shadow-card__name">${d.name}（复合）</div>
        <div class="shadow-card__desc">${(d.desc || '').replace(/\n/g, '<br>')}</div>
        <div class="shadow-card__tag">${d.tag || ''}</div>
      </div>
    `;
  }

  return html;
}


/* ================================================================
   4. 核心业务函数
   ================================================================ */

/**
 * 初始化测评
 * 异步加载题库 JSON 数据，初始化答题状态，导航到答题页
 * @param {string} mode - 'standard' | 'quick' | 'fast'
 */
async function initQuiz(mode) {
  // 校验模式（兼容 'fast' 别名）
  if (mode !== 'standard' && mode !== 'quick' && mode !== 'fast') {
    mode = 'standard';
  }

  // 重置答题相关状态
  AppState.mode = mode;
  AppState.currentQuestion = 0;
  AppState.answers = [];
  AppState.startTime = Date.now();
  AppState.save();

  // 异步加载题库
  const quizData = await loadQuestions(mode);
  if (!quizData || !quizData.questions) {
    showToast('题库加载失败，请重试', 'error');
    return;
  }

  // 存储加载的题库数据到 AppState
  AppState.quizData = quizData;
  AppState.save();

  // 导航到答题页
  AppState.navigate('/quiz');
}

/**
 * 提交答案
 * 记录用户作答，自动前进到下一题或完成测评
 * @param {string} questionId - 题目 ID
 * @param {string} selectedId - 选择的标识（'left'/'right' / option.value / 排序逗号拼接字符串）
 */
function submitAnswer(questionId, selectedId) {
  const state = AppState.getState();

  // 构建作答记录
  const answer = {
    questionId: questionId,
    selectedId: selectedId,
  };

  // 记录答案
  AppState.answers.push(answer);
  AppState.currentQuestion += 1;
  AppState.save();

  // 获取题目列表，判断是否还有下一题
  const questions = (state.quizData && state.quizData.questions) || [];
  const totalQuestions = questions.length;

  // 判断是否已完成所有题目
  if (AppState.currentQuestion >= totalQuestions) {
    finishQuiz();
  } else {
    // 渲染下一题
    if (PageControllers.quiz && PageControllers.quiz._renderCurrentQuestion) {
      PageControllers.quiz._renderCurrentQuestion();
    }
  }
}

/**
 * 完成测评
 * 使用 CJIScorer 计算三轴分数、画像、遮蔽、指数等，保存结果
 */
function finishQuiz() {
  const state = AppState.getState();
  if (!state.quizData || !state.answers || state.answers.length === 0) {
    showToast('没有作答记录', 'error');
    Router.navigate('/');
    return;
  }

  // 构建答案映射 { questionId: selectedId }
  const answerMap = {};
  for (const a of state.answers) {
    answerMap[a.questionId] = a.selectedId;
  }

  // 计算耗时
  const elapsedMs = state.startTime ? Date.now() - state.startTime : 0;

  // 使用 CJIScorer 计算
  try {
    const scorer = new CJIScorer(
      answerMap,
      state.quizData.questions,
      state.mode,
      elapsedMs
    );
    const results = scorer.calculate();

    AppState.results = results;
    AppState.save();

    // 导航到报告生成页
    AppState.navigate('/generating');
  } catch (e) {
    console.error('[finishQuiz] 计分失败:', e);
    showToast('评分计算失败，请重新评测', 'error');
    Router.navigate('/');
  }
}

/**
 * 开始教练训练
 * 保存训练备份到 localStorage，供首页检测恢复
 */
function startCoach() {
  const state = AppState.getState();
  const results = state.results || null;
  const portrait = results?.portrait || 'BBB';
  
  // 保存训练备份（供首页检测）
  try {
    const now = new Date();
    const backup = {
      round: (state.coachRound || 0) + 1,
      totalRounds: 6,
      portrait: portrait,
      updatedAt: `${now.getMonth()+1}月${now.getDate()}日`,
    };
    localStorage.setItem('cji_training_backup', JSON.stringify(backup));
  } catch (e) {}
  
  AppState.navigate('/coach');
}

/**
 * 提交教练回复（代理到教练控制器的 _handleUserReply）
 * @param {string} text - 用户回复文本
 */
function submitCoachReply(text) {
  const state = AppState.getState();
  const results = state.results || { portrait: 'BBB', deepDiag: [], driveShadowAlignment: { isAligned: false } };
  const portrait = results.portrait || 'BBB';
  PageControllers.coach._handleUserReply(text, state, results, portrait);
}

/**
 * 生成分享图片
 * 调用 share.js 中的 Canvas 绘制函数生成 base64 图片
 * 如果 share.js 尚未加载，则在此处实现基础版本
 */
function generateShareImage() {
  const state = AppState.getState();

  if (!state.results) {
    showToast('未找到评测结果', 'error');
    return;
  }

  // 尝试调用 share.js 中的绘制函数
  try {
    // 动态导入 share.js（如果存在）
    // 注意：如果 share.js 未实现，使用内置的基础绘制
    if (typeof window.generateShareCanvas === 'function') {
      window.generateShareCanvas(state.results, (base64) => {
        AppState.shareImage = base64;
        AppState.save();
        updateSharePage(base64);
      });
    } else {
      // 使用内置 Canvas 基础绘制
      _drawBasicShareImage(state.results);
    }
  } catch (e) {
    console.warn('[generateShareImage] 生成失败：', e);
    _drawBasicShareImage(state.results);
  }
}

/**
 * 更新分享页显示生成的图片
 * @param {string} base64 - 图片 base64 数据
 */
function updateSharePage(base64) {
  const pageEl = document.getElementById('page-share');
  if (!pageEl) return;

  // 替换加载状态为图片展示
  const container = pageEl.querySelector('.share-container');
  if (container) {
    container.innerHTML = PageControllers.share._renderWithImage(base64);
    PageControllers.share._bindEvents(pageEl);
  }
}

/**
 * 内置基础分享图片绘制（Canvas）
 * 当 share.js 不可用时的兜底实现
 * 适配 CJIScorer 新结果结构
 * @param {Object} results - CJIScorer 计算结果
 */
function _drawBasicShareImage(results) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 设置画布尺寸（移动端分享卡片尺寸）
    const width = 750;
    const height = 1334;
    canvas.width = width;
    canvas.height = height;

    // ── 背景：暖黄渐变 ──
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#FFF8E7');
    gradient.addColorStop(0.4, '#FFECC8');
    gradient.addColorStop(1, '#FFD8A0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 装饰圆
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#C05520';
    ctx.beginPath();
    ctx.arc(width * 0.8, 300, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width * 0.2, 1000, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── 数据内容 ──

    // 标题
    ctx.fillStyle = '#C05520';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('澄明力报告', width / 2, 200);

    // 三轴分数
    const axes = results.threeAxes || {};
    const jianCha = axes.jianCha || 0;
    const chengXing = axes.chengXing || 0;
    const mingDing = axes.mingDing || 0;

    // 画像代码
    const portrait = results.portrait || '';
    const oneLiner = results.oneLiner || '';

    // 画像名称
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#D04A18';
    ctx.fillText(portrait, width / 2, 280);

    // 一句话画像
    if (oneLiner) {
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#8A7040';
      ctx.fillText(oneLiner, width / 2, 330);
    }

    // 三轴分数
    const scores = [
      { label: '见察力', score: jianCha },
      { label: '澄省力', score: chengXing },
      { label: '明定力', score: mingDing },
    ];

    scores.forEach((item, i) => {
      const y = 480 + i * 200;

      // 轴名称
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#5A4A30';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, 80, y);

      // 分数
      ctx.font = 'bold 56px sans-serif';
      ctx.fillStyle = '#D04A18';
      ctx.textAlign = 'right';
      ctx.fillText(`${item.score}`, width - 80, y + 10);
    });

    // 认知澄明度总分
    const clarityScore = results.clarityScore || 0;
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#C05520';
    ctx.textAlign = 'center';
    ctx.fillText(`认知澄明度 ${clarityScore}`, width / 2, 1100);

    // 底部水印
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#B09870';
    ctx.textAlign = 'center';
    ctx.fillText('澄明力评测 · 发现你的认知力量', width / 2, height - 40);

    // 转换为 base64
    const base64 = canvas.toDataURL('image/png');
    AppState.shareImage = base64;
    AppState.save();

    // 更新分享页
    updateSharePage(base64);
  } catch (e) {
    console.warn('[_drawBasicShareImage] 绘制失败：', e);
    showToast('分享图片生成失败', 'error');
  }
}


/* ================================================================
   5. 工具函数
   ================================================================ */

/**
 * 防抖函数
 * @param {Function} fn - 需要防抖的函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Function} 防抖包装后的函数
 */
function debounce(fn, ms = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, ms);
  };
}

/**
 * 格式化分数显示
 * @param {number} score - 原始分数
 * @returns {string} 格式化后的分数字符串
 */
function formatScore(score) {
  if (typeof score !== 'number' || isNaN(score)) return '--';
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 获取等级标签（A/B）
 * @param {number} score - 轴分数
 * @returns {string} 等级标签
 */
function formatGrade(score) {
  if (typeof score !== 'number' || isNaN(score)) return '--';
  return score >= 70 ? 'A' : 'B';
}

/**
 * 数字滚动动画
 * 从 0 平滑递增到目标值
 * @param {HTMLElement} el - 目标 DOM 元素
 * @param {number} target - 目标数值
 * @param {number} duration - 动画时长（毫秒）
 */
function animateNumber(el, target, duration = 1000) {
  if (!el) return;

  const startTime = performance.now();
  const startValue = 0;

  // 使用 requestAnimationFrame 实现流畅动画
  const step = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // 使用 easeOutCubic 缓动函数
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startValue + (target - startValue) * eased);

    el.textContent = formatScore(current);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = formatScore(target);
    }
  };

  requestAnimationFrame(step);
}

/**
 * 显示提示消息（Toast）
 * @param {string} message - 提示文案
 * @param {string} type - 提示类型 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, type = 'info', duration = 2500) {
  // 查找或创建 Toast 容器
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // 创建 Toast 元素
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${_getToastIcon(type)}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // 触发入场动画
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  // 自动消失
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * 获取 Toast 图标
 * @param {string} type - 提示类型
 * @returns {string} 图标字符
 */
function _getToastIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  return icons[type] || icons.info;
}

/**
 * 检查是否可以恢复未完成的测评
 * 在应用初始化时调用
 */
function checkResume() {
  const state = AppState.getState();

  // 如果有未完成的测评（有答案但没有结果），提示恢复
  if (state.answers.length > 0 && !state.results) {
    // 如果当前在首页，显示恢复提示
    if (Router.current === 'home') {
      const pageEl = document.getElementById('page-home');
      if (pageEl) {
        const resumeBanner = document.createElement('div');
        resumeBanner.className = 'resume-banner';
        resumeBanner.innerHTML = `
          <p>你有一次未完成的评测（已答 ${state.answers.length} 题）</p>
          <button class="btn btn-sm btn-primary" id="resume-quiz">继续作答</button>
          <button class="btn btn-sm btn-outline" id="dismiss-resume">放弃</button>
        `;
        // 插入到 home-hero 下方、手风琴面板上方
        const hero = pageEl.querySelector('.home-hero');
        const firstPanel = pageEl.querySelector('.home-panel');
        if (hero && hero.nextSibling) {
          pageEl.insertBefore(resumeBanner, hero.nextSibling);
        } else if (firstPanel) {
          pageEl.insertBefore(resumeBanner, firstPanel);
        } else {
          pageEl.appendChild(resumeBanner);
        }

        // 绑定事件
        const resumeBtn = resumeBanner.querySelector('#resume-quiz');
        const dismissBtn = resumeBanner.querySelector('#dismiss-resume');

        if (resumeBtn) {
          resumeBtn.addEventListener('click', () => {
            AppState.navigate('/quiz', { resume: true });
          });
        }
        if (dismissBtn) {
          dismissBtn.addEventListener('click', () => {
            AppState.reset();
            resumeBanner.remove();
          });
        }
      }
    }
  }
}


/* ================================================================
   6. 应用初始化生命周期
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 从 localStorage 恢复状态
  AppState.load();

  // 2. 初始化路由系统
  Router.init();

  // 3. 检查是否有未完成的测评
  checkResume();
});


/* ================================================================
   7. 导出
   ================================================================ */

export {
  Router,
  AppState,
  PageControllers,
  initQuiz,
  submitAnswer,
  finishQuiz,
  startCoach,
  submitCoachReply,
  generateShareImage,
  _renderShadowCards,
};
