-- ==============================================================================
-- WISHRITE — COUPONS & DISCOUNT MANAGEMENT SYSTEM MIGRATION
-- Tables: public.coupons, public.coupon_usages
-- Extended Columns: public.orders
-- ==============================================================================

-- 1. Create coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    scope VARCHAR(30) NOT NULL DEFAULT 'all' CHECK (scope IN ('jewellery', 'occasion', 'all', 'category', 'product', 'collection')),
    occasion_slug VARCHAR(50),
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping')),
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
    minimum_order_value NUMERIC(10, 2) DEFAULT 0 CHECK (minimum_order_value >= 0),
    maximum_discount NUMERIC(10, 2) CHECK (maximum_discount IS NULL OR maximum_discount >= 0),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
    first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
    stackable BOOLEAN NOT NULL DEFAULT FALSE,
    eligible_categories TEXT[],
    eligible_product_codes TEXT[],
    eligible_collection TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast coupon lookup and validation
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_upper ON public.coupons (UPPER(TRIM(code)));
CREATE INDEX IF NOT EXISTS idx_coupons_active_scope ON public.coupons (is_active, scope);
CREATE INDEX IF NOT EXISTS idx_coupons_occasion ON public.coupons (occasion_slug);
CREATE INDEX IF NOT EXISTS idx_coupons_validity ON public.coupons (start_date, end_date);

-- 2. Create coupon_usages table for fraud prevention, customer limits & analytics
CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE,
    customer_id TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    order_id TEXT,
    coupon_code VARCHAR(50) NOT NULL,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_id ON public.coupon_usages (coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_customer_phone ON public.coupon_usages (customer_phone);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_customer_email ON public.coupon_usages (customer_email);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_order_id ON public.coupon_usages (order_id);

-- 3. Extend public.orders table with coupon and invoice audit columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_amount NUMERIC(10, 2);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Public customers can ONLY select active, currently valid coupons
DROP POLICY IF EXISTS "Public can view valid active coupons" ON public.coupons;
CREATE POLICY "Public can view valid active coupons" ON public.coupons
    FOR SELECT
    USING (
        is_active = TRUE
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
    );

-- Prevent public/anon users from inserting, updating or deleting coupons
DROP POLICY IF EXISTS "Public cannot insert coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public cannot update coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public cannot delete coupons" ON public.coupons;

-- Public can record coupon usage upon order creation
DROP POLICY IF EXISTS "Public can insert coupon usage" ON public.coupon_usages;
CREATE POLICY "Public can insert coupon usage" ON public.coupon_usages
    FOR INSERT
    WITH CHECK (TRUE);

-- Authenticated / Admin can view coupon usages
DROP POLICY IF EXISTS "Users can view coupon usage" ON public.coupon_usages;
CREATE POLICY "Users can view coupon usage" ON public.coupon_usages
    FOR SELECT
    USING (TRUE);
