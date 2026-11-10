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
        process.env.META_APP_ID = '439894570032149';

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
});
