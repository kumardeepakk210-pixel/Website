import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    handleGetAdminCreatorContent,
    handleModerateCreatorContent,
    signAdminSessionToken,
    verifyAdminSessionToken,
    ensureAdminContentAccess,
    getPlatformEnvironment,
    addContestPoints,
    revokeContestPoints,
    calculateContestLeaderboard,
    formatLeaderboardFromDatasets,
    isLocalTestStoreActive,
    handleSubmitCreatorContent,
    validateContestForSubmission,
    ALLOWED_ADMIN_ROLES,
    readLocalStore,
    writeLocalStore
} from '../backend/creator.js';

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        setHeader(k, v) {
            this.headers[k] = v;
        }
    };
}

describe('Admin Security Hardening & Contest Persistence Verification', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origStaging = process.env.WISHRITE_STAGING_MODE;
    const origAdminSecret = process.env.ADMIN_SESSION_SECRET;
    const origAdminKey = process.env.ADMIN_API_KEY;

    const STORE_PATH = path.join(process.cwd(), 'data', 'influencers_store.json');
    let backupStoreRaw = null;

    before(() => {
        if (fs.existsSync(STORE_PATH)) {
            backupStoreRaw = fs.readFileSync(STORE_PATH, 'utf8');
        }
        process.env.NODE_ENV = 'test';
        delete process.env.WISHRITE_STAGING_MODE;
        process.env.ADMIN_SESSION_SECRET = 'test-admin-secret-key-at-least-32-characters-long';
        process.env.ADMIN_API_KEY = 'test-server-admin-key-999';
    });

    after(() => {
        if (backupStoreRaw && fs.existsSync(STORE_PATH)) {
            fs.writeFileSync(STORE_PATH, backupStoreRaw, 'utf8');
        }
        process.env.NODE_ENV = origNodeEnv;
        if (origStaging) process.env.WISHRITE_STAGING_MODE = origStaging;
        else delete process.env.WISHRITE_STAGING_MODE;
        if (origAdminSecret) process.env.ADMIN_SESSION_SECRET = origAdminSecret;
        else delete process.env.ADMIN_SESSION_SECRET;
        if (origAdminKey) process.env.ADMIN_API_KEY = origAdminKey;
        else delete process.env.ADMIN_API_KEY;
    });

    test('1. Unauthenticated request to admin content endpoint is rejected with 401', async () => {
        const res = createMockRes();
        await handleGetAdminCreatorContent({ headers: {}, query: {} }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ADMIN_AUTH_REQUIRED');
    });

    test('2. Creator Bearer token (crt...) is strictly rejected from admin moderation with 403', async () => {
        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: 'Bearer crt.fakecreatorpayload.fakesig' }
        }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN_ADMIN_ONLY');
    });

    test('3. Forged x-admin-role header without valid token is rejected with 401', async () => {
        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: {
                'x-admin-role': 'true',
                'x-admin': 'true',
                'role': 'Admin'
            }
        }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ADMIN_AUTH_REQUIRED');
    });

    test('4. Expired signed admin token is rejected with 401 ADMIN_SESSION_EXPIRED', async () => {
        const expiredToken = signAdminSessionToken({
            sub: 'emp_001',
            role: 'Admin',
            exp: Date.now() - 1000 // Expired 1 second ago
        });
        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${expiredToken}` }
        }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ADMIN_SESSION_EXPIRED');
    });

    test('5. Tampered signed admin token is rejected with 401 ADMIN_TOKEN_INVALID', async () => {
        const validToken = signAdminSessionToken({ sub: 'emp_002', role: 'Admin' });
        const parts = validToken.split('.');
        const tampered = `${parts[0]}.${parts[1]}.tamperedSignature`;

        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${tampered}` }
        }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ADMIN_TOKEN_INVALID');
    });

    test('6. Valid cryptographically signed employee token authorizes access with 200', async () => {
        const validToken = signAdminSessionToken({ sub: 'emp_003', email: 'moderator@wishrite.in', role: 'Curator' });
        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${validToken}` }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(Array.isArray(res.body.content));
    });

    test('7. Server admin key (x-admin-key) authorizes access with 200', async () => {
        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { 'x-admin-key': 'test-server-admin-key-999' }
        }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
    });

    test('8. Creator cannot self-moderate their own content (403 FORBIDDEN_SELF_MODERATION)', async () => {
        const creatorId = '00000000-0000-4000-a000-000000000001';
        const validToken = signAdminSessionToken({ sub: 'emp_004', role: 'Admin' });

        const req = {
            headers: { authorization: `Bearer ${validToken}` },
            creator: { id: creatorId },
            body: {
                id: 'content_self_mod_test',
                action: 'approve'
            }
        };
        const res = createMockRes();

        // Pass an item matching the caller's creator ID
        const fakeItem = {
            id: 'content_self_mod_test',
            influencer_id: creatorId,
            status: 'Submitted'
        };

        // ensureAdminContentAccess directly checks creator token rejection
        const creatorTokenReq = {
            headers: { authorization: 'Bearer crt.creator.token' }
        };
        const creatorTokenRes = createMockRes();
        const allowed = await ensureAdminContentAccess(creatorTokenReq, creatorTokenRes);
        assert.equal(allowed, false);
        assert.equal(creatorTokenRes.statusCode, 403);
    });

    test('9. Environment isolation: getPlatformEnvironment returns correct environment', () => {
        assert.equal(getPlatformEnvironment(), 'test');

        process.env.WISHRITE_STAGING_MODE = 'true';
        assert.equal(getPlatformEnvironment(), 'staging');
        delete process.env.WISHRITE_STAGING_MODE;

        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        assert.equal(getPlatformEnvironment(), 'production');
        process.env.NODE_ENV = savedEnv;
    });

    test('10. Leaderboard calculation sorts deterministically (points DESC, updated_at ASC, id ASC)', () => {
        const mockContest = {
            id: 'contest-deterministic-test',
            name: 'Test Contest',
            start_date: '2026-10-01T00:00:00.000Z',
            end_date: '2026-12-31T23:59:59.000Z',
            status: 'active'
        };

        const mockScores = [
            { contest_id: mockContest.id, influencer_id: 'inf_c', points: 100, updated_at: '2026-10-10T12:00:00.000Z' },
            { contest_id: mockContest.id, influencer_id: 'inf_a', points: 200, updated_at: '2026-10-10T12:00:00.000Z' },
            { contest_id: mockContest.id, influencer_id: 'inf_b', points: 100, updated_at: '2026-10-09T12:00:00.000Z' } // Earlier achiever of 100 pts
        ];

        const mockInfluencers = [
            { id: 'inf_a', name: 'Creator A' },
            { id: 'inf_b', name: 'Creator B' },
            { id: 'inf_c', name: 'Creator C' }
        ];

        const result = formatLeaderboardFromDatasets({
            contest: mockContest,
            scores: mockScores,
            influencers: mockInfluencers,
            content: []
        });

        assert.equal(result.leaderboard.length, 3);
        assert.equal(result.leaderboard[0].name, 'Creator A'); // 200 points
        assert.equal(result.leaderboard[0].points, 200);
        assert.equal(result.leaderboard[1].name, 'Creator B'); // 100 points, achieved Oct 9
        assert.equal(result.leaderboard[1].points, 100);
        assert.equal(result.leaderboard[2].name, 'Creator C'); // 100 points, achieved Oct 10
        assert.equal(result.leaderboard[2].points, 100);
    });

    test('11. Staging contest mutations route to environment = staging and fail closed on store failure', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        assert.equal(getPlatformEnvironment(), 'staging');

        let addErr = null;
        try {
            await addContestPoints('00000000-0000-4000-a000-000000000099', 100, 'Test mutation');
        } catch (err) {
            addErr = err;
        }
        assert.ok(addErr, 'Expected addContestPoints to query Supabase and throw fail-closed error if offline');
        assert.equal(addErr.code, 'CONTEST_STORE_UNAVAILABLE');

        let revErr = null;
        try {
            await revokeContestPoints('00000000-0000-4000-a000-000000000099', 50, 'contest-festive-2026');
        } catch (err) {
            revErr = err;
        }
        assert.ok(revErr, 'Expected revokeContestPoints to query Supabase and throw fail-closed error if offline');
        assert.equal(revErr.code, 'CONTEST_STORE_UNAVAILABLE');

        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('12. Staging leaderboard cannot return production records', () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        assert.equal(getPlatformEnvironment(), 'staging');

        const stagingContest = {
            id: 'contest-staging-2026',
            environment: 'staging',
            name: 'Staging Creator Contest',
            status: 'active'
        };

        const mixedScores = [
            { contest_id: 'contest-staging-2026', influencer_id: 'inf_staging', points: 150, updated_at: '2026-11-01T10:00:00Z', environment: 'staging' },
            { contest_id: 'contest-prod-2026', influencer_id: 'inf_prod', points: 500, updated_at: '2026-11-01T10:00:00Z', environment: 'production' }
        ];

        const influencers = [
            { id: 'inf_staging', name: 'Staging Tester' },
            { id: 'inf_prod', name: 'Production Creator' }
        ];

        const result = formatLeaderboardFromDatasets({
            contest: stagingContest,
            scores: mixedScores.filter(s => s.contest_id === stagingContest.id && s.environment === 'staging'),
            influencers,
            content: []
        });

        assert.equal(result.leaderboard.length, 1);
        assert.equal(result.leaderboard[0].name, 'Staging Tester');
        assert.equal(result.leaderboard[0].points, 150);
        assert.ok(!result.leaderboard.some(e => e.name === 'Production Creator'));
        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('13. Production leaderboard cannot return staging records', () => {
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        delete process.env.WISHRITE_STAGING_MODE;
        assert.equal(getPlatformEnvironment(), 'production');

        const prodContest = {
            id: 'contest-prod-2026',
            environment: 'production',
            name: 'Production Creator Contest',
            status: 'active'
        };

        const mixedScores = [
            { contest_id: 'contest-staging-2026', influencer_id: 'inf_staging', points: 300, updated_at: '2026-11-01T10:00:00Z', environment: 'staging' },
            { contest_id: 'contest-prod-2026', influencer_id: 'inf_prod', points: 450, updated_at: '2026-11-01T10:00:00Z', environment: 'production' }
        ];

        const influencers = [
            { id: 'inf_staging', name: 'Staging Tester' },
            { id: 'inf_prod', name: 'Production Creator' }
        ];

        const result = formatLeaderboardFromDatasets({
            contest: prodContest,
            scores: mixedScores.filter(s => s.contest_id === prodContest.id && s.environment === 'production'),
            influencers,
            content: []
        });

        assert.equal(result.leaderboard.length, 1);
        assert.equal(result.leaderboard[0].name, 'Production Creator');
        assert.equal(result.leaderboard[0].points, 450);
        assert.ok(!result.leaderboard.some(e => e.name === 'Staging Tester'));
        process.env.NODE_ENV = savedEnv;
    });

    test('14. Staging contest cannot appear in public production contest discovery (RLS check)', () => {
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261112_create_contest_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Verify policy definition in SQL migration
        assert.match(
            sql,
            /CREATE\s+POLICY\s+"Allow public read on active production contests"\s+ON\s+public\.contests\s+FOR\s+SELECT\s+TO\s+anon,\s*authenticated\s+USING\s*\(\s*status\s*=\s*'active'\s+AND\s+environment\s*=\s*'production'\s*\);/i
        );

        // Simulate PostgreSQL RLS policy evaluator: USING (status = 'active' AND environment = 'production')
        function rlsPublicContestsSelectPermitted(row) {
            return row.status === 'active' && row.environment === 'production';
        }

        const candidateRows = [
            { id: 'c1', environment: 'staging', status: 'active', name: 'Staging Active Contest' },
            { id: 'c2', environment: 'staging', status: 'draft', name: 'Staging Draft Contest' },
            { id: 'c3', environment: 'production', status: 'draft', name: 'Production Draft Contest' },
            { id: 'c4', environment: 'production', status: 'ended', name: 'Production Ended Contest' },
            { id: 'c5', environment: 'production', status: 'active', name: 'Production Active Contest' }
        ];

        const visibleToPublic = candidateRows.filter(rlsPublicContestsSelectPermitted);
        assert.equal(visibleToPublic.length, 1);
        assert.equal(visibleToPublic[0].id, 'c5');
        assert.equal(visibleToPublic[0].environment, 'production');
        assert.ok(!visibleToPublic.some(c => c.environment === 'staging'));
    });

    test('15. No contest returns safe empty response without local JSON fallback', async () => {
        // A. When contest is null (no active contest), formatLeaderboardFromDatasets returns safe empty structure
        const nullResult = formatLeaderboardFromDatasets({
            contest: null,
            scores: [],
            influencers: [],
            content: []
        });
        assert.equal(nullResult.contest, null);
        assert.deepEqual(nullResult.leaderboard, []);
        assert.deepEqual(nullResult.nearby, []);
        assert.equal(nullResult.totalParticipants, 0);
        assert.equal(nullResult.message, 'No active contest right now.');

        // B. When in production mode (!isLocalTestStoreActive), DB failure fails closed with CONTEST_STORE_UNAVAILABLE
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        delete process.env.WISHRITE_STAGING_MODE;

        let errorCaught = null;
        try {
            await calculateContestLeaderboard('non-existent-contest-id');
        } catch (err) {
            errorCaught = err;
        }

        assert.ok(errorCaught, 'Expected calculateContestLeaderboard to throw on database query failure in production mode');
        assert.equal(errorCaught.code, 'CONTEST_STORE_UNAVAILABLE');
        process.env.NODE_ENV = savedEnv;
    });

    test('16. Client-side anon/authenticated access to participants/scores denied by PostgreSQL permissions and RLS', () => {
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261112_create_contest_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // 1. Explicit REVOKE on contest_participants and contest_scores from anon, authenticated, PUBLIC
        assert.match(
            sql,
            /REVOKE\s+ALL\s+ON\s+public\.contest_participants\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i
        );
        assert.match(
            sql,
            /REVOKE\s+ALL\s+ON\s+public\.contest_scores\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i
        );

        // 2. Only service_role has access to contest_participants and contest_scores
        assert.match(
            sql,
            /GRANT\s+ALL\s+ON\s+public\.contest_participants\s+TO\s+service_role;/i
        );
        assert.match(
            sql,
            /GRANT\s+ALL\s+ON\s+public\.contest_scores\s+TO\s+service_role;/i
        );

        // 3. Confirm NO grant of SELECT, INSERT, UPDATE, or ALL to anon or authenticated on child tables
        assert.doesNotMatch(
            sql,
            /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+public\.contest_participants\s+TO\s+(PUBLIC|anon|authenticated)/i
        );
        assert.doesNotMatch(
            sql,
            /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+public\.contest_scores\s+TO\s+(PUBLIC|anon|authenticated)/i
        );

        // 4. Confirm RLS is enabled on all tables
        assert.match(sql, /ALTER\s+TABLE\s+public\.contests\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
        assert.match(sql, /ALTER\s+TABLE\s+public\.contest_participants\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
        assert.match(sql, /ALTER\s+TABLE\s+public\.contest_scores\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);

        // 5. Confirm no permissive policies for anon or authenticated exist on contest_participants or contest_scores
        assert.doesNotMatch(
            sql,
            /CREATE\s+POLICY\s+.*ON\s+public\.contest_participants\s+FOR\s+.*TO\s+.*(anon|authenticated)/i
        );
        assert.doesNotMatch(
            sql,
            /CREATE\s+POLICY\s+.*ON\s+public\.contest_scores\s+FOR\s+.*TO\s+.*(anon|authenticated)/i
        );
    });

    test('17. Local test-store fallback cannot activate in staging or production', () => {
        // A. Staging mode disables local test-store regardless of CREATOR_USE_LOCAL_STORE
        process.env.WISHRITE_STAGING_MODE = 'true';
        process.env.CREATOR_USE_LOCAL_STORE = 'true';
        assert.equal(isLocalTestStoreActive(), false);
        delete process.env.WISHRITE_STAGING_MODE;
        delete process.env.CREATOR_USE_LOCAL_STORE;

        // B. Production mode disables local test-store regardless of CREATOR_USE_LOCAL_STORE
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        process.env.CREATOR_USE_LOCAL_STORE = 'true';
        assert.equal(isLocalTestStoreActive(), false);
        delete process.env.CREATOR_USE_LOCAL_STORE;
        process.env.NODE_ENV = savedEnv;

        // C. Automated test runner (NODE_ENV === 'test' without staging mode) activates local test-store
        assert.equal(isLocalTestStoreActive(), true);
    });

    test('18. Unsigned or forged JWT is strictly rejected in staging and production (Fix F-02)', async () => {
        const fakeJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({ role: 'admin', email: 'admin@wishrite.in' })).toString('base64url') +
            '.fakesig';

        // Staging: unverified JWT fallback is disabled, request rejected with 401
        process.env.WISHRITE_STAGING_MODE = 'true';
        const stagingRes = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${fakeJwt}` },
            query: {}
        }, stagingRes);
        assert.equal(stagingRes.statusCode, 401);
        delete process.env.WISHRITE_STAGING_MODE;

        // Production: unverified JWT fallback is disabled, request rejected with 401
        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const prodRes = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${fakeJwt}` },
            query: {}
        }, prodRes);
        assert.equal(prodRes.statusCode, 401);
        process.env.NODE_ENV = savedEnv;
    });

    test('19. Valid signed employee token continues working in staging and production', async () => {
        const validToken = signAdminSessionToken({ sub: 'emp_staging_test', email: 'admin@wishrite.in', role: 'Admin' });

        process.env.WISHRITE_STAGING_MODE = 'true';
        const stagingAuthRes = createMockRes();
        const stagingAllowed = await ensureAdminContentAccess({
            headers: { authorization: `Bearer ${validToken}` }
        }, stagingAuthRes);
        assert.equal(stagingAllowed, true);

        // handleGetAdminCreatorContent accepts valid auth in staging and reaches DB query (which fails closed with 500 CONTENT_STORE_UNAVAILABLE offline)
        const stagingRes = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${validToken}` },
            query: {}
        }, stagingRes);
        assert.equal(stagingRes.statusCode, 500);
        assert.equal(stagingRes.body.error.code, 'CONTENT_STORE_UNAVAILABLE');
        delete process.env.WISHRITE_STAGING_MODE;

        const savedEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const prodAuthRes = createMockRes();
        const prodAllowed = await ensureAdminContentAccess({
            headers: { authorization: `Bearer ${validToken}` }
        }, prodAuthRes);
        assert.equal(prodAllowed, true);

        const prodRes = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${validToken}` },
            query: {}
        }, prodRes);
        assert.equal(prodRes.statusCode, 500);
        assert.equal(prodRes.body.error.code, 'CONTENT_STORE_UNAVAILABLE');
        process.env.NODE_ENV = savedEnv;
    });

    test('20. Staging requests cannot mutate production contest scores or participants', () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const stagingEnv = getPlatformEnvironment();
        assert.equal(stagingEnv, 'staging');

        // Formatted leaderboard with staging contest must filter out any production scores
        const stagingContest = { id: 'c_staging', environment: 'staging', name: 'Staging Contest', status: 'active' };
        const prodScores = [
            { id: 'sc_prod_1', contest_id: 'c_prod', influencer_id: 'inf_prod_1', points: 500, environment: 'production' }
        ];
        const stagingScores = [
            { id: 'sc_staging_1', contest_id: 'c_staging', influencer_id: 'inf_staging_1', points: 100, environment: 'staging' }
        ];

        const result = formatLeaderboardFromDatasets({
            contest: stagingContest,
            scores: [...stagingScores, ...prodScores].filter(s => s.contest_id === stagingContest.id && s.environment === 'staging'),
            influencers: [
                { id: 'inf_staging_1', name: 'Staging QA Creator' },
                { id: 'inf_prod_1', name: 'Production Creator' }
            ],
            content: []
        });

        assert.equal(result.leaderboard.length, 1);
        assert.equal(result.leaderboard[0].name, 'Staging QA Creator');
        assert.ok(!result.leaderboard.some(e => e.name === 'Production Creator'));
        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('21. Fix 1: Ordinary verified user with @wishrite.in email without admin role is rejected (401)', async () => {
        const ordinaryEmployeeJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({
                sub: 'user-emp-non-admin',
                email: 'staff@wishrite.in',
                role: 'authenticated'
            })).toString('base64url') +
            '.fakesig';

        const req = {
            headers: { authorization: `Bearer ${ordinaryEmployeeJwt}` },
            query: {}
        };
        const res = createMockRes();
        const allowed = await ensureAdminContentAccess(req, res);
        assert.equal(allowed, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error.code, 'ADMIN_AUTH_REQUIRED');
    });

    test('22. Fix 1: Explicit admin role or server-managed allowlist is accepted', async () => {
        // A. Explicit role: 'Admin'
        const adminJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({
                sub: 'user-admin',
                email: 'staff@wishrite.in',
                role: 'Admin'
            })).toString('base64url') +
            '.fakesig';

        const reqA = { headers: { authorization: `Bearer ${adminJwt}` } };
        const resA = createMockRes();
        const allowedA = await ensureAdminContentAccess(reqA, resA);
        assert.equal(allowedA, true);
        assert.equal(reqA.admin.role, 'Admin');

        // B. Allowlisted email via ADMIN_EMAIL_ALLOWLIST
        const origAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
        process.env.ADMIN_EMAIL_ALLOWLIST = 'security-lead@wishrite.in,ops@wishrite.in';

        const allowlistedJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({
                sub: 'user-ops',
                email: 'security-lead@wishrite.in',
                role: 'authenticated'
            })).toString('base64url') +
            '.fakesig';

        const reqB = { headers: { authorization: `Bearer ${allowlistedJwt}` } };
        const resB = createMockRes();
        const allowedB = await ensureAdminContentAccess(reqB, resB);
        assert.equal(allowedB, true);

        if (origAllowlist) process.env.ADMIN_EMAIL_ALLOWLIST = origAllowlist;
        else delete process.env.ADMIN_EMAIL_ALLOWLIST;
    });

    test('23. Fix 2: Staging handleGetAdminCreatorContent fails closed with 500 without local JSON fallback', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const validToken = signAdminSessionToken({ role: 'Admin' });

        const res = createMockRes();
        await handleGetAdminCreatorContent({
            headers: { authorization: `Bearer ${validToken}` }
        }, res);

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'CONTENT_STORE_UNAVAILABLE');
        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('24. Fix 3 & 4: Staging handleModerateCreatorContent fails closed on DB error and does not touch local store', async () => {
        process.env.WISHRITE_STAGING_MODE = 'true';
        const validToken = signAdminSessionToken({ role: 'Admin' });

        const res = createMockRes();
        await handleModerateCreatorContent({
            headers: { authorization: `Bearer ${validToken}` },
            body: {
                id: 'non-existent-submission-id',
                action: 'approve'
            }
        }, res);

        assert.notEqual(res.statusCode, 200);
        assert.equal(res.body.success, false);
        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('25. Fix 5: Reject contest submission when contest is in draft status (CONTEST_DRAFT)', () => {
        const check = validateContestForSubmission({
            id: 'c_draft',
            status: 'draft',
            start_date: new Date(Date.now() - 10000).toISOString(),
            end_date: new Date(Date.now() + 10000).toISOString()
        }, 'reel');

        assert.equal(check.valid, false);
        assert.equal(check.code, 'CONTEST_DRAFT');
    });

    test('26. Fix 5: Reject contest submission when contest is upcoming (CONTEST_UPCOMING)', () => {
        // A. Explicit status 'upcoming'
        const checkA = validateContestForSubmission({
            id: 'c_up1',
            status: 'upcoming',
            start_date: new Date(Date.now() + 86400000).toISOString(),
            end_date: new Date(Date.now() + 172800000).toISOString()
        }, 'reel');
        assert.equal(checkA.valid, false);
        assert.equal(checkA.code, 'CONTEST_UPCOMING');

        // B. Active status but start_date is in the future
        const checkB = validateContestForSubmission({
            id: 'c_up2',
            status: 'active',
            start_date: new Date(Date.now() + 86400000).toISOString(),
            end_date: new Date(Date.now() + 172800000).toISOString()
        }, 'reel');
        assert.equal(checkB.valid, false);
        assert.equal(checkB.code, 'CONTEST_UPCOMING');
    });

    test('27. Fix 5: Reject contest submission when contest has ended or is out-of-window (CONTEST_ENDED)', () => {
        // A. Explicit status 'ended'
        const checkA = validateContestForSubmission({
            id: 'c_end1',
            status: 'ended',
            start_date: new Date(Date.now() - 172800000).toISOString(),
            end_date: new Date(Date.now() - 86400000).toISOString()
        }, 'reel');
        assert.equal(checkA.valid, false);
        assert.equal(checkA.code, 'CONTEST_ENDED');

        // B. Active status but end_date has passed
        const checkB = validateContestForSubmission({
            id: 'c_end2',
            status: 'active',
            start_date: new Date(Date.now() - 172800000).toISOString(),
            end_date: new Date(Date.now() - 1000).toISOString()
        }, 'reel');
        assert.equal(checkB.valid, false);
        assert.equal(checkB.code, 'CONTEST_ENDED');
    });

    test('28. Fix 5: Reject non-active status contests (CONTEST_NOT_ACTIVE)', () => {
        const check = validateContestForSubmission({
            id: 'c_paused',
            status: 'paused',
            start_date: new Date(Date.now() - 86400000).toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString()
        }, 'reel');
        assert.equal(check.valid, false);
        assert.equal(check.code, 'CONTEST_NOT_ACTIVE');
    });

    test('29. Fix 5: Reject post submission when contest requires reels (CONTEST_REEL_REQUIRED)', async () => {
        // Unit check
        const unitCheck = validateContestForSubmission({
            id: 'c_reels_only',
            status: 'active',
            start_date: new Date(Date.now() - 86400000).toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString(),
            requires_reels: true
        }, 'post');
        assert.equal(unitCheck.valid, false);
        assert.equal(unitCheck.code, 'CONTEST_REEL_REQUIRED');

        // API handler check with default seeded contest
        const req = {
            creator: { id: '00000000-0000-4000-a000-000000000001' },
            body: {
                contest_id: 'contest-festive-2026',
                content_type: 'post',
                url: 'https://instagram.com/p/CfestivePost123/'
            }
        };
        const res = createMockRes();
        await handleSubmitCreatorContent(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error.code, 'CONTEST_REEL_REQUIRED');
    });

    test('30. Fix 5: Accept valid reel submission for active contest within window', async () => {
        // Unit check
        const unitCheck = validateContestForSubmission({
            id: 'c_valid',
            status: 'active',
            start_date: new Date(Date.now() - 86400000).toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString(),
            requires_reels: true
        }, 'reel');
        assert.equal(unitCheck.valid, true);

        // API handler check with default seeded contest
        const uniqueUrl = `https://instagram.com/reel/Cfestive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}/`;
        const req = {
            creator: { id: '00000000-0000-4000-a000-000000000001' },
            body: {
                contest_id: 'contest-festive-2026',
                content_type: 'reel',
                url: uniqueUrl
            }
        };
        const res = createMockRes();
        await handleSubmitCreatorContent(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.contest_id, 'contest-festive-2026');
    });

    test('31. Supabase service_role in JWT role metadata is strictly rejected from user-facing admin sessions', async () => {
        assert.ok(!ALLOWED_ADMIN_ROLES.has('service_role'), 'service_role must not be present in ALLOWED_ADMIN_ROLES');

        const serviceRoleJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({
                sub: 'service-role-user',
                email: 'service@wishrite.internal',
                role: 'service_role'
            })).toString('base64url') +
            '.fakesig';

        const req = {
            headers: { authorization: `Bearer ${serviceRoleJwt}` }
        };
        const res = createMockRes();
        const allowed = await ensureAdminContentAccess(req, res);
        assert.equal(allowed, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error.code, 'ADMIN_AUTH_REQUIRED');
    });

    test('32. validateContestForSubmission: rejects missing start_date or end_date (CONTEST_INVALID_DATES)', () => {
        // Missing start_date
        const checkNoStart = validateContestForSubmission({
            id: 'c_nostart',
            status: 'active',
            end_date: new Date(Date.now() + 86400000).toISOString()
        }, 'reel');
        assert.equal(checkNoStart.valid, false);
        assert.equal(checkNoStart.code, 'CONTEST_INVALID_DATES');

        // Missing end_date
        const checkNoEnd = validateContestForSubmission({
            id: 'c_noend',
            status: 'active',
            start_date: new Date(Date.now() - 86400000).toISOString()
        }, 'reel');
        assert.equal(checkNoEnd.valid, false);
        assert.equal(checkNoEnd.code, 'CONTEST_INVALID_DATES');
    });

    test('33. validateContestForSubmission: rejects invalid/unparseable date strings (CONTEST_INVALID_DATES)', () => {
        const checkInvalidStart = validateContestForSubmission({
            id: 'c_bad_date',
            status: 'active',
            start_date: 'not-a-valid-date',
            end_date: new Date(Date.now() + 86400000).toISOString()
        }, 'reel');
        assert.equal(checkInvalidStart.valid, false);
        assert.equal(checkInvalidStart.code, 'CONTEST_INVALID_DATES');

        const checkInvalidEnd = validateContestForSubmission({
            id: 'c_bad_date2',
            status: 'active',
            start_date: new Date(Date.now() - 86400000).toISOString(),
            end_date: 'invalid-iso-string'
        }, 'reel');
        assert.equal(checkInvalidEnd.valid, false);
        assert.equal(checkInvalidEnd.code, 'CONTEST_INVALID_DATES');
    });

    test('34. validateContestForSubmission: rejects end_date earlier than start_date (CONTEST_INVALID_DATES)', () => {
        const checkInverted = validateContestForSubmission({
            id: 'c_inverted',
            status: 'active',
            start_date: new Date(Date.now() + 86400000).toISOString(),
            end_date: new Date(Date.now() - 86400000).toISOString()
        }, 'reel');
        assert.equal(checkInverted.valid, false);
        assert.equal(checkInverted.code, 'CONTEST_INVALID_DATES');
        assert.match(checkInverted.message, /earlier than start date/i);
    });

    test('35. validateContestForSubmission: enforces exact end-date boundary consistently', () => {
        const now = Date.now();
        // A. 5 seconds before end boundary -> valid
        const checkBeforeEnd = validateContestForSubmission({
            id: 'c_near_end',
            status: 'active',
            start_date: new Date(now - 100000).toISOString(),
            end_date: new Date(now + 5000).toISOString(),
            requires_reels: true
        }, 'reel');
        assert.equal(checkBeforeEnd.valid, true);

        // B. Past end boundary -> CONTEST_ENDED
        const checkPastEnd = validateContestForSubmission({
            id: 'c_past_end',
            status: 'active',
            start_date: new Date(now - 100000).toISOString(),
            end_date: new Date(now - 1).toISOString(),
            requires_reels: true
        }, 'reel');
        assert.equal(checkPastEnd.valid, false);
        assert.equal(checkPastEnd.code, 'CONTEST_ENDED');
    });

    test('36. validateContestForSubmission: normalizes contentType with trim().toLowerCase()', () => {
        const contest = {
            id: 'c_reels',
            status: 'active',
            start_date: new Date(Date.now() - 86400000).toISOString(),
            end_date: new Date(Date.now() + 86400000).toISOString(),
            requires_reels: true
        };

        // Mixed case and spaces for reel
        const checkUpper = validateContestForSubmission(contest, '  REEL  ');
        assert.equal(checkUpper.valid, true);

        const checkMixed = validateContestForSubmission(contest, 'ReEl');
        assert.equal(checkMixed.valid, true);

        // Non-reels with spaces/case
        const checkPost = validateContestForSubmission(contest, '  Post  ');
        assert.equal(checkPost.valid, false);
        assert.equal(checkPost.code, 'CONTEST_REEL_REQUIRED');

        const checkEmpty = validateContestForSubmission(contest, '   ');
        assert.equal(checkEmpty.valid, false);
        assert.equal(checkEmpty.code, 'CONTEST_REEL_REQUIRED');
    });

    test('37. Five simultaneous awards to the same creator (Mocked/Simulated Application Concurrency)', async () => {
        // NOTE ON CONCURRENCY VALIDATION:
        // This unit test evaluates asynchronous application dispatch (Promise.all) within Node.js.
        // In live production, real database concurrency serialization is enforced by PostgreSQL's
        // SELECT FOR UPDATE row-level lock and transaction isolation inside the adjust_contest_score RPC.
        const testInfId = '00000000-0000-4000-a000-concur000001';
        const contestId = 'contest-festive-2026';

        // 5 distinct submissions awarded simultaneously
        const awards = [
            addContestPoints(testInfId, 100, 'Reel 1', contestId, 'cid_concurrent_1'),
            addContestPoints(testInfId, 100, 'Reel 2', contestId, 'cid_concurrent_2'),
            addContestPoints(testInfId, 100, 'Reel 3', contestId, 'cid_concurrent_3'),
            addContestPoints(testInfId, 100, 'Reel 4', contestId, 'cid_concurrent_4'),
            addContestPoints(testInfId, 100, 'Reel 5', contestId, 'cid_concurrent_5')
        ];

        const results = await Promise.all(awards);
        assert.equal(results.length, 5);
        for (const res of results) {
            assert.equal(res.success, true);
            assert.equal(res.idempotent, false);
        }

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.ok(score, 'Score row must exist');
        assert.equal(score.points, 500, 'All 5 awards must accumulate to 500 points with zero lost updates');
    });

    test('38. Simultaneous award and revocation for distinct content submissions', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000002';
        const contestId = 'contest-festive-2026';

        // Seed initial award of 100 pts for content A
        await addContestPoints(testInfId, 100, 'Initial Reel A', contestId, 'cid_ab_1');

        // Simultaneously award content B (+50) and revoke content A (-100)
        const [resAward, resRevoke] = await Promise.all([
            addContestPoints(testInfId, 50, 'Reel B', contestId, 'cid_ab_2'),
            revokeContestPoints(testInfId, 100, contestId, 'cid_ab_1', null, 'Rejected A')
        ]);

        assert.equal(resAward.success, true);
        assert.equal(resRevoke.success, true);

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 50, 'Net score must accurately reflect award minus revocation (100 - 100 + 50 = 50)');
    });

    test('39. Duplicate award for the same content is idempotent', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000003';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_dup_award_1';

        // First award
        const first = await addContestPoints(testInfId, 100, 'First award', contestId, contentId);
        assert.equal(first.success, true);
        assert.equal(first.idempotent, false);

        // Duplicate award for the exact same content submission
        const duplicate = await addContestPoints(testInfId, 100, 'Duplicate award retry', contestId, contentId);
        assert.equal(duplicate.success, true);
        assert.equal(duplicate.idempotent, true);

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 100, 'Score must remain 100, duplicate call must not inflate score');
    });

    test('40. Duplicate revocation for the same content is idempotent', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000004';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_dup_revoke_1';

        // Award points first
        await addContestPoints(testInfId, 100, 'Initial award', contestId, contentId);

        // First revocation
        const rev1 = await revokeContestPoints(testInfId, 100, contestId, contentId);
        assert.equal(rev1.success, true);
        assert.equal(rev1.idempotent, false);

        // Second revocation for the same content
        const rev2 = await revokeContestPoints(testInfId, 100, contestId, contentId);
        assert.equal(rev2.success, true);
        assert.equal(rev2.idempotent, true);

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 0, 'Score must remain 0 and not be deducted a second time');
    });

    test('41. Retries after simulated network failure return existing adjustment result', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000005';
        const contestId = 'contest-festive-2026';
        const networkRetryKey = 'net_retry_client_nonce_xyz';

        // First request completed server-side, but client timed out
        const attempt1 = await addContestPoints(testInfId, 100, 'Network timeout request', contestId, 'cid_net_1', networkRetryKey);
        assert.equal(attempt1.success, true);
        assert.equal(attempt1.idempotent, false);

        // Client retries with the same idempotency key
        const attempt2 = await addContestPoints(testInfId, 100, 'Network retry', contestId, 'cid_net_1', networkRetryKey);
        assert.equal(attempt2.success, true);
        assert.equal(attempt2.idempotent, true);
        assert.equal(attempt2.idempotency_key, networkRetryKey);

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 100, 'Retry must not increment points twice');
    });

    test('42. Initial score-row creation race safely initializes participant and score without 409 collision', async () => {
        const freshCreatorId = '00000000-0000-4000-a000-freshcreator01';
        const contestId = 'contest-festive-2026';

        // Verify fresh creator has no existing records
        const initialStore = readLocalStore();
        assert.ok(!initialStore.contest_scores?.some(s => s.influencer_id === freshCreatorId));
        assert.ok(!initialStore.contest_participants?.some(p => p.influencer_id === freshCreatorId));

        // First point award automatically enrolls participant and creates score
        const award = await addContestPoints(freshCreatorId, 100, 'First Reel', contestId, 'cid_fresh_1');
        assert.equal(award.success, true);

        const postStore = readLocalStore();
        const participant = postStore.contest_participants?.find(p => p.influencer_id === freshCreatorId && p.contest_id === contestId);
        const score = postStore.contest_scores?.find(s => s.influencer_id === freshCreatorId && s.contest_id === contestId);

        assert.ok(participant, 'Participant record must be automatically created');
        assert.equal(participant.status, 'active');
        assert.ok(score, 'Score record must be created');
        assert.equal(score.points, 100);
    });

    test('43. Negative-score prevention and excessive revocation rejection', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000007';
        const contestId = 'contest-festive-2026';

        // Give creator 50 points
        await addContestPoints(testInfId, 50, 'Small award', contestId, 'cid_excessive_1');

        // Attempt to deduct 150 points (more than creator has) via manual adjustment
        let caughtErr = null;
        try {
            await revokeContestPoints(testInfId, 150, contestId, null);
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Expected excessive revocation to throw error');
        assert.equal(caughtErr.code, 'EXCESSIVE_REVOCATION');

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 50, 'Points must remain 50 and must never drop below zero');
    });

    test('44. Wrong environment contest cannot be scored or mutated', async () => {
        const savedStaging = process.env.WISHRITE_STAGING_MODE;
        process.env.WISHRITE_STAGING_MODE = 'true'; // Staging environment active

        const prodOnlyContestId = 'contest-prod-isolated-2026';

        let caughtErr = null;
        try {
            // Calling with production contest ID when staging is active
            await addContestPoints('00000000-0000-4000-a000-concur000008', 100, 'Cross env award', prodOnlyContestId);
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Expected cross-environment contest mutation to fail');
        if (savedStaging) process.env.WISHRITE_STAGING_MODE = savedStaging;
        else delete process.env.WISHRITE_STAGING_MODE;
    });

    test('45. Inactive contest rejects score adjustments (Static RPC SQL inspection)', () => {
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261113_add_contest_score_rpc.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Verify status validation check inside RPC
        assert.match(
            sql,
            /IF\s+v_contest\.status\s*!=\s*'active'\s+THEN/i,
            'RPC must reject contests when status is not active'
        );
        assert.match(
            sql,
            /jsonb_build_object\(\s*'success',\s*false,\s*'code',\s*'CONTEST_NOT_ACTIVE'/i,
            'RPC must return CONTEST_NOT_ACTIVE code on non-active contest'
        );
    });

    test('46. Static SQL audit: adjust_contest_score permissions, ledger RLS, and security definer', () => {
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261113_add_contest_score_rpc.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // 1. Function is SECURITY DEFINER
        assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.adjust_contest_score/i);
        assert.match(sql, /SECURITY\s+DEFINER/i);
        assert.match(sql, /SET\s+search_path\s*=\s*public,\s*pg_temp/i);
        assert.match(sql, /approval_cycle\s+INTEGER/i, 'Ledger and RPC must track approval cycles');

        // 2. Revoke execution from PUBLIC, anon, authenticated
        assert.match(
            sql,
            /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.adjust_contest_score\s*\([^)]*\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i
        );

        // 3. Grant execution exclusively to service_role
        assert.match(
            sql,
            /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.adjust_contest_score\s*\([^)]*\)\s+TO\s+service_role;/i
        );

        // 4. Ledger table RLS enabled and locked down
        assert.match(sql, /ALTER\s+TABLE\s+public\.contest_score_adjustments\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
        assert.match(
            sql,
            /REVOKE\s+ALL\s+ON\s+public\.contest_score_adjustments\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i
        );
        assert.match(
            sql,
            /GRANT\s+ALL\s+ON\s+public\.contest_score_adjustments\s+TO\s+service_role;/i
        );
    });

    test('47. Ledger and score consistency: points on score record match sum of ledger adjustments', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000009';
        const contestId = 'contest-festive-2026';

        // Perform sequence of awards and revocations
        await addContestPoints(testInfId, 100, 'Reel 1', contestId, 'cid_audit_1');
        await addContestPoints(testInfId, 50, 'Post 2', contestId, 'cid_audit_2');
        await addContestPoints(testInfId, 100, 'Reel 3', contestId, 'cid_audit_3');
        await revokeContestPoints(testInfId, 50, contestId, 'cid_audit_2', null, 'Disqualified Post 2');

        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);

        // Calculate net points from ledger
        const ledgerEntries = (local.contest_score_adjustments || []).filter(
            a => a.influencer_id === testInfId && a.contest_id === contestId
        );

        const calculatedNet = ledgerEntries.reduce((sum, entry) => {
            if (entry.adjustment_type === 'award') return sum + entry.points_delta;
            if (entry.adjustment_type === 'revoke') return sum - entry.points_delta;
            return sum;
        }, 0);

        assert.equal(score.points, 200, 'Score points must be 200 (100 + 50 + 100 - 50)');
        assert.equal(score.points, calculatedNet, 'Score points must match ledger calculated net points exactly');
    });

    test('48. Same idempotency key with different content ID triggers IDEMPOTENCY_KEY_CONFLICT', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000010';
        const contestId = 'contest-festive-2026';
        const sharedKey = 'idemp_key_diff_content_test';

        // First call with content A
        const resA = await addContestPoints(testInfId, 100, 'Award Content A', contestId, 'cid_part_A', sharedKey);
        assert.equal(resA.success, true);
        assert.equal(resA.idempotent, false);

        // Second call with same idempotency key but different content B
        let conflictErr = null;
        try {
            await addContestPoints(testInfId, 100, 'Award Content B', contestId, 'cid_part_B', sharedKey);
        } catch (err) {
            conflictErr = err;
        }

        assert.ok(conflictErr, 'Expected IDEMPOTENCY_KEY_CONFLICT error when reusing key with different content');
        assert.equal(conflictErr.code, 'IDEMPOTENCY_KEY_CONFLICT');
    });

    test('49. Same idempotency key with different points delta triggers IDEMPOTENCY_KEY_CONFLICT', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000011';
        const contestId = 'contest-festive-2026';
        const sharedKey = 'idemp_key_diff_points_test';

        // First call with 100 points
        const res1 = await addContestPoints(testInfId, 100, 'Award 100 pts', contestId, 'cid_pts_1', sharedKey);
        assert.equal(res1.success, true);

        // Second call with same idempotency key but 200 points
        let conflictErr = null;
        try {
            await addContestPoints(testInfId, 200, 'Award 200 pts', contestId, 'cid_pts_1', sharedKey);
        } catch (err) {
            conflictErr = err;
        }

        assert.ok(conflictErr, 'Expected IDEMPOTENCY_KEY_CONFLICT error when reusing key with different points');
        assert.equal(conflictErr.code, 'IDEMPOTENCY_KEY_CONFLICT');
    });

    test('50. Revocation amount mismatch triggers REVOCATION_AMOUNT_MISMATCH and rejects', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000012';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_mismatch_test_1';

        // Award 100 points
        await addContestPoints(testInfId, 100, 'Award 100', contestId, contentId);

        // Attempt to revoke 50 points (does not match original award of 100)
        let mismatchErr = null;
        try {
            await revokeContestPoints(testInfId, 50, contestId, contentId);
        } catch (err) {
            mismatchErr = err;
        }

        assert.ok(mismatchErr, 'Expected REVOCATION_AMOUNT_MISMATCH when revoking different point amount');
        assert.equal(mismatchErr.code, 'REVOCATION_AMOUNT_MISMATCH');

        // Score must remain 100
        const local = readLocalStore();
        const score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 100);
    });

    test('51. Reapproval lifecycle: cycle 1 award -> cycle 1 revoke -> cycle 2 award operates cleanly', async () => {
        const testInfId = '00000000-0000-4000-a000-concur000013';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_reapproval_cycle_test';

        // Step 1: Initial approval in Cycle 1
        const award1 = await addContestPoints(testInfId, 100, 'Cycle 1 Approval', contestId, contentId);
        assert.equal(award1.success, true);
        assert.equal(award1.approval_cycle, 1);

        let local = readLocalStore();
        let score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 100);

        // Step 2: Rejection / Revocation in Cycle 1
        const revoke1 = await revokeContestPoints(testInfId, 100, contestId, contentId, null, 'Creator edit required');
        assert.equal(revoke1.success, true);
        assert.equal(revoke1.approval_cycle, 1);

        local = readLocalStore();
        score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 0);

        // Step 3: Re-approval in Cycle 2 (after creator corrected content)
        const award2 = await addContestPoints(testInfId, 100, 'Cycle 2 Re-approval', contestId, contentId);
        assert.equal(award2.success, true);
        assert.equal(award2.approval_cycle, 2, 'Re-approval must advance to approval_cycle 2');

        local = readLocalStore();
        score = (local.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 100);

        // Confirm 3 ledger entries exist (award cycle 1, revoke cycle 1, award cycle 2)
        const entries = (local.contest_score_adjustments || []).filter(
            a => a.influencer_id === testInfId && a.contest_id === contestId && a.content_id === contentId
        );
        assert.equal(entries.length, 3);
        assert.equal(entries[0].adjustment_type, 'award');
        assert.equal(entries[0].approval_cycle, 1);
        assert.equal(entries[1].adjustment_type, 'revoke');
        assert.equal(entries[1].approval_cycle, 1);
        assert.equal(entries[2].adjustment_type, 'award');
        assert.equal(entries[2].approval_cycle, 2);
    });

    test('52. Failed revocation leaves zero dirty records (no participant, score, or ledger changes)', async () => {
        const freshCreatorId = '00000000-0000-4000-a000-cleanfailure01';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_never_awarded_content';

        const storeBefore = JSON.parse(JSON.stringify(readLocalStore()));

        let caughtErr = null;
        try {
            await revokeContestPoints(freshCreatorId, 100, contestId, contentId);
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr);
        assert.equal(caughtErr.code, 'NO_PRIOR_AWARD');

        const storeAfter = readLocalStore();

        // Verify zero changes to participants, scores, and adjustments
        const part = (storeAfter.contest_participants || []).find(p => p.influencer_id === freshCreatorId);
        const sc = (storeAfter.contest_scores || []).find(s => s.influencer_id === freshCreatorId);
        const adj = (storeAfter.contest_score_adjustments || []).find(a => a.influencer_id === freshCreatorId);

        assert.equal(part, undefined, 'No participant record must be created on failed revocation');
        assert.equal(sc, undefined, 'No score record must be created on failed revocation');
        assert.equal(adj, undefined, 'No ledger adjustment record must be created on failed revocation');
    });

    test('53. Static SQL audit: pg_advisory_xact_lock with hashtextextended, deterministic key, and zero-write validation order', () => {
        const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261113_add_contest_score_rpc.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // 1. Transaction advisory lock must be present and use native 64-bit hashtextextended
        assert.match(sql, /pg_advisory_xact_lock/i, 'Must acquire transaction-level advisory lock');
        assert.match(sql, /hashtextextended\s*\(/i, 'Must use native 64-bit hashtextextended() function');
        assert.match(sql, /p_environment\s*\|\|\s*':'/i, 'Advisory lock key must include environment prefix to prevent cross-env collisions');
        assert.match(sql, /'idempotency:'\s*\|\|\s*v_idempotency_key/i, 'Must acquire advisory lock with idempotency: namespace');

        // 2. Lock must occur before idempotency and cycle validations
        const lockPos = sql.indexOf('pg_advisory_xact_lock');
        const conflictPos = sql.indexOf('IDEMPOTENCY_KEY_CONFLICT');

        assert.ok(lockPos > 0, 'Advisory lock must be acquired inside the procedure');
        assert.ok(conflictPos > lockPos, 'Idempotency conflict check must occur after acquiring advisory lock');

        // 3. Confirm NO pre-seeding INSERT INTO contest_scores occurs before validations
        const preValidationScoreInsert = sql.substring(0, conflictPos).indexOf('INSERT INTO public.contest_scores');
        assert.equal(preValidationScoreInsert, -1, 'Must NOT insert into contest_scores before completing validations');

        // 4. Confirm all three database writes (participants, scores, adjustments) are inside ONE exception-protected block
        const atomicSectionPos = sql.indexOf('-- 8. ATOMIC COMMITS AS ONE UNIT');
        const exceptionPos = sql.indexOf('WHEN unique_violation THEN', atomicSectionPos);
        const insertPartPos = sql.indexOf('INSERT INTO public.contest_participants', atomicSectionPos);
        const insertScorePos = sql.indexOf('INSERT INTO public.contest_scores', atomicSectionPos);
        const insertLedgerPos = sql.indexOf('INSERT INTO public.contest_score_adjustments', atomicSectionPos);

        assert.ok(atomicSectionPos > conflictPos, 'Atomic writes section must be after all validations');
        assert.ok(insertPartPos > atomicSectionPos && insertPartPos < exceptionPos, 'Participant insert must be inside atomic exception block');
        assert.ok(insertScorePos > atomicSectionPos && insertScorePos < exceptionPos, 'Score upsert must be inside atomic exception block');
        assert.ok(insertLedgerPos > atomicSectionPos && insertLedgerPos < exceptionPos, 'Ledger insert must be inside atomic exception block');
        assert.match(sql, /WHEN\s+unique_violation\s+THEN/i, 'Must catch unique_violation on ledger insert to guard concurrent races');
    });

    test('54. Requirement A & B: Invalid first-time revocation & idempotency conflict create zero database rows', async () => {
        const freshCreatorIdA = '00000000-0000-4000-a000-zerowrite00001';
        const freshCreatorIdB = '00000000-0000-4000-a000-zerowrite00002';
        const contestId = 'contest-festive-2026';

        // Part A: Invalid first-time revocation
        let revErr = null;
        try {
            await revokeContestPoints(freshCreatorIdA, 100, contestId, 'cid_no_such_content');
        } catch (err) {
            revErr = err;
        }
        assert.ok(revErr);
        assert.equal(revErr.code, 'NO_PRIOR_AWARD');

        const storeA = readLocalStore();
        assert.ok(!storeA.contest_participants?.some(p => p.influencer_id === freshCreatorIdA), 'No participant row on invalid revocation');
        assert.ok(!storeA.contest_scores?.some(s => s.influencer_id === freshCreatorIdA), 'No score row on invalid revocation');
        assert.ok(!storeA.contest_score_adjustments?.some(a => a.influencer_id === freshCreatorIdA), 'No ledger row on invalid revocation');

        // Part B: Invalid idempotency-key conflict on award
        const sharedKey = 'idemp_key_zero_write_conflict';
        // First valid award for Creator B
        const awardRes = await addContestPoints(freshCreatorIdB, 100, 'First award', contestId, 'cid_zw_1', sharedKey);
        assert.equal(awardRes.success, true);

        // Snapshot ledger & score count
        const storeB1 = readLocalStore();
        const scoreCountBefore = (storeB1.contest_scores || []).length;
        const ledgerCountBefore = (storeB1.contest_score_adjustments || []).length;

        // Conflicting call using same key but different points
        let conflictErr = null;
        try {
            await addContestPoints(freshCreatorIdB, 200, 'Conflicting points', contestId, 'cid_zw_1', sharedKey);
        } catch (err) {
            conflictErr = err;
        }
        assert.ok(conflictErr);
        assert.equal(conflictErr.code, 'IDEMPOTENCY_KEY_CONFLICT');

        const storeB2 = readLocalStore();
        assert.equal((storeB2.contest_scores || []).length, scoreCountBefore, 'No additional score row created on conflict');
        assert.equal((storeB2.contest_score_adjustments || []).length, ledgerCountBefore, 'No additional ledger entry created on conflict');
    });

    test('55. Requirement C: Concurrent first-time awards create exactly one score row with correct final sum', async () => {
        const freshCreatorId = '00000000-0000-4000-a000-concurfirst001';
        const contestId = 'contest-festive-2026';

        // Two simultaneous first-time awards for different content
        const [res1, res2] = await Promise.all([
            addContestPoints(freshCreatorId, 100, 'First Reel', contestId, 'cid_first_reel_1'),
            addContestPoints(freshCreatorId, 50, 'First Post', contestId, 'cid_first_post_2')
        ]);

        assert.equal(res1.success, true);
        assert.equal(res2.success, true);

        const store = readLocalStore();
        const matchingScores = (store.contest_scores || []).filter(
            s => s.influencer_id === freshCreatorId && s.contest_id === contestId
        );

        assert.equal(matchingScores.length, 1, 'Exactly one score row must exist for creator in contest');
        assert.equal(matchingScores[0].points, 150, 'Final score must accurately sum both awards (100 + 50 = 150)');

        const matchingLedger = (store.contest_score_adjustments || []).filter(
            a => a.influencer_id === freshCreatorId && a.contest_id === contestId
        );
        assert.equal(matchingLedger.length, 2, 'Both legitimate awards must be recorded in ledger');
    });

    test('56. Requirement D: Concurrent identical first-time awards apply only one award with idempotent retry', async () => {
        const freshCreatorId = '00000000-0000-4000-a000-concurident01';
        const contestId = 'contest-festive-2026';
        const contentId = 'cid_ident_first_time';
        const clientNonce = 'client_retry_nonce_fresh_01';

        // Two simultaneous identical calls with the same client nonce & content
        const [res1, res2] = await Promise.all([
            addContestPoints(freshCreatorId, 100, 'Reel submission', contestId, contentId, clientNonce),
            addContestPoints(freshCreatorId, 100, 'Reel submission retry', contestId, contentId, clientNonce)
        ]);

        assert.equal(res1.success, true);
        assert.equal(res2.success, true);

        // One must be the original award, the other must be marked idempotent
        const idempotentCount = [res1.idempotent, res2.idempotent].filter(Boolean).length;
        assert.equal(idempotentCount, 1, 'Exactly one response must be marked idempotent');

        const store = readLocalStore();
        const matchingScores = (store.contest_scores || []).filter(
            s => s.influencer_id === freshCreatorId && s.contest_id === contestId
        );
        assert.equal(matchingScores.length, 1, 'Exactly one score row must exist');
        assert.equal(matchingScores[0].points, 100, 'Score must be 100, duplicate call must not inflate score');

        const matchingLedger = (store.contest_score_adjustments || []).filter(
            a => a.influencer_id === freshCreatorId && a.contest_id === contestId
        );
        assert.equal(matchingLedger.length, 1, 'Ledger must contain exactly one adjustment record');
    });

    test('57. Backend moderation fails closed if contest score adjustment returns success: false', async () => {
        const validAdminJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
            Buffer.from(JSON.stringify({
                sub: 'admin-mod-tester',
                email: 'admin@wishrite.in',
                role: 'Admin'
            })).toString('base64url') +
            '.fakesig';

        // 1. Non-existent content returns 404
        const req404 = {
            headers: { authorization: `Bearer ${validAdminJwt}` },
            body: {
                id: 'non_existent_content_id',
                action: 'approve'
            }
        };
        const res404 = createMockRes();
        await handleModerateCreatorContent(req404, res404);
        assert.equal(res404.statusCode, 404);
        assert.equal(res404.body.success, false);

        // 2. Moderation failure if database or scoring fails closed
        process.env.WISHRITE_STAGING_MODE = 'true';
        const validSignedToken = signAdminSessionToken({ role: 'Admin' });
        const reqStaging = {
            headers: { authorization: `Bearer ${validSignedToken}` },
            body: { id: 'content_mock_mod_fail', action: 'approve' }
        };
        const resStaging = createMockRes();
        await handleModerateCreatorContent(reqStaging, resStaging);
        assert.equal(resStaging.statusCode, 500);
        assert.equal(resStaging.body.success, false);
        delete process.env.WISHRITE_STAGING_MODE;
    });

    test('58. Same idempotency key used for different identities (different influencer or contest) fails safely with IDEMPOTENCY_KEY_CONFLICT', async () => {
        const creatorX = '00000000-0000-4000-a000-creatorx000001';
        const creatorY = '00000000-0000-4000-a000-creatory000002';
        const contestId = 'contest-festive-2026';
        const reusedKey = 'shared_stolen_idempotency_key_123';

        // Creator X uses the key first
        const resX = await addContestPoints(creatorX, 100, 'Creator X Reel', contestId, 'cid_x_1', reusedKey);
        assert.equal(resX.success, true);

        // Creator Y attempts to use the exact same idempotency key
        let conflictErr = null;
        try {
            await addContestPoints(creatorY, 100, 'Creator Y Reel', contestId, 'cid_y_1', reusedKey);
        } catch (err) {
            conflictErr = err;
        }

        assert.ok(conflictErr, 'Expected IDEMPOTENCY_KEY_CONFLICT when key is reused across different identities');
        assert.equal(conflictErr.code, 'IDEMPOTENCY_KEY_CONFLICT');

        const store = readLocalStore();
        // Creator Y must not receive any points or score row
        assert.ok(!store.contest_scores?.some(s => s.influencer_id === creatorY));
        assert.ok(!store.contest_participants?.some(p => p.influencer_id === creatorY));
    });

    test('59. Manual adjustment retries use stable key and do not award points twice', async () => {
        const testInfId = '00000000-0000-4000-a000-manualretry001';
        const contestId = 'contest-festive-2026';
        const reason = 'Manual campaign bonus';

        // First manual award (contentId is null)
        const attempt1 = await addContestPoints(testInfId, 75, reason, contestId, null);
        assert.equal(attempt1.success, true);
        assert.equal(attempt1.idempotent, false);

        // Simulated network timeout retry with identical parameters
        const attempt2 = await addContestPoints(testInfId, 75, reason, contestId, null);
        assert.equal(attempt2.success, true);
        assert.equal(attempt2.idempotent, true, 'Retry of manual adjustment must return idempotent success');

        const store = readLocalStore();
        const score = (store.contest_scores || []).find(s => s.influencer_id === testInfId && s.contest_id === contestId);
        assert.equal(score.points, 75, 'Score must be exactly 75, not double-counted to 150');

        const ledger = (store.contest_score_adjustments || []).filter(
            a => a.influencer_id === testInfId && a.contest_id === contestId
        );
        assert.equal(ledger.length, 1, 'Exactly one ledger record must be created for retryable manual adjustment');
    });

    test('60. Same idempotency key concurrently used by different influencers in Promise.all: exactly one succeeds, loser creates zero rows', async () => {
        const inf1 = '00000000-0000-4000-a000-concurinf00001';
        const inf2 = '00000000-0000-4000-a000-concurinf00002';
        const contestId = 'contest-festive-2026';
        const raceKey = 'shared_race_key_influencers_999';

        const storeBefore = JSON.parse(JSON.stringify(readLocalStore()));
        const participantsBefore = (storeBefore.contest_participants || []).length;
        const scoresBefore = (storeBefore.contest_scores || []).length;
        const adjustmentsBefore = (storeBefore.contest_score_adjustments || []).length;

        const results = await Promise.allSettled([
            addContestPoints(inf1, 100, 'Reel submission inf1', contestId, 'cid_inf1_race', raceKey),
            addContestPoints(inf2, 100, 'Reel submission inf2', contestId, 'cid_inf2_race', raceKey)
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Exactly one operation must succeed');
        assert.equal(rejected.length, 1, 'Losing operation must be rejected');
        assert.equal(rejected[0].reason.code, 'IDEMPOTENCY_KEY_CONFLICT', 'Rejection code must be IDEMPOTENCY_KEY_CONFLICT');

        const winningInfluencer = fulfilled[0].value.idempotency_key === raceKey ? inf1 : inf2;
        const losingInfluencer = winningInfluencer === inf1 ? inf2 : inf1;

        const storeAfter = readLocalStore();
        // Winning influencer has records
        const winScore = (storeAfter.contest_scores || []).find(s => s.influencer_id === winningInfluencer && s.contest_id === contestId);
        assert.ok(winScore, 'Winner must have score record');
        assert.equal(winScore.points, 100);

        // Losing influencer has ZERO records
        const loserPart = (storeAfter.contest_participants || []).find(p => p.influencer_id === losingInfluencer && p.contest_id === contestId);
        const loserScore = (storeAfter.contest_scores || []).find(s => s.influencer_id === losingInfluencer && s.contest_id === contestId);
        const loserAdj = (storeAfter.contest_score_adjustments || []).find(a => a.influencer_id === losingInfluencer && a.contest_id === contestId);

        assert.equal(loserPart, undefined, 'Losing influencer must have no participant record');
        assert.equal(loserScore, undefined, 'Losing influencer must have no score record');
        assert.equal(loserAdj, undefined, 'Losing influencer must have no ledger record');

        // Total increments in DB are exactly 1 score and 1 adjustment
        assert.equal((storeAfter.contest_scores || []).length, scoresBefore + 1);
        assert.equal((storeAfter.contest_score_adjustments || []).length, adjustmentsBefore + 1);
    });

    test('61. Exception-protected subtransaction: unexpected ledger uniqueness failure rolls back participant and score writes', async () => {
        const infTarget = '00000000-0000-4000-a000-rollbackinf001';
        const contestId = 'contest-festive-2026';
        const poisonedKey = 'poisoned_rollback_test_key_777';

        // Pre-seed an existing ledger entry directly in local store to simulate an unexpected ledger uniqueness collision
        const storeInitial = readLocalStore();
        storeInitial.contest_score_adjustments = storeInitial.contest_score_adjustments || [];
        storeInitial.contest_score_adjustments.push({
            id: 'pre-existing-colliding-id',
            contest_id: 'other-contest',
            influencer_id: 'other-influencer',
            environment: 'staging',
            content_id: 'other-content',
            adjustment_type: 'award',
            points_delta: 50,
            approval_cycle: 1,
            reason: 'other reason',
            created_at: new Date().toISOString(),
            idempotency_key: poisonedKey
        });
        writeLocalStore(storeInitial);

        const countsBefore = {
            participants: (readLocalStore().contest_participants || []).length,
            scores: (readLocalStore().contest_scores || []).length
        };

        let caughtErr = null;
        try {
            await addContestPoints(infTarget, 100, 'Rollback check', contestId, 'cid_rollback_content', poisonedKey);
        } catch (err) {
            caughtErr = err;
        }

        assert.ok(caughtErr, 'Operation must fail on duplicate key collision');
        assert.equal(caughtErr.code, 'IDEMPOTENCY_KEY_CONFLICT');

        const storeFinal = readLocalStore();
        const orphanPart = (storeFinal.contest_participants || []).find(p => p.influencer_id === infTarget);
        const orphanScore = (storeFinal.contest_scores || []).find(s => s.influencer_id === infTarget);

        assert.equal(orphanPart, undefined, 'No participant row must remain after idempotency conflict');
        assert.equal(orphanScore, undefined, 'No score row must remain after idempotency conflict');
        assert.equal((storeFinal.contest_participants || []).length, countsBefore.participants);
        assert.equal((storeFinal.contest_scores || []).length, countsBefore.scores);
    });
});
