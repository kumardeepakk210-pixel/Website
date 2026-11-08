-- Migration: 20261108_add_influencer_instagram_profile_columns.sql
-- Description: Adds automatic Instagram profile validation, follower counts, categories and creator niche fields to public.influencers

ALTER TABLE public.influencers
    ADD COLUMN IF NOT EXISTS instagram_followers_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS instagram_following_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS instagram_media_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS instagram_profile_picture TEXT,
    ADD COLUMN IF NOT EXISTS instagram_category TEXT,
    ADD COLUMN IF NOT EXISTS creator_niche TEXT,
    ADD COLUMN IF NOT EXISTS instagram_profile_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS instagram_validation_status TEXT DEFAULT 'pending';

-- Indexes for creator niche and Instagram validation status
CREATE INDEX IF NOT EXISTS idx_influencers_creator_niche ON public.influencers (creator_niche);
CREATE INDEX IF NOT EXISTS idx_influencers_ig_validation ON public.influencers (instagram_validation_status);
