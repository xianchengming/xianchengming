-- ================================================================
-- 澄明力评测 H5 — 数据库 Schema v1.0
-- PostgreSQL · snake_case · UUID PK · JSONB
-- ================================================================

BEGIN;

-- ────────────────────────────────────────────
-- 1. users  用户
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    openid      TEXT        NOT NULL,                          -- 微信 openid / 平台唯一标识
    nickname    TEXT        NOT NULL DEFAULT '',
    avatar_url  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_openid ON users (openid);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- ────────────────────────────────────────────
-- 2. eval_sessions  评测会话
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode            TEXT        NOT NULL,                      -- 'fast' | 'standard'
    answers         JSONB       NOT NULL DEFAULT '[]',          -- [{question_id, selected_id, ...}]
    result          JSONB       DEFAULT NULL,                  -- {jianCha, chengXing, mingDing, portrait, blinders, indices, se, ...}
    axis_tag        TEXT        NOT NULL DEFAULT '',            -- v5.0 评测维度标签
    domain_tag      TEXT        NOT NULL DEFAULT '',            -- v5.0 域标签
    methodology_ref TEXT        NOT NULL DEFAULT '',            -- v5.0 方法论引用
    duration_ms     INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_sessions_user_id ON eval_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_eval_sessions_user_created ON eval_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_sessions_mode ON eval_sessions (mode);

-- ────────────────────────────────────────────
-- 3. training_sessions  训练会话
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_sessions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    eval_session_id UUID        NULL REFERENCES eval_sessions(id) ON DELETE SET NULL,  -- 允许空
    messages        JSONB       NOT NULL DEFAULT '[]',          -- [{role, text, round, ...}]
    current_round   INT         NOT NULL DEFAULT 1,
    is_complete     BOOL        NOT NULL DEFAULT FALSE,
    summary         JSONB       DEFAULT NULL,                  -- {cognitive_anchor, topic, axes_findings, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_user_id ON training_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_eval_id ON training_sessions (eval_session_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_complete ON training_sessions (user_id, is_complete, created_at DESC);

-- ────────────────────────────────────────────
-- 4. training_feedback  训练反馈
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_feedback (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    training_session_id UUID       NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    learning_score      INT         NOT NULL CHECK (learning_score BETWEEN 1 AND 5),
    awareness_score     INT         NOT NULL CHECK (awareness_score BETWEEN 1 AND 5),
    nps_score           INT         NOT NULL CHECK (nps_score BETWEEN 1 AND 5),
    best_finding        TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_feedback_session
    ON training_feedback (training_session_id);

-- ────────────────────────────────────────────
-- 5. eval_feedback  评测反馈
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_feedback (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    eval_session_id UUID        NOT NULL REFERENCES eval_sessions(id) ON DELETE CASCADE,
    accuracy_score  INT         NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
    insight_score   INT         NOT NULL CHECK (insight_score BETWEEN 1 AND 5),
    recommend_score INT         NOT NULL CHECK (recommend_score BETWEEN 1 AND 5),
    comment         TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_eval_feedback_session
    ON eval_feedback (eval_session_id);

-- ────────────────────────────────────────────
-- 6. question_stats  题目统计
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_stats (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id TEXT        NOT NULL,                      -- 对应 JSON 题库中的 id
    option_id   TEXT        NOT NULL DEFAULT '',           -- 被选的选项 id（聚合维度）
    count       INT         NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_stats_qid_oid
    ON question_stats (question_id, option_id);
CREATE INDEX IF NOT EXISTS idx_question_stats_count ON question_stats (count DESC);

-- ────────────────────────────────────────────
-- 7. portraits  画像统计
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portraits (
    portrait_code TEXT        PRIMARY KEY,                 -- 'AAA' ~ 'BBB' (共8种)
    count         INT         NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 初始化8种画像
INSERT INTO portraits (portrait_code, count) VALUES
    ('AAA', 0), ('AAB', 0), ('ABA', 0), ('ABB', 0),
    ('BAA', 0), ('BAB', 0), ('BBA', 0), ('BBB', 0)
ON CONFLICT (portrait_code) DO NOTHING;


-- ================================================================
-- 复测冷却：同一 user_id + mode 7天内不可重复
-- 通过查询约束实现（应用层 + DB层双重保障）
-- ================================================================

-- 辅助函数：检查是否在冷却期内
CREATE OR REPLACE FUNCTION is_in_cooldown(p_user_id UUID, p_mode TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM eval_sessions
        WHERE user_id     = p_user_id
          AND mode        = p_mode
          AND created_at  > now() - INTERVAL '7 days'
    );
$$ LANGUAGE sql STABLE;

-- 复测触发器：INSERT 前校验冷却期
CREATE OR REPLACE FUNCTION enforce_eval_cooldown()
RETURNS TRIGGER AS $$
BEGIN
    IF is_in_cooldown(NEW.user_id, NEW.mode) THEN
        RAISE EXCEPTION 'eval_cooldown_violation'
            USING ERRCODE = '55P03',       -- lock_not_available
                  HINT   = format('同一用户同一模式 %s 7天内只能评测一次', NEW.mode);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eval_cooldown ON eval_sessions;
CREATE TRIGGER trg_eval_cooldown
    BEFORE INSERT ON eval_sessions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_eval_cooldown();


-- ================================================================
-- 更新统计触发器
-- ================================================================

-- 画像计数：评测完成后更新 portraits 表
CREATE OR REPLACE FUNCTION update_portrait_count()
RETURNS TRIGGER AS $$
DECLARE
    v_code TEXT;
BEGIN
    -- 从 result JSONB 提取 portrait.code
    IF NEW.result IS NOT NULL AND jsonb_typeof(NEW.result) = 'object' THEN
        v_code := NULLIF(
            (NEW.result->>'portrait_code'),
            ''
        );
        -- 兼容嵌套提取 portrait.code
        IF v_code IS NULL THEN
            v_code := NULLIF(
                (NEW.result#>'{portrait,code}')>>'',
                ''
            );
        END IF;

        IF v_code IS NOT NULL THEN
            INSERT INTO portraits (portrait_code, count, updated_at)
            VALUES (v_code, 1, now())
            ON CONFLICT (portrait_code)
            DO UPDATE SET
                count      = portraits.count + 1,
                updated_at = now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portrait_count ON eval_sessions;
CREATE TRIGGER trg_portrait_count
    AFTER INSERT OR UPDATE OF result ON eval_sessions
    FOR EACH ROW
    WHEN (NEW.result IS NOT NULL AND OLD.result IS DISTINCT FROM NEW.result)
    EXECUTE FUNCTION update_portrait_count();


-- ================================================================
-- 题目统计：评测完成后批量更新 question_stats
-- ================================================================

CREATE OR REPLACE FUNCTION update_question_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_answer JSONB;
    v_qid    TEXT;
    v_oid    TEXT;
BEGIN
    -- 遍历 answers 数组，逐项 upsert
    FOR v_answer IN SELECT * FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(NEW.answers) = 'array' THEN NEW.answers ELSE '[]'::jsonb END
    )
    LOOP
        v_qid := NULLIF(v_answer->>'question_id', '');
        v_oid := NULLIF(v_answer->>'selected_id', '');

        IF v_qid IS NOT NULL THEN
            INSERT INTO question_stats (question_id, option_id, count, updated_at)
            VALUES (v_qid, COALESCE(v_oid, ''), 1, now())
            ON CONFLICT (question_id, option_id)
            DO UPDATE SET
                count      = question_stats.count + 1,
                updated_at = now();
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_question_stats ON eval_sessions;
CREATE TRIGGER trg_question_stats
    AFTER INSERT ON eval_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_question_stats();


COMMIT;
