-- ==============================================================================
-- WISHRITE CREATOR CLUB — DATABASE SCHEMA & RLS MIGRATION CONTINUATION
-- File: supabase/migrations/creator_fix_tables_continuation.sql
-- 
-- 🚨 CRITICAL MIGRATION SAFETY NOTICE:
-- This continuation script resumes migration from the point where the initial
-- run completed. It is NON-DESTRUCTIVE and IDEMPOTENT:
--   - Uses ADD COLUMN IF NOT EXISTS
--   - Uses CREATE TABLE IF NOT EXISTS
--   - Uses CREATE INDEX IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS
--   - Excludes already-created wallet tables and wallet indexes
--   - Applies RPC privileges using the exact function signature
--   - Does NOT drop tables, columns, or modify existing production data.
-- ==============================================================================

-- 1. EXTEND public.influencers TABLE (Add only missing Creator profile columns)
ALTER TABLE public.influencers
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS profile_image TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Jewellery styling',
    ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'starter',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS public_slug TEXT,
    ADD COLUMN IF NOT EXISTS public_profile_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url TEXT,
    ADD COLUMN IF NOT EXISTS youtube_url TEXT,
    ADD COLUMN IF NOT EXISTS facebook_url TEXT,
    ADD COLUMN IF NOT EXISTS other_url TEXT,
    ADD COLUMN IF NOT EXISTS content_preferences JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS instagram_connection JSONB DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_influencers_public_slug
    ON public.influencers (public_slug)
    WHERE public_slug IS NOT NULL;

-- 2. CREATE MISSING TABLE: public.creator_content
CREATE TABLE IF NOT EXISTS public.creator_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    customer_id UUID,
    creator_name TEXT,
    creator_email TEXT,
    content_type TEXT CHECK (content_type IN ('post', 'reel', 'story', 'video')),
    platform TEXT NOT NULL DEFAULT 'instagram',
    url TEXT NOT NULL,
    caption TEXT,
    product_category TEXT,
    product_code TEXT,
    product_name TEXT,
    product_image TEXT,
    thumbnail_url TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Approved', 'Rejected', 'Draft')),
    rejection_reason TEXT,
    views INT NOT NULL DEFAULT 0,
    views_count INT,
    likes_count INT,
    comments_count INT,
    shares_count INT,
    instagram_media_id TEXT,
    instagram_media_type TEXT,
    instagram_account_id TEXT,
    instagram_permalink TEXT,
    last_synced_at TIMESTAMPTZ,
    insights_status TEXT DEFAULT 'not_connected',
    insights_error TEXT,
    clicks INT NOT NULL DEFAULT 0,
    orders INT NOT NULL DEFAULT 0,
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_content_influencer_id
    ON public.creator_content (influencer_id, created_at DESC);

-- 3. CREATE MISSING TABLE: public.influencer_links
CREATE TABLE IF NOT EXISTS public.influencer_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    link_type TEXT NOT NULL DEFAULT 'storefront',
    url TEXT NOT NULL,
    campaign_id TEXT DEFAULT 'default',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencer_links_influencer
    ON public.influencer_links (influencer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_influencer_links_unique_default
    ON public.influencer_links (influencer_id)
    WHERE is_default = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_influencer_links_unique_url
    ON public.influencer_links (influencer_id, url);

-- 4. CREATE MISSING TABLE: public.influencer_stats
CREATE TABLE IF NOT EXISTS public.influencer_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    influencer_id UUID NOT NULL UNIQUE REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    total_clicks INT NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_views INT NOT NULL DEFAULT 0,
    total_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    available_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pending_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_points INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencer_stats_influencer
    ON public.influencer_stats (influencer_id);

-- 5. APPLY CORRECTED WALLET RPC PRIVILEGES (Exact argument signature)
REVOKE EXECUTE ON FUNCTION public.deduct_influencer_wallet_balance(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_influencer_wallet_balance(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_influencer_wallet_balance(uuid, numeric) TO service_role;

-- 6. HELPER FUNCTION FOR CREATOR RLS RESOLUTION
CREATE OR REPLACE FUNCTION public.get_current_user_influencer_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT influencer_id
    FROM public.influencer_accounts
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_influencer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_influencer_id() TO authenticated, service_role;

-- 7. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_stats ENABLE ROW LEVEL SECURITY;

-- 8. ROW LEVEL SECURITY POLICIES

-- RLS: influencer_accounts
DROP POLICY IF EXISTS influencer_accounts_select_own ON public.influencer_accounts;
CREATE POLICY influencer_accounts_select_own
    ON public.influencer_accounts
    FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS influencer_accounts_insert_own ON public.influencer_accounts;
CREATE POLICY influencer_accounts_insert_own
    ON public.influencer_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS influencer_accounts_update_own ON public.influencer_accounts;
CREATE POLICY influencer_accounts_update_own
    ON public.influencer_accounts
    FOR UPDATE
    TO authenticated
    USING (auth_user_id = auth.uid());

-- RLS: influencers
DROP POLICY IF EXISTS influencers_select_own ON public.influencers;
CREATE POLICY influencers_select_own
    ON public.influencers
    FOR SELECT
    TO authenticated
    USING (
        influencer_id = public.get_current_user_influencer_id()
        OR influencer_id = auth.uid()
    );

DROP POLICY IF EXISTS influencers_insert_own ON public.influencers;
CREATE POLICY influencers_insert_own
    ON public.influencers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        influencer_id = auth.uid()
        OR influencer_id = public.get_current_user_influencer_id()
    );

DROP POLICY IF EXISTS influencers_update_own ON public.influencers;
CREATE POLICY influencers_update_own
    ON public.influencers
    FOR UPDATE
    TO authenticated
    USING (
        influencer_id = public.get_current_user_influencer_id()
        OR influencer_id = auth.uid()
    );

-- RLS: influencer_wallets
DROP POLICY IF EXISTS influencer_wallets_select_own ON public.influencer_wallets;
CREATE POLICY influencer_wallets_select_own
    ON public.influencer_wallets
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- RLS: influencer_wallet_transactions
DROP POLICY IF EXISTS influencer_wallet_transactions_select_own ON public.influencer_wallet_transactions;
CREATE POLICY influencer_wallet_transactions_select_own
    ON public.influencer_wallet_transactions
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- RLS: creator_content
DROP POLICY IF EXISTS creator_content_select_own ON public.creator_content;
CREATE POLICY creator_content_select_own
    ON public.creator_content
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS creator_content_insert_own ON public.creator_content;
CREATE POLICY creator_content_insert_own
    ON public.creator_content
    FOR INSERT
    TO authenticated
    WITH CHECK (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS creator_content_update_own ON public.creator_content;
CREATE POLICY creator_content_update_own
    ON public.creator_content
    FOR UPDATE
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS creator_content_delete_own ON public.creator_content;
CREATE POLICY creator_content_delete_own
    ON public.creator_content
    FOR DELETE
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- RLS: influencer_links
DROP POLICY IF EXISTS influencer_links_select_own ON public.influencer_links;
CREATE POLICY influencer_links_select_own
    ON public.influencer_links
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS influencer_links_insert_own ON public.influencer_links;
CREATE POLICY influencer_links_insert_own
    ON public.influencer_links
    FOR INSERT
    TO authenticated
    WITH CHECK (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS influencer_links_update_own ON public.influencer_links;
CREATE POLICY influencer_links_update_own
    ON public.influencer_links
    FOR UPDATE
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

DROP POLICY IF EXISTS influencer_links_delete_own ON public.influencer_links;
CREATE POLICY influencer_links_delete_own
    ON public.influencer_links
    FOR DELETE
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- RLS: influencer_stats
DROP POLICY IF EXISTS influencer_stats_select_own ON public.influencer_stats;
CREATE POLICY influencer_stats_select_own
    ON public.influencer_stats
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- 9. PERMISSIONS GRANT
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
