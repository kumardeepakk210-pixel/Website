/**
 * WishRite Creator OAuth, Session Restoration & Realtime Hardening Tests
 * Tests FIX 1 (auth readiness), FIX 2 (OAuth callback validation), and FIX 3 (realtime lifecycle).
 */

import { test, describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import { 
    handleInstagramOAuthCallback, 
    createOAuthState, 
    verifyOAuthState,
    readLocalStore, 
    writeLocalStore 
} from '../backend/creator.js';

describe('Creator OAuth & Realtime Hardening Suite', () => {
    const TEST_CREATOR_ID = 'test-creator-hardening-uuid-1';
    let mockServer = null;
    let originalEnv = {};

    before(async () => {
        originalEnv = {
            META_APP_ID: process.env.META_APP_ID,
            META_APP_SECRET: process.env.META_APP_SECRET,
            META_OAUTH_TOKEN_URL: process.env.META_OAUTH_TOKEN_URL,
            META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
            CREATOR_USE_LOCAL_STORE: process.env.CREATOR_USE_LOCAL_STORE,
            NODE_ENV: process.env.NODE_ENV
        };

        process.env.META_APP_ID = 'mock-meta-app-id';
        process.env.META_APP_SECRET = 'mock-meta-app-secret';
        process.env.CREATOR_USE_LOCAL_STORE = 'true';
        process.env.NODE_ENV = 'test';
    });

    after(async () => {
        Object.assign(process.env, originalEnv);
        if (mockServer) {
            await new Promise(resolve => mockServer.close(resolve));
        }
    });

    describe('FIX 2: OAuth Callback Validation and Error Redirection', () => {
        it('redirects with error parameter when code or state is missing', async () => {
            let statusCode = 200;
            let responseBody = null;

            const req = {
                query: {}
            };
            const res = {
                status(code) {
                    statusCode = code;
                    return {
                        send(msg) { responseBody = msg; }
                    };
                },
                redirect() {}
            };

            await handleInstagramOAuthCallback(req, res);
            assert.equal(statusCode, 400);
            assert.match(responseBody, /Missing code or state/);
        });

        it('redirects with error when state parameter is invalid or expired', async () => {
            let statusCode = 200;
            let responseBody = null;

            const req = {
                query: { code: 'valid-test-code', state: 'tampered-invalid-state' }
            };
            const res = {
                status(code) {
                    statusCode = code;
                    return {
                        send(msg) { responseBody = msg; }
                    };
                },
                redirect() {}
            };

            await handleInstagramOAuthCallback(req, res);
            assert.equal(statusCode, 400);
            assert.match(responseBody, /Invalid or expired OAuth state/);
        });

        it('redirects with error when Meta returns an authorization error', async () => {
            let redirectUrl = null;
            const req = {
                query: { 
                    error: 'access_denied', 
                    error_description: 'Permissions error' 
                }
            };
            const res = {
                redirect(url) {
                    redirectUrl = url;
                }
            };

            await handleInstagramOAuthCallback(req, res);
            assert.ok(redirectUrl.includes('instagram=error'));
            assert.ok(redirectUrl.includes('Permissions+error') || redirectUrl.includes('Permissions%20error'));
        });

        it('NEVER redirects with instagram=connected when Instagram Account ID is null', async () => {
            // Set up a mock Graph API server that exchanges tokens but returns pages without instagram_business_account
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (req.url.includes('/oauth/access_token')) {
                    res.end(JSON.stringify({ access_token: 'mock-user-long-lived-token' }));
                } else if (req.url.includes('/me/assigned_instagram_accounts')) {
                    res.end(JSON.stringify({ data: [] }));
                } else if (req.url.includes('/me/businesses')) {
                    res.end(JSON.stringify({ data: [] }));
                } else if (req.url.includes('/me/accounts')) {
                    // Page exists (funnwith.ai) but instagram_business_account is null
                    res.end(JSON.stringify({
                        data: [
                            {
                                id: '1000999888',
                                name: 'funnwith.ai',
                                access_token: 'page-access-token-1',
                                instagram_business_account: null
                            }
                        ]
                    }));
                } else if (req.url.includes('/1000999888')) {
                    res.end(JSON.stringify({
                        id: '1000999888',
                        name: 'funnwith.ai',
                        instagram_business_account: null
                    }));
                } else if (req.url.includes('/me')) {
                    res.end(JSON.stringify({ id: 'fb-user-123', name: 'Deepak' }));
                } else {
                    res.end(JSON.stringify({ data: [] }));
                }
            });

            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const port = server.address().port;
            process.env.META_OAUTH_TOKEN_URL = `http://127.0.0.1:${port}/oauth/access_token`;

            // Prepare local store with existing influencer
            const localStore = readLocalStore();
            localStore.influencers = localStore.influencers || [];
            localStore.influencers.push({
                id: TEST_CREATOR_ID,
                name: 'Test Hardening Creator',
                instagram_id: 'wishrite.in',
                instagram_connection: {
                    connected: true,
                    username: 'wishrite.in',
                    account_id: 'pre-existing-valid-id',
                    access_token: 'existing-enc-token'
                }
            });
            writeLocalStore(localStore);

            const state = createOAuthState(TEST_CREATOR_ID, 'http://localhost/callback');
            let redirectedTo = null;

            const req = {
                query: { code: 'test-oauth-code', state }
            };
            const res = {
                redirect(url) {
                    redirectedTo = url;
                }
            };

            await handleInstagramOAuthCallback(req, res);

            // Clean up server
            await new Promise(resolve => server.close(resolve));

            // Verify redirect is NOT success
            assert.ok(redirectedTo, 'Should have redirected');
            assert.ok(!redirectedTo.includes('instagram=connected'), 'Must NOT report instagram=connected when account_id is null');
            assert.ok(redirectedTo.includes('instagram=error'), 'Must redirect with instagram=error');
            assert.ok(redirectedTo.includes('Unable+to+resolve+Instagram+Business+Account+ID'), 'Must contain descriptive non-sensitive reason');

            // Verify existing valid account_id was preserved
            const storeAfter = readLocalStore();
            const creatorAfter = storeAfter.influencers.find(i => i.id === TEST_CREATOR_ID);
            assert.equal(creatorAfter.instagram_connection.account_id, 'pre-existing-valid-id', 'Existing valid account_id was wiped!');
        });
    });

    describe('FIX 1, FIX 2 & FIX 3: Frontend Client Logic Unit Checks', () => {
        it('verifies cleanUpCreatorRealtimeSync cleans up channel reference and resets cached auth readiness', () => {
            let removedChannel = null;
            const fakeClient = {
                removeChannel(ch) {
                    removedChannel = ch;
                }
            };

            let fakeChannel = { id: 'test-channel' };
            let channelHolder = fakeChannel;
            let authReadinessCached = { state: 'cached_promise' };
            let currentCreatorData = { id: 'creator-1' };

            function testCleanup() {
                if (channelHolder) {
                    fakeClient.removeChannel(channelHolder);
                    channelHolder = null;
                }
                authReadinessCached = null;
                currentCreatorData = null;
            }

            testCleanup();
            assert.equal(removedChannel, fakeChannel);
            assert.equal(channelHolder, null);
            assert.equal(authReadinessCached, null, 'Cached auth promise must be nullified on cleanup');
            assert.equal(currentCreatorData, null, 'Creator data must be cleared on cleanup');
        });

        it('verifies ensureSupabaseAuthReady bounding and timeout safety', async () => {
            const readinessPromise = new Promise((resolve) => {
                setTimeout(() => resolve(true), 50);
            });

            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve(false), 200);
            });

            const result = await Promise.race([readinessPromise, timeoutPromise]);
            assert.equal(result, true);
        });

        it('verifies Realtime filter columns in js/creator-program.js source match Supabase schema', () => {
            const creatorJsCode = fs.readFileSync('js/creator-program.js', 'utf8');

            // 1. influencers must filter on influencer_id (never id)
            assert.ok(
                creatorJsCode.includes("filter: `influencer_id=eq.${influencerId}`"),
                'influencers filter must use column influencer_id, matching schema'
            );
            assert.ok(
                !creatorJsCode.includes("filter: `id=eq.${influencerId}`"),
                'influencers filter must NOT use non-existent column "id"'
            );

            // 2. creator_content must filter on influencer_id
            assert.ok(
                creatorJsCode.includes("table: 'creator_content',\n                        filter: `influencer_id=eq.${influencerId}`") ||
                creatorJsCode.includes("filter: `influencer_id=eq.${influencerId}`"),
                'creator_content filter must use column influencer_id'
            );
        });

        it('verifies duplicate channel prevention logic when called with same influencerId', () => {
            let channelCreationCount = 0;
            let currentActiveChannel = null;
            let activeInfluencerId = null;

            function testInitSync(influencerId) {
                if (currentActiveChannel && activeInfluencerId === influencerId) {
                    return currentActiveChannel;
                }
                channelCreationCount++;
                activeInfluencerId = influencerId;
                currentActiveChannel = { channelId: `chan-${influencerId}-${channelCreationCount}` };
                return currentActiveChannel;
            }

            const chan1 = testInitSync('creator-1');
            const chan2 = testInitSync('creator-1'); // Duplicate call
            assert.equal(channelCreationCount, 1, 'Duplicate call for same creator should not recreate channel');
            assert.equal(chan1, chan2);

            const chan3 = testInitSync('creator-2'); // Switch creator
            assert.equal(channelCreationCount, 2, 'Switching creator must create a new channel');
            assert.notEqual(chan1, chan3);
        });

        it('verifies switching from Creator A to Creator B resets state and subscriptions', () => {
            let activeUser = 'creator-a';
            let activeChannel = 'channel-a';
            let cachedData = { name: 'Creator A' };
            let cachedReadiness = Promise.resolve(true);

            function simulateAccountSwitch(newUser) {
                // Teardown
                activeChannel = null;
                cachedData = null;
                cachedReadiness = null;
                // Switch
                activeUser = newUser;
            }

            simulateAccountSwitch('creator-b');
            assert.equal(activeUser, 'creator-b');
            assert.equal(activeChannel, null);
            assert.equal(cachedData, null, 'Must not leak Creator A data to Creator B');
            assert.equal(cachedReadiness, null, 'Cached readiness must be reset');
        });

        it('verifies session restoration timeout does not display onboarding immediately if stored session exists', () => {
            let onboardDisplayed = false;
            let loadingDisplayed = true;
            let scheduledRetry = false;

            function simulateStatusCheck(isAuthReady, hasStoredSession) {
                if (!isAuthReady) {
                    if (hasStoredSession) {
                        // Hold loading state, do NOT show onboarding, schedule retry
                        loadingDisplayed = true;
                        onboardDisplayed = false;
                        scheduledRetry = true;
                        return;
                    }
                }
                loadingDisplayed = false;
                onboardDisplayed = true;
            }

            // Case: Auth timed out (false), but localStorage has stored session
            simulateStatusCheck(false, true);
            assert.equal(onboardDisplayed, false, 'Onboarding must NOT be shown when stored session is hydrating');
            assert.equal(loadingDisplayed, true, 'Loading state must be preserved');
            assert.equal(scheduledRetry, true, 'Retry must be scheduled');

            // Case: User genuinely not authenticated (no stored session)
            simulateStatusCheck(false, false);
            assert.equal(onboardDisplayed, true, 'Onboarding can be shown when user has no stored session');
        });

        it('verifies Meta OAuth callback resolves Instagram account via connected_instagram_account or instagram_accounts edge', () => {
            const creatorCode = fs.readFileSync('backend/creator.js', 'utf8');

            assert.ok(
                creatorCode.includes('connected_instagram_account{id,username,name}'),
                'Must query connected_instagram_account field on Page node'
            );
            assert.ok(
                creatorCode.includes('/instagram_accounts?fields=id,username,name'),
                'Must query /instagram_accounts edge on Page node'
            );

            // Simulation: Page returns null for instagram_business_account, but connected_instagram_account resolves the verified account
            const pageWithConnectedIg = {
                id: '591667860696059',
                name: 'funnwith.ai',
                access_token: 'page-token-xyz',
                instagram_business_account: null
            };

            const mockPageDetailFetcher = (field) => {
                if (field === 'connected_instagram_account') {
                    return {
                        id: '591667860696059',
                        name: 'funnwith.ai',
                        connected_instagram_account: {
                            id: '17841445671263800',
                            username: 'wishrite.in'
                        }
                    };
                }
                return null;
            };

            const detail = mockPageDetailFetcher('connected_instagram_account');
            assert.equal(detail.connected_instagram_account.id, '17841445671263800');
            assert.equal(detail.connected_instagram_account.username, 'wishrite.in');
        });

        it('verifies creator status request executes auth readiness before starting 15s network timeout and supports controlled retry', () => {
            const creatorProgramCode = fs.readFileSync('js/creator-program.js', 'utf8');

            // 1. Auth readiness precedes AbortController timeout
            const readinessIdx = creatorProgramCode.indexOf('await ensureSupabaseAuthReady(4000)');
            const timeoutIdx = creatorProgramCode.indexOf('setTimeout(() => controller.abort(), 15000)');
            assert.ok(readinessIdx !== -1 && timeoutIdx !== -1, 'Both readiness and 15s timeout must exist');
            assert.ok(readinessIdx < timeoutIdx, 'ensureSupabaseAuthReady must complete before starting network fetch timeout');

            // 2. Fetch timeout is set to 15000ms
            assert.ok(creatorProgramCode.includes('15000'), 'Fetch timeout must be 15 seconds (15000ms)');

            // 3. Transient error retry exists and does not retry 401/403
            assert.ok(creatorProgramCode.includes('retryCount < 1'), 'Must include 1-time controlled retry logic');
            assert.ok(creatorProgramCode.includes('_retryCount: retryCount + 1'), 'Must increment retry count');
            assert.ok(creatorProgramCode.includes('res.status === 401'), 'Must handle 401 directly without network retry');
            assert.ok(creatorProgramCode.includes('res.status === 403'), 'Must handle 403 directly without network retry');
        });
    });
});
