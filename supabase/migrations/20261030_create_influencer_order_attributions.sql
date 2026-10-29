-- ==============================================================================
-- WISHRITE CREATOR CLUB — INFLUENCER ORDER ATTRIBUTIONS TABLE & SECURITY
-- Migration: Create public.influencer_order_attributions with RLS & idempotency
-- ==============================================================================

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.influencer_order_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_reference TEXT NOT NULL,
    attribution_id TEXT,
    influencer_link_id UUID REFERENCES public.influencer_links(id) ON DELETE SET NULL,
    sales_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. INDEXES & CONSTRAINTS
-- Idempotency: guarantees an order reference can only be attributed once
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_attributions_unique_order_ref
    ON public.influencer_order_attributions (order_reference);

CREATE INDEX IF NOT EXISTS idx_order_attributions_influencer_id
    ON public.influencer_order_attributions (influencer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_attributions_status
    ON public.influencer_order_attributions (status);

-- 3. ROW LEVEL SECURITY
ALTER TABLE public.influencer_order_attributions ENABLE ROW LEVEL SECURITY;

-- Block all anonymous/public access
REVOKE ALL ON public.influencer_order_attributions FROM anon, public;

-- Creators can view only their own order attributions
DROP POLICY IF EXISTS influencer_order_attributions_select_own ON public.influencer_order_attributions;
CREATE POLICY influencer_order_attributions_select_own
    ON public.influencer_order_attributions
    FOR SELECT
    TO authenticated
    USING (influencer_id = public.get_current_user_influencer_id());

-- Grant server-side administrative access
GRANT ALL ON public.influencer_order_attributions TO service_role;
GRANT SELECT ON public.influencer_order_attributions TO authenticated;
