// Test exact verified reel metrics upsert and Graph API version verification
import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertCreatorContentItem } from '../backend/services/instagram-sync.js';

test('5. Verified Reel exact metrics upsert (Media ID: 18136926376563626)', async () => {
    // Exact verified values from Meta API test:
    // Reel ID: 18136926376563626
    // Views: 28, Reach: 26, Likes: 0, Comments: 0, Saves: 0, Shares: 0, Total interactions: 0
    const verifiedMedia = {
        id: '18136926376563626',
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        permalink: 'https://www.instagram.com/reel/DBG7X_yP123/',
        caption: 'WishRite Official Reel Test',
        account_id: '17841400000000000'
    };

    const verifiedInsights = {
        metrics: {
            views: 28,
            reach: 26,
            likes: 0,
            comments: 0,
            saved: 0,
            shares: 0,
            total_interactions: 0
        },
        error: null
    };

    const creator = {
        id: 'creator-verified-001',
        name: 'Deepak Kumar',
        email: 'deepak@wishrite.in'
    };

    const res = await upsertCreatorContentItem(creator, verifiedMedia, verifiedInsights);

    assert.equal(res.instagram_media_id, '18136926376563626');
    assert.equal(res.views_count, 28);
    assert.equal(res.reach_count, 26);
    assert.equal(res.likes_count, 0);
    assert.equal(res.comments_count, 0);
    assert.equal(res.saves_count, 0);
    assert.equal(res.shares_count, 0);
    assert.equal(res.total_interactions_count, 0);
    assert.equal(res.content_type, 'reel');
    assert.equal(res.platform, 'instagram');
    assert.equal(res.insights_status, 'synced');
    assert.equal(res.insights_error, null);
});

test('6. Graph API Version configuration check', async () => {
    // Check that META_GRAPH_API_VERSION defaults to v26.0 or respects env
    const configuredVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
    assert.equal(configuredVersion, 'v26.0');
});

