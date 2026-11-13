-- ============================================================================
-- Migration: 20261113_add_contest_score_rpc.sql
-- Description: Creates contest score adjustment ledger table and atomic
--              PostgreSQL RPC adjust_contest_score() for concurrency-safe,
--              idempotent contest point scoring and reapproval lifecycles.
-- Target: WishRite Influencer Platform (Supabase PostgreSQL)
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE UNTIL EXPLICITLY APPROVED)
-- ============================================================================

-- 1. Contest Score Adjustments Ledger Table
CREATE TABLE IF NOT EXISTS public.contest_score_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id TEXT NOT NULL,
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development', 'test')),
    content_id TEXT,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('award', 'revoke')),
    points_delta INTEGER NOT NULL CHECK (points_delta > 0),
    approval_cycle INTEGER NOT NULL DEFAULT 1 CHECK (approval_cycle > 0),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT NOT NULL,
    FOREIGN KEY (contest_id, environment) REFERENCES public.contests(id, environment) ON DELETE CASCADE,
    CONSTRAINT uq_contest_ledger_idempotency UNIQUE (idempotency_key)
);

-- Unique index per content, adjustment type, and approval cycle (permits legitimate reapproval cycles)
CREATE UNIQUE INDEX IF NOT EXISTS uq_contest_ledger_content_cycle
    ON public.contest_score_adjustments (contest_id, influencer_id, environment, content_id, adjustment_type, approval_cycle)
    WHERE content_id IS NOT NULL;

-- Indexes for audit, reconciliation, and participant history queries
CREATE INDEX IF NOT EXISTS idx_contest_score_adj_contest_env
    ON public.contest_score_adjustments (environment, contest_id, influencer_id);

CREATE INDEX IF NOT EXISTS idx_contest_score_adj_created_at
    ON public.contest_score_adjustments (created_at DESC);

-- Enable Row-Level Security (RLS) on Ledger
ALTER TABLE public.contest_score_adjustments ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from PUBLIC, anon, and authenticated
REVOKE ALL ON public.contest_score_adjustments FROM PUBLIC, anon, authenticated;

-- Grant full access exclusively to service_role (server-side only)
GRANT ALL ON public.contest_score_adjustments TO service_role;

DROP POLICY IF EXISTS "Allow service_role full access on contest_score_adjustments" ON public.contest_score_adjustments;
CREATE POLICY "Allow service_role full access on contest_score_adjustments" ON public.contest_score_adjustments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Atomic Stored Procedure: adjust_contest_score
CREATE OR REPLACE FUNCTION public.adjust_contest_score(
    p_contest_id TEXT,
    p_influencer_id UUID,
    p_environment TEXT,
    p_adjustment_type TEXT,
    p_points_delta INTEGER,
    p_content_id TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contest RECORD;
    v_score RECORD;
    v_existing_by_key RECORD;
    v_award_count INTEGER := 0;
    v_revoke_count INTEGER := 0;
    v_latest_award RECORD;
    v_latest_revoke RECORD;
    v_target_cycle INTEGER := 1;
    v_clean_content_id TEXT := NULLIF(TRIM(p_content_id), '');
    v_clean_reason TEXT := NULLIF(TRIM(p_reason), '');
    v_idempotency_key TEXT;
    v_current_points INTEGER := 0;
    v_new_points INTEGER;
    v_now TIMESTAMPTZ := NOW();
    v_score_id UUID;
    v_adj_id UUID;
    v_constraint_name TEXT;
BEGIN
    -- 1. INPUT VALIDATION (Zero writes performed)
    IF p_contest_id IS NULL OR TRIM(p_contest_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_CONTEST_ID', 'message', 'Contest ID is required.');
    END IF;

    IF p_influencer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INFLUENCER_ID', 'message', 'Influencer ID is required.');
    END IF;

    IF p_environment IS NULL OR p_environment NOT IN ('production', 'staging', 'development', 'test') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ENVIRONMENT', 'message', 'Valid environment is required.');
    END IF;

    IF p_adjustment_type IS NULL OR p_adjustment_type NOT IN ('award', 'revoke') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ADJUSTMENT_TYPE', 'message', 'Adjustment type must be award or revoke.');
    END IF;

    IF p_points_delta IS NULL OR p_points_delta <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_POINTS_DELTA', 'message', 'Points delta must be a positive integer.');
    END IF;

    v_idempotency_key := NULLIF(TRIM(p_idempotency_key), '');

    -- 2. VERIFY CONTEST EXISTS AND IS ACTIVE IN TARGET ENVIRONMENT (Zero writes performed)
    SELECT id, status, environment INTO v_contest
    FROM public.contests
    WHERE id = p_contest_id AND environment = p_environment;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'CONTEST_NOT_FOUND', 'message', 'Contest not found in the specified environment.');
    END IF;

    IF v_contest.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'code', 'CONTEST_NOT_ACTIVE', 'message', format('Contest status is %s (must be active).', v_contest.status));
    END IF;

    -- 3. VERIFY INFLUENCER EXISTS (Zero writes performed)
    PERFORM 1 FROM public.influencers WHERE influencer_id = p_influencer_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INFLUENCER_NOT_FOUND', 'message', 'Influencer does not exist.');
    END IF;

    -- 4. ACQUIRE DETERMINISTIC TRANSACTION ADVISORY LOCKS IN CONSISTENT ORDER
    -- All requests acquire locks in the exact same order to avoid deadlocks:
    -- Lock 1: Entity Lock (contest_score:<environment>:<contest_id>:<influencer_id>)
    -- Lock 2: Global Idempotency Key Lock (idempotency:<idempotency_key>)

    -- Lock 1: Entity Lock
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'contest_score:' || p_environment || ':' || p_contest_id || ':' || p_influencer_id::text,
            0
        )
    );

    -- Lock 2: Global Idempotency Key Lock (if explicitly supplied)
    -- Acquired before looking up or inserting an explicitly supplied idempotency key
    IF v_idempotency_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended(
                'idempotency:' || v_idempotency_key,
                0
            )
        );

        -- 5. IDEMPOTENCY KEY VALIDATION (Inside both Entity & Idempotency Locks)
        SELECT * INTO v_existing_by_key
        FROM public.contest_score_adjustments
        WHERE idempotency_key = v_idempotency_key;

        IF FOUND THEN
            -- Check if all incoming request parameters match the previously recorded key
            IF v_existing_by_key.contest_id != p_contest_id
               OR v_existing_by_key.influencer_id != p_influencer_id
               OR v_existing_by_key.environment != p_environment
               OR COALESCE(v_existing_by_key.content_id, '') != COALESCE(v_clean_content_id, '')
               OR v_existing_by_key.adjustment_type != p_adjustment_type
               OR v_existing_by_key.points_delta != p_points_delta THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'IDEMPOTENCY_KEY_CONFLICT',
                    'message', 'The provided idempotency key has already been used with different request parameters.',
                    'idempotency_key', v_idempotency_key
                );
            END IF;

            -- Identical retry: fetch current score if it exists (or fallback to recorded delta)
            SELECT points INTO v_current_points
            FROM public.contest_scores
            WHERE contest_id = p_contest_id
              AND influencer_id = p_influencer_id
              AND environment = p_environment;

            -- Return previously committed result
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'action', v_existing_by_key.adjustment_type,
                'message', 'Adjustment already recorded previously.',
                'points_delta', v_existing_by_key.points_delta,
                'current_points', COALESCE(v_current_points, v_existing_by_key.points_delta),
                'approval_cycle', v_existing_by_key.approval_cycle,
                'ledger_id', v_existing_by_key.id,
                'idempotency_key', v_existing_by_key.idempotency_key
            );
        END IF;
    END IF;

    -- 6. READ EXISTING SCORE (DO NOT INSERT ZERO-POINT ROW ON READ)
    SELECT * INTO v_score
    FROM public.contest_scores
    WHERE contest_id = p_contest_id
      AND influencer_id = p_influencer_id
      AND environment = p_environment;

    IF FOUND THEN
        v_current_points := v_score.points;
    ELSE
        v_current_points := 0;
    END IF;

    -- 7. CONTENT LIFECYCLE, PRIOR AWARD, REVOCATION AMOUNT, AND SCORE CONSTRAINTS
    IF v_clean_content_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_award_count
        FROM public.contest_score_adjustments
        WHERE contest_id = p_contest_id
          AND influencer_id = p_influencer_id
          AND environment = p_environment
          AND content_id = v_clean_content_id
          AND adjustment_type = 'award';

        SELECT COUNT(*) INTO v_revoke_count
        FROM public.contest_score_adjustments
        WHERE contest_id = p_contest_id
          AND influencer_id = p_influencer_id
          AND environment = p_environment
          AND content_id = v_clean_content_id
          AND adjustment_type = 'revoke';

        IF p_adjustment_type = 'award' THEN
            -- Check if content is already currently awarded
            IF v_award_count > v_revoke_count THEN
                -- Check if this is an idempotent duplicate award retry for the active cycle
                SELECT * INTO v_latest_award
                FROM public.contest_score_adjustments
                WHERE contest_id = p_contest_id
                  AND influencer_id = p_influencer_id
                  AND environment = p_environment
                  AND content_id = v_clean_content_id
                  AND adjustment_type = 'award'
                  AND approval_cycle = v_award_count;

                IF FOUND AND v_latest_award.points_delta = p_points_delta THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'idempotent', true,
                        'action', 'award',
                        'message', 'Points have already been awarded for this content in the current cycle.',
                        'points_delta', v_latest_award.points_delta,
                        'current_points', v_current_points,
                        'approval_cycle', v_latest_award.approval_cycle,
                        'ledger_id', v_latest_award.id,
                        'idempotency_key', v_latest_award.idempotency_key
                    );
                END IF;

                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'CONTENT_ALREADY_AWARDED',
                    'message', 'Points have already been awarded for this content submission.'
                );
            END IF;
            -- Legitimate award or reapproval (new cycle)
            v_target_cycle := v_award_count + 1;
            v_new_points := v_current_points + p_points_delta;
        ELSIF p_adjustment_type = 'revoke' THEN
            -- Verify prior award exists
            IF v_award_count = 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'NO_PRIOR_AWARD',
                    'message', 'Cannot revoke points for content that was never awarded points.'
                );
            END IF;

            -- Check if already revoked
            IF v_award_count <= v_revoke_count THEN
                -- Check if this is an idempotent duplicate revocation retry for the latest cycle
                SELECT * INTO v_latest_revoke
                FROM public.contest_score_adjustments
                WHERE contest_id = p_contest_id
                  AND influencer_id = p_influencer_id
                  AND environment = p_environment
                  AND content_id = v_clean_content_id
                  AND adjustment_type = 'revoke'
                  AND approval_cycle = v_revoke_count;

                IF FOUND AND v_latest_revoke.points_delta = p_points_delta THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'idempotent', true,
                        'action', 'revoke',
                        'message', 'Points for this content have already been revoked in the current cycle.',
                        'points_delta', v_latest_revoke.points_delta,
                        'current_points', v_current_points,
                        'approval_cycle', v_latest_revoke.approval_cycle,
                        'ledger_id', v_latest_revoke.id,
                        'idempotency_key', v_latest_revoke.idempotency_key
                    );
                END IF;

                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'ALREADY_REVOKED',
                    'message', 'Points for this content have already been revoked.'
                );
            END IF;

            -- Find the matching active award record for this cycle
            SELECT * INTO v_latest_award
            FROM public.contest_score_adjustments
            WHERE contest_id = p_contest_id
              AND influencer_id = p_influencer_id
              AND environment = p_environment
              AND content_id = v_clean_content_id
              AND adjustment_type = 'award'
              AND approval_cycle = v_award_count;

            -- Require revocation amount to match original award amount exactly
            IF v_latest_award.points_delta != p_points_delta THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'REVOCATION_AMOUNT_MISMATCH',
                    'message', format('Revocation points delta (%s) must match original award points delta (%s).', p_points_delta, v_latest_award.points_delta),
                    'expected_points_delta', v_latest_award.points_delta,
                    'requested_points_delta', p_points_delta
                );
            END IF;

            -- Prevent negative scores
            IF v_current_points < p_points_delta THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'EXCESSIVE_REVOCATION',
                    'message', format('Cannot deduct %s points from current score of %s points.', p_points_delta, v_current_points),
                    'current_points', v_current_points,
                    'requested_deduction', p_points_delta
                );
            END IF;

            v_target_cycle := v_award_count;
            v_new_points := v_current_points - p_points_delta;
        END IF;
    ELSE
        -- Manual / Non-content adjustments
        IF p_adjustment_type = 'revoke' THEN
            IF v_current_points < p_points_delta THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'EXCESSIVE_REVOCATION',
                    'message', format('Cannot deduct %s points from current score of %s points.', p_points_delta, v_current_points),
                    'current_points', v_current_points,
                    'requested_deduction', p_points_delta
                );
            END IF;
            v_new_points := v_current_points - p_points_delta;
        ELSE
            v_new_points := v_current_points + p_points_delta;
        END IF;
    END IF;

    -- Formulate unique idempotency key if omitted by caller (stable non-timestamp fallback for manual adjustments)
    IF v_idempotency_key IS NULL THEN
        v_idempotency_key := p_adjustment_type || ':' || p_contest_id || ':' || p_influencer_id::text || ':' || p_environment || ':' || COALESCE(v_clean_content_id || ':c' || v_target_cycle::text, 'manual:' || COALESCE(v_clean_reason, 'default'));

        -- For generated keys, acquire the idempotency lock after deriving the key but before any writes
        PERFORM pg_advisory_xact_lock(
            hashtextextended(
                'idempotency:' || v_idempotency_key,
                0
            )
        );

        -- Perform a final idempotency lookup on the generated key
        SELECT * INTO v_existing_by_key
        FROM public.contest_score_adjustments
        WHERE idempotency_key = v_idempotency_key;

        IF FOUND THEN
            IF v_existing_by_key.contest_id != p_contest_id
               OR v_existing_by_key.influencer_id != p_influencer_id
               OR v_existing_by_key.environment != p_environment
               OR COALESCE(v_existing_by_key.content_id, '') != COALESCE(v_clean_content_id, '')
               OR v_existing_by_key.adjustment_type != p_adjustment_type
               OR v_existing_by_key.points_delta != p_points_delta THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'IDEMPOTENCY_KEY_CONFLICT',
                    'message', 'The derived idempotency key has already been used with different request parameters.',
                    'idempotency_key', v_idempotency_key
                );
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'action', v_existing_by_key.adjustment_type,
                'message', 'Adjustment already recorded previously.',
                'points_delta', v_existing_by_key.points_delta,
                'current_points', v_current_points,
                'approval_cycle', v_existing_by_key.approval_cycle,
                'ledger_id', v_existing_by_key.id,
                'idempotency_key', v_existing_by_key.idempotency_key
            );
        END IF;
    END IF;

    -- 8. ATOMIC COMMITS AS ONE UNIT (ONLY REACHED AFTER ALL VALIDATIONS SUCCEED)
    -- Participant insertion, score upsert, and ledger insertion are executed
    -- inside ONE PL/pgSQL subtransaction exception-protected block.
    -- In PostgreSQL, an unexpected unique_violation automatically rolls back
    -- all three writes, leaving zero dirty rows behind.
    BEGIN
        -- Step A: Enroll participant if not already enrolled
        INSERT INTO public.contest_participants (
            contest_id,
            influencer_id,
            environment,
            joined_at,
            status,
            metadata
        ) VALUES (
            p_contest_id,
            p_influencer_id,
            p_environment,
            v_now,
            'active',
            '{}'::jsonb
        )
        ON CONFLICT (contest_id, influencer_id, environment) DO NOTHING;

        -- Step B: Upsert score record atomically
        INSERT INTO public.contest_scores (
            contest_id,
            influencer_id,
            environment,
            points,
            last_activity_at,
            metadata,
            created_at,
            updated_at
        ) VALUES (
            p_contest_id,
            p_influencer_id,
            p_environment,
            v_new_points,
            v_now,
            '{}'::jsonb,
            v_now,
            v_now
        )
        ON CONFLICT (contest_id, influencer_id, environment)
        DO UPDATE SET
            points = v_new_points,
            last_activity_at = v_now,
            updated_at = v_now
        RETURNING id INTO v_score_id;

        -- Step C: Insert ledger record
        INSERT INTO public.contest_score_adjustments (
            contest_id,
            influencer_id,
            environment,
            content_id,
            adjustment_type,
            points_delta,
            approval_cycle,
            reason,
            created_at,
            idempotency_key
        ) VALUES (
            p_contest_id,
            p_influencer_id,
            p_environment,
            v_clean_content_id,
            p_adjustment_type,
            p_points_delta,
            v_target_cycle,
            v_clean_reason,
            v_now,
            v_idempotency_key
        )
        RETURNING id INTO v_adj_id;

    EXCEPTION
        WHEN unique_violation THEN
            -- In PostgreSQL, catching unique_violation rolls back all statements
            -- executed inside this BEGIN...EXCEPTION block (Steps A, B, and C).
            -- Neither contest_participants nor contest_scores modifications persist.
            GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

            -- Case 1: Explicitly identify content cycle duplication
            IF v_constraint_name = 'uq_contest_ledger_content_cycle' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'CONTENT_CYCLE_CONFLICT',
                    'message', 'Points have already been adjusted for this content in the current approval cycle.',
                    'constraint', v_constraint_name
                );
            END IF;

            -- Case 2: Explicitly handle idempotency key uniqueness
            IF v_constraint_name = 'uq_contest_ledger_idempotency' THEN
                SELECT * INTO v_existing_by_key
                FROM public.contest_score_adjustments
                WHERE idempotency_key = v_idempotency_key;

                IF FOUND THEN
                    IF v_existing_by_key.contest_id != p_contest_id
                       OR v_existing_by_key.influencer_id != p_influencer_id
                       OR v_existing_by_key.environment != p_environment
                       OR COALESCE(v_existing_by_key.content_id, '') != COALESCE(v_clean_content_id, '')
                       OR v_existing_by_key.adjustment_type != p_adjustment_type
                       OR v_existing_by_key.points_delta != p_points_delta THEN
                        RETURN jsonb_build_object(
                            'success', false,
                            'code', 'IDEMPOTENCY_KEY_CONFLICT',
                            'message', 'The provided idempotency key has already been used with different request parameters.',
                            'idempotency_key', v_idempotency_key,
                            'constraint', v_constraint_name
                        );
                    ELSE
                        SELECT points INTO v_current_points
                        FROM public.contest_scores
                        WHERE contest_id = p_contest_id
                          AND influencer_id = p_influencer_id
                          AND environment = p_environment;

                        RETURN jsonb_build_object(
                            'success', true,
                            'idempotent', true,
                            'action', v_existing_by_key.adjustment_type,
                            'message', 'Adjustment already recorded previously.',
                            'points_delta', v_existing_by_key.points_delta,
                            'current_points', COALESCE(v_current_points, v_existing_by_key.points_delta),
                            'approval_cycle', v_existing_by_key.approval_cycle,
                            'ledger_id', v_existing_by_key.id,
                            'idempotency_key', v_existing_by_key.idempotency_key
                        );
                    END IF;
                ELSE
                    RETURN jsonb_build_object(
                        'success', false,
                        'code', 'IDEMPOTENCY_KEY_CONFLICT',
                        'message', 'A concurrent request with the same idempotency key caused a conflict.',
                        'idempotency_key', v_idempotency_key,
                        'constraint', v_constraint_name
                    );
                END IF;
            END IF;

            -- Case 3: Any other unknown unique constraint (safely fail closed without mislabelling)
            RETURN jsonb_build_object(
                'success', false,
                'code', 'DATABASE_UNIQUE_CONFLICT',
                'message', 'A database unique constraint conflict occurred.',
                'constraint', COALESCE(v_constraint_name, 'unknown')
            );
    END;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'action', p_adjustment_type,
        'ledger_id', v_adj_id,
        'score_id', v_score_id,
        'previous_points', v_current_points,
        'new_points', v_new_points,
        'points_delta', p_points_delta,
        'approval_cycle', v_target_cycle,
        'contest_id', p_contest_id,
        'influencer_id', p_influencer_id,
        'environment', p_environment,
        'idempotency_key', v_idempotency_key
    );
END;
$$;

-- Revoke execution from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.adjust_contest_score(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant execution exclusively to service_role (Node server-side client only)
GRANT EXECUTE ON FUNCTION public.adjust_contest_score(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO service_role;
