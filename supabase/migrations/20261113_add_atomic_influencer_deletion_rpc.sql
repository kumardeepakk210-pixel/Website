-- ============================================================================
-- Migration: 20261113_add_atomic_influencer_deletion_rpc.sql
-- Description: Creates atomic PostgreSQL RPC delete_influencer_atomic() for
--              all-or-nothing cascading deletion of influencer records across
--              child tables (creator_content, influencer_links, influencer_stats,
--              influencer_wallets, influencer_accounts, contest_scores,
--              contest_participants, contest_score_adjustments,
--              influencer_order_attributions) and public.influencers within
--              a single transactional boundary.
-- Target: WishRite Influencer Platform (Supabase PostgreSQL)
-- Status: PREPARED FOR REVIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_influencer_atomic(
    p_influencer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_id UUID;
    v_deleted_counts JSONB := '{}'::jsonb;
    v_count INTEGER;
BEGIN
    -- 1. Validate parameter
    IF p_influencer_id IS NULL THEN
        RAISE EXCEPTION 'Target influencer_id cannot be null' USING ERRCODE = '22004';
    END IF;

    -- 2. Verify target influencer exists (lock for deletion)
    SELECT influencer_id
    INTO v_target_id
    FROM public.influencers
    WHERE influencer_id = p_influencer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'message', 'Influencer not found with specified influencer_id',
            'influencer_id', p_influencer_id
        );
    END IF;

    -- 3. Transactional cascading deletions across all child tables
    -- A. creator_content
    DELETE FROM public.creator_content
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{creator_content}', to_jsonb(v_count));

    -- B. influencer_links
    DELETE FROM public.influencer_links
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{influencer_links}', to_jsonb(v_count));

    -- C. influencer_stats
    DELETE FROM public.influencer_stats
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{influencer_stats}', to_jsonb(v_count));

    -- D. influencer_wallets
    DELETE FROM public.influencer_wallets
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{influencer_wallets}', to_jsonb(v_count));

    -- E. influencer_accounts
    DELETE FROM public.influencer_accounts
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{influencer_accounts}', to_jsonb(v_count));

    -- F. contest_scores (if present)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contest_scores') THEN
        DELETE FROM public.contest_scores WHERE influencer_id = p_influencer_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted_counts := jsonb_set(v_deleted_counts, '{contest_scores}', to_jsonb(v_count));
    END IF;

    -- G. contest_participants (if present)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contest_participants') THEN
        DELETE FROM public.contest_participants WHERE influencer_id = p_influencer_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted_counts := jsonb_set(v_deleted_counts, '{contest_participants}', to_jsonb(v_count));
    END IF;

    -- H. contest_score_adjustments (if present)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contest_score_adjustments') THEN
        DELETE FROM public.contest_score_adjustments WHERE influencer_id = p_influencer_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted_counts := jsonb_set(v_deleted_counts, '{contest_score_adjustments}', to_jsonb(v_count));
    END IF;

    -- I. influencer_order_attributions (if present)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'influencer_order_attributions') THEN
        DELETE FROM public.influencer_order_attributions WHERE influencer_id = p_influencer_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_deleted_counts := jsonb_set(v_deleted_counts, '{influencer_order_attributions}', to_jsonb(v_count));
    END IF;

    -- 4. Delete parent influencer record
    DELETE FROM public.influencers
    WHERE influencer_id = p_influencer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := jsonb_set(v_deleted_counts, '{influencers}', to_jsonb(v_count));

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Parent influencer record could not be deleted' USING ERRCODE = 'P0001';
    END IF;

    -- 5. Return success payload
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Influencer and all associated child records deleted atomically.',
        'influencer_id', p_influencer_id,
        'deleted_counts', v_deleted_counts
    );
EXCEPTION
    WHEN OTHERS THEN
        -- PostgreSQL PL/pgSQL automatically rolls back the entire transaction when an unhandled exception is re-raised
        RAISE EXCEPTION 'Atomic influencer deletion failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- Revoke execute from PUBLIC and anon; grant exclusively to service_role and authenticated administrators
REVOKE ALL ON FUNCTION public.delete_influencer_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_influencer_atomic(UUID) TO service_role;
