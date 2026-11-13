-- ============================================================================
-- Seed: 20261113_seed_staging_contest.sql
-- Description: Inserts exactly ONE staging-only contest record for demo verification.
-- Safety Rule: Strict insert-only. Aborts with error if record already exists.
-- Target: WishRite Supabase (Shared Project: ptpuepejciqiktmcpuon)
-- Environment: 'staging' (Strictly isolated from production)
-- Status: PREPARED FOR GATE 3 REVIEW (DO NOT EXECUTE UNTIL EXPLICITLY APPROVED)
-- ============================================================================

DO $$
BEGIN
    -- Check if staging contest record already exists
    IF EXISTS (
        SELECT 1
        FROM public.contests
        WHERE id = 'contest-festive-2026'
          AND environment = 'staging'
    ) THEN
        RAISE EXCEPTION 'CONFLICT: Contest (contest-festive-2026, staging) already exists. Aborting seed to prevent accidental overwrite.';
    END IF;

    -- Strict Insert-Only (No automatic overwrite)
    INSERT INTO public.contests (
        id,
        environment,
        name,
        description,
        start_date,
        end_date,
        status,
        requires_reels,
        scoring_rules,
        created_at,
        updated_at
    ) VALUES (
        'contest-festive-2026',
        'staging',
        'Festive Sparkle Creator Challenge 2026 (Staging)',
        'Create standout posts and reels featuring WishRite pure 925 sterling silver jewellery and inspire style lovers across India.',
        '2026-10-15 00:00:00+00',
        '2026-11-26 23:59:59+00',
        'active',
        true,
        '{
            "post_points": 50,
            "reel_points": 100,
            "order_points_multiplier": 10,
            "click_points_multiplier": 1
        }'::jsonb,
        NOW(),
        NOW()
    );

    RAISE NOTICE 'SUCCESS: Seeded staging contest (contest-festive-2026, staging).';
END $$;
