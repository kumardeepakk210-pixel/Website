// WISHRITE — INSTAGRAM INSIGHTS PRODUCTION INTEGRATION TEST SUITE
// Tests encryption, media upsert, insights retrieval, NULL handling, and Creator isolation

import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken, fetchMediaInsights, upsertCreatorContentItem } from '../backend/services/instagram-sync.js';

test('1. Access Token Encryption & Decryption', () => {
    const rawToken = 'EAABtesting_token_secret_12345';
    const encrypted = encryptToken(rawToken);

    assert.ok(encrypted.startsWith('enc:'), 'Token must be encrypted with enc: prefix');
    assert.notEqual(encrypted, rawToken, 'Encrypted token must differ from raw token');
    assert.equal(encrypted.includes(rawToken), false, 'Raw token must not be in ciphertext');

    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, rawToken, 'Decrypted token must exactly match raw token');
});

test('2. NULL vs 0 Distinction in Insights Metrics', async () => {
    // Media item with explicit 0 likes and missing saves
    const creator = {
        id: 'bc16eb55-99f8-408a-a6a8-bdc85fc0882d',
        name: 'Deepak Kumar',
        influencer_code: 'WR-INF-41BB07'
    };

    const media = {
        id: '18136926376563626',
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        permalink: 'https://www.instagram.com/reel/DBGxyz123/',
        caption: 'WishRite style reel'
    };

    const insightsResult = {
        error: null,
        metrics: {
            views: 28,
            reach: 26,
            likes: 0,        // Explicit zero from Meta
            comments: 0,     // Explicit zero from Meta
            saved: null,     // Not returned by Meta
            shares: 0,
            total_interactions: 0
        }
    };

    const result = await upsertCreatorContentItem(creator, media, insightsResult);

    assert.equal(result.views_count, 28, 'Views should be 28');
    assert.equal(result.reach_count, 26, 'Reach should be 26');
    assert.equal(result.likes_count, 0, 'Explicit 0 likes must be preserved as 0');
    assert.equal(result.saves_count, null, 'Unreturned metric must be preserved as NULL, never coerced to 0');
    assert.equal(result.insights_status, 'synced', 'Status should be synced');
});

test('3. Multi-Creator Content Isolation', async () => {
    const creatorA = { id: 'uuid-creator-a-1111', name: 'Creator A' };
    const creatorB = { id: 'uuid-creator-b-2222', name: 'Creator B' };

    const mediaA = { id: 'media_a_123', permalink: 'https://instagram.com/p/aaa/' };
    const mediaB = { id: 'media_b_456', permalink: 'https://instagram.com/p/bbb/' };

    const resA = await upsertCreatorContentItem(creatorA, mediaA, { metrics: { views: 100 } });
    const resB = await upsertCreatorContentItem(creatorB, mediaB, { metrics: { views: 200 } });

    assert.equal(resA.influencer_id, 'uuid-creator-a-1111');
    assert.equal(resB.influencer_id, 'uuid-creator-b-2222');
    assert.notEqual(resA.influencer_id, resB.influencer_id, 'Creators must remain strictly isolated');
});

test('4. Token Security: No Tokens In Public Objects', async () => {
    const creator = { id: 'uuid-sec-check', name: 'Security Check' };
    const media = { id: 'media_sec_1', permalink: 'https://instagram.com/p/sec/' };

    const item = await upsertCreatorContentItem(creator, media, { metrics: { views: 50 } });
    assert.equal(item.access_token, undefined, 'Access token must never exist on content item');
    assert.equal(item.token, undefined, 'Token must never exist on content item');
});

