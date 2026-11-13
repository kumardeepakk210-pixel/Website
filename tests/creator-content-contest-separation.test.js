import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    handleSubmitCreatorContent,
    handleGetCreatorContent,
    handleGetAdminCreatorContent,
    handleModerateCreatorContent,
    handleGetCreatorContest,
    handleSyncAllInstagramContent,
    signAdminSessionToken
} from '../backend/creator.js';
import {
    syncCreatorInstagram,
    upsertCreatorContentItem
} from '../backend/services/instagram-sync.js';

const STORE_PATH = path.join(process.cwd(), 'data', 'influencers_store.json');

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

describe('Instagram Account Sync vs Creator Submitted Content & Contest Eligibility', () => {
    let originalStoreRaw = null;
    const origNodeEnv = process.env.NODE_ENV;
    const origStaging = process.env.WISHRITE_STAGING_MODE;

    const CREATOR_A_ID = '00000000-0000-4000-b000-0000000000a1';
    const CREATOR_B_ID = '00000000-0000-4000-b000-0000000000b2';
    const CONTEST_ID = 'contest-festive-2026';

    before(() => {
        process.env.NODE_ENV = 'test';
        delete process.env.WISHRITE_STAGING_MODE;

        if (fs.existsSync(STORE_PATH)) {
            originalStoreRaw = fs.readFileSync(STORE_PATH, 'utf8');
        }

        const baseStore = originalStoreRaw ? JSON.parse(originalStoreRaw) : {};
        baseStore.influencers = (baseStore.influencers || []).filter(
            i => i.id !== CREATOR_A_ID && i.id !== CREATOR_B_ID
        );
        baseStore.creator_content = (baseStore.creator_content || []).filter(
            c => c.influencer_id !== CREATOR_A_ID && c.influencer_id !== CREATOR_B_ID
        );
        baseStore.contest_scores = (baseStore.contest_scores || []).filter(
            s => s.influencer_id !== CREATOR_A_ID && s.influencer_id !== CREATOR_B_ID
        );
        baseStore.contest_participants = (baseStore.contest_participants || []).filter(
            p => p.influencer_id !== CREATOR_A_ID && p.influencer_id !== CREATOR_B_ID
        );

        baseStore.contests = baseStore.contests || [];
        if (!baseStore.contests.some(c => c.id === CONTEST_ID)) {
            baseStore.contests.push({
                id: CONTEST_ID,
                name: 'Festive Sparkle Creator Challenge 2026',
                description: 'Share Reels featuring WishRite jewellery.',
                start_date: '2026-10-15T00:00:00.000Z',
                end_date: '2026-12-31T23:59:59.000Z',
                status: 'active',
                requires_reels: true,
                scoring_rules: { post_points: 50, reel_points: 100 }
            });
        } else {
            const c = baseStore.contests.find(x => x.id === CONTEST_ID);
            c.end_date = '2026-12-31T23:59:59.000Z';
            c.status = 'active';
            c.requires_reels = true;
        }

        baseStore.influencers.push(
            {
                id: CREATOR_A_ID,
                influencer_id: CREATOR_A_ID,
                name: 'Ananya Creator',
                email: 'ananya.test@wishrite.example',
                instagram_id: 'ananya_creates',
                status: 'active',
                instagram_connection: {
                    connected: true,
                    username: 'ananya_creates',
                    account_id: '17841400999001',
                    access_token: 'mock-oauth-creator-a-token'
                }
            },
            {
                id: CREATOR_B_ID,
                influencer_id: CREATOR_B_ID,
                name: 'Meera Creator',
                email: 'meera.test@wishrite.example',
                instagram_id: 'meera_creates',
                status: 'active'
            }
        );

        fs.writeFileSync(STORE_PATH, JSON.stringify(baseStore, null, 2), 'utf8');
    });

    after(() => {
        if (originalStoreRaw !== null) {
            fs.writeFileSync(STORE_PATH, originalStoreRaw, 'utf8');
        }
        process.env.NODE_ENV = origNodeEnv;
        if (origStaging !== undefined) {
            process.env.WISHRITE_STAGING_MODE = origStaging;
        } else {
            delete process.env.WISHRITE_STAGING_MODE;
        }
    });

    const creatorA = {
        id: CREATOR_A_ID,
        influencer_id: CREATOR_A_ID,
        name: 'Ananya Creator',
        email: 'ananya.test@wishrite.example',
        instagram_id: 'ananya_creates',
        instagram_connection: {
            connected: true,
            username: 'ananya_creates',
            account_id: '17841400999001',
            access_token: 'mock-oauth-creator-a-token'
        }
    };

    const creatorB = {
        id: CREATOR_B_ID,
        influencer_id: CREATOR_B_ID,
        name: 'Meera Creator',
        email: 'meera.test@wishrite.example'
    };

    let submittedReelId = null;
    let rejectedReelId = null;

    test('1-2. Automatic Instagram sync retrieves metrics without populating My Content or contests', async () => {
        const origFetch = global.fetch;
        global.fetch = async (url) => {
            const u = String(url);
            if (u.includes('/17841400999001/media')) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [
                            {
                                id: 'ig_media_discovered_1',
                                caption: 'Personal coffee morning reel',
                                media_type: 'VIDEO',
                                media_product_type: 'REELS',
                                permalink: 'https://www.instagram.com/reel/Discovered111/',
                                thumbnail_url: 'https://cdn.example.com/thumb1.jpg'
                            },
                            {
                                id: 'ig_media_discovered_2',
                                caption: 'Weekend travel post',
                                media_type: 'IMAGE',
                                media_product_type: 'FEED',
                                permalink: 'https://www.instagram.com/p/Discovered222/',
                                media_url: 'https://cdn.example.com/thumb2.jpg'
                            }
                        ]
                    })
                };
            }
            if (u.includes('/insights')) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [
                            { name: 'views', values: [{ value: 410 }] },
                            { name: 'reach', values: [{ value: 350 }] },
                            { name: 'likes', values: [{ value: 42 }] }
                        ]
                    })
                };
            }
            if (u.includes('/17841400999001?fields=')) {
                return {
                    status: 200,
                    json: async () => ({
                        id: '17841400999001',
                        username: 'ananya_creates',
                        followers_count: 15200,
                        follows_count: 310,
                        media_count: 84,
                        profile_picture_url: 'https://cdn.example.com/avatar.jpg'
                    })
                };
            }
            return { status: 200, json: async () => ({}) };
        };

        try {
            const syncRes = await syncCreatorInstagram(creatorA);
            assert.equal(syncRes.success, true);
            assert.equal(syncRes.discovered_count, 2);
            assert.equal(syncRes.synced_count, 2);
            assert.equal(syncRes.profile.followers_count, 15200);
            assert.equal(syncRes.items[0].persisted, false);
            assert.equal(syncRes.items[0].action, 'discovered_only');

            // Direct upsert helper also does not auto-insert unmatched IG media
            const directRes = await upsertCreatorContentItem(
                creatorA,
                { id: 'ig_media_discovered_3', permalink: 'https://www.instagram.com/reel/Discovered333/' },
                { metrics: { views: 99, reach: 77 } }
            );
            assert.equal(directRes.persisted, false);
            assert.equal(directRes.views_count, 99);

            // Sync API endpoint returns empty My Content list when creator hasn't submitted anything
            const syncReq = { creator: creatorA, headers: {}, query: {}, body: {} };
            const syncHttpRes = createMockRes();
            await handleSyncAllInstagramContent(syncReq, syncHttpRes);
            assert.equal(syncHttpRes.statusCode, 200);
            assert.equal(syncHttpRes.body.items.length, 0);

            // My Content must remain empty
            const contentRes = createMockRes();
            await handleGetCreatorContent({ creator: creatorA, headers: {}, query: {} }, contentRes);
            assert.equal(contentRes.statusCode, 200);
            assert.equal(contentRes.body.data.length, 0, 'Discovered IG media must NOT auto-populate My Content');

            // Contest entries must remain empty
            const contestRes = createMockRes();
            await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorA }, contestRes);
            assert.equal(contestRes.statusCode, 200);
            assert.deepEqual(contestRes.body.eligibleSubmissions, [], 'Discovered IG media must NOT populate contest entries');
        } finally {
            global.fetch = origFetch;
        }
    });

    test('3-5. Manual Reel submission appears as Pending in My Content and is excluded from contest until approved', async () => {
        const req = {
            creator: creatorA,
            headers: {},
            body: {
                content_type: 'reel',
                platform: 'instagram',
                url: 'https://www.instagram.com/reel/WishRiteManual1/',
                product_code: 'WR-ER-101',
                product_name: 'Moonlight Silver Studs',
                product_category: 'Earrings',
                thumbnail_url: 'https://cdn.example.com/reel1-thumb.jpg',
                contest_id: CONTEST_ID,
                caption: 'Festive styling with WishRite'
            }
        };
        const res = createMockRes();
        await handleSubmitCreatorContent(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.status, 'Submitted');
        assert.equal(res.body.data.contest_id, CONTEST_ID);
        assert.equal(res.body.data.contest_name, 'Festive Sparkle Creator Challenge 2026');
        assert.equal(res.body.data.submission_source, 'platform_submission');
        submittedReelId = res.body.data.id;

        // Visible in My Content as Pending (Submitted)
        const listRes = createMockRes();
        await handleGetCreatorContent({ creator: creatorA, headers: {}, query: {} }, listRes);
        assert.equal(listRes.statusCode, 200);
        assert.equal(listRes.body.data.length, 1);
        assert.equal(listRes.body.data[0].id, submittedReelId);
        assert.equal(listRes.body.data[0].status, 'Submitted');

        // NOT visible in Contest participation list while Pending
        const contestRes = createMockRes();
        await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorA }, contestRes);
        assert.equal(contestRes.statusCode, 200);
        assert.equal(contestRes.body.eligibleSubmissions.length, 0, 'Pending submission must not appear in contest');
    });

    test('6-8. Admin authentication, approval workflow, contest visibility & isolation', async () => {
        // Unauthenticated admin access rejected
        const unauthAdmin = createMockRes();
        await handleGetAdminCreatorContent({ headers: {}, query: {} }, unauthAdmin);
        assert.equal(unauthAdmin.statusCode, 401);

        // Creator token blocked from admin moderation even with x-admin-role header
        const creatorToken = `crt.mockpayload.${CREATOR_A_ID}`;
        const creatorModRes = createMockRes();
        await handleModerateCreatorContent({
            creator: creatorA,
            headers: { authorization: `Bearer ${creatorToken}`, 'x-admin-role': 'true' },
            body: { contentId: submittedReelId, action: 'approve' }
        }, creatorModRes);
        assert.equal(creatorModRes.statusCode, 403);

        // Also test stateless crt. token WITHOUT req.creator or identical influencer match
        const nonOwnerTokenModRes = createMockRes();
        await handleModerateCreatorContent({
            headers: { authorization: `Bearer ${creatorToken}`, 'x-admin-role': 'true' },
            body: { contentId: submittedReelId, action: 'approve' }
        }, nonOwnerTokenModRes);
        assert.equal(nonOwnerTokenModRes.statusCode, 403);

        // Forged x-admin-role header without valid admin token is strictly rejected with 401
        const forgedAdminRes = createMockRes();
        await handleModerateCreatorContent({
            headers: { 'x-admin-role': 'true' },
            body: { contentId: submittedReelId, action: 'approve' }
        }, forgedAdminRes);
        assert.equal(forgedAdminRes.statusCode, 401);

        // Admin approves the submission with a cryptographically signed employee token
        const validAdminToken = signAdminSessionToken({ role: 'Admin' });
        const approveRes = createMockRes();
        await handleModerateCreatorContent({
            headers: { authorization: `Bearer ${validAdminToken}` },
            body: { contentId: submittedReelId, action: 'approve' }
        }, approveRes);
        assert.equal(approveRes.statusCode, 200);
        assert.equal(approveRes.body.success, true);
        assert.equal(approveRes.body.data.status, 'Approved');

        // Creator A sees Approved item in My Content
        const contentRes = createMockRes();
        await handleGetCreatorContent({ creator: creatorA, headers: {}, query: {} }, contentRes);
        assert.equal(contentRes.body.data[0].status, 'Approved');

        // Creator A sees ONLY their approved contest-linked Reel in contest participation list
        const contestResA = createMockRes();
        await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorA }, contestResA);
        assert.equal(contestResA.statusCode, 200);
        assert.equal(contestResA.body.eligibleSubmissions.length, 1);
        assert.equal(contestResA.body.eligibleSubmissions[0].id, submittedReelId);

        // Creator B cannot see Creator A's My Content or contest entries
        const contentResB = createMockRes();
        await handleGetCreatorContent({ creator: creatorB, headers: {}, query: {} }, contentResB);
        assert.equal(contentResB.body.data.length, 0);

        const contestResB = createMockRes();
        await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorB }, contestResB);
        assert.equal(contestResB.body.eligibleSubmissions.length, 0);
    });

    test('9. Rejected submission shows reason in My Content and is excluded from contest', async () => {
        const subRes = createMockRes();
        await handleSubmitCreatorContent({
            creator: creatorA,
            headers: {},
            body: {
                content_type: 'reel',
                platform: 'instagram',
                url: 'https://www.instagram.com/reel/WishRiteReject2/',
                product_code: 'WR-ER-102',
                product_name: 'Classic Silver Bangle',
                contest_id: CONTEST_ID
            }
        }, subRes);
        assert.equal(subRes.statusCode, 200);
        rejectedReelId = subRes.body.data.id;

        const validAdminToken = signAdminSessionToken({ role: 'Admin' });
        const rejRes = createMockRes();
        await handleModerateCreatorContent({
            headers: { authorization: `Bearer ${validAdminToken}` },
            body: {
                contentId: rejectedReelId,
                action: 'reject',
                rejectionReason: 'Product tag missing in Reel caption'
            }
        }, rejRes);
        assert.equal(rejRes.statusCode, 200);
        assert.equal(rejRes.body.data.status, 'Rejected');
        assert.equal(rejRes.body.data.rejection_reason, 'Product tag missing in Reel caption');

        const contentRes = createMockRes();
        await handleGetCreatorContent({ creator: creatorA, headers: {}, query: {} }, contentRes);
        const rejectedItem = contentRes.body.data.find(i => i.id === rejectedReelId);
        assert.ok(rejectedItem);
        assert.equal(rejectedItem.status, 'Rejected');
        assert.equal(rejectedItem.rejection_reason, 'Product tag missing in Reel caption');

        const contestRes = createMockRes();
        await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorA }, contestRes);
        assert.equal(contestRes.body.eligibleSubmissions.length, 1);
        assert.ok(!contestRes.body.eligibleSubmissions.some(e => e.id === rejectedReelId), 'Rejected Reel must not appear in contest');
    });

    test('10. Duplicate URL/shortcode prevention & legacy auto-synced row filtering', async () => {
        // Duplicate URL with query string variations must be blocked with 409
        const dupRes = createMockRes();
        await handleSubmitCreatorContent({
            creator: creatorA,
            headers: {},
            body: {
                content_type: 'reel',
                platform: 'instagram',
                url: 'https://www.instagram.com/reel/WishRiteManual1/?igsh=tracking123',
                contest_id: CONTEST_ID
            }
        }, dupRes);
        assert.equal(dupRes.statusCode, 409);
        assert.equal(dupRes.body.error.code, 'DUPLICATE_SUBMISSION');

        // Another creator cannot submit the same approved URL
        const hijackedRes = createMockRes();
        await handleSubmitCreatorContent({
            creator: creatorB,
            headers: {},
            body: {
                content_type: 'reel',
                platform: 'instagram',
                url: 'https://www.instagram.com/reel/WishRiteManual1/',
                contest_id: CONTEST_ID
            }
        }, hijackedRes);
        assert.equal(hijackedRes.statusCode, 409);

        // Legacy auto-synced dump row injected directly into store is hidden from My Content and Contests
        const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        store.creator_content.push({
            id: 'legacy-auto-synced-dump-1',
            influencer_id: CREATOR_A_ID,
            content_type: 'reel',
            platform: 'instagram',
            url: 'https://www.instagram.com/reel/LegacyDump999/',
            instagram_media_id: '999888777',
            instagram_permalink: 'https://www.instagram.com/reel/LegacyDump999/',
            status: 'Approved',
            tags: [],
            created_at: new Date().toISOString()
        });
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');

        const contentRes = createMockRes();
        await handleGetCreatorContent({ creator: creatorA, headers: {}, query: {} }, contentRes);
        assert.ok(!contentRes.body.data.some(i => i.id === 'legacy-auto-synced-dump-1'), 'Legacy auto-synced dump must be excluded from My Content');

        const contestRes = createMockRes();
        await handleGetCreatorContest({ headers: {}, query: {}, creator: creatorA }, contestRes);
        assert.ok(!contestRes.body.eligibleSubmissions.some(i => i.id === 'legacy-auto-synced-dump-1'), 'Legacy auto-synced dump must be excluded from Contest');
    });

    test('11. UI templates include Rejected filter, contest selector, rejection reason & contest entry list', () => {
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        const creatorJs = fs.readFileSync(path.join(process.cwd(), 'js/creator-program.js'), 'utf8');
        const adminJs = fs.readFileSync(path.join(process.cwd(), 'js/admin-rewards.js'), 'utf8');

        assert.ok(indexHtml.includes("filterCreatorContent('rejected', this)"), 'Rejected filter button must exist in index.html');
        assert.ok(indexHtml.includes('id="share-reel-contest"'), 'Contest selector must exist in Share Reel modal');
        assert.ok(creatorJs.includes("normFilter === 'rejected'"), 'Rejected filter logic must exist in creator-program.js');
        assert.ok(creatorJs.includes('content-rejection-reason'), 'Rejection reason display must exist in My Content renderer');
        assert.ok(creatorJs.includes('contest-eligible-submissions-card'), 'Qualifying contest entries section must exist in contest renderer');
        assert.ok(adminJs.includes('rejection_reason:'), 'Admin moderation must send rejection_reason');
    });
});
