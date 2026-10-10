-- ==============================================================================
-- WISHRITE — WALLET, REWARD POINTS & REFERRAL SYSTEM MIGRATION
-- Migration: 20261010_wallet_rewards_referrals.sql
-- Production-Ready, Idempotent, High Precision, Fully Audited & RLS Protected
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND EXISTING TABLES (Non-destructive)
-- ──────────────────────────────────────────────────────────────────────────────

-- Extend public.customers with referral_code and user_id indexing
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
    ON public.customers (referral_code)
    WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_user_id
    ON public.customers (user_id)
    WHERE user_id IS NOT NULL;

-- Extend public.orders with user_id, points, wallet and purchase reward tracking
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS points_redeemed NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS points_discount_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS wallet_amount_used NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS purchase_points_awarded NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS purchase_points_awarded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS eligible_taxable_subtotal NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON public.orders (user_id)
    WHERE user_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. REWARD SETTINGS TABLE (Singleton Configuration)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    purchase_reward_percentage NUMERIC(5, 2) NOT NULL DEFAULT 1.00 CHECK (purchase_reward_percentage >= 0),
    referral_reward_points NUMERIC(10, 2) NOT NULL DEFAULT 100.00 CHECK (referral_reward_points >= 0),
    point_value_inr NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (point_value_inr > 0),
    minimum_points_redemption NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_points_redemption >= 0),
    maximum_points_per_order NUMERIC(10, 2) DEFAULT NULL,
    points_expiry_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    points_expiry_days INT DEFAULT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT 'admin'
);

INSERT INTO public.reward_settings (id, purchase_reward_percentage, referral_reward_points, point_value_inr)
VALUES (1, 1.00, 100.00, 1.00)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. CUSTOMER WALLET TABLE
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets (user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. WALLET TRANSACTIONS TABLE (Immutable Ledger)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('TOPUP', 'ORDER_PAYMENT', 'REFUND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'ADJUSTMENT')),
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reference_type VARCHAR(50),
    reference_id TEXT,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_ref ON public.wallet_transactions (reference_type, reference_id);

-- Idempotency constraint: Prevent duplicate topup credit for same payment reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_idempotent_topup
    ON public.wallet_transactions (reference_type, reference_id)
    WHERE transaction_type = 'TOPUP' AND reference_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. WALLET TOP-UP REQUESTS TABLE (Secure Razorpay Bridge)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_topup_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user_id ON public.wallet_topup_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_rzp_order ON public.wallet_topup_requests (razorpay_order_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. CUSTOMER POINTS TABLE (Reward Balance)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    points_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (points_balance >= 0.00),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_points_user_id ON public.customer_points (user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. REWARD TRANSACTIONS TABLE (Points Ledger)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    points NUMERIC(12, 2) NOT NULL,
    points_balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('REFERRAL', 'PURCHASE_REWARD', 'POINTS_REDEMPTION', 'REFUND_REVERSAL', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'ADJUSTMENT')),
    reference_type VARCHAR(50),
    reference_id TEXT,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_user_id ON public.reward_transactions (user_id, created_at DESC);

-- Idempotency constraint: One order = One purchase reward
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_tx_purchase_idempotent
    ON public.reward_transactions (user_id, reference_id)
    WHERE transaction_type = 'PURCHASE_REWARD' AND reference_type = 'order';

-- Idempotency constraint: One referral = One referral reward
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_tx_referral_idempotent
    ON public.reward_transactions (user_id, reference_id)
    WHERE transaction_type = 'REFERRAL' AND reference_type = 'referral';

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. REFERRALS TABLE
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'REWARDED', 'CANCELLED')),
    first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    reward_points NUMERIC(12, 2) DEFAULT 0.00,
    rewarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_referral CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals (referral_code);

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. ADMIN AUDIT LOGS TABLE
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES auth.users(id),
    admin_email TEXT NOT NULL,
    adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN ('WALLET_CREDIT', 'WALLET_DEBIT', 'POINTS_CREDIT', 'POINTS_DEBIT')),
    amount_or_points NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.reward_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- REWARD SETTINGS: Public can read, only service_role/admin can modify
DROP POLICY IF EXISTS "Public can view reward settings" ON public.reward_settings;
CREATE POLICY "Public can view reward settings" ON public.reward_settings
    FOR SELECT USING (TRUE);

-- WALLETS: Customers can only view their own wallet
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
CREATE POLICY "Users can view own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

-- WALLET TRANSACTIONS: Customers can only view their own transactions
DROP POLICY IF EXISTS "Users can view own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- WALLET TOP-UPS: Customers can only view their own topups
DROP POLICY IF EXISTS "Users can view own wallet topups" ON public.wallet_topup_requests;
CREATE POLICY "Users can view own wallet topups" ON public.wallet_topup_requests
    FOR SELECT USING (auth.uid() = user_id);

-- CUSTOMER POINTS: Customers can only view their own points
DROP POLICY IF EXISTS "Users can view own points" ON public.customer_points;
CREATE POLICY "Users can view own points" ON public.customer_points
    FOR SELECT USING (auth.uid() = user_id);

-- REWARD TRANSACTIONS: Customers can only view their own reward transactions
DROP POLICY IF EXISTS "Users can view own reward transactions" ON public.reward_transactions;
CREATE POLICY "Users can view own reward transactions" ON public.reward_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- REFERRALS: Referrer and referred user can view the referral record
DROP POLICY IF EXISTS "Users can view their referrals" ON public.referrals;
CREATE POLICY "Users can view their referrals" ON public.referrals
    FOR SELECT USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- Direct client updates/inserts/deletions on financial ledgers are BLOCKED for all users.
-- Only PostgreSQL functions marked SECURITY DEFINER and Supabase service_role can update balances.

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. ATOMIC STORED PROCEDURES (SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────────────────────

-- Helper: Generate unique referral code (format: WR + 5 alphanumeric characters, e.g. WR8K4P)
CREATE OR REPLACE FUNCTION public.fn_generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    res TEXT := 'WR';
    i INT;
    candidate TEXT;
BEGIN
    LOOP
        res := 'WR';
        FOR i IN 1..5 LOOP
            res := res || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        
        -- Check uniqueness across customers
        IF NOT EXISTS (SELECT 1 FROM public.customers WHERE referral_code = res) THEN
            RETURN res;
        END IF;
    END LOOP;
END;
$$;

-- Procedure: Get or Create Customer Wallet & Points
CREATE OR REPLACE FUNCTION public.get_or_create_customer_wallet(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_wallet RECORD;
    v_points RECORD;
    v_cust RECORD;
    v_code TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
    END IF;

    -- Ensure wallet exists
    INSERT INTO public.wallets (user_id, balance, currency)
    VALUES (p_user_id, 0.00, 'INR')
    ON CONFLICT (user_id) DO NOTHING;

    -- Ensure points exist
    INSERT INTO public.customer_points (user_id, points_balance)
    VALUES (p_user_id, 0.00)
    ON CONFLICT (user_id) DO NOTHING;

    -- Fetch wallet
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id;

    -- Fetch points
    SELECT * INTO v_points FROM public.customer_points WHERE user_id = p_user_id;

    -- Ensure customer referral code exists
    SELECT * INTO v_cust FROM public.customers WHERE user_id = p_user_id LIMIT 1;
    IF v_cust.id IS NOT NULL AND (v_cust.referral_code IS NULL OR v_cust.referral_code = '') THEN
        v_code := public.fn_generate_referral_code();
        UPDATE public.customers SET referral_code = v_code WHERE id = v_cust.id;
    ELSE
        v_code := v_cust.referral_code;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'wallet_id', v_wallet.id,
        'wallet_balance', COALESCE(v_wallet.balance, 0.00),
        'currency', COALESCE(v_wallet.currency, 'INR'),
        'points_balance', COALESCE(v_points.points_balance, 0.00),
        'referral_code', v_code
    );
END;
$$;

-- Procedure: Record Customer Referral Registration
CREATE OR REPLACE FUNCTION public.record_customer_referral(p_referred_user_id UUID, p_referral_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_cleaned_code TEXT;
    v_referrer_cust RECORD;
    v_referrer_id UUID;
    v_existing RECORD;
BEGIN
    IF p_referred_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referred user ID is required');
    END IF;

    v_cleaned_code := UPPER(TRIM(COALESCE(p_referral_code, '')));
    IF v_cleaned_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
    END IF;

    -- Find referrer by referral_code
    SELECT * INTO v_referrer_cust FROM public.customers WHERE UPPER(referral_code) = v_cleaned_code LIMIT 1;
    IF v_referrer_cust.id IS NULL OR v_referrer_cust.user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
    END IF;

    v_referrer_id := v_referrer_cust.user_id;

    -- Fraud guard: Cannot refer oneself
    IF v_referrer_id = p_referred_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot use your own referral code');
    END IF;

    -- Fraud guard: Cannot be referred more than once
    SELECT * INTO v_existing FROM public.referrals WHERE referred_user_id = p_referred_user_id;
    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer already has an active referral', 'referral_id', v_existing.id);
    END IF;

    -- Create referral record with status = 'REGISTERED' (DO NOT award points yet!)
    INSERT INTO public.referrals (
        referrer_user_id,
        referred_user_id,
        referral_code,
        status,
        reward_points
    ) VALUES (
        v_referrer_id,
        p_referred_user_id,
        v_cleaned_code,
        'REGISTERED',
        0.00
    );

    -- Update customer profile referred_by_code
    UPDATE public.customers
    SET referred_by_code = v_cleaned_code
    WHERE user_id = p_referred_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'REGISTERED',
        'message', 'Referral recorded successfully'
    );
END;
$$;

-- Procedure: Credit Wallet from Verified Payment (Idempotent)
CREATE OR REPLACE FUNCTION public.credit_wallet_from_verified_payment(
    p_topup_id UUID,
    p_razorpay_payment_id TEXT,
    p_razorpay_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_topup RECORD;
    v_wallet RECORD;
    v_new_balance NUMERIC(12, 2);
    v_existing_tx RECORD;
BEGIN
    IF p_topup_id IS NULL OR p_razorpay_payment_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Top-up ID and Razorpay Payment ID are required');
    END IF;

    -- Fetch top-up request with lock
    SELECT * INTO v_topup
    FROM public.wallet_topup_requests
    WHERE id = p_topup_id
    FOR UPDATE;

    IF v_topup.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Top-up request not found');
    END IF;

    -- Idempotency check: Already paid and credited?
    SELECT * INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE reference_type = 'razorpay_payment' AND reference_id = p_razorpay_payment_id;

    IF v_existing_tx.id IS NOT NULL OR v_topup.status = 'PAID' THEN
        SELECT balance INTO v_new_balance FROM public.wallets WHERE user_id = v_topup.user_id;
        RETURN jsonb_build_object(
            'success', true,
            'already_credited', true,
            'message', 'Top-up was already credited',
            'wallet_balance', v_new_balance
        );
    END IF;

    -- Lock and update wallet balance
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_topup.user_id
    FOR UPDATE;

    IF v_wallet.id IS NULL THEN
        INSERT INTO public.wallets (user_id, balance, currency)
        VALUES (v_topup.user_id, 0.00, 'INR')
        RETURNING * INTO v_wallet;
    END IF;

    v_new_balance := v_wallet.balance + v_topup.amount;

    UPDATE public.wallets
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Record in transaction ledger
    INSERT INTO public.wallet_transactions (
        wallet_id,
        user_id,
        transaction_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description,
        status,
        metadata
    ) VALUES (
        v_wallet.id,
        v_topup.user_id,
        'TOPUP',
        v_topup.amount,
        v_new_balance,
        'razorpay_payment',
        p_razorpay_payment_id,
        'Wallet Top-up via Razorpay',
        'SUCCESS',
        jsonb_build_object(
            'razorpay_order_id', v_topup.razorpay_order_id,
            'razorpay_payment_id', p_razorpay_payment_id,
            'topup_id', p_topup_id
        )
    );

    -- Mark topup request as PAID
    UPDATE public.wallet_topup_requests
    SET status = 'PAID',
        razorpay_payment_id = p_razorpay_payment_id,
        razorpay_signature = p_razorpay_signature,
        updated_at = NOW()
    WHERE id = p_topup_id;

    RETURN jsonb_build_object(
        'success', true,
        'wallet_credited', true,
        'amount_credited', v_topup.amount,
        'wallet_balance', v_new_balance
    );
END;
$$;

-- Procedure: Apply Wallet and Points to Checkout (Atomic & Race-Condition Safe)
CREATE OR REPLACE FUNCTION public.apply_wallet_and_points_to_checkout(
    p_order_id UUID,
    p_user_id UUID,
    p_points_to_redeem NUMERIC(12, 2),
    p_wallet_to_use NUMERIC(12, 2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_order RECORD;
    v_wallet RECORD;
    v_points RECORD;
    v_settings RECORD;
    v_pt_value NUMERIC(10, 2);
    v_points_discount NUMERIC(12, 2);
    v_req_points NUMERIC(12, 2) := COALESCE(p_points_to_redeem, 0.00);
    v_req_wallet NUMERIC(12, 2) := COALESCE(p_wallet_to_use, 0.00);
    v_new_wallet_balance NUMERIC(12, 2);
    v_new_points_balance NUMERIC(12, 2);
    v_new_grand_total NUMERIC(12, 2);
BEGIN
    IF p_order_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID and User ID are required');
    END IF;

    -- Fetch order with lock
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Check if already processed
    IF COALESCE(v_order.points_redeemed, 0) > 0 OR COALESCE(v_order.wallet_amount_used, 0) > 0 THEN
        RETURN jsonb_build_object('success', true, 'already_applied', true, 'grand_total', v_order.grand_total);
    END IF;

    -- Fetch settings
    SELECT * INTO v_settings FROM public.reward_settings WHERE id = 1;
    v_pt_value := COALESCE(v_settings.point_value_inr, 1.00);

    -- Lock wallet and points
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
    SELECT * INTO v_points FROM public.customer_points WHERE user_id = p_user_id FOR UPDATE;

    -- Validate points
    IF v_req_points > 0 THEN
        IF v_points.id IS NULL OR v_points.points_balance < v_req_points THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient WishRite Points balance');
        END IF;
    END IF;

    -- Validate wallet
    IF v_req_wallet > 0 THEN
        IF v_wallet.id IS NULL OR v_wallet.balance < v_req_wallet THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient Wallet balance');
        END IF;
    END IF;

    v_points_discount := v_req_points * v_pt_value;

    -- Ensure discounts do not exceed order total
    IF (v_points_discount + v_req_wallet) > v_order.grand_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Points and wallet usage cannot exceed order total');
    END IF;

    -- Deduct points
    IF v_req_points > 0 THEN
        v_new_points_balance := v_points.points_balance - v_req_points;
        UPDATE public.customer_points
        SET points_balance = v_new_points_balance, updated_at = NOW()
        WHERE id = v_points.id;

        INSERT INTO public.reward_transactions (
            user_id,
            points,
            points_balance_after,
            transaction_type,
            reference_type,
            reference_id,
            description,
            status
        ) VALUES (
            p_user_id,
            -v_req_points,
            v_new_points_balance,
            'POINTS_REDEMPTION',
            'order',
            p_order_id::text,
            'Points redeemed on Order #' || COALESCE(v_order.order_number, p_order_id::text),
            'SUCCESS'
        );
    END IF;

    -- Deduct wallet
    IF v_req_wallet > 0 THEN
        v_new_wallet_balance := v_wallet.balance - v_req_wallet;
        UPDATE public.wallets
        SET balance = v_new_wallet_balance, updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.wallet_transactions (
            wallet_id,
            user_id,
            transaction_type,
            amount,
            balance_after,
            reference_type,
            reference_id,
            description,
            status
        ) VALUES (
            v_wallet.id,
            p_user_id,
            'ORDER_PAYMENT',
            -v_req_wallet,
            v_new_wallet_balance,
            'order',
            p_order_id::text,
            'Wallet payment on Order #' || COALESCE(v_order.order_number, p_order_id::text),
            'SUCCESS'
        );
    END IF;

    -- Calculate remaining grand total
    v_new_grand_total := v_order.grand_total - v_points_discount - v_req_wallet;

    -- Update order record
    UPDATE public.orders
    SET user_id = p_user_id,
        points_redeemed = v_req_points,
        points_discount_amount = v_points_discount,
        wallet_amount_used = v_req_wallet,
        grand_total = v_new_grand_total,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- If remaining grand_total is 0, order is fully paid by Points and/or Wallet!
    IF v_new_grand_total <= 0 THEN
        UPDATE public.orders
        SET payment_status = 'paid',
            payment_method = 'wallet_points',
            paid_at = NOW(),
            order_status = 'processing',
            updated_at = NOW()
        WHERE id = p_order_id;

        -- Attempt server-side fulfillment
        BEGIN
            PERFORM public.fulfill_paid_order(p_order_id);
        EXCEPTION WHEN OTHERS THEN
            -- Non-blocking in case fulfillment RPC is handled separately
            NULL;
        END;

        -- Award purchase rewards and check referral
        PERFORM public.process_order_purchase_reward(p_order_id);
        PERFORM public.process_referral_reward(p_order_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'points_redeemed', v_req_points,
        'points_discount', v_points_discount,
        'wallet_used', v_req_wallet,
        'remaining_grand_total', v_new_grand_total,
        'is_fully_paid', (v_new_grand_total <= 0)
    );
END;
$$;

-- Procedure: Award Purchase Reward Points (1% excluding GST/tax, Idempotent)
CREATE OR REPLACE FUNCTION public.process_order_purchase_reward(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_order RECORD;
    v_settings RECORD;
    v_taxable_value NUMERIC(12, 2);
    v_reward_pct NUMERIC(5, 2);
    v_points_earned NUMERIC(12, 2);
    v_user_id UUID;
    v_points RECORD;
    v_new_points_balance NUMERIC(12, 2);
    v_existing RECORD;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Only qualifying paid or confirmed orders are awarded
    IF v_order.payment_status <> 'paid' AND v_order.order_status NOT IN ('confirmed', 'processing', 'completed', 'delivered') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order has not reached qualifying paid status');
    END IF;

    -- Idempotency check: Already awarded?
    IF COALESCE(v_order.purchase_points_awarded, 0) > 0 THEN
        RETURN jsonb_build_object('success', true, 'already_awarded', true, 'points', v_order.purchase_points_awarded);
    END IF;

    SELECT * INTO v_existing
    FROM public.reward_transactions
    WHERE reference_type = 'order' AND reference_id = p_order_id::text AND transaction_type = 'PURCHASE_REWARD';
    IF v_existing.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'already_awarded', true, 'points', v_existing.points);
    END IF;

    -- Resolve user ID (either order.user_id or lookup via email)
    v_user_id := v_order.user_id;
    IF v_user_id IS NULL AND v_order.customer_email IS NOT NULL THEN
        SELECT user_id INTO v_user_id FROM public.customers WHERE LOWER(customer_email) = LOWER(v_order.customer_email) LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No registered customer account found for this order');
    END IF;

    -- Calculate eligible product value EXCLUDING GST/taxes and shipping
    -- Formula: Taxable value before tax = subtotal - discount (coupons)
    IF v_order.eligible_taxable_subtotal IS NOT NULL AND v_order.eligible_taxable_subtotal > 0 THEN
        v_taxable_value := v_order.eligible_taxable_subtotal;
    ELSE
        v_taxable_value := GREATEST(0.00, COALESCE(v_order.subtotal, 0.00) - COALESCE(v_order.discount, 0.00));
    END IF;

    -- Fetch configured reward percentage (default 1%)
    SELECT * INTO v_settings FROM public.reward_settings WHERE id = 1;
    v_reward_pct := COALESCE(v_settings.purchase_reward_percentage, 1.00);

    -- Calculate reward points (allow decimals, e.g. ₹550 * 1% = 5.50 points)
    v_points_earned := ROUND((v_taxable_value * (v_reward_pct / 100.0)), 2);

    IF v_points_earned <= 0 THEN
        RETURN jsonb_build_object('success', true, 'points_earned', 0, 'message', 'Eligible taxable value is 0');
    END IF;

    -- Lock and credit points
    SELECT * INTO v_points FROM public.customer_points WHERE user_id = v_user_id FOR UPDATE;
    IF v_points.id IS NULL THEN
        INSERT INTO public.customer_points (user_id, points_balance)
        VALUES (v_user_id, 0.00)
        RETURNING * INTO v_points;
    END IF;

    v_new_points_balance := v_points.points_balance + v_points_earned;

    UPDATE public.customer_points
    SET points_balance = v_new_points_balance, updated_at = NOW()
    WHERE id = v_points.id;

    -- Insert ledger record
    INSERT INTO public.reward_transactions (
        user_id,
        points,
        points_balance_after,
        transaction_type,
        reference_type,
        reference_id,
        description,
        status
    ) VALUES (
        v_user_id,
        v_points_earned,
        v_new_points_balance,
        'PURCHASE_REWARD',
        'order',
        p_order_id::text,
        'Purchase Reward for Order #' || COALESCE(v_order.order_number, p_order_id::text) || ' (1% on taxable ₹' || v_taxable_value || ')',
        'SUCCESS'
    );

    -- Mark order as rewarded
    UPDATE public.orders
    SET purchase_points_awarded = v_points_earned,
        purchase_points_awarded_at = NOW(),
        user_id = v_user_id
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'points_earned', v_points_earned,
        'taxable_value', v_taxable_value,
        'points_balance', v_new_points_balance
    );
END;
$$;

-- Procedure: Process Referral Reward on First Qualifying Order (Idempotent)
CREATE OR REPLACE FUNCTION public.process_referral_reward(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_order RECORD;
    v_user_id UUID;
    v_referral RECORD;
    v_settings RECORD;
    v_reward_points NUMERIC(10, 2);
    v_referrer_points RECORD;
    v_new_referrer_balance NUMERIC(12, 2);
    v_prior_orders_count INT;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Only qualifying paid orders trigger referral reward
    IF v_order.payment_status <> 'paid' AND v_order.order_status NOT IN ('confirmed', 'processing', 'completed', 'delivered') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order has not reached qualifying paid status');
    END IF;

    -- Resolve user ID of purchaser
    v_user_id := v_order.user_id;
    IF v_user_id IS NULL AND v_order.customer_email IS NOT NULL THEN
        SELECT user_id INTO v_user_id FROM public.customers WHERE LOWER(customer_email) = LOWER(v_order.customer_email) LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No registered customer found for this order');
    END IF;

    -- Check if purchaser has an active referral with status = 'REGISTERED'
    SELECT * INTO v_referral
    FROM public.referrals
    WHERE referred_user_id = v_user_id
    FOR UPDATE;

    IF v_referral.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'no_referral', true, 'message', 'Customer was not referred');
    END IF;

    -- Idempotency check: Already rewarded?
    IF v_referral.status = 'REWARDED' THEN
        RETURN jsonb_build_object('success', true, 'already_rewarded', true, 'message', 'Referral reward was already granted');
    END IF;

    -- Ensure this is indeed the customer's FIRST qualifying order
    SELECT COUNT(*) INTO v_prior_orders_count
    FROM public.orders
    WHERE user_id = v_user_id
      AND id <> p_order_id
      AND payment_status = 'paid';

    IF v_prior_orders_count > 0 THEN
        -- If previous paid orders exist, customer had already purchased previously
        RETURN jsonb_build_object('success', false, 'error', 'Not customer first qualifying order');
    END IF;

    -- Fetch configured referral points (default 100 points)
    SELECT * INTO v_settings FROM public.reward_settings WHERE id = 1;
    v_reward_points := COALESCE(v_settings.referral_reward_points, 100.00);

    -- Lock and credit referrer points balance
    SELECT * INTO v_referrer_points FROM public.customer_points WHERE user_id = v_referral.referrer_user_id FOR UPDATE;
    IF v_referrer_points.id IS NULL THEN
        INSERT INTO public.customer_points (user_id, points_balance)
        VALUES (v_referral.referrer_user_id, 0.00)
        RETURNING * INTO v_referrer_points;
    END IF;

    v_new_referrer_balance := v_referrer_points.points_balance + v_reward_points;

    UPDATE public.customer_points
    SET points_balance = v_new_referrer_balance, updated_at = NOW()
    WHERE id = v_referrer_points.id;

    -- Record in reward transaction ledger for referrer
    INSERT INTO public.reward_transactions (
        user_id,
        points,
        points_balance_after,
        transaction_type,
        reference_type,
        reference_id,
        description,
        status
    ) VALUES (
        v_referral.referrer_user_id,
        v_reward_points,
        v_new_referrer_balance,
        'REFERRAL',
        'referral',
        v_referral.id::text,
        'Referral Reward for referring a friend who placed their first order (Order #' || COALESCE(v_order.order_number, p_order_id::text) || ')',
        'SUCCESS'
    );

    -- Mark referral record as REWARDED
    UPDATE public.referrals
    SET status = 'REWARDED',
        first_order_id = p_order_id,
        reward_points = v_reward_points,
        rewarded_at = NOW()
    WHERE id = v_referral.id;

    RETURN jsonb_build_object(
        'success', true,
        'referrer_user_id', v_referral.referrer_user_id,
        'referred_user_id', v_user_id,
        'reward_points', v_reward_points,
        'referrer_points_balance', v_new_referrer_balance
    );
END;
$$;

-- Procedure: Reverse Order Rewards on Refund / Cancellation
CREATE OR REPLACE FUNCTION public.reverse_order_rewards_on_refund(
    p_order_id UUID,
    p_refund_amount NUMERIC(12, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_order RECORD;
    v_user_id UUID;
    v_awarded NUMERIC(12, 2);
    v_reversal_points NUMERIC(12, 2);
    v_points RECORD;
    v_new_points_balance NUMERIC(12, 2);
    v_existing_reversal RECORD;
BEGIN
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order ID is required');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    v_awarded := COALESCE(v_order.purchase_points_awarded, 0.00);
    IF v_awarded <= 0 THEN
        RETURN jsonb_build_object('success', true, 'no_points_awarded', true);
    END IF;

    -- Check if already reversed
    SELECT * INTO v_existing_reversal
    FROM public.reward_transactions
    WHERE reference_type = 'order' AND reference_id = p_order_id::text AND transaction_type = 'REFUND_REVERSAL';
    IF v_existing_reversal.id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'already_reversed', true);
    END IF;

    v_user_id := v_order.user_id;
    IF v_user_id IS NULL THEN
        SELECT user_id INTO v_user_id FROM public.customers WHERE LOWER(customer_email) = LOWER(v_order.customer_email) LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
    END IF;

    -- If partial refund, reverse proportionally; else reverse all
    IF p_refund_amount IS NOT NULL AND p_refund_amount > 0 AND v_order.grand_total > 0 THEN
        v_reversal_points := LEAST(v_awarded, ROUND((v_awarded * (p_refund_amount / v_order.grand_total)), 2));
    ELSE
        v_reversal_points := v_awarded;
    END IF;

    SELECT * INTO v_points FROM public.customer_points WHERE user_id = v_user_id FOR UPDATE;
    IF v_points.id IS NOT NULL THEN
        -- Prevent negative points balance if points were already spent
        v_new_points_balance := GREATEST(0.00, v_points.points_balance - v_reversal_points);
        UPDATE public.customer_points
        SET points_balance = v_new_points_balance, updated_at = NOW()
        WHERE id = v_points.id;

        INSERT INTO public.reward_transactions (
            user_id,
            points,
            points_balance_after,
            transaction_type,
            reference_type,
            reference_id,
            description,
            status
        ) VALUES (
            v_user_id,
            -v_reversal_points,
            v_new_points_balance,
            'REFUND_REVERSAL',
            'order',
            p_order_id::text,
            'Reward adjustment due to refunded/cancelled Order #' || COALESCE(v_order.order_number, p_order_id::text),
            'SUCCESS'
        );
    END IF;

    -- Also check if wallet was used on this order and refund wallet balance
    IF COALESCE(v_order.wallet_amount_used, 0.00) > 0 THEN
        DECLARE
            v_wallet RECORD;
            v_new_w_balance NUMERIC(12, 2);
        BEGIN
            SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
            IF v_wallet.id IS NOT NULL THEN
                v_new_w_balance := v_wallet.balance + v_order.wallet_amount_used;
                UPDATE public.wallets
                SET balance = v_new_w_balance, updated_at = NOW()
                WHERE id = v_wallet.id;

                INSERT INTO public.wallet_transactions (
                    wallet_id,
                    user_id,
                    transaction_type,
                    amount,
                    balance_after,
                    reference_type,
                    reference_id,
                    description,
                    status
                ) VALUES (
                    v_wallet.id,
                    v_user_id,
                    'REFUND',
                    v_order.wallet_amount_used,
                    v_new_w_balance,
                    'order_refund',
                    p_order_id::text,
                    'Wallet refund for Order #' || COALESCE(v_order.order_number, p_order_id::text),
                    'SUCCESS'
                );
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'points_reversed', v_reversal_points,
        'order_id', p_order_id
    );
END;
$$;

-- Procedure: Admin Manual Balance Adjustment (Audited)
CREATE OR REPLACE FUNCTION public.admin_adjust_customer_balance(
    p_target_user_id UUID,
    p_type TEXT,
    p_amount NUMERIC(12, 2),
    p_reason TEXT,
    p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_adj_type TEXT := UPPER(TRIM(p_type));
    v_wallet RECORD;
    v_points RECORD;
    v_new_balance NUMERIC(12, 2);
    v_audit_id UUID;
BEGIN
    IF p_target_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user and valid positive amount are required');
    END IF;

    IF v_adj_type NOT IN ('WALLET_CREDIT', 'WALLET_DEBIT', 'POINTS_CREDIT', 'POINTS_DEBIT') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid adjustment type');
    END IF;

    -- Insert audit log
    INSERT INTO public.reward_admin_audit_logs (
        target_user_id,
        admin_email,
        adjustment_type,
        amount_or_points,
        reason
    ) VALUES (
        p_target_user_id,
        COALESCE(p_admin_email, 'admin'),
        v_adj_type,
        p_amount,
        COALESCE(p_reason, 'Manual adjustment')
    ) RETURNING id INTO v_audit_id;

    -- Apply adjustment
    IF v_adj_type = 'WALLET_CREDIT' THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_target_user_id FOR UPDATE;
        IF v_wallet.id IS NULL THEN
            INSERT INTO public.wallets (user_id, balance) VALUES (p_target_user_id, 0.00) RETURNING * INTO v_wallet;
        END IF;
        v_new_balance := v_wallet.balance + p_amount;
        UPDATE public.wallets SET balance = v_new_balance, updated_at = NOW() WHERE id = v_wallet.id;

        INSERT INTO public.wallet_transactions (
            wallet_id, user_id, transaction_type, amount, balance_after,
            reference_type, reference_id, description, status
        ) VALUES (
            v_wallet.id, p_target_user_id, 'ADMIN_CREDIT', p_amount, v_new_balance,
            'admin_audit', v_audit_id::text, 'Admin Credit: ' || COALESCE(p_reason, ''), 'SUCCESS'
        );

    ELSIF v_adj_type = 'WALLET_DEBIT' THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_target_user_id FOR UPDATE;
        IF v_wallet.id IS NULL OR v_wallet.balance < p_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance for debit');
        END IF;
        v_new_balance := v_wallet.balance - p_amount;
        UPDATE public.wallets SET balance = v_new_balance, updated_at = NOW() WHERE id = v_wallet.id;

        INSERT INTO public.wallet_transactions (
            wallet_id, user_id, transaction_type, amount, balance_after,
            reference_type, reference_id, description, status
        ) VALUES (
            v_wallet.id, p_target_user_id, 'ADMIN_DEBIT', -p_amount, v_new_balance,
            'admin_audit', v_audit_id::text, 'Admin Debit: ' || COALESCE(p_reason, ''), 'SUCCESS'
        );

    ELSIF v_adj_type = 'POINTS_CREDIT' THEN
        SELECT * INTO v_points FROM public.customer_points WHERE user_id = p_target_user_id FOR UPDATE;
        IF v_points.id IS NULL THEN
            INSERT INTO public.customer_points (user_id, points_balance) VALUES (p_target_user_id, 0.00) RETURNING * INTO v_points;
        END IF;
        v_new_balance := v_points.points_balance + p_amount;
        UPDATE public.customer_points SET points_balance = v_new_balance, updated_at = NOW() WHERE id = v_points.id;

        INSERT INTO public.reward_transactions (
            user_id, points, points_balance_after, transaction_type,
            reference_type, reference_id, description, status
        ) VALUES (
            p_target_user_id, p_amount, v_new_balance, 'ADMIN_CREDIT',
            'admin_audit', v_audit_id::text, 'Admin Points Credit: ' || COALESCE(p_reason, ''), 'SUCCESS'
        );

    ELSIF v_adj_type = 'POINTS_DEBIT' THEN
        SELECT * INTO v_points FROM public.customer_points WHERE user_id = p_target_user_id FOR UPDATE;
        IF v_points.id IS NULL OR v_points.points_balance < p_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient points balance for debit');
        END IF;
        v_new_balance := v_points.points_balance - p_amount;
        UPDATE public.customer_points SET points_balance = v_new_balance, updated_at = NOW() WHERE id = v_points.id;

        INSERT INTO public.reward_transactions (
            user_id, points, points_balance_after, transaction_type,
            reference_type, reference_id, description, status
        ) VALUES (
            p_target_user_id, -p_amount, v_new_balance, 'ADMIN_DEBIT',
            'admin_audit', v_audit_id::text, 'Admin Points Debit: ' || COALESCE(p_reason, ''), 'SUCCESS'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'adjustment_type', v_adj_type,
        'new_balance', v_new_balance,
        'audit_id', v_audit_id
    );
END;
$$;

-- Procedure: Admin Update Reward Settings
CREATE OR REPLACE FUNCTION public.admin_update_reward_settings(
    p_purchase_reward_percentage NUMERIC(5, 2),
    p_referral_reward_points NUMERIC(10, 2),
    p_point_value_inr NUMERIC(10, 2),
    p_minimum_points_redemption NUMERIC(10, 2) DEFAULT NULL,
    p_maximum_points_per_order NUMERIC(10, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    UPDATE public.reward_settings
    SET purchase_reward_percentage = COALESCE(p_purchase_reward_percentage, purchase_reward_percentage),
        referral_reward_points = COALESCE(p_referral_reward_points, referral_reward_points),
        point_value_inr = COALESCE(p_point_value_inr, point_value_inr),
        minimum_points_redemption = COALESCE(p_minimum_points_redemption, minimum_points_redemption),
        maximum_points_per_order = COALESCE(p_maximum_points_per_order, maximum_points_per_order),
        updated_at = NOW()
    WHERE id = 1;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Ensure public.coupons exists and seed the 3 standard promotional coupons
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    scope VARCHAR(30) NOT NULL DEFAULT 'all',
    occasion_slug VARCHAR(50),
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    minimum_order_value NUMERIC(10, 2) DEFAULT 0,
    maximum_discount NUMERIC(10, 2),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    per_customer_limit INTEGER NOT NULL DEFAULT 1,
    first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
    stackable BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID,
    customer_id TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    order_id TEXT,
    coupon_code VARCHAR(50) NOT NULL,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view valid active coupons" ON public.coupons;
CREATE POLICY "Public can view valid active coupons" ON public.coupons
    FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public can insert coupon usage" ON public.coupon_usages;
CREATE POLICY "Public can insert coupon usage" ON public.coupon_usages
    FOR INSERT WITH CHECK (TRUE);

INSERT INTO public.coupons (
    code, description, scope, discount_type, discount_value, minimum_order_value, first_order_only, per_customer_limit, is_active
) VALUES
    ('WELCOME10', 'Welcome to WishRite! 10% off on your first order.', 'all', 'percentage', 10.00, 0.00, TRUE, 1, TRUE),
    ('SALE10', '10% off on minimum cart value of ₹3,000 for everyone.', 'all', 'percentage', 10.00, 3000.00, FALSE, 10, TRUE),
    ('SALE15', '15% off on minimum cart value of ₹5,000 for everyone.', 'all', 'percentage', 15.00, 5000.00, FALSE, 10, TRUE)
ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    minimum_order_value = EXCLUDED.minimum_order_value,
    first_order_only = EXCLUDED.first_order_only,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Notify PostgREST schema cache to reload
NOTIFY pgrst, 'reload schema';
