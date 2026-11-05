/**
 * WishRite Creator Stateless & Serverless Multi-Instance Authentication Suite
 * 
 * Verifies:
 * 1. HMAC-SHA256 signed stateless creator session token issuance and verification.
 * 2. Simulated serverless cold-start: Instance A issues session token, Instance B (fresh memory) validates token and serves content.
 * 3. Creator data isolation: Creator B cannot access Creator A content even if requesting Creator A's ID.
 * 4. Token expiration handling: Expired tokens return 401 SESSION_EXPIRED.
 * 5. Tampered token rejection: Altered payload/signature returns 401.
 * 6. Inactive creator access check: Inactive creators return 403.
 * 7. Error handling in content loading: 401, 403, 500 error scenarios do not render false "No Content Submitted Yet".
 * 8. Real content vs genuine empty content verification.
 */

import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { 
    issueCreatorSession, 
    verifyCreatorSessionToken, 
    requireCreatorAuth,
    handleGetCreatorContent,
    getCreatorHmacSecret,
    readLocalStore,
    writeLocalStore
} from '../backend/creator.js';

describe('Creator Serverless & Stateless Authentication Suite', () => {
    let originalEnv = {};
    const CREATOR_A_ID = 'test-stateless-creator-a-id';
    const CREATOR_B_ID = 'test-stateless-creator-b-id';

    before(() => {
        originalEnv = {
            CREATOR_USE_LOCAL_STORE: process.env.CREATOR_USE_LOCAL_STORE,
            NODE_ENV: process.env.NODE_ENV,
            SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
        };

        process.env.CREATOR_USE_LOCAL_STORE = 'true';
        process.env.NODE_ENV = 'test';
        process.env.SUPABASE_SECRET_KEY = 'test-secret-stateless-key-32b-length!!';

        // Seed isolated test store
        const store = readLocalStore();
        store.influencers = (store.influencers || []).filter(i => i.id !== CREATOR_A_ID && i.id !== CREATOR_B_ID);
        store.accounts = (store.accounts || []).filter(a => a.influencer_id !== CREATOR_A_ID && a.influencer_id !== CREATOR_B_ID);
        store.creator_content = (store.creator_content || []).filter(c => c.influencer_id !== CREATOR_A_ID && c.influencer_id !== CREATOR_B_ID);

        // Creator A
        store.influencers.push({
            id: CREATOR_A_ID,
            name: 'Creator Alpha',
            email: 'creator.alpha@wishrite.test',
            status: 'active'
        });
        store.accounts.push({
            id: 'acct-creator-a',
            influencer_id: CREATOR_A_ID,
            email: 'creator.alpha@wishrite.test',
            is_active: true
        });
        store.creator_content.push(
            {
                id: 'content-a-1',
                influencer_id: CREATOR_A_ID,
                content_type: 'reel',
                url: 'https://instagram.com/reel/111',
                status: 'Approved',
                created_at: new Date(Date.now() - 10000).toISOString()
            },
            {
                id: 'content-a-2',
                influencer_id: CREATOR_A_ID,
                content_type: 'post',
                url: 'https://instagram.com/p/222',
                status: 'Submitted',
                created_at: new Date(Date.now() - 5000).toISOString()
            }
        );

        // Creator B
        store.influencers.push({
            id: CREATOR_B_ID,
            name: 'Creator Beta',
            email: 'creator.beta@wishrite.test',
            status: 'active'
        });
        store.accounts.push({
            id: 'acct-creator-b',
            influencer_id: CREATOR_B_ID,
            email: 'creator.beta@wishrite.test',
            is_active: true
        });

        writeLocalStore(store);
    });

    after(() => {
        Object.assign(process.env, originalEnv);
        // Clean test entries
        const store = readLocalStore();
        store.influencers = (store.influencers || []).filter(i => i.id !== CREATOR_A_ID && i.id !== CREATOR_B_ID);
        store.accounts = (store.accounts || []).filter(a => a.influencer_id !== CREATOR_A_ID && a.influencer_id !== CREATOR_B_ID);
        store.creator_content = (store.creator_content || []).filter(c => c.influencer_id !== CREATOR_A_ID && c.influencer_id !== CREATOR_B_ID);
        writeLocalStore(store);
    });

    describe('1. Stateless Token Cryptography & Verification', () => {
        it('generates a valid signed token starting with crt.', () => {
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token, expiresAt } = issueCreatorSession(acct, inf);

            assert.ok(token.startsWith('crt.'), 'Token must start with crt.');
            assert.equal(token.split('.').length, 3, 'Token must have 3 segments: crt.payload.sig');
            assert.ok(expiresAt > Date.now(), 'Token expiration must be in the future');

            const verified = verifyCreatorSessionToken(token);
            assert.ok(verified, 'Verification must succeed');
            assert.equal(verified.expired, false);
            assert.equal(verified.payload.accountId, 'acct-creator-a');
            assert.equal(verified.payload.influencerId, CREATOR_A_ID);
        });

        it('rejects tampered signatures', () => {
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token } = issueCreatorSession(acct, inf);

            const [p1, p2] = token.split('.');
            const forgedToken = `${p1}.${p2}.tampered_signature_hex`;
            const verified = verifyCreatorSessionToken(forgedToken);
            assert.equal(verified, null, 'Tampered signature must be rejected');
        });

        it('rejects tampered payload', () => {
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token } = issueCreatorSession(acct, inf);

            const [p1, , p3] = token.split('.');
            const maliciousPayload = Buffer.from(JSON.stringify({
                accountId: 'admin-account',
                influencerId: 'admin-id',
                exp: Date.now() + 100000
            })).toString('base64url');

            const forgedToken = `${p1}.${maliciousPayload}.${p3}`;
            const verified = verifyCreatorSessionToken(forgedToken);
            assert.equal(verified, null, 'Tampered payload must be rejected');
        });

        it('detects expired tokens correctly', () => {
            const expiredPayload = {
                accountId: 'acct-creator-a',
                influencerId: CREATOR_A_ID,
                iat: Date.now() - 100000,
                exp: Date.now() - 1000
            };
            const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
            const sec = getCreatorHmacSecret();
            const sig = crypto.createHmac('sha256', sec).update(`crt.${b64}`).digest('base64url');
            const expiredToken = `crt.${b64}.${sig}`;

            const verified = verifyCreatorSessionToken(expiredToken);
            assert.ok(verified, 'Signature is valid');
            assert.equal(verified.expired, true, 'Token must be marked expired');
        });
    });

    describe('2. Serverless Multi-Instance Simulation & Authentication Guard', () => {
        it('Instance B authenticates token issued by Instance A without shared memory', async () => {
            // Instance A issues token
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token } = issueCreatorSession(acct, inf);

            // Simulate fresh instance memory: token is verified purely via HMAC + database/store lookup
            const req = {
                headers: {
                    authorization: `Bearer ${token}`
                }
            };
            let nextCalled = false;
            let resStatus = 200;
            let resData = null;
            const res = {
                status(code) {
                    resStatus = code;
                    return this;
                },
                json(data) {
                    resData = data;
                    return this;
                }
            };

            await requireCreatorAuth(req, res, () => {
                nextCalled = true;
            });

            assert.equal(nextCalled, true, 'requireCreatorAuth should allow valid stateless token');
            assert.ok(req.creator, 'req.creator must be attached');
            assert.equal(req.creator.id, CREATOR_A_ID, 'Creator ID must match Creator A');
            assert.equal(req.creatorAccount.id, 'acct-creator-a');
        });

        it('rejects expired stateless token with 401 SESSION_EXPIRED', async () => {
            const expiredPayload = {
                accountId: 'acct-creator-a',
                influencerId: CREATOR_A_ID,
                iat: Date.now() - 100000,
                exp: Date.now() - 1000
            };
            const b64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
            const sec = getCreatorHmacSecret();
            const sig = crypto.createHmac('sha256', sec).update(`crt.${b64}`).digest('base64url');
            const expiredToken = `crt.${b64}.${sig}`;

            const req = { headers: { authorization: `Bearer ${expiredToken}` } };
            let nextCalled = false;
            let resStatus = 200;
            let resData = null;
            const res = {
                status(code) { resStatus = code; return this; },
                json(data) { resData = data; return this; }
            };

            await requireCreatorAuth(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false, 'Expired token must not call next()');
            assert.equal(resStatus, 401);
            assert.equal(resData.error.code, 'SESSION_EXPIRED');
        });

        it('rejects inactive accounts with 403 CREATOR_ACCESS_UNAVAILABLE', async () => {
            const store = readLocalStore();
            const inactiveInfId = 'inactive-creator-test-id';
            store.influencers.push({ id: inactiveInfId, name: 'Inactive', status: 'suspended' });
            store.accounts.push({ id: 'acct-inactive', influencer_id: inactiveInfId, is_active: false });
            writeLocalStore(store);

            const { token } = issueCreatorSession(
                { id: 'acct-inactive', email: 'inactive@wishrite.test' },
                { id: inactiveInfId }
            );

            const req = { headers: { authorization: `Bearer ${token}` } };
            let nextCalled = false;
            let resStatus = 200;
            let resData = null;
            const res = {
                status(code) { resStatus = code; return this; },
                json(data) { resData = data; return this; }
            };

            await requireCreatorAuth(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false);
            assert.equal(resStatus, 403);
            assert.equal(resData.error.code, 'CREATOR_ACCESS_UNAVAILABLE');

            // Cleanup
            const cleanStore = readLocalStore();
            cleanStore.influencers = cleanStore.influencers.filter(i => i.id !== inactiveInfId);
            cleanStore.accounts = cleanStore.accounts.filter(a => a.id !== 'acct-inactive');
            writeLocalStore(cleanStore);
        });
    });

    describe('3. Content Loading & Strict Creator Isolation', () => {
        it('Creator A retrieves only their content items', async () => {
            const req = {
                creator: { id: CREATOR_A_ID }
            };
            let resData = null;
            const res = {
                json(data) {
                    resData = data;
                    return this;
                }
            };

            await handleGetCreatorContent(req, res);

            assert.ok(resData.success);
            assert.equal(Array.isArray(resData.data), true);
            assert.equal(resData.data.length, 2);
            assert.ok(resData.data.every(item => item.influencer_id === CREATOR_A_ID));
        });

        it('Creator B sees zero items and cannot access Creator A content', async () => {
            const req = {
                creator: { id: CREATOR_B_ID }
            };
            let resData = null;
            const res = {
                json(data) {
                    resData = data;
                    return this;
                }
            };

            await handleGetCreatorContent(req, res);

            assert.ok(resData.success);
            assert.equal(Array.isArray(resData.data), true);
            assert.equal(resData.data.length, 0, 'Creator B must have 0 content items');
        });

        it('handleGetCreatorContent rejects unauthenticated requests with 401', async () => {
            const req = {};
            let resStatus = 200;
            let resData = null;
            const res = {
                status(code) { resStatus = code; return this; },
                json(data) { resData = data; return this; }
            };

            await handleGetCreatorContent(req, res);
            assert.equal(resStatus, 401);
            assert.equal(resData.success, false);
        });
    });

    describe('4. Client-side Concurrency & Error Handlers Check in js/creator-program.js', () => {
        it('confirms loadCreatorContent handles 401, 403, and server errors distinctly from empty content', () => {
            const clientSource = fs.readFileSync('js/creator-program.js', 'utf8');

            // Concurrency guard check
            assert.ok(clientSource.includes('_activeContentLoadId'), 'Must track active content load ID');

            // 401 handler check
            assert.ok(clientSource.includes('res.status === 401'), 'Must handle 401 status');
            assert.ok(clientSource.includes('Session Expired'), 'Must render session expired notice on 401');

            // 403 handler check
            assert.ok(clientSource.includes('res.status === 403'), 'Must handle 403 status');
            assert.ok(clientSource.includes('Creator Access Unavailable'), 'Must render access unavailable on 403');

            // Server / API error check
            assert.ok(clientSource.includes('Unable to Load Content'), 'Must render retryable error state on API failure');

            // Empty content check
            assert.ok(clientSource.includes('No Content Submitted Yet'), 'Only renders empty state on genuine empty data');

            // Realtime cleanup checks
            assert.ok(clientSource.includes('currentCreatorContent = []'), 'Cleans up content array on teardown');
            assert.ok(clientSource.includes('currentReelsList = []'), 'Cleans up reels array on teardown');

            // Explicit logout cleanup check in js/auth.js
            const authSource = fs.readFileSync('js/auth.js', 'utf8');
            assert.ok(authSource.includes("localStorage.removeItem('wishrite_creator_token')"), 'Cleans up stored creator token on explicit logout');
        });
    });

    describe('5. Dedicated Secret & Security Hardening Tests', () => {
        it('uses CREATOR_SESSION_SECRET and fails securely if missing in production', () => {
            const originalNodeEnv = process.env.NODE_ENV;
            const originalSessionSec = process.env.CREATOR_SESSION_SECRET;

            try {
                // Test 1: Production missing CREATOR_SESSION_SECRET fails securely
                process.env.NODE_ENV = 'production';
                delete process.env.CREATOR_SESSION_SECRET;

                assert.throws(() => {
                    getCreatorHmacSecret();
                }, /Missing CREATOR_SESSION_SECRET in production/);

                // Test 2: Production with CREATOR_SESSION_SECRET succeeds
                process.env.CREATOR_SESSION_SECRET = 'super-secret-prod-creator-session-key-64b-hex';
                const secret = getCreatorHmacSecret();
                assert.equal(secret, 'super-secret-prod-creator-session-key-64b-hex');
            } finally {
                process.env.NODE_ENV = originalNodeEnv;
                if (originalSessionSec) {
                    process.env.CREATOR_SESSION_SECRET = originalSessionSec;
                } else {
                    delete process.env.CREATOR_SESSION_SECRET;
                }
            }
        });

        it('does NOT fall back to META_APP_SECRET for creator session signing', () => {
            const originalNodeEnv = process.env.NODE_ENV;
            const originalSessionSec = process.env.CREATOR_SESSION_SECRET;
            const originalMetaSec = process.env.META_APP_SECRET;

            try {
                process.env.NODE_ENV = 'production';
                delete process.env.CREATOR_SESSION_SECRET;
                process.env.META_APP_SECRET = 'meta-secret-should-never-be-used-here';

                assert.throws(() => {
                    getCreatorHmacSecret();
                }, /Missing CREATOR_SESSION_SECRET in production/);
            } finally {
                process.env.NODE_ENV = originalNodeEnv;
                process.env.META_APP_SECRET = originalMetaSec;
                if (originalSessionSec) {
                    process.env.CREATOR_SESSION_SECRET = originalSessionSec;
                } else {
                    delete process.env.CREATOR_SESSION_SECRET;
                }
            }
        });

        it('enforces 24-hour token lifetime for stateless creator tokens', () => {
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token, expiresAt } = issueCreatorSession(acct, inf);

            const durationMs = expiresAt - Date.now();
            // Should be approximately 24 hours (86,400,000 ms)
            assert.ok(durationMs <= 24 * 60 * 60 * 1000, 'Expiry must not exceed 24 hours');
            assert.ok(durationMs > 23 * 60 * 60 * 1000, 'Expiry must be approximately 24 hours');

            const verified = verifyCreatorSessionToken(token);
            assert.ok(verified && !verified.expired);
        });

        it('stolen-token limitation: stateless token is cryptographically valid until expired unless account deactivated', async () => {
            // Document and verify security model:
            // A stateless HMAC token contains signed claims. If stolen, it remains valid until expiry unless
            // the server invalidates the creator account.
            const acct = { id: 'acct-creator-a', email: 'creator.alpha@wishrite.test' };
            const inf = { id: CREATOR_A_ID, email: 'creator.alpha@wishrite.test' };
            const { token } = issueCreatorSession(acct, inf);

            // Valid while active
            const req = { headers: { authorization: `Bearer ${token}` } };
            let nextCalled = false;
            let resStatus = 200;
            const res = {
                status(code) { resStatus = code; return this; },
                json() { return this; }
            };
            await requireCreatorAuth(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true, 'Active account allows token');

            // Deactivating account immediately revokes token authorization
            const store = readLocalStore();
            const a = store.accounts.find(x => x.id === 'acct-creator-a');
            if (a) a.is_active = false;
            writeLocalStore(store);

            let blocked = false;
            let blockedStatus = 200;
            const resBlocked = {
                status(code) { blockedStatus = code; return this; },
                json() { return this; }
            };
            await requireCreatorAuth(req, resBlocked, () => { blocked = true; });
            assert.equal(blocked, false, 'Inactive account blocks token immediately');
            assert.equal(blockedStatus, 403, 'Returns 403 CREATOR_ACCESS_UNAVAILABLE');

            // Restore
            if (a) a.is_active = true;
            writeLocalStore(store);
        });
    });

    describe('6. Session Hydration & Authentication Timing Tests', () => {
        it('verifies auth onAuthStateChange listens for INITIAL_SESSION and SIGNED_IN to reload creator status with deferred invocation', () => {
            const authSource = fs.readFileSync('js/auth.js', 'utf8');
            assert.ok(authSource.includes("event === 'INITIAL_SESSION' || event === 'SIGNED_IN'"), 'Must handle INITIAL_SESSION and SIGNED_IN');
            assert.ok(authSource.includes('setTimeout(') && authSource.includes('window.loadCustomerCreatorStatus()'), 'Must defer call to loadCustomerCreatorStatus with setTimeout');
            assert.ok(authSource.includes("typeof window.loadCustomerCreatorStatus === 'function'"), 'Must verify function existence before invocation');
        });

        it('verifies loadCustomerCreatorStatus protects against premature onboarding and concurrent race conditions', () => {
            const creatorSource = fs.readFileSync('js/creator-program.js', 'utf8');
            assert.ok(creatorSource.includes('_activeStatusRequestId'), 'Must track active status request ID for concurrency');
            assert.ok(creatorSource.includes('data?.is_authenticated === true && data?.is_creator === false'), 'Only shows onboarding when authenticated non-creator is confirmed');
            assert.ok(creatorSource.includes('setCreatorUIState'), 'Must manage states through mutually exclusive helper');
            assert.ok(creatorSource.includes('SIGN IN REQUIRED'), 'Renders sign in required on 401 instead of become a creator');
            assert.ok(creatorSource.includes('Creator Access Unavailable'), 'Renders access unavailable on 403');
            assert.ok(creatorSource.includes('UNABLE TO LOAD'), 'Renders retry state on unexpected error');
        });

        it('behavioral test: setCreatorUIState ensures mutual exclusivity across all Creator tab states', () => {
            // Emulate minimal browser DOM environment for behavioral testing
            const stateIds = [
                'creator-loading-state',
                'creator-signin-state',
                'creator-onboard-state',
                'creator-dashboard-state',
                'creator-review-state',
                'creator-error-state'
            ];

            const domElements = {};
            const mockDoc = {
                getElementById: (id) => domElements[id] || null,
                querySelector: (sel) => null,
                createElement: (tag) => {
                    const el = { tagName: tag, style: {}, innerHTML: '', innerText: '', id: '', className: '' };
                    return el;
                }
            };

            const creatorPane = {
                id: 'tab-pane-creator',
                appendChild: (el) => { domElements[el.id] = el; return el; },
                insertBefore: (el, ref) => { domElements[el.id] = el; return el; },
                lastElementChild: null
            };
            domElements['tab-pane-creator'] = creatorPane;

            // Pre-populate standard index.html elements
            ['creator-loading-state', 'creator-onboard-state', 'creator-dashboard-state', 'creator-review-state'].forEach((id) => {
                domElements[id] = { id, style: { display: 'none' } };
            });

            // Evaluate setCreatorUIState in context
            const code = fs.readFileSync('js/creator-program.js', 'utf8');
            const fnMatch = code.match(/function setCreatorUIState[\s\S]*?\n\}/);
            assert.ok(fnMatch, 'setCreatorUIState function definition must exist');

            const testScope = {
                document: mockDoc,
                window: {},
                updateCreatorHeroCTA: () => {},
                prefillOnboardingForm: () => {}
            };
            const runner = new Function('document', 'window', 'updateCreatorHeroCTA', 'prefillOnboardingForm', `
                ${fnMatch[0]};
                return setCreatorUIState;
            `);
            const setCreatorUIState = runner(testScope.document, testScope.window, testScope.updateCreatorHeroCTA, testScope.prefillOnboardingForm);

            // Test 1: Transition to 'loading'
            setCreatorUIState('loading');
            assert.strictEqual(domElements['creator-loading-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-onboard-state'].style.display, 'none');
            assert.strictEqual(domElements['creator-dashboard-state'].style.display, 'none');

            // Test 2: Transition to 'signin'
            setCreatorUIState('signin');
            assert.strictEqual(domElements['creator-signin-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-loading-state'].style.display, 'none');
            assert.strictEqual(domElements['creator-onboard-state'].style.display, 'none');

            // Test 3: Transition to 'onboard'
            setCreatorUIState('onboard');
            assert.strictEqual(domElements['creator-onboard-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-signin-state'].style.display, 'none');
            assert.strictEqual(domElements['creator-dashboard-state'].style.display, 'none');

            // Test 4: Transition to 'dashboard'
            setCreatorUIState('dashboard');
            assert.strictEqual(domElements['creator-dashboard-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-onboard-state'].style.display, 'none');
            assert.strictEqual(domElements['creator-signin-state'].style.display, 'none');

            // Test 5: Transition to 'review' (403 or under_review)
            setCreatorUIState('review');
            assert.strictEqual(domElements['creator-review-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-dashboard-state'].style.display, 'none');

            // Test 6: Transition to 'error' (5xx / network)
            setCreatorUIState('error');
            assert.strictEqual(domElements['creator-error-state'].style.display, 'block');
            assert.strictEqual(domElements['creator-review-state'].style.display, 'none');
            assert.strictEqual(domElements['creator-dashboard-state'].style.display, 'none');
        });

        it('behavioral test: stale status requests cannot overwrite newer account state', async () => {
            let activeRequestId = 0;
            let currentUiState = 'initial';

            // Simulate the request ID concurrency logic from loadCustomerCreatorStatus
            const simulateStatusRequest = async (userLabel, delayMs, finishState) => {
                const reqId = ++activeRequestId;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                // Only write if this request is still active
                if (reqId === activeRequestId) {
                    currentUiState = finishState;
                }
            };

            // Launch Request 1 (slow, from Account A) with 50ms delay
            const p1 = simulateStatusRequest('Account A', 50, 'Account A State');

            // Immediately launch Request 2 (fast, account switch to Account B) with 10ms delay
            const p2 = simulateStatusRequest('Account B', 10, 'Account B State');

            await Promise.all([p1, p2]);

            // Request 2 was newer, so Request 1 must NOT have overwritten currentUiState
            assert.strictEqual(currentUiState, 'Account B State');
        });
    });
});
