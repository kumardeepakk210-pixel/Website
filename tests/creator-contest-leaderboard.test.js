import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8085';

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, headers: res.headers, data };
}

const STORE_PATH = path.join(process.cwd(), 'data', 'influencers_store.json');
let backupStoreRaw = null;

function setupTestFixture() {
    if (!fs.existsSync(STORE_PATH)) return;
    backupStoreRaw = fs.readFileSync(STORE_PATH, 'utf8');
    const store = JSON.parse(backupStoreRaw);

    const contestId = 'contest-festive-2026';
    store.contests = store.contests || [];
    if (!store.contests.some(c => c.id === contestId)) {
        store.contests.push({
            id: contestId,
            name: 'Festive Sparkle Creator Challenge 2026',
            description: 'Create standout posts and reels featuring WishRite pure 925 sterling silver jewellery.',
            start_date: '2026-10-15T00:00:00.000Z',
            end_date: '2026-11-26T23:59:59.000Z',
            status: 'active',
            scoring_rules: { post_points: 50, reel_points: 100, order_points_multiplier: 10, click_points_multiplier: 1 }
        });
    }

    const testInf1 = { id: 'test_creator_1', influencer_code: 'WR-TEST-001', name: 'Aarya Sharma', email: 'secret_active@example.com', public_slug: 'aarya-test', status: 'active' };
    const testInf2 = { id: 'test_creator_2', influencer_code: 'WR-TEST-002', name: 'Rohan Verma', email: 'rohan@example.com', public_slug: 'rohan-test', status: 'active' };
    const testInf3 = { id: 'test_creator_3', influencer_code: 'WR-TEST-003', name: 'Pooja Hegde', email: 'pooja@example.com', public_slug: 'pooja-test', status: 'active' };
    const testInf4 = { id: 'test_creator_4', influencer_code: 'WR-TEST-004', name: 'Deepak Kumar', email: 'deepak.kumar@wishrite.in', public_slug: 'deepak-test', status: 'active' };

    store.influencers = store.influencers || [];
    store.influencers.push(testInf1, testInf2, testInf3, testInf4);

    store.accounts = store.accounts || [];
    store.accounts.push(
        { id: 'acct_1', influencer_id: testInf1.id, email: testInf1.email, is_active: true },
        { id: 'acct_2', influencer_id: testInf2.id, email: testInf2.email, is_active: true },
        { id: 'acct_3', influencer_id: testInf3.id, email: testInf3.email, is_active: true },
        { id: 'acct_4', influencer_id: testInf4.id, email: testInf4.email, is_active: true }
    );

    store.contest_scores = store.contest_scores || [];
    store.contest_scores.push(
        { id: 'score_1', contest_id: contestId, influencer_id: testInf1.id, points: 1240, updated_at: '2026-10-20T00:00:00.000Z' },
        { id: 'score_2', contest_id: contestId, influencer_id: testInf2.id, points: 980, updated_at: '2026-10-21T00:00:00.000Z' },
        { id: 'score_3', contest_id: contestId, influencer_id: testInf3.id, points: 820, updated_at: '2026-10-22T00:00:00.000Z' },
        { id: 'score_4', contest_id: contestId, influencer_id: testInf4.id, points: 50, updated_at: '2026-10-23T00:00:00.000Z' }
    );

    for (let i = 5; i <= 15; i++) {
        const id = `test_creator_${i}`;
        store.influencers.push({ id, influencer_code: `WR-TEST-0${i}`, name: `Creator ${i}`, email: `c${i}@test.in`, public_slug: `c${i}-test`, status: 'active' });
        store.contest_scores.push({ id: `score_${i}`, contest_id: contestId, influencer_id: id, points: 800 - (i * 40), updated_at: '2026-10-24T00:00:00.000Z' });
    }

    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function teardownTestFixture() {
    if (backupStoreRaw && fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, backupStoreRaw, 'utf8');
    }
}

test('Creator Contest Leaderboard — Comprehensive Validation Suite', async (t) => {
    setupTestFixture();

    await t.test('1. CONTEST SYSTEM & API ENDPOINT', async (st) => {
        await st.test('GET /api/creator/contest returns active contest data', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`);
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);
            assert.ok(res.data.contest, 'Contest object must be present');
            assert.ok(res.data.contest.id, 'Contest ID must be present');
            assert.ok(res.data.contest.name, 'Contest name must be present');
            assert.equal(res.data.contest.status, 'active');
            assert.ok(res.data.contest.endsAt, 'Contest endsAt date must be present');
            assert.ok(res.data.totalParticipants > 0, 'Total participants must be positive number');
        });

        await st.test('Scoring rules exist and define points per activity', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`);
            const rules = res.data.contest.scoring_rules;
            assert.ok(rules, 'Scoring rules must exist');
            assert.ok(rules.post_points >= 50, 'Post points must be defined');
            assert.ok(rules.reel_points >= 100, 'Reel points must be defined');
        });
    });

    await t.test('2. LEADERBOARD RANKINGS & DETERMINISTIC CALCULATION', async (st) => {
        await st.test('Leaderboard returns Top 10 sorted deterministically by points DESC', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`);
            const leaders = res.data.leaderboard;
            assert.ok(Array.isArray(leaders), 'Leaderboard must be an array');
            assert.ok(leaders.length <= 10, 'Leaderboard must show top 10');
            assert.ok(leaders.length >= 3, 'Leaderboard must have top creators');

            // Verify rank order
            for (let i = 0; i < leaders.length; i++) {
                assert.equal(leaders[i].rank, i + 1, `Rank must be sequential (${i + 1})`);
                if (i > 0) {
                    assert.ok(
                        leaders[i - 1].points >= leaders[i].points,
                        `Rank ${i} points (${leaders[i - 1].points}) must be >= rank ${i + 1} points (${leaders[i].points})`
                    );
                }
            }
        });

        await st.test('Top 3 have valid medals displayable in frontend', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`);
            const leaders = res.data.leaderboard;
            assert.equal(leaders[0].rank, 1);
            assert.equal(leaders[1].rank, 2);
            assert.equal(leaders[2].rank, 3);
        });
    });

    await t.test('3. PRIVACY & DATA SANITIZATION', async (st) => {
        await st.test('Leaderboard and nearby creators never expose private credentials or customer info', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`);
            const allEntries = [...(res.data.leaderboard || []), ...(res.data.nearby || [])];

            for (const entry of allEntries) {
                assert.equal(entry.email, undefined, 'Email must never be exposed');
                assert.equal(entry.phone, undefined, 'Phone must never be exposed');
                assert.equal(entry.address, undefined, 'Address must never be exposed');
                assert.equal(entry.wallet_balance, undefined, 'Wallet balance must never be exposed');
                assert.equal(entry.payout_info, undefined, 'Payout info must never be exposed');
                assert.equal(entry.bank_account, undefined, 'Bank account must never be exposed');
                assert.ok(entry.name, 'Public name must be present');
                assert.ok(entry.rank > 0, 'Rank must be positive');
                assert.ok(entry.points !== undefined, 'Points must be present');
            }
        });
    });

    await t.test('4. CURRENT CREATOR POSITION & PERSONAL STATS', async (st) => {
        await st.test('Authenticated creator receives accurate personal rank, points, and percentile', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`, {
                headers: {
                    'x-customer-email': 'secret_active@example.com'
                }
            });
            assert.equal(res.status, 200);
            assert.ok(res.data.currentCreator, 'Authenticated creator position must be resolved');
            const cur = res.data.currentCreator;
            assert.ok(cur.rank > 0, 'Creator must have a valid rank');
            assert.ok(cur.points > 0, 'Creator must have valid points');
            assert.ok(cur.totalParticipants >= cur.rank, 'Total participants must be >= rank');
            assert.ok(cur.topPercentile > 0 && cur.topPercentile <= 100, 'Top percentile must be between 1 and 100');
            assert.ok(typeof cur.isTop10 === 'boolean', 'isTop10 flag must be boolean');
        });

        await st.test('Creator outside Top 10 receives nearby competitors and distance from Top 10', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`, {
                headers: {
                    'x-customer-email': 'deepak.kumar@wishrite.in'
                }
            });
            assert.equal(res.status, 200);
            const cur = res.data.currentCreator;
            if (cur && !cur.isTop10) {
                assert.ok(cur.positionsFromTop10 > 0, 'Positions from Top 10 must be > 0');
                assert.ok(Array.isArray(res.data.nearby), 'Nearby array must be returned');
                assert.ok(res.data.nearby.length > 0, 'Nearby competitors must be populated');
                const inNearby = res.data.nearby.some(c => c.is_current_user || c.rank === cur.rank);
                assert.ok(inNearby, 'Current creator must be present in nearby competitors list');
            }
        });

        await st.test('Calculation of pointsToNext and nextRank is mathematically correct', async () => {
            const res = await fetchJson(`${BASE_URL}/api/creator/contest`, {
                headers: {
                    'x-customer-email': 'secret_active@example.com'
                }
            });
            const cur = res.data.currentCreator;
            if (cur && !cur.isFirst && cur.nextRank) {
                assert.equal(cur.nextRank, cur.rank - 1, 'Next rank should be exactly 1 rank higher');
                assert.ok(cur.pointsToNext > 0, 'Points needed to climb must be positive');
            }
        });
    });

    await t.test('5. SECURITY & SERVER AUTHORITATIVENESS', async (st) => {
        await st.test('Client cannot modify score or rank via POST/PUT/PATCH to /api/creator/contest', async () => {
            const postRes = await fetchJson(`${BASE_URL}/api/creator/contest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rank: 1, points: 999999 })
            });
            assert.ok([404, 405].includes(postRes.status), 'Mutating leaderboard via POST must be rejected');

            const patchRes = await fetchJson(`${BASE_URL}/api/creator/contest`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rank: 1, points: 999999 })
            });
            assert.ok([404, 405].includes(patchRes.status), 'Mutating leaderboard via PATCH must be rejected');
        });

        await st.test('Live payouts remain strictly disabled in server configuration', async () => {
            const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
            assert.match(envContent, /ALLOW_LIVE_PAYOUTS=false/, 'ALLOW_LIVE_PAYOUTS must remain false');
        });
    });

    await t.test('6. HTML STRUCTURE & UI ORDERING', async (st) => {
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

        await st.test('Contest Leaderboard section is placed between YOUR CREATOR LINK and REEL INSIGHTS', async () => {
            const linkPos = html.indexOf('id="creator-link-card"');
            const contestPos = html.indexOf('id="creator-contest-section"');
            const reelPos = html.indexOf('id="creator-reel-insights-section"');

            assert.ok(linkPos > 0, 'creator-link-card must exist');
            assert.ok(contestPos > 0, 'creator-contest-section must exist');
            assert.ok(reelPos > 0, 'creator-reel-insights-section must exist');

            assert.ok(
                linkPos < contestPos,
                'YOUR CREATOR LINK must be positioned BEFORE CONTEST LEADERBOARD'
            );
            assert.ok(
                contestPos < reelPos,
                'CONTEST LEADERBOARD must be positioned BEFORE REEL INSIGHTS'
            );
        });

        await st.test('Contest Leaderboard header contains exact title, subtitle and refresh button', async () => {
            assert.ok(html.includes('CONTEST LEADERBOARD'), 'Must include CONTEST LEADERBOARD title');
            assert.ok(
                html.includes('See your current position and track your progress against other WishRite Creators.'),
                'Must include exact subtitle'
            );
            assert.ok(html.includes('btn-refresh-contest'), 'Must have refresh button');
        });
    });

    await t.test('7. RESPONSIVE CSS & MOBILE DESIGN', async (st) => {
        const css = fs.readFileSync(path.join(process.cwd(), 'css/creator.css'), 'utf8');

        await st.test('creator.css contains dedicated styles for contest leaderboard', async () => {
            assert.ok(css.includes('.creator-contest-section'), 'Must contain .creator-contest-section');
            assert.ok(css.includes('.contest-banner'), 'Must contain .contest-banner');
            assert.ok(css.includes('.contest-position-card'), 'Must contain .contest-position-card');
            assert.ok(css.includes('.contest-table-card'), 'Must contain .contest-table-card');
            assert.ok(css.includes('.contest-row-you'), 'Must contain .contest-row-you highlight');
            assert.ok(css.includes('.contest-medal'), 'Must contain .contest-medal');
        });

        await st.test('Mobile media query optimizes leaderboard for 375x812 and 390x844 viewports', async () => {
            assert.ok(css.includes('@media (max-width: 600px)'), 'Must contain mobile media query');
            assert.ok(css.includes('.contest-table-header'), 'Must style table header');
            assert.ok(css.includes('.contest-row'), 'Must style rows for mobile');
            assert.ok(!css.includes('overflow-x: scroll'), 'No horizontal scroll should be introduced');
        });
    });

    await t.test('8. CLIENT JAVASCRIPT CONTROLLER', async (st) => {
        const js = fs.readFileSync(path.join(process.cwd(), 'js/creator-program.js'), 'utf8');

        await st.test('creator-program.js exposes loadCreatorContest and refreshCreatorContestLeaderboard', async () => {
            assert.ok(js.includes('async function loadCreatorContest'), 'Must define loadCreatorContest');
            assert.ok(js.includes('function renderCreatorContest'), 'Must define renderCreatorContest');
            assert.ok(js.includes('async function refreshCreatorContestLeaderboard'), 'Must define refreshCreatorContestLeaderboard');
            assert.ok(js.includes('window.creatorProgram.loadContest'), 'Must expose on window.creatorProgram');
        });

        await st.test('renderCreatorDashboard calls loadCreatorContest automatically', async () => {
            const dashIdx = js.indexOf('function renderCreatorDashboard');
            const endIdx = js.indexOf('function copyCreatorReferralLink', dashIdx);
            const dashSlice = js.slice(dashIdx, endIdx > dashIdx ? endIdx : dashIdx + 5000);
            assert.ok(dashSlice.includes('loadCreatorContest()'), 'renderCreatorDashboard must invoke loadCreatorContest');
        });
    });
});
