-- ============================================================================
-- Migration: 20261112_create_contest_tables.sql
-- Description: Creates persistent contests, participants, and scores tables
--              with strict environment isolation (production vs staging).
-- Target: WishRite Influencer Platform (Supabase PostgreSQL)
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE UNTIL EXPLICITLY APPROVED)
-- ============================================================================

-- 1. Contests Table
CREATE TABLE IF NOT EXISTS public.contests (
    id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development', 'test')),
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'upcoming', 'active', 'ended', 'archived')),
    requires_reels BOOLEAN NOT NULL DEFAULT true,
    scoring_rules JSONB NOT NULL DEFAULT '{
        "post_points": 50,
        "reel_points": 100,
        "order_points_multiplier": 10,
        "click_points_multiplier": 1
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, environment)
);

-- 2. Contest Participants Table
CREATE TABLE IF NOT EXISTS public.contest_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id TEXT NOT NULL,
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development', 'test')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disqualified', 'withdrawn')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (contest_id, environment) REFERENCES public.contests(id, environment) ON DELETE CASCADE,
    CONSTRAINT uq_contest_participant UNIQUE (contest_id, influencer_id, environment)
);

-- 3. Contest Scores Table
CREATE TABLE IF NOT EXISTS public.contest_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id TEXT NOT NULL,
    influencer_id UUID NOT NULL REFERENCES public.influencers(influencer_id) ON DELETE CASCADE,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development', 'test')),
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    last_activity_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (contest_id, environment) REFERENCES public.contests(id, environment) ON DELETE CASCADE,
    CONSTRAINT uq_contest_score UNIQUE (contest_id, influencer_id, environment)
);

-- Indexes for performant filtering and deterministic leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_contests_env_status ON public.contests(environment, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contest_participants_env_inf ON public.contest_participants(environment, contest_id, influencer_id);
CREATE INDEX IF NOT EXISTS idx_contest_scores_leaderboard ON public.contest_scores(environment, contest_id, points DESC, updated_at ASC, influencer_id ASC);

-- Row-Level Security (RLS)
ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_scores ENABLE ROW LEVEL SECURITY;

-- 1. Contests Policies:
-- Public and authenticated clients can view active production contests only.
-- Draft, upcoming, ended, archived, and staging contests are hidden from direct PostgREST queries.
-- Staging contest discovery is performed exclusively via the authenticated server-side API.
DROP POLICY IF EXISTS "Allow public read on active production contests" ON public.contests;
DROP POLICY IF EXISTS "Allow public read on active contests" ON public.contests;
DROP POLICY IF EXISTS "Allow public read on contests" ON public.contests;
CREATE POLICY "Allow public read on active production contests" ON public.contests
    FOR SELECT
    TO anon, authenticated
    USING (status = 'active' AND environment = 'production');

DROP POLICY IF EXISTS "Allow service_role full access on contests" ON public.contests;
CREATE POLICY "Allow service_role full access on contests" ON public.contests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Contest Participants Policies:
-- Direct table access is completely disabled for anonymous and authenticated clients.
-- Participant enrollment, validation, and retrieval are handled exclusively server-side via service_role.
-- This guarantees zero exposure of influencer UUIDs, internal metadata, or participant statuses.
DROP POLICY IF EXISTS "Allow public read on contest_participants" ON public.contest_participants;
DROP POLICY IF EXISTS "Allow creators to read own participant record" ON public.contest_participants;
DROP POLICY IF EXISTS "Allow service_role full access on contest_participants" ON public.contest_participants;
CREATE POLICY "Allow service_role full access on contest_participants" ON public.contest_participants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Contest Scores Policies:
-- Direct table access is completely disabled for anonymous and authenticated clients.
-- Leaderboard rankings, point totals, and creator positions are calculated and sanitized
-- exclusively server-side via /api/creator/contest using service_role credentials.
DROP POLICY IF EXISTS "Allow public read on contest_scores" ON public.contest_scores;
DROP POLICY IF EXISTS "Allow creators to read own score record" ON public.contest_scores;
DROP POLICY IF EXISTS "Allow service_role full access on contest_scores" ON public.contest_scores;
CREATE POLICY "Allow service_role full access on contest_scores" ON public.contest_scores
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Schema Permissions & Grants:
-- Enforce principle of least privilege: revoke all default permissions from PUBLIC and client roles
REVOKE ALL ON public.contests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.contest_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.contest_scores FROM PUBLIC, anon, authenticated;

-- Contests: Grant SELECT to anon and authenticated (strictly scoped by RLS to status = 'active' AND environment = 'production')
GRANT SELECT ON public.contests TO anon, authenticated;

-- Full administrative access for service_role (server-side leaderboard calculations, scoring, and moderation)
GRANT ALL ON public.contests TO service_role;
GRANT ALL ON public.contest_participants TO service_role;
GRANT ALL ON public.contest_scores TO service_role;
