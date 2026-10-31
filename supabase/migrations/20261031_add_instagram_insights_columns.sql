-- Migration: 20261031_add_instagram_insights_columns.sql
-- Description: Adds missing Instagram Insights and Reach/Save metrics columns to public.creator_content and ensures JSONB instagram_connection on influencers

-- 1. Ensure creator_content table has reach_count, saves_count, total_interactions_count, instagram_media_type
ALTER TABLE public.creator_content
    ADD COLUMN IF NOT EXISTS reach_count INTEGER,
    ADD COLUMN IF NOT EXISTS saves_count INTEGER,
    ADD COLUMN IF NOT EXISTS total_interactions_count INTEGER,
    ADD COLUMN IF NOT EXISTS instagram_media_type TEXT,
    ADD COLUMN IF NOT EXISTS instagram_account_id TEXT,
    ADD COLUMN IF NOT EXISTS instagram_permalink TEXT,
    ADD COLUMN IF NOT EXISTS insights_status TEXT DEFAULT 'not_connected',
    ADD COLUMN IF NOT EXISTS insights_error TEXT,
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 2. Ensure indexes exist for rapid lookup and synchronization
CREATE INDEX IF NOT EXISTS idx_creator_content_ig_media_id ON public.creator_content (instagram_media_id);
CREATE INDEX IF NOT EXISTS idx_creator_content_influencer_sync ON public.creator_content (influencer_id, last_synced_at);

-- 3. Ensure influencers table supports instagram_connection JSONB
ALTER TABLE public.influencers
    ADD COLUMN IF NOT EXISTS instagram_connection JSONB DEFAULT NULL;

-- 4. Enable RLS and maintain access policies
ALTER TABLE public.creator_content ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'creator_content' AND policyname = 'Allow service role full access to creator_content'
    ) THEN
        CREATE POLICY "Allow service role full access to creator_content"
            ON public.creator_content
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

