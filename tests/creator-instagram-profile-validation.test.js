// WISHRITE CREATOR CLUB — AUTOMATED VALIDATION TEST SUITE
// PART F: Automatic Instagram Account Validation & Influencer Profile Fetching
// Covers 10 distinct validation & profile fetching scenarios

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import {
    fetchInstagramProfileDetails,
    verifyMetaTokenPermissions,
    ALLOWED_CREATOR_NICHES,
    syncCreatorInstagram
} from '../backend/services/instagram-sync.js';
import {
    handleInstagramOAuthCallback,
    handleRefreshInstagramProfile,
    handleUpdateCreatorNiche,
    createOAuthState,
    readLocalStore,
    writeLocalStore
} from '../backend/creator.js';

describe('PART F: Automatic Instagram Account Validation & Influencer Profile Fetching Suite', () => {
    let mockServer = null;
    let mockPort = 0;
    let mockResponses = {};
    let savedLocalStore = null;

    before(async () => {
        // Save initial local store
        savedLocalStore = JSON.parse(JSON.stringify(readLocalStore()));

        // Start mock HTTP server
        mockServer = http.createServer((req, res) => {
            const url = req.url || '';
            res.writeHead(200, { 'Content-Type': 'application/json' });

            // Check if mockResponses has a custom handler or response for this path
            for (const [pattern, handler] of Object.entries(mockResponses)) {
                if (url.includes(pattern)) {
                    if (typeof handler === 'function') {
                        return handler(req, res);
                    }
                    return res.end(JSON.stringify(handler));
                }
            }

            // Default fallback response
            res.end(JSON.stringify({ data: [] }));
        });

        await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
        mockPort = mockServer.address().port;
        process.env.META_OAUTH_TOKEN_URL = `http://127.0.0.1:${mockPort}/oauth/access_token`;
    });

    after(async () => {
        if (mockServer) {
            await new Promise(resolve => mockServer.close(resolve));
        }
        if (savedLocalStore) {
            writeLocalStore(savedLocalStore);
        }
    });

    beforeEach(() => {
        mockResponses = {};
    });

    it('Scenario 1: Successfully validates and fetches profile for a valid Creator account', async () => {
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/17841445671263800')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '17841445671263800',
                        username: 'creator_jane',
                        name: 'Jane Doe',
                        biography: 'Lifestyle & Jewellery Creator',
                        website: 'https://wishrite.in/creator/jane',
                        profile_picture_url: 'https://cdn.instagram.com/p/pic_jane.jpg',
                        followers_count: 15400,
                        follows_count: 320,
                        media_count: 85
                    })
                };
            }
            return { status: 404, json: async () => ({ error: { message: 'Not found' } }) };
        };

        try {
            const profile = await fetchInstagramProfileDetails('17841445671263800', 'mock_token_123');
            assert.ok(profile, 'Profile should be returned');
            assert.equal(profile.account_id, '17841445671263800');
            assert.equal(profile.username, 'creator_jane');
            assert.equal(profile.name, 'Jane Doe');
            assert.equal(profile.followers_count, 15400);
            assert.equal(profile.following_count, 320);
            assert.equal(profile.media_count, 85);
            assert.equal(profile.profile_picture_url, 'https://cdn.instagram.com/p/pic_jane.jpg');
            assert.equal(profile.validation_status, 'verified');
            assert.equal(profile.account_type, 'professional');
            assert.ok(profile.profile_synced_at);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 2: Successfully retrieves profile and Page category for a Business account', async () => {
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/17841445671263800')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '17841445671263800',
                        username: 'business_brand',
                        followers_count: 24500,
                        follows_count: 15,
                        media_count: 310
                    })
                };
            }
            if (urlStr.includes('/591667860696059')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '591667860696059',
                        name: 'WishRite Business Page',
                        category: 'Jewelry / watches',
                        category_list: [{ id: '123', name: 'Jewelry / watches' }]
                    })
                };
            }
            return { status: 404, json: async () => ({ error: { message: 'Not found' } }) };
        };

        try {
            const profile = await fetchInstagramProfileDetails('17841445671263800', 'mock_token_bus', '591667860696059');
            assert.ok(profile);
            assert.equal(profile.account_id, '17841445671263800');
            assert.equal(profile.instagram_category, 'Jewelry / watches');
            assert.equal(profile.followers_count, 24500);
            assert.equal(profile.validation_status, 'verified');
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 3: Rejects personal accounts when no Instagram professional account is linked', async () => {
        const state = createOAuthState('test-personal-creator-id', 'http://localhost/callback');
        let redirectUrl = null;

        mockResponses['/oauth/access_token'] = { access_token: 'mock-personal-token' };
        mockResponses['/me/assigned_instagram_accounts'] = { data: [] };
        mockResponses['/me/businesses'] = { data: [] };
        mockResponses['/me/accounts'] = { data: [{ id: 'page-1', name: 'Personal FB Page' }] };
        mockResponses['/me'] = { id: 'personal-fb-user', name: 'Personal User' };

        const req = {
            query: { code: 'test-personal-code', state }
        };
        const res = {
            redirect(url) {
                redirectUrl = url;
            }
        };

        await handleInstagramOAuthCallback(req, res);
        assert.ok(redirectUrl, 'Should redirect');
        assert.ok(!redirectUrl.includes('instagram=connected'), 'Must not report connected');
        assert.ok(redirectUrl.includes('instagram=error'), 'Must redirect with instagram=error');
        assert.ok(redirectUrl.includes('Unable+to+resolve+Instagram+Business+Account+ID'), 'Must indicate business account requirement');
    });

    it('Scenario 4: Fails validation when Meta returns an invalid or inaccessible account (#100 error)', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            status: 400,
            json: async () => ({
                error: {
                    message: '(#100) Unsupported get request. Object with ID does not exist.',
                    type: 'OAuthException',
                    code: 100
                }
            })
        });

        try {
            const result = await fetchInstagramProfileDetails('invalid_id_999', 'mock_token');
            assert.ok(result?.error, 'Should return error object');
            assert.equal(result.error.code, 100);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 5: Handles expired token (code 190) gracefully in refresh endpoint and preserves existing stats', async () => {
        const testCreator = {
            id: 'test-creator-expired-token-id',
            influencer_id: 'test-creator-expired-token-id',
            name: 'Creator With Expired Token',
            instagram_connection: {
                connected: true,
                username: 'expired_user',
                account_id: '17841445671263800',
                followers_count: 5000,
                following_count: 200,
                media_count: 40,
                access_token: 'valid-looking-token',
                insights_status: 'connected'
            }
        };

        const originalFetch = global.fetch;
        global.fetch = async () => ({
            status: 400,
            json: async () => ({
                error: {
                    message: 'Error validating access token: Session has expired.',
                    type: 'OAuthException',
                    code: 190,
                    error_subcode: 463
                }
            })
        });

        let statusCode = 200;
        let responseJson = null;

        const req = { creator: testCreator };
        const res = {
            status(code) {
                statusCode = code;
                return { json(payload) { responseJson = payload; } };
            },
            json(payload) { responseJson = payload; }
        };

        try {
            await handleRefreshInstagramProfile(req, res);
            assert.equal(statusCode, 400);
            assert.equal(responseJson.success, false);
            assert.equal(responseJson.error.is_auth_expired, true);

            // Verify followers & media count were NOT erased
            assert.equal(testCreator.instagram_connection.followers_count, 5000);
            assert.equal(testCreator.instagram_connection.media_count, 40);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 6: Detects and rejects missing required permissions (instagram_manage_insights missing)', async () => {
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/me/permissions')) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [
                            { permission: 'instagram_basic', status: 'granted' },
                            { permission: 'pages_show_list', status: 'granted' },
                            { permission: 'instagram_manage_insights', status: 'declined' }
                        ]
                    })
                };
            }
            return { status: 404, json: async () => ({ error: { message: 'Not found' } }) };
        };

        try {
            const permCheck = await verifyMetaTokenPermissions('mock_token_with_declined_insights');
            assert.equal(permCheck.valid, false);
            assert.ok(permCheck.missing.includes('instagram_manage_insights'));
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 7: Gracefully handles an account with no category without failing validation', async () => {
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/17841445671263800')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '17841445671263800',
                        username: 'no_category_creator',
                        followers_count: 850,
                        follows_count: 120,
                        media_count: 14
                    })
                };
            }
            if (urlStr.includes('/page-without-category')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: 'page-without-category',
                        name: 'Page with null category'
                    })
                };
            }
            return { status: 404, json: async () => ({ error: { message: 'Not found' } }) };
        };

        try {
            const profile = await fetchInstagramProfileDetails('17841445671263800', 'mock_token', 'page-without-category');
            assert.ok(profile);
            assert.equal(profile.instagram_category, null);
            assert.equal(profile.validation_status, 'verified');
            assert.equal(profile.followers_count, 850);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 8: Correctly validates and preserves account with zero followers, zero posts', async () => {
        const originalFetch = global.fetch;
        global.fetch = async (url) => ({
            status: 200,
            json: async () => ({
                id: '17841445671263800',
                username: 'newbie_creator',
                followers_count: 0,
                follows_count: 0,
                media_count: 0
            })
        });

        try {
            const profile = await fetchInstagramProfileDetails('17841445671263800', 'mock_token');
            assert.ok(profile);
            assert.strictEqual(profile.followers_count, 0);
            assert.strictEqual(profile.following_count, 0);
            assert.strictEqual(profile.media_count, 0);
            assert.equal(profile.validation_status, 'verified');
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 9: Retains valid existing profile metrics upon API rate limit or transient failure', async () => {
        const testCreator = {
            id: 'test-creator-retention-id',
            influencer_id: 'test-creator-retention-id',
            name: 'Retention Creator',
            instagram_connection: {
                connected: true,
                username: 'retention_creator',
                account_id: '17841445671263800',
                followers_count: 9800,
                following_count: 450,
                media_count: 120,
                profile_picture_url: 'https://cdn/pic.jpg',
                instagram_category: 'Reel creator',
                validation_status: 'verified',
                access_token: 'valid-test-token'
            }
        };

        const originalFetch = global.fetch;
        // Mock rate limit error on profile fetch
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/17841445671263800/media')) {
                return { status: 200, json: async () => ({ data: [] }) };
            }
            if (urlStr.includes('/17841445671263800')) {
                return {
                    status: 429,
                    json: async () => ({
                        error: {
                            message: 'Application request limit reached',
                            type: 'OAuthException',
                            code: 4
                        }
                    })
                };
            }
            return { status: 200, json: async () => ({}) };
        };

        try {
            const result = await syncCreatorInstagram(testCreator);
            assert.ok(result.success, 'Sync should complete');
            // Check that previous followers & media count were preserved
            assert.equal(result.profile.followers_count, 9800);
            assert.equal(result.profile.following_count, 450);
            assert.equal(result.profile.media_count, 120);
            assert.equal(result.profile.instagram_category, 'Reel creator');
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Scenario 10: Prevents cross-creator account hijacking (rejects if account already bound to another creator)', async () => {
        const store = readLocalStore();
        store.influencers = store.influencers || [];

        // Creator A is already connected to account 17841445671263800
        const CREATOR_A_ID = 'creator-a-unique-uuid-111';
        const CREATOR_B_ID = 'creator-b-unique-uuid-222';

        store.influencers.push({
            id: CREATOR_A_ID,
            name: 'Creator A Owner',
            instagram_connection: {
                connected: true,
                username: 'shared_ig_handle',
                account_id: '17841445671263800'
            }
        });
        store.influencers.push({
            id: CREATOR_B_ID,
            name: 'Creator B Attacker'
        });
        writeLocalStore(store);

        // Creator B attempts to complete OAuth and connect 17841445671263800
        mockResponses['/oauth/access_token'] = { access_token: 'mock-b-token' };

        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/oauth/access_token')) {
                return { status: 200, json: async () => ({ access_token: 'mock-b-token' }) };
            }
            if (urlStr.includes('/me/permissions')) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [
                            { permission: 'instagram_basic', status: 'granted' },
                            { permission: 'instagram_manage_insights', status: 'granted' }
                        ]
                    })
                };
            }
            if (urlStr.includes('/me/assigned_instagram_accounts')) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [{ id: '17841445671263800', username: 'shared_ig_handle' }]
                    })
                };
            }
            if (urlStr.includes('/17841445671263800')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '17841445671263800',
                        username: 'shared_ig_handle',
                        followers_count: 500,
                        follows_count: 50,
                        media_count: 10
                    })
                };
            }
            return { status: 200, json: async () => ({ data: [] }) };
        };

        const state = createOAuthState(CREATOR_B_ID, 'http://localhost/callback');
        let redirectUrl = null;

        const req = {
            query: { code: 'test-hijack-code', state }
        };
        const res = {
            redirect(url) {
                redirectUrl = url;
            }
        };

        try {
            await handleInstagramOAuthCallback(req, res);

            assert.ok(redirectUrl, 'Should redirect');
            assert.ok(!redirectUrl.includes('instagram=connected'), 'Must not report connected');
            assert.ok(redirectUrl.includes('instagram=error'), 'Must redirect with error');
            assert.ok(decodeURIComponent(redirectUrl).includes('already connected to another WishRite creator'), 'Must give clear hijacking prevention message');

            // Verify Creator A connection is unchanged
            const storeAfter = readLocalStore();
            const creatorA = storeAfter.influencers.find(i => i.id === CREATOR_A_ID);
            assert.equal(creatorA.instagram_connection.account_id, '17841445671263800');
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('Verifies creator niche update endpoint accepts valid niches and rejects invalid ones', async () => {
        const testCreator = {
            id: 'test-creator-niche-uuid',
            influencer_id: 'test-creator-niche-uuid',
            name: 'Niche Creator'
        };

        // 1. Valid niche
        let statusCode = 200;
        let responseJson = null;
        let req = { creator: testCreator, body: { creator_niche: 'Jewellery & Accessories' } };
        let res = {
            status(c) { statusCode = c; return { json(p) { responseJson = p; } }; },
            json(p) { responseJson = p; }
        };
        await handleUpdateCreatorNiche(req, res);
        assert.equal(statusCode, 200);
        assert.equal(responseJson.success, true);
        assert.equal(responseJson.creator_niche, 'Jewellery & Accessories');

        // 2. Invalid niche
        statusCode = 200;
        req = { creator: testCreator, body: { creator_niche: 'Invalid Custom Random Niche' } };
        res = {
            status(c) { statusCode = c; return { json(p) { responseJson = p; } }; },
            json(p) { responseJson = p; }
        };
        await handleUpdateCreatorNiche(req, res);
        assert.equal(statusCode, 400);
        assert.equal(responseJson.success, false);
        assert.ok(responseJson.error.message.includes('Invalid niche'));
    });
});
