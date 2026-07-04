/****************************
 * 见澄明H5 - 计分引擎 v7.0 (ES Module)
 * 对齐《澄明力评测v5.0·三轴×三域》开发规格v3.0
 * 三轴并行：见察力(jianCha) / 澄省力(chengXing) / 明定力(mingDing)
 * 五遮蔽：懒/怕/利/锁/盲
 * 五指数：利用社会/被社会毒打/AI运用/AI风险/六步闭环
 * 六交叉判定：投喂型AI/校准偏差/叠合遮蔽/第三地图/觉察跃迁/驱动-遮蔽一致性
 * 边界缓冲带：67-69分按A处理但柔和措辞
 ****************************/

/* 深度诊断数据（原 report-data.js，内联定义） */
import { DEEP_DIAG_DATA } from './report-data.js';

/* 字段映射：report-data.js 使用 tag/desc，scoring 需要 title/description/suggestion */
const _mapDeepDiag = (key) => {
  const src = DEEP_DIAG_DATA[key];
  if (!src) return { type: key, tag: key, desc: '' };
  return { type: key, title: src.tag || key, description: src.desc || '', suggestion: '', ...src };
};

export class CJIScorer {
  constructor(answers, questions, mode = 'fast', elapsedMs = 0) {
    this.answers = answers;
    this.questions = questions;
    this.mode = mode;
    this.elapsedMs = elapsedMs;
    // 三轴并行
    this.rawScores = { jianCha: 0, mingDing: 0, chengXing: 0 };
    // v5.0五指数
    this.auxScores = { utilizeSociety: 0, beatenBySociety: 0, aiUtilization: 0, aiRisk: 0, sixStep: 0 };
    this.seScore = 0;
    // v5.0六交叉判定
    this.crossFlags = {
      feedingRisk: false,
      calibrationCheck: false,
      overlapDetection: false,
      thirdMap: false,
      awarenessShift: false,
      driveShadowAlignment: false
    };
    this.crossDetails = {
      thirdMapType: null,
      awarenessShiftType: null
    };
    this.consistencyOffset = 0;
    this.maxScores = {};
    this._computeMaxScores();
  }

  _computeMaxScores() {
    const axes = ['jianCha', 'mingDing', 'chengXing'];
    for (const axis of axes) {
      let total = 0;
      for (const q of this.questions) {
        // 跳过SE题、交叉判定题和收尾题
        if (q.type === 'socialDesirability' || q.type === 'selfReflection') continue;
        if (q.segment === 'crossJudgment') continue;

        const opts = this._getOptions(q);
        if (!opts || opts.length === 0) continue;

        let maxForQ = 0;
        for (const opt of opts) {
          let val = 0;
          if (q.type === 'sort') {
            // 排序题：取排第一的items对应维度权重最大值
            const sc = q.scoring || {};
            const weights = sc[axis + 'Weights'] || {};
            for (const dim of Object.keys(weights)) {
              val = Math.max(val, weights[dim]);
            }
          } else {
            const s = opt.scores || {};
            val = s[axis] || 0;
          }
          if (val > maxForQ) maxForQ = val;
        }
        total += maxForQ;
      }
      this.maxScores[axis] = total || 1;
    }
  }

  _getOptions(q) {
    // v5.0题库用options字段（选择题）或items字段（排序题）
    if (q.options) return q.options;
    if (q.items) return q.items;
    return null;
  }

  calculate() {
    this._collectRawScores();
    const normalized = this._normalize();
    const validity = this._validityCheck(normalized);
    const portrait = this._getPortrait(validity.jianCha, validity.mingDing, validity.chengXing);
    const oneLiner = this._getOneLiner(portrait);
    const deepDiag = this._deepDiagnosis();
    const tooFast = this._checkTooFast();

    // v5.0五指数
    const fiveIndices = this._deriveFiveIndices(validity);

    // 认知澄明度总分 = 三轴平均分
    const clarityScore = Math.round(
      (validity.jianCha + validity.mingDing + validity.chengXing) / 3
    );

    // 遮蔽诊断
    const shadow = this._getShadow(validity);

    // 驱动-遮蔽一致性（从交叉判定推导简化版）
    const driveShadowAlignment = this._checkDriveShadowAlignment(validity);

    return {
      mode: this.mode,
      threeAxes: validity,
      portrait: portrait,
      oneLiner: oneLiner,
      fiveIndices: fiveIndices,
      deepDiag: deepDiag,
      shadow: shadow,
      driveShadowAlignment: driveShadowAlignment,
      consistency: { stable: this.consistencyOffset < 2, offset: this.consistencyOffset, checked: true },
      tooFast: tooFast,
      raw: this.rawScores,
      clarityScore: clarityScore,
      // v5.0交叉判定结果
      crossJudgments: {
        feedingRisk: this.crossFlags.feedingRisk,
        calibration: this.crossFlags.calibrationCheck,
        overlap: this.crossFlags.overlapDetection,
        thirdMap: { detected: this.crossFlags.thirdMap, type: this.crossDetails.thirdMapType },
        awarenessShift: { detected: this.crossFlags.awarenessShift, shiftType: this.crossDetails.awarenessShiftType }
      },
      recommendedAxis: this._getRecommendedAxis(validity),
      // 边界缓冲带标记
      boundaryBuffer: this._getBoundaryBuffer(validity)
    };
  }

  _collectRawScores() {
    for (const q of this.questions) {
      const selectedId = this.answers[q.id];
      if (!selectedId) continue;

      // SE检测题
      if (q.type === 'socialDesirability') {
        const opt = this._findOption(q, selectedId);
        if (opt && opt.meta) {
          if (q.meta && q.meta.direction === 'positive') {
            if (selectedId === 'agree' || selectedId === 'stronglyAgree') this.seScore += 2;
            else if (selectedId === 'disagree' || selectedId === 'stronglyDisagree') this.seScore -= 1;
          }
        }
        continue;
      }

      // 收尾题（自评不评分）
      if (q.type === 'selfReflection') continue;

      // 交叉判定题（不参与三轴计分，但收集信号）
      if (q.segment === 'crossJudgment' || q.type === 'thirdMap' || q.type === 'awarenessShift') {
        const opt = this._findOption(q, selectedId);
        if (opt && opt.crossJudgment) {
          this._processCrossJudgment(opt.crossJudgment);
        }
        continue;
      }

      // binary / quickBinary 类型：左右分
      if (q.type === 'binary' || q.type === 'quickBinary') {
        const side = selectedId; // 'left' or 'right'
        const ls = q.leftScores || {};
        const rs = q.rightScores || {};
        if (side === 'left') {
          this.rawScores.jianCha += (ls.jianCha || 0);
          this.rawScores.mingDing += (ls.mingDing || 0);
          this.rawScores.chengXing += (ls.chengXing || 0);
          // auxScores
          if (ls.utilizeSociety) this.auxScores.utilizeSociety += ls.utilizeSociety;
          if (ls.beatenBySociety) this.auxScores.beatenBySociety += ls.beatenBySociety;
        } else {
          this.rawScores.jianCha += (rs.jianCha || 0);
          this.rawScores.mingDing += (rs.mingDing || 0);
          this.rawScores.chengXing += (rs.chengXing || 0);
          if (rs.utilizeSociety) this.auxScores.utilizeSociety += rs.utilizeSociety;
          if (rs.beatenBySociety) this.auxScores.beatenBySociety += rs.beatenBySociety;
        }
        continue;
      }

      // sort 类型：排序题
      if (q.type === 'sort') {
        const order = selectedId.split(',');
        // 取排第一的item的dimension来计分
        if (order.length > 0) {
          const firstId = order[0];
          const item = (q.items || []).find(i => i.value === firstId || i.id === firstId);
          if (item) {
            const dim = item.dimension;
            const sc = q.scoring || {};
            const jw = sc.jianChaWeights || {};
            const cw = sc.chengXingWeights || {};
            const mw = sc.mingDingWeights || {};
            this.rawScores.jianCha += (jw[dim] || 0);
            this.rawScores.mingDing += (cw[dim] || 0);
            this.rawScores.chengXing += (mw[dim] || 0);
          }
        }
        continue;
      }

      // 普通选择题：chat / situational / ifTomorrow / aiScenario
      const opt = this._findOption(q, selectedId);
      if (!opt) continue;

      const s = opt.scores || {};
      this.rawScores.jianCha += (s.jianCha || 0);
      this.rawScores.mingDing += (s.mingDing || 0);
      this.rawScores.chengXing += (s.chengXing || 0);

      // 收集交叉判定信号（普通题也可能有crossJudgment）
      if (opt.crossJudgment) {
        this._processCrossJudgment(opt.crossJudgment);
      }
    }
  }

  _findOption(q, selectedId) {
    const opts = this._getOptions(q);
    if (!opts) return null;
    // v5.0用value字段做ID
    return opts.find(o => (o.value || o.id) === selectedId);
  }

  _processCrossJudgment(cj) {
    if (cj.feedingRisk) {
      this.crossFlags.feedingRisk = true;
    }
    if (cj.calibrationCheck) {
      this.crossFlags.calibrationCheck = true;
    }
    if (cj.overlapDetection) {
      this.crossFlags.overlapDetection = true;
    }
    if (cj.thirdMap) {
      this.crossFlags.thirdMap = true;
      this.crossDetails.thirdMapType = cj.thirdMap; // "doubleRationalization" | "abilityIllusion"
    }
    if (cj.awarenessShift) {
      this.crossFlags.awarenessShift = true;
      this.crossDetails.awarenessShiftType = cj.awarenessShift; // "namingToPause" | "pauseToObserver" | "naming"
    }
    if (cj.driveShadowAlignment) {
      this.crossFlags.driveShadowAlignment = true;
    }
  }

  _normalize() {
    const m = this.maxScores;
    let j = Math.round(Math.min((this.rawScores.jianCha / m.jianCha) * 100, 100));
    let c = Math.round(Math.min((this.rawScores.mingDing / m.mingDing) * 100, 100));
    let mding = Math.round(Math.min((this.rawScores.chengXing / m.chengXing) * 100, 100));

    // SE效度修正：SE≥2 → 三轴得分打9折
    if (this.seScore >= 2) {
      j = Math.round(j * 0.9);
      c = Math.round(c * 0.9);
      mding = Math.round(mding * 0.9);
    }

    return { jianCha: j, mingDing: c, chengXing: mding, seWarning: this.seScore >= 2 };
  }

  _validityCheck(normalized) {
    return { ...normalized };
  }

  // 画像判定：v5.0边界缓冲带 67-69按A处理
  _getPortrait(j, c, m) {
    const toGrade = (val) => val >= 70 ? 'A' : (val >= 67 ? 'A' : 'B');
    return toGrade(j) + toGrade(c) + toGrade(m);
  }

  _getOneLiner(portrait) {
    const map = {
      'AAA': '三根轴都在转——看得见场，读得懂自己，找得到路。',
      'AAB': '看得清外面，也看懂自己。差的是找到出口。',
      'ABA': '看得清场，也找得到路，就差对自己诚实。',
      'ABB': '场看得清楚，但人和路还需要补上。',
      'BAA': '了解自己，也能行动，但对外面的场子看得不够。',
      'BAB': '了解自己，但外面和路都还模糊。',
      'BBA': '能行动，但看不清场也看不清自己，容易瞎忙。',
      'BBB': '三根轴都在起步——看见自己在起步，就是开始。'
    };
    return map[portrait] || '你的澄明力状态需要进一步探索。';
  }

  // v5.0五指数
  _deriveFiveIndices(axes) {
    const { jianCha, mingDing, chengXing } = axes;
    return {
      // 利用社会能力：看清世界越高，越能识别和利用社会结构
      utilizeSociety: Math.min(100, jianCha),
      // 被社会毒打风险：看清世界和找到路径越低风险越高
      beatenBySociety: Math.min(100, Math.round((100 - jianCha) * 0.6 + (100 - mingDing) * 0.4)),
      // AI运用力：看清世界越高越能正确使用AI
      aiUtilization: Math.min(100, Math.round(jianCha * 0.7 + mingDing * 0.3)),
      // 被AI操控风险：看清世界和了解自己越低越容易被锁定
      aiRisk: Math.min(100, Math.round((100 - jianCha) * 0.5 + (100 - chengXing) * 0.3 + (100 - mingDing) * 0.2)),
      // 六步闭环能力：找到路径越高，约束映射和最小验证越强
      sixStep: Math.min(100, Math.round(mingDing * 0.7 + jianCha * 0.2 + chengXing * 0.1))
    };
  }

  _deepDiagnosis() {
    const results = [];
    if (this.crossFlags.feedingRisk) {
      results.push(_mapDeepDiag('feedingRisk'));
    }
    if (this.crossFlags.calibrationCheck) {
      results.push(_mapDeepDiag('calibrationCheck'));
    }
    if (this.crossFlags.overlapDetection) {
      results.push(_mapDeepDiag('overlapDetection'));
    }
    // v5.0新增
    if (this.crossFlags.thirdMap) {
      results.push({ type: 'thirdMap', detected: true, signalType: this.crossDetails.thirdMapType });
    }
    if (this.crossFlags.awarenessShift) {
      results.push({ type: 'awarenessShift', detected: true, shiftType: this.crossDetails.awarenessShiftType });
    }
    return results;
  }

  _checkTooFast() {
    if (!this.elapsedMs || this.elapsedMs <= 0) return { flagged: false };
    // v5.0: 快速版20题~6.5分钟(390秒), 标准版30题~10分钟(600秒)
    const threshold = this.mode === 'fast' ? 120000 : 240000;
    const flagged = this.elapsedMs < threshold;
    return { flagged, elapsedSec: Math.round(this.elapsedMs / 1000), thresholdSec: threshold / 1000 };
  }

  // 遮蔽诊断：五遮蔽（懒/怕/利/锁/盲）
  _getShadow(axes) {
    const { jianCha, mingDing, chengXing } = axes;
    const scores = [
      { key: 'jianCha', val: jianCha },
      { key: 'mingDing', val: mingDing },
      { key: 'chengXing', val: chengXing }
    ];
    scores.sort((a, b) => a.val - b.val);

    // 三轴都比较高：无明显遮蔽
    if (scores[0].val >= 60) {
      return { mainShadow: 'null', shadowMode: 'none' };
    }

    // 基于最低轴判断主遮蔽
    let mainShadow;
    switch (scores[0].key) {
      case 'jianCha':
        mainShadow = 'lock';  // 看不清世界→锁
        break;
      case 'chengXing':
        mainShadow = 'blind'; // 不了解自己→盲
        break;
      case 'mingDing':
        mainShadow = 'lazy';  // 找不到路径→懒
        break;
      default:
        mainShadow = 'blind';
    }

    // 次低轴也低：复合遮蔽
    const compound = scores[1].val < 50;
    let secondShadow = null;
    if (compound) {
      if (scores[1].key === 'chengXing' && mainShadow !== 'blind') {
        secondShadow = chengXing < 40 ? 'profit' : 'fear';
      } else if (scores[1].key === 'mingDing' && mainShadow !== 'lazy') {
        secondShadow = 'fear';
      } else if (scores[1].key === 'jianCha' && mainShadow !== 'lock') {
        secondShadow = 'lock';
      }
    }

    return {
      mainShadow,
      secondShadow,
      shadowMode: compound ? 'compound' : 'single'
    };
  }

  // 驱动-遮蔽一致性简化检测
  _checkDriveShadowAlignment(axes) {
    // 简化版：如果最高轴和最低轴的差距≥30，视为方向不一致（安全的）
    // 如果所有轴都偏低(<50)，容易发生一致性遮蔽
    const { jianCha, mingDing, chengXing } = axes;
    const scores = [jianCha, mingDing, chengXing];
    const allLow = scores.every(s => s < 50);
    const range = Math.max(...scores) - Math.min(...scores);

    return {
      isAligned: allLow && range < 20, // 所有轴都低且差距小→驱动和遮蔽同方向
      type: allLow && range < 20 ? 'reinforcing' : null
    };
  }

  // 推荐训练轴：三轴最低分轴
  _getRecommendedAxis(axes) {
    const { jianCha, mingDing, chengXing } = axes;
    const scores = [
      { key: 'jianCha', val: jianCha },
      { key: 'mingDing', val: mingDing },
      { key: 'chengXing', val: chengXing }
    ];
    scores.sort((a, b) => a.val - b.val);
    // 同分优先级：澄省力 > 见察力 > 明定力
    const priority = { chengXing: 0, jianCha: 1, mingDing: 2 };
    if (scores[0].val === scores[1].val) {
      return priority[scores[0].key] <= priority[scores[1].key]
        ? scores[0].key : scores[1].key;
    }
    return scores[0].key;
  }

  // 边界缓冲带：标记哪些轴在67-69之间
  _getBoundaryBuffer(axes) {
    const result = {};
    for (const axis of ['jianCha', 'mingDing', 'chengXing']) {
      const val = axes[axis];
      if (val >= 67 && val < 70) {
        result[axis] = true;
      }
    }
    return result;
  }

  static getIndexText(INDEX_DATA, indexKey, score) {
    const data = INDEX_DATA[indexKey];
    if (!data) return { label: '', text: '' };
    for (const level of data.levels) {
      if (score <= level.max) return { label: level.label, text: level.text };
    }
    return data.levels[data.levels.length - 1];
  }

  static getBarClass(score, isRisk = false) {
    if (isRisk) {
      if (score <= 33) return 'risk-low';
      if (score <= 66) return 'risk-mid';
      return 'risk-high';
    }
    if (score <= 25) return 'score-warm';
    if (score <= 50) return 'score-amber';
    if (score <= 75) return 'score-terracotta';
    return 'score-red';
  }
}
