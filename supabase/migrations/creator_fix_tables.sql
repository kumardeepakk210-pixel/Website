-- ==============================================================================
-- WISHRITE CREATOR CLUB — DATABASE SCHEMA & RLS ALIGNMENT MIGRATION
-- File: supabase/migrations/creator_fix_tables.sql
-- 
-- 🚨 CRITICAL MIGRATION SAFETY NOTICE:
-- This SQL file is generated for reference and MANUAL review/execution.
-- It is NON-DESTRUCTIVE:
--   - Uses ADD COLUMN IF NOT EXISTS
--   - Uses CREATE TABLE IF NOT EXISTS
--   - Uses CREATE INDEX IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS
--   - Does NOT drop tables, columns, or truncate existing data.
-- ==============================================================================

-- 1. EXTEND public.influencers TABLE (Non-destructive)
-- Ensure all application metadata columns exist on public.influencers
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

-- 2. ENSURE public.influencer_accounts CONSTRAINTS & INDEXES
CREATE INDEX IF NOT EXISTS idx_influencer_accounts_auth_user_id
    ON public.influencer_accounts (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_accounts_influencer_id
    ON public.influencer_accounts (influencer_id);

-- Enforce unique auth_user_id (1 Supabase Auth user = exactly 1 Creator Account)
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencer_accounts_unique_auth_user
    ON public.influencer_accounts (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

-- 3. ENSURE public.influencer_wallets CONSTRAINTS & INDEXES
-- Enforce exactly one wallet per creator at the database level
CREATE INDEX IF NOT EXISTS idx_influencer_wallets_influencer_id
    ON public.influencer_wallets (influencer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_influencer_wallets_unique_influencer
    ON public.influencer_wallets (influencer_id);

-- 4. ENSURE public.influencer_wallet_transactions CONSTRAINTS & INDEXES
CREATE INDEX IF NOT EXISTS idx_influencer_wallet_transactions_influencer
    ON public.influencer_wallet_transactions (influencer_id, created_at DESC);

-- Enforce transaction idempotency: prevent duplicate transactions for the same reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_influencer_wallet_tx_idempotency
    ON public.influencer_wallet_transactions (influencer_id, reference_type, reference_id, transaction_type)
    WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL;

-- 5. CREATE public.creator_content TABLE
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

-- 6. CREATE public.influencer_links TABLE
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

-- 7. CREATE public.influencer_stats TABLE
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

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. ATOMIC STORED PROCEDURE: deduct_influencer_wallet_balance
-- Concurrency-safe, row-locking (FOR UPDATE), overdraft-protected, idempotent
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_influencer_wallet_balance(
    p_influencer_id UUID DEFAULT NULL,
    p_amount NUMERIC DEFAULT 0,
    p_reference_type TEXT DEFAULT 'withdrawal',
    p_reference_id TEXT DEFAULT NULL,
    p_description TEXT DEFAULT 'Wallet balance deduction',
    p_wallet_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_target_id UUID := COALESCE(p_influencer_id, p_wallet_id);
    v_wallet RECORD;
    v_new_balance NUMERIC;
    v_existing_tx RECORD;
    v_tx_id UUID;
    v_clean_ref TEXT := NULLIF(TRIM(p_reference_id), '');
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Input Validation
    IF v_target_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_INFLUENCER',
            'message', 'Influencer ID or Wallet ID is required.'
        );
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_AMOUNT',
            'message', 'Deduction amount must be greater than zero.'
        );
    END IF;

    -- 2. Concurrency-safe Row Lock (SELECT ... FOR UPDATE)
    SELECT * INTO v_wallet
    FROM public.influencer_wallets
    WHERE influencer_id = v_target_id OR id = v_target_id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'WALLET_NOT_FOUND',
            'message', 'Influencer wallet does not exist.'
        );
    END IF;

    -- 3. Idempotency Check: if reference exists, check if already debited
    IF v_clean_ref IS NOT NULL AND p_reference_type IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.influencer_wallet_transactions
        WHERE influencer_id = v_wallet.influencer_id
          AND reference_type = p_reference_type
          AND reference_id = v_clean_ref
          AND transaction_type = 'debit'
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'code', 'ALREADY_PROCESSED',
                'message', 'Transaction already processed for this reference.',
                'transaction_id', v_existing_tx.id,
                'wallet', jsonb_build_object(
                    'id', v_wallet.id,
                    'influencer_id', v_wallet.influencer_id,
                    'available_balance', v_wallet.available_balance,
                    'pending_balance', v_wallet.pending_balance,
                    'paid_balance', v_wallet.paid_balance,
                    'lifetime_earned', v_wallet.lifetime_earned,
                    'lifetime_paid', v_wallet.lifetime_paid,
                    'currency', v_wallet.currency
                )
            );
        END IF;
    END IF;

    -- 4. Negative-Balance Protection (Overdraft prevention)
    IF v_wallet.available_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INSUFFICIENT_BALANCE',
            'message', 'Insufficient available balance.',
            'available_balance', v_wallet.available_balance,
            'requested_amount', p_amount
        );
    END IF;

    v_new_balance := ROUND(v_wallet.available_balance - p_amount, 2);

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OVERDRAFT_PREVENTED',
            'message', 'Deduction would result in a negative balance.'
        );
    END IF;

    -- 5. Atomic State Update (Wallet + Transaction inside same transaction context)
    UPDATE public.influencer_wallets
    SET available_balance = v_new_balance,
        updated_at = v_now
    WHERE id = v_wallet.id;

    v_tx_id := gen_random_uuid();

    INSERT INTO public.influencer_wallet_transactions (
        id,
        influencer_id,
        wallet_id,
        amount,
        currency,
        transaction_type,
        direction,
        status,
        description,
        reference_id,
        reference_type,
        metadata,
        created_at
    ) VALUES (
        v_tx_id,
        v_wallet.influencer_id,
        v_wallet.id,
        p_amount,
        COALESCE(v_wallet.currency, 'INR'),
        'debit',
        'debit',
        'completed',
        COALESCE(p_description, 'Wallet balance deduction'),
        v_clean_ref,
        p_reference_type,
        jsonb_build_object('previous_balance', v_wallet.available_balance, 'new_balance', v_new_balance),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'transaction_id', v_tx_id,
        'wallet', jsonb_build_object(
            'id', v_wallet.id,
            'influencer_id', v_wallet.influencer_id,
            'available_balance', v_new_balance,
            'pending_balance', v_wallet.pending_balance,
            'paid_balance', v_wallet.paid_balance,
            'lifetime_earned', v_wallet.lifetime_earned,
            'lifetime_paid', v_wallet.lifetime_paid,
            'currency', v_wallet.currency,
            'updated_at', v_now
        )
    );
END;
$$;

-- Secure execution: Revoke untrusted public access, restrict to service_role
REVOKE ALL ON FUNCTION public.deduct_influencer_wallet_balance FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_influencer_wallet_balance FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_influencer_wallet_balance TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensure Creators can only access their own data via auth.uid()
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_stats ENABLE ROW LEVEL SECURITY;

-- Helper security definer function to resolve current user's influencer_id
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

-- Grant essential permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
