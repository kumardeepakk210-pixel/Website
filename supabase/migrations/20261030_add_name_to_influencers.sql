-- ==============================================================================
-- WISHRITE CREATOR CLUB — ADD CANONICAL NAME COLUMN TO INFLUENCERS TABLE
-- Migration: Add name column to public.influencers and backfill from influencer_name
-- ==============================================================================

-- 1. ADD COLUMN
ALTER TABLE public.influencers
    ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. BACKFILL DATA
UPDATE public.influencers
    SET name = influencer_name
    WHERE name IS NULL AND influencer_name IS NOT NULL;
