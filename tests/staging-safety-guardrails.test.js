/**
 * ==============================================================================
 * TEST SUITE: WishRite Staging Safety & QA Creator Isolation Guardrails
 * ==============================================================================
 * 
 * Verifies all staging-only safety protections for Meta App Review:
 * 1. Allowlisted QA creator login on staging
 * 2. Rejection of non-allowlisted creators on staging
 * 3. Unchanged production login behavior
 * 4. Staging middleware enforcement via requireCreatorAuth
 * 5. Cryptographic OAuth state binding to verified QA creator UUID
 * 6. OAuth callback record isolation (cannot update non-QA creator)
 * 7. Token encryption verification (AES-256-GCM)
 * 8. Disconnect isolation (affects only authenticated QA creator)
 * 9. Financial operation blocks in staging (payouts, withdrawals, checkout, wallet)
 * 10. Contest participation and leaderboard protection in staging
 * ==============================================================================
 */

import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'crypto';
import {
    handleCreatorLogin,
    requireCreatorAuth,
    createOAuthState,
    verifyOAuthState,
    handleInstagramOAuthStart,
    handleInstagramOAuthCallback,
    handleDisconnectInstagram,
    isPositivelyIdentifiedSyntheticFixture,
    addContestPoints,
    calculateContestLeaderboard,
    readLocalStore,
    writeLocalStore,
    hashPassword,
    issueCreatorSession
} from '../backend/creator.js';
import {
    isStagingMode,
    isAllowedStagingCreatorEmail,
    getAllowedStagingCreatorEmails,
    getPublicMetaConfig
} from '../backend/meta-config.js';
import {
    encryptToken,
    decryptToken
} from '../backend/services/instagram-sync.js';
import {
    handleCreateWithdrawal,
    dispatchRazorpayXPayout
} from '../backend/creator-wallet.js';
import { handleCheckoutCreateOrder } from '../backend/checkout.js';
import { handleWalletCreateOrder } from '../backend/wallet.js';

describe('WishRite Staging Safety & QA Creator Isolation Guardrails', () => {
    const QA_CREATOR_ID = '00000000-0000-4000-a000-000000000099';
    const QA_EMAIL = 'qa.creator@wishrite.test';
    const PROD_CREATOR_ID = '00000000-0000-4000-a000-000000000001';
    const PROD_EMAIL = 'prod.creator@wishrite.in';
    const TEST_PASSWORD = 'WishriteTest2026!';

    let originalEnv = {};

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.NODE_ENV = 'test';
        process.env.CREATOR_USE_LOCAL_STORE = 'true';
        process.env.CREATOR_SESSION_SECRET = 'test-creator-session-secret-32b-key!';
        process.env.META_APP_SECRET = 'test-meta-app-secret-32b-length!!';
        process.env.META_APP_ID = '4398945700321494';

        // Seed clean local test database
        const store = readLocalStore();
        store.influencers = (store.influencers || []).filter(i => i.id !== QA_CREATOR_ID && i.id !== PROD_CREATOR_ID);
        store.accounts = (store.accounts || []).filter(a => a.influencer_id !== QA_CREATOR_ID && a.influencer_id !== PROD_CREATOR_ID);
        store.creator_content = (store.creator_content || []).filter(c => c.influencer_id !== QA_CREATOR_ID && c.influencer_id !== PROD_CREATOR_ID);
        store.contest_scores = (store.contest_scores || []).filter(s => s.influencer_id !== QA_CREATOR_ID && s.influencer_id !== PROD_CREATOR_ID);
        store.contest_participants = (store.contest_participants || []).filter(p => p.influencer_id !== QA_CREATOR_ID && p.influencer_id !== PROD_CREATOR_ID);

        // 1. Seed QA Creator
        store.influencers.push({
            id: QA_CREATOR_ID,
            name: 'QA Test Creator',
            email: QA_EMAIL,
            status: 'active',
            instagram_id: 'qatestcreator'
        });
        store.accounts.push({
            id: 'acct-qa-creator',
            influencer_id: QA_CREATOR_ID,
            email: QA_EMAIL,
            password_hash: hashPassword(TEST_PASSWORD),
            is_active: true
        });

        // 2. Seed Production Creator
        store.influencers.push({
            id: PROD_CREATOR_ID,
            name: 'Production Creator',
            email: PROD_EMAIL,
            status: 'active',
            instagram_id: 'prodcreator'
        });
        store.accounts.push({
            id: 'acct-prod-creator',
            influencer_id: PROD_CREATOR_ID,
            email: PROD_EMAIL,
            password_hash: hashPassword(TEST_PASSWORD),
            is_active: true
        });

        writeLocalStore(store);
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('1. Allowlisted QA creator can successfully log in on staging', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa.creator@wishrite.test, other.qa@wishrite.test';

        assert.equal(isStagingMode(), true);
        assert.deepEqual(getAllowedStagingCreatorEmails(), ['qa.creator@wishrite.test', 'other.qa@wishrite.test']);
        assert.equal(isAllowedStagingCreatorEmail(QA_EMAIL), true);

        const req = {
            body: { email: QA_EMAIL, password: TEST_PASSWORD },
            headers: {}
        };
        let responseStatus = 200;
        let responseData = null;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await handleCreatorLogin(req, res);

        assert.equal(responseStatus, 200);
        assert.equal(responseData.success, true);
        assert.ok(responseData.token, 'Should return a valid session token');
        assert.equal(responseData.creator.id, QA_CREATOR_ID);
    });

    it('2. Non-allowlisted creator is rejected on staging with 403 STAGING_CREATOR_ACCESS_DENIED', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa.creator@wishrite.test';

        assert.equal(isAllowedStagingCreatorEmail(PROD_EMAIL), false);

        const req = {
            body: { email: PROD_EMAIL, password: TEST_PASSWORD },
            headers: {}
        };
        let responseStatus = 200;
        let responseData = null;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await handleCreatorLogin(req, res);

        assert.equal(responseStatus, 403);
        assert.equal(responseData.success, false);
        assert.equal(responseData.error.code, 'STAGING_CREATOR_ACCESS_DENIED');
        assert.match(responseData.error.message, /staging environment is restricted/i);
    });

    it('3. Production creator login remains completely unchanged when staging mode is inactive', async () => {
        delete process.env.WISHRITE_STAGING_MODE;
        delete process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS;

        assert.equal(isStagingMode(), false);
        assert.equal(isAllowedStagingCreatorEmail(PROD_EMAIL), true);

        const req = {
            body: { email: PROD_EMAIL, password: TEST_PASSWORD },
            headers: {}
        };
        let responseStatus = 200;
        let responseData = null;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await handleCreatorLogin(req, res);

        assert.equal(responseStatus, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.creator.id, PROD_CREATOR_ID);
    });

    it('4. requireCreatorAuth blocks non-allowlisted creators on staging even with a pre-existing token', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa.creator@wishrite.test';

        const store = readLocalStore();
        const prodAccount = store.accounts.find(a => a.influencer_id === PROD_CREATOR_ID);
        const prodCreator = store.influencers.find(i => i.id === PROD_CREATOR_ID);
        const { token } = issueCreatorSession(prodAccount, prodCreator);

        const req = {
            headers: { authorization: `Bearer ${token}` }
        };
        let responseStatus = 200;
        let responseData = null;
        let nextCalled = false;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await requireCreatorAuth(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, false, 'Middleware must not call next() for non-allowlisted creator');
        assert.equal(responseStatus, 403);
        assert.equal(responseData.error.code, 'STAGING_CREATOR_ACCESS_DENIED');
    });

    it('5. Staging OAuth state cryptographically embeds and signs the verified QA creator identity', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa.creator@wishrite.test';
        process.env.META_OAUTH_REDIRECT_URI = 'https://review.wishrite.in/api/creator/instagram/oauth/callback';

        const stateStr = createOAuthState(QA_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
        assert.ok(stateStr.includes('.'), 'State must be HMAC signed');

        const verified = verifyOAuthState(stateStr);
        assert.ok(verified, 'State must pass HMAC verification');
        assert.equal(verified.creatorId, QA_CREATOR_ID);
        assert.equal(verified.redirectUri, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
    });

    it('6. OAuth callback cannot update another creator record and blocks non-QA creators on staging', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa.creator@wishrite.test';

        // State signed for production creator (attack / mixup scenario)
        const forgedState = createOAuthState(PROD_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');

        const req = {
            query: { code: 'test_code_123', state: forgedState },
            headers: {}
        };
        let responseStatus = 200;
        let sentMessage = '';
        const res = {
            status: (code) => { responseStatus = code; return res; },
            send: (msg) => { sentMessage = msg; return res; },
            redirect: () => {}
        };

        await handleInstagramOAuthCallback(req, res);

        assert.equal(responseStatus, 403);
        assert.match(sentMessage, /restricted to authorized QA creators/i);

        // Verify production creator row was untouched
        const store = readLocalStore();
        const prodInf = store.influencers.find(i => i.id === PROD_CREATOR_ID);
        assert.equal(prodInf.instagram_connection, undefined, 'Production creator must have zero connection data');
    });

    it('7. Instagram access tokens are encrypted with AES-256-GCM', () => {
        const rawToken = 'EAAG_test_user_access_token_super_secret_12345';
        const enc = encryptToken(rawToken);

        assert.ok(enc.startsWith('enc:'), 'Encrypted token must have enc: prefix');
        assert.equal(enc.includes(rawToken), false, 'Ciphertext must not expose raw token');

        const decrypted = decryptToken(enc);
        assert.equal(decrypted, rawToken, 'Decrypted token must match original exactly');
    });

    it('8. Disconnect affects only the authenticated QA creator record', async () => {
        const store = readLocalStore();
        const qaInf = store.influencers.find(i => i.id === QA_CREATOR_ID);
        qaInf.instagram_connection = { connected: true, username: 'qatest' };
        const prodInf = store.influencers.find(i => i.id === PROD_CREATOR_ID);
        prodInf.instagram_connection = { connected: true, username: 'prodtest' };
        writeLocalStore(store);

        const req = {
            creator: { id: QA_CREATOR_ID }
        };
        let responseStatus = 200;
        let responseData = null;
        const res = {
            status: (code) => { responseStatus = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await handleDisconnectInstagram(req, res);

        assert.equal(responseStatus, 200);
        assert.equal(responseData.success, true);

        // Verify QA creator disconnected, Prod creator still connected
        const updatedStore = readLocalStore();
        const updatedQa = updatedStore.influencers.find(i => i.id === QA_CREATOR_ID);
        const updatedProd = updatedStore.influencers.find(i => i.id === PROD_CREATOR_ID);
        assert.equal(updatedQa.instagram_connection, null, 'QA creator must be disconnected');
        assert.equal(updatedProd.instagram_connection?.username, 'prodtest', 'Prod creator must remain connected');
    });

    it('9. Staging blocks live financial operations (withdrawals, payouts, checkout, wallet)', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';

        // 1. Withdrawal request blocked
        const wReq = { creator: { id: QA_CREATOR_ID }, body: { amount: 1000 } };
        let wStatus = 200;
        let wData = null;
        const wRes = {
            status: (c) => { wStatus = c; return wRes; },
            json: (d) => { wData = d; return wRes; }
        };
        await handleCreateWithdrawal(wReq, wRes);
        assert.equal(wStatus, 403);
        assert.equal(wData.error.code, 'STAGING_PAYOUTS_DISABLED');

        // 2. Direct RazorpayX disbursement function blocked
        const pRes = await dispatchRazorpayXPayout({
            withdrawal: { id: 'w1', withdrawal_reference: 'WR-WTH-01' },
            influencer: { id: QA_CREATOR_ID },
            payoutMethod: {}
        });
        assert.equal(pRes.success, false);
        assert.equal(pRes.code, 'STAGING_PAYOUTS_DISABLED');

        // 3. Checkout order creation blocked
        const cReq = { body: { items: [{ product_id: 'p1' }] } };
        let cStatus = 200;
        let cData = null;
        const cRes = {
            status: (c) => { cStatus = c; return cRes; },
            json: (d) => { cData = d; return cRes; }
        };
        await handleCheckoutCreateOrder(cReq, cRes);
        assert.equal(cStatus, 403);
        assert.match(cData.error, /disabled in the staging review environment/i);

        // 4. Wallet top-up order creation blocked
        const wlReq = { body: { amount: 500 } };
        let wlStatus = 200;
        let wlData = null;
        const wlRes = {
            status: (c) => { wlStatus = c; return wlRes; },
            json: (d) => { wlData = d; return wlRes; }
        };
        await handleWalletCreateOrder(wlReq, wlRes);
        assert.equal(wlStatus, 403);
        assert.match(wlData.error, /disabled in the staging review environment/i);
    });

    it('10. Staging prevents QA accounts from auto-joining contests or modifying leaderboard data', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';

        // 1. addContestPoints should be a no-op in staging
        await addContestPoints(QA_CREATOR_ID, 500, 'Staging Test Reel');
        const store = readLocalStore();
        const score = (store.contest_scores || []).find(s => s.influencer_id === QA_CREATOR_ID);
        assert.equal(score, undefined, 'QA creator must not receive contest scores in staging');

        // 2. calculateContestLeaderboard should not auto-enroll QA creator in staging
        await calculateContestLeaderboard(null, QA_CREATOR_ID);
        const storeAfter = readLocalStore();
        const participant = (storeAfter.contest_participants || []).find(p => p.influencer_id === QA_CREATOR_ID);
        assert.equal(participant, undefined, 'QA creator must not be enrolled as a participant in staging');

        // 3. Public config reports staging_mode: true
        const publicCfg = getPublicMetaConfig();
        assert.equal(publicCfg.staging_mode, true);
    });

    it('11. Staging conflict isolation ignores positively identified synthetic fixtures only', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = `${QA_EMAIL},qa2@wishrite.com`;
        delete process.env.META_OAUTH_TOKEN_URL;

        // Direct classifier unit checks
        assert.equal(
            isPositivelyIdentifiedSyntheticFixture({
                name: 'Pooja Hegde',
                instagram_id: 'pooja_h',
                email_id: null,
                public_slug: null,
                instagram_connection: { connected: true, account_id: '17841445671263800' }
            }),
            true,
            'Historical Pooja Hegde synthetic test row without email/slug/username must match'
        );
        assert.equal(
            isPositivelyIdentifiedSyntheticFixture({
                name: 'QA Test',
                email: 'dummy@wishrite.test',
                instagram_connection: { connected: true, account_id: '17841445671263800' }
            }),
            true,
            '@wishrite.test fixture email must match'
        );
        assert.equal(
            isPositivelyIdentifiedSyntheticFixture({
                name: 'Real Creator',
                email_id: 'real.creator@gmail.com',
                public_slug: 'real-creator',
                instagram_id: 'realcreator',
                instagram_connection: { connected: true, account_id: '17841445671263800', username: 'realcreator' }
            }),
            false,
            'Genuine production creator must NEVER be classified as synthetic'
        );
        assert.equal(
            isPositivelyIdentifiedSyntheticFixture({
                name: 'Staging QA Two',
                email_id: 'qa2@wishrite.com',
                public_slug: null,
                instagram_id: 'qa2_ig',
                instagram_connection: { connected: true, account_id: '17841445671263800', username: 'qa2_ig' }
            }),
            false,
            'Allowlisted staging creator must NEVER be classified as synthetic'
        );

        const origFetch = global.fetch;
        const syntheticId = '00000000-0000-4000-a000-000000000901';
        const storeBackup = JSON.parse(JSON.stringify(readLocalStore()));

        try {
            const store = readLocalStore();
            store.influencers = (store.influencers || []).filter(i => i.id !== syntheticId);
            store.influencers.push({
                id: syntheticId,
                name: 'Pooja Hegde',
                instagram_id: 'pooja_h',
                email: null,
                email_id: null,
                public_slug: null,
                instagram_connection: {
                    connected: true,
                    account_id: '17841445671263800'
                }
            });
            writeLocalStore(store);

            global.fetch = async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('/oauth/access_token')) {
                    return { status: 200, json: async () => ({ access_token: 'qa_tok_11', token_type: 'bearer', expires_in: 3600 }) };
                }
                if (urlStr.includes('/me/permissions')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                { permission: 'instagram_manage_insights', status: 'granted' },
                                { permission: 'pages_show_list', status: 'granted' }
                            ]
                        })
                    };
                }
                if (urlStr.includes('/me/assigned_instagram_accounts')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [{ id: '17841445671263800', username: 'qatestcreator', name: 'QA IG' }]
                        })
                    };
                }
                if (urlStr.includes('/17841445671263800/media')) {
                    return { status: 200, json: async () => ({ data: [] }) };
                }
                if (urlStr.includes('/17841445671263800')) {
                    return {
                        status: 200,
                        json: async () => ({
                            id: '17841445671263800',
                            username: 'qatestcreator',
                            name: 'QA IG',
                            followers_count: 500,
                            follows_count: 25,
                            media_count: 10
                        })
                    };
                }
                return { status: 200, json: async () => ({ data: [] }) };
            };

            const state = createOAuthState(QA_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
            let redirectTarget = '';
            const req = { query: { code: 'qa_code_11', state }, headers: {} };
            const res = {
                status: () => res,
                send: () => res,
                redirect: (loc) => { redirectTarget = loc; }
            };

            await handleInstagramOAuthCallback(req, res);

            assert.ok(redirectTarget.includes('instagram=connected'), `QA creator must connect when only synthetic fixture held ID; got ${redirectTarget}`);
            const updatedQa = readLocalStore().influencers.find(i => i.id === QA_CREATOR_ID);
            assert.equal(updatedQa.instagram_connection?.account_id, '17841445671263800');
        } finally {
            global.fetch = origFetch;
            writeLocalStore(storeBackup);
        }
    });

    it('12. Staging still blocks claiming an Instagram account owned by a genuine production creator or another allowlisted staging creator', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const STAGING_QA1_ID = '00000000-0000-4000-a000-000000000911';
        const STAGING_QA2_ID = '00000000-0000-4000-a000-000000000912';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = 'qa1@wishrite.com,qa2@wishrite.com';
        delete process.env.META_OAUTH_TOKEN_URL;

        const origFetch = global.fetch;
        const storeBackup = JSON.parse(JSON.stringify(readLocalStore()));

        try {
            const store = readLocalStore();
            const prodInf = store.influencers.find(i => i.id === PROD_CREATOR_ID);
            prodInf.public_slug = 'prod-creator';
            prodInf.instagram_connection = {
                connected: true,
                account_id: '17841445671263901',
                username: 'prodcreator'
            };

            store.influencers = store.influencers.filter(i => i.id !== STAGING_QA1_ID && i.id !== STAGING_QA2_ID);
            store.influencers.push(
                {
                    id: STAGING_QA1_ID,
                    name: 'Staging QA 1',
                    email: 'qa1@wishrite.com',
                    status: 'active',
                    instagram_id: 'shared_ig_target'
                },
                {
                    id: STAGING_QA2_ID,
                    name: 'Staging QA 2',
                    email: 'qa2@wishrite.com',
                    status: 'active',
                    instagram_id: 'staging_qa2_ig',
                    instagram_connection: {
                        connected: true,
                        account_id: '17841445671263902',
                        username: 'staging_qa2_ig'
                    }
                }
            );
            writeLocalStore(store);

            // Case A: Conflict with genuine production creator must block
            let currentTargetId = '17841445671263901';
            let currentTargetUsername = 'prodcreator';
            global.fetch = async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('/oauth/access_token')) {
                    return { status: 200, json: async () => ({ access_token: 'qa_tok_12', token_type: 'bearer', expires_in: 3600 }) };
                }
                if (urlStr.includes('/me/permissions')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                { permission: 'instagram_manage_insights', status: 'granted' },
                                { permission: 'pages_show_list', status: 'granted' }
                            ]
                        })
                    };
                }
                if (urlStr.includes('/me/assigned_instagram_accounts')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [{ id: currentTargetId, username: currentTargetUsername }]
                        })
                    };
                }
                return { status: 200, json: async () => ({ data: [] }) };
            };

            const stateA = createOAuthState(STAGING_QA1_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
            let redirectA = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_12a', state: stateA }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectA = loc; } }
            );
            assert.ok(redirectA.includes('instagram=error'), `Conflict with production creator must block; got ${redirectA}`);
            assert.match(decodeURIComponent(redirectA), /already connected/i);

            // Case B: Conflict with another allowlisted staging creator must block
            currentTargetId = '17841445671263902';
            currentTargetUsername = 'staging_qa2_ig';
            const stateB = createOAuthState(STAGING_QA1_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
            let redirectB = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_12b', state: stateB }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectB = loc; } }
            );
            assert.ok(redirectB.includes('instagram=error'), `Conflict with other allowlisted staging creator must block; got ${redirectB}`);
            assert.match(decodeURIComponent(redirectB), /already connected/i);

            const unchangedQa1 = readLocalStore().influencers.find(i => i.id === STAGING_QA1_ID);
            assert.equal(unchangedQa1.instagram_connection, undefined);
        } finally {
            global.fetch = origFetch;
            writeLocalStore(storeBackup);
        }
    });

    it('13. Non-staging production mode preserves strict conflict check even against fixture-shaped rows', async () => {
        delete process.env.WISHRITE_STAGING_MODE;
        delete process.env.META_OAUTH_TOKEN_URL;

        const origFetch = global.fetch;
        const syntheticId = '00000000-0000-4000-a000-000000000913';
        const storeBackup = JSON.parse(JSON.stringify(readLocalStore()));

        try {
            const store = readLocalStore();
            store.influencers = (store.influencers || []).filter(i => i.id !== syntheticId);
            store.influencers.push({
                id: syntheticId,
                name: 'Pooja Hegde',
                instagram_id: 'pooja_h',
                email: null,
                email_id: null,
                public_slug: null,
                instagram_connection: {
                    connected: true,
                    account_id: '17841445671263999'
                }
            });
            writeLocalStore(store);

            global.fetch = async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('/oauth/access_token')) {
                    return { status: 200, json: async () => ({ access_token: 'prod_tok_13', token_type: 'bearer', expires_in: 3600 }) };
                }
                if (urlStr.includes('/me/permissions')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                { permission: 'instagram_manage_insights', status: 'granted' },
                                { permission: 'pages_show_list', status: 'granted' }
                            ]
                        })
                    };
                }
                if (urlStr.includes('/me/assigned_instagram_accounts')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [{ id: '17841445671263999', username: 'prodcreator' }]
                        })
                    };
                }
                return { status: 200, json: async () => ({ data: [] }) };
            };

            const state = createOAuthState(PROD_CREATOR_ID, 'https://wishrite.in/api/creator/instagram/oauth/callback');
            let redirectTarget = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'prod_code_13', state }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectTarget = loc; } }
            );

            assert.ok(redirectTarget.includes('instagram=error'), `Production mode must keep strict ownership check; got ${redirectTarget}`);
            assert.match(decodeURIComponent(redirectTarget), /already connected/i);
        } finally {
            global.fetch = origFetch;
            writeLocalStore(storeBackup);
        }
    });

    it('14. Supabase PostgREST conflict query detects genuine creators (including email_id: null) while bypassing only positive synthetic fixtures in staging', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const STAGING_EMAIL = 'qa.staging.db@wishrite.com';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = `${STAGING_EMAIL},${QA_EMAIL}`;
        process.env.CREATOR_USE_LOCAL_STORE = 'false';
        delete process.env.META_OAUTH_TOKEN_URL;

        // Allowlisted staging creator using a @wishrite.test email must NOT be treated as synthetic
        assert.equal(
            isPositivelyIdentifiedSyntheticFixture({
                name: 'Allowlisted QA',
                email_id: QA_EMAIL,
                instagram_connection: { connected: true, account_id: '17841445671263800' }
            }),
            false,
            'Allowlisted staging creator email must never be classified as synthetic'
        );

        const origFetch = global.fetch;
        const storeBackup = JSON.parse(JSON.stringify(readLocalStore()));

        try {
            let conflictRowsToReturn = [];
            let dbConflictQueriesSeen = 0;

            global.fetch = async (url, opts = {}) => {
                const urlStr = String(url);
                const method = String(opts?.method || 'GET').toUpperCase();

                if (urlStr.includes('/rest/v1/influencers')) {
                    if (method === 'PATCH') {
                        return { ok: true, status: 204, text: async () => '', json: async () => ([]) };
                    }
                    if (urlStr.includes('account_id')) {
                        dbConflictQueriesSeen += 1;
                        return { ok: true, status: 200, json: async () => conflictRowsToReturn };
                    }
                    if (urlStr.includes(`influencer_id=eq.${encodeURIComponent(QA_CREATOR_ID)}`)) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ([{
                                influencer_id: QA_CREATOR_ID,
                                influencer_name: 'QA Staging Creator',
                                email_id: STAGING_EMAIL,
                                instagram_id: 'qatestcreator',
                                public_slug: null
                            }])
                        };
                    }
                    if (urlStr.includes(`influencer_id=eq.${encodeURIComponent(PROD_CREATOR_ID)}`)) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ([{
                                influencer_id: PROD_CREATOR_ID,
                                influencer_name: 'Production Creator',
                                email_id: PROD_EMAIL,
                                instagram_id: 'prodcreator',
                                public_slug: 'prod-creator'
                            }])
                        };
                    }
                    return { ok: true, status: 200, json: async () => ([]) };
                }

                if (urlStr.includes('/oauth/access_token')) {
                    return { status: 200, json: async () => ({ access_token: 'db_test_tok_14', token_type: 'bearer', expires_in: 3600 }) };
                }
                if (urlStr.includes('/me/permissions')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                { permission: 'instagram_manage_insights', status: 'granted' },
                                { permission: 'pages_show_list', status: 'granted' }
                            ]
                        })
                    };
                }
                if (urlStr.includes('/me/assigned_instagram_accounts')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [{ id: '17841445671263800', username: 'qatestcreator' }]
                        })
                    };
                }
                if (urlStr.includes('/17841445671263800/media')) {
                    return { status: 200, json: async () => ({ data: [] }) };
                }
                if (urlStr.includes('/17841445671263800')) {
                    return {
                        status: 200,
                        json: async () => ({
                            id: '17841445671263800',
                            username: 'qatestcreator',
                            followers_count: 100,
                            follows_count: 10,
                            media_count: 5
                        })
                    };
                }
                return { status: 200, json: async () => ({ data: [] }) };
            };

            // Subcase A: Staging with only synthetic PostgREST rows connects cleanly
            conflictRowsToReturn = [
                {
                    influencer_id: 'syn-db-1',
                    influencer_name: 'Pooja Hegde',
                    email_id: null,
                    instagram_id: 'pooja_h',
                    public_slug: null,
                    instagram_connection: { connected: true, account_id: '17841445671263800' }
                },
                {
                    influencer_id: 'syn-db-2',
                    influencer_name: 'Fixture User',
                    email_id: 'seed@wishrite.test',
                    instagram_id: 'seed_ig',
                    public_slug: null,
                    instagram_connection: { connected: true, account_id: '17841445671263800' }
                }
            ];
            let redirectA = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_14a', state: createOAuthState(QA_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback') }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectA = loc; } }
            );
            assert.equal(dbConflictQueriesSeen, 1);
            assert.ok(redirectA.includes('instagram=connected'), `Only synthetic PostgREST fixtures should be bypassed in staging; got ${redirectA}`);

            // Subcase B: Staging with synthetic row + genuine creator (even with email_id: null!) MUST block
            conflictRowsToReturn = [
                {
                    influencer_id: 'syn-db-1',
                    influencer_name: 'Pooja Hegde',
                    email_id: null,
                    instagram_id: 'pooja_h',
                    public_slug: null,
                    instagram_connection: { connected: true, account_id: '17841445671263800' }
                },
                {
                    influencer_id: 'genuine-no-email-creator',
                    influencer_name: 'Real Creator Without Email',
                    email_id: null,
                    instagram_id: 'real_creator_ig',
                    public_slug: null,
                    instagram_connection: { connected: true, account_id: '17841445671263800' }
                }
            ];
            let redirectB = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_14b', state: createOAuthState(QA_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback') }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectB = loc; } }
            );
            assert.equal(dbConflictQueriesSeen, 2);
            assert.ok(redirectB.includes('instagram=error'), `Genuine creator with email_id: null MUST block in staging; got ${redirectB}`);
            assert.match(decodeURIComponent(redirectB), /already connected/i);

            // Subcase C: Production mode (!WISHRITE_STAGING_MODE) still blocks even for synthetic Pooja Hegde PostgREST row
            delete process.env.WISHRITE_STAGING_MODE;
            conflictRowsToReturn = [
                {
                    influencer_id: 'syn-db-1',
                    influencer_name: 'Pooja Hegde',
                    email_id: null,
                    instagram_id: 'pooja_h',
                    public_slug: null,
                    instagram_connection: { connected: true, account_id: '17841445671263800' }
                }
            ];
            let redirectC = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_14c', state: createOAuthState(PROD_CREATOR_ID, 'https://wishrite.in/api/creator/instagram/oauth/callback') }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectC = loc; } }
            );
            assert.equal(dbConflictQueriesSeen, 3);
            assert.ok(redirectC.includes('instagram=error'), `Production mode MUST keep strict conflict check on PostgREST rows; got ${redirectC}`);
            assert.match(decodeURIComponent(redirectC), /already connected/i);
        } finally {
            global.fetch = origFetch;
            writeLocalStore(storeBackup);
        }
    });

    it('15. Staging fails safely when Supabase conflict verification fails (fail-closed)', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const STAGING_EMAIL = 'qa.staging.failclosed@wishrite.com';
        process.env.WISHRITE_STAGING_ALLOWED_CREATOR_EMAILS = STAGING_EMAIL;
        process.env.CREATOR_USE_LOCAL_STORE = 'false';
        delete process.env.META_OAUTH_TOKEN_URL;

        const origFetch = global.fetch;
        const storeBackup = JSON.parse(JSON.stringify(readLocalStore()));

        try {
            global.fetch = async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('/rest/v1/influencers')) {
                    if (urlStr.includes('account_id')) {
                        return {
                            ok: false,
                            status: 500,
                            statusText: 'Internal Server Error',
                            json: async () => ({ message: 'Supabase unavailable during conflict check' })
                        };
                    }
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ([{
                            influencer_id: QA_CREATOR_ID,
                            email_id: STAGING_EMAIL,
                            instagram_id: 'qatestcreator'
                        }])
                    };
                }
                if (urlStr.includes('/oauth/access_token')) {
                    return { status: 200, json: async () => ({ access_token: 'db_fail_tok_15', token_type: 'bearer', expires_in: 3600 }) };
                }
                if (urlStr.includes('/me/permissions')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [
                                { permission: 'instagram_basic', status: 'granted' },
                                { permission: 'instagram_manage_insights', status: 'granted' },
                                { permission: 'pages_show_list', status: 'granted' }
                            ]
                        })
                    };
                }
                if (urlStr.includes('/me/assigned_instagram_accounts')) {
                    return {
                        status: 200,
                        json: async () => ({
                            data: [{ id: '17841445671263800', username: 'qatestcreator' }]
                        })
                    };
                }
                return { status: 200, json: async () => ({ data: [] }) };
            };

            const state = createOAuthState(QA_CREATOR_ID, 'https://review.wishrite.in/api/creator/instagram/oauth/callback');
            let redirectTarget = '';
            await handleInstagramOAuthCallback(
                { query: { code: 'code_15', state }, headers: {} },
                { status() { return this; }, send() { return this; }, redirect: (loc) => { redirectTarget = loc; } }
            );

            assert.ok(redirectTarget.includes('instagram=error'), `Failed conflict verification in staging MUST fail closed; got ${redirectTarget}`);
            assert.match(decodeURIComponent(redirectTarget), /verify instagram account ownership safely/i);
        } finally {
            global.fetch = origFetch;
            writeLocalStore(storeBackup);
        }
    });
});
