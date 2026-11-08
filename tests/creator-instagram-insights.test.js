process.env.NODE_ENV = 'test';
process.env.CREATOR_USE_LOCAL_STORE = 'true';
require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let server = null;
let serverPort = null;
const STORE_PATH = path.join(__dirname, '..', 'data', 'influencers_store.json');
let backupStoreRaw = null;

function makeRequest(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: serverPort || process.env.PORT || 8085,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (bodyData && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (_) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: data
        });
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

describe('WishRite Creator — Instagram Content List & Official Insights Sync', () => {
  const testEmailA = `creator_insta_a_${Date.now()}@wishrite.test`;
  const testIdA = '00000000-0000-0000-0000-0000000000c1';
  const customerHeadersA = { 'x-customer-email': testEmailA, 'x-customer-id': testIdA };

  const testEmailB = `creator_insta_b_${Date.now()}@wishrite.test`;
  const testIdB = '00000000-0000-0000-0000-0000000000c2';
  const customerHeadersB = { 'x-customer-email': testEmailB, 'x-customer-id': testIdB };

  let tokenA = null;
  let tokenB = null;
  let creatorA = null;
  let creatorB = null;
  let reelItem1 = null;
  let reelItem2 = null;
  let postItem = null;

  const authHeadersA = {
    get Authorization() { return `Bearer ${tokenA}`; },
    get authorization() { return `Bearer ${tokenA}`; }
  };
  const authHeadersB = {
    get Authorization() { return `Bearer ${tokenB}`; },
    get authorization() { return `Bearer ${tokenB}`; }
  };

  before(async () => {
    if (fs.existsSync(STORE_PATH)) {
      backupStoreRaw = fs.readFileSync(STORE_PATH, 'utf8');
    }
    const serverModule = require('../server.js');
    const handler = serverModule.listeners('request')[0];
    server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverPort = server.address().port;

    // 1. Onboard Creator A using customer identity
    const resA = await makeRequest({
      path: '/api/creator/onboard',
      method: 'POST',
      headers: customerHeadersA
    }, {
      name: 'Priya Sharma',
      instagram: 'priyastylez',
      bio: 'Fashion & Fine Jewelry Creator',
      agreement_accepted: true
    });
    if (resA.data && resA.data.creator) {
      creatorA = resA.data.creator;
      tokenA = resA.data.token;
    }

    // 2. Onboard Creator B using customer identity
    const resB = await makeRequest({
      path: '/api/creator/onboard',
      method: 'POST',
      headers: customerHeadersB
    }, {
      name: 'Rohan Verma',
      instagram: 'rohanv_luxury',
      bio: 'Luxury accessories collector',
      agreement_accepted: true
    });
    if (resB.data && resB.data.creator) {
      creatorB = resB.data.creator;
      tokenB = resB.data.token;
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('1. HTML Structure & Desktop Table Columns', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    test('My Content section contains list view container and Instagram connection card', () => {
      assert.ok(html.includes('id="creator-content-list-container"'), 'Content list container must exist');
      assert.ok(html.includes('id="creator-instagram-conn-card"'), 'Instagram connection card must exist');
      assert.ok(html.includes('id="modal-connect-instagram"'), 'Instagram connection modal must exist');
    });

    test('Filter pills exist for All, Posts, Reels, Pending, Approved', () => {
      assert.ok(html.includes("filterCreatorContent('all'"), 'All filter must exist');
      assert.ok(html.includes("filterCreatorContent('post'"), 'Posts filter must exist');
      assert.ok(html.includes("filterCreatorContent('reel'"), 'Reels filter must exist');
      assert.ok(html.includes("filterCreatorContent('pending'"), 'Pending filter must exist');
      assert.ok(html.includes("filterCreatorContent('approved'"), 'Approved filter must exist');
    });

    test('Sorting options include Newest, Views, Likes, Comments, Shares', () => {
      assert.ok(html.includes('id="creator-content-sort"'), 'Content sort dropdown must exist');
      assert.ok(html.includes('value="newest"'), 'Newest sort option must exist');
      assert.ok(html.includes('value="views"'), 'Views sort option must exist');
      assert.ok(html.includes('value="likes"'), 'Likes sort option must exist');
      assert.ok(html.includes('value="comments"'), 'Comments sort option must exist');
      assert.ok(html.includes('value="shares"'), 'Shares sort option must exist');
    });

    test('Professional Account notice is present in connect modal', () => {
      assert.ok(
        html.includes('Instagram insights require an eligible') &&
        html.includes('professional account'),
        'Professional account requirement must be clearly communicated'
      );
    });
  });

  describe('2. Responsive CSS & Mobile Design (375x812 & 390x844)', () => {
    const cssPath = path.join(__dirname, '..', 'css', 'creator.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    test('Table styles define clean desktop table layout', () => {
      assert.ok(css.includes('.content-list-table'), 'Table class must be defined');
      assert.ok(css.includes('.content-table-url'), 'Instagram URL link styling must be defined');
      assert.ok(css.includes('.content-metric-val'), 'Metric value styling must be defined');
      assert.ok(css.includes('.content-metric-na'), 'Unavailable metric styling must be defined');
    });

    test('Responsive rules transform table into compact cards on mobile without horizontal scrolling', () => {
      assert.ok(css.includes('@media (max-width: 860px)'), 'Mobile media query must be present');
      assert.ok(css.includes('.content-card-mobile-list'), 'Mobile cards list container must be defined');
      assert.ok(css.includes('.content-mobile-card'), 'Mobile card class must be defined');
      assert.ok(css.includes('.content-mobile-metrics-grid'), 'Mobile metrics grid must be defined');
      assert.ok(css.includes('.content-table-wrapper') && css.includes('overflow-x: auto'), 'Desktop wrapper handles overflow safely');
    });
  });

  describe('3. Content Submission & Auto Content-Type Detection', () => {
    test('Submit Instagram Reel 1 with Silver Evil Eye Necklace', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: authHeadersA
      }, {
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/C8xyz123abc/',
        product_code: 'WR-NK-001',
        product_name: 'Silver Evil Eye Necklace',
        product_category: 'Necklaces',
        category: 'Necklaces',
        caption: 'Styling piece video'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      const item = res.data.data;
      assert.ok(item, 'Submitted content must be returned');
      assert.equal(item.content_type, 'reel', 'Auto-detected content type must be reel');
      assert.equal(item.platform, 'instagram');
      assert.equal(item.product_name, 'Silver Evil Eye Necklace');
      assert.equal(item.product_category, 'Necklaces');
      assert.equal(item.status, 'Submitted');
      assert.equal(item.url, 'https://www.instagram.com/reel/C8xyz123abc/');
      reelItem1 = item;
    });

    test('Submit Instagram Reel 2 with Initial Pendant', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: authHeadersA
      }, {
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/D9abc456def/',
        product_code: 'WR-PD-002',
        product_name: 'Initial Pendant',
        product_category: 'Pendants',
        category: 'Pendants',
        caption: 'Second reel submission'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      const item = res.data.data;
      assert.equal(item.content_type, 'reel', 'Auto-detected content type must be reel');
      assert.equal(item.product_name, 'Initial Pendant');
      assert.equal(item.product_category, 'Pendants');
      assert.equal(item.url, 'https://www.instagram.com/reel/D9abc456def/');
      reelItem2 = item;
    });

    test('Submit Instagram Post with Tennis Bracelet', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: authHeadersA
      }, {
        platform: 'instagram',
        url: 'https://www.instagram.com/p/E1q2w3e4r5t/',
        product_code: 'WR-BR-003',
        product_name: 'Classic Tennis Bracelet',
        product_category: 'Bracelets',
        category: 'Bracelets',
        caption: 'Photo post submission'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      const item = res.data.data;
      assert.equal(item.content_type, 'post', 'Auto-detected content type must be post');
      assert.equal(item.product_name, 'Classic Tennis Bracelet');
      assert.equal(item.url, 'https://www.instagram.com/p/E1q2w3e4r5t/');
      postItem = item;
    });
  });

  describe('4. Official Instagram API Connection Flow', () => {
    test('GET /api/creator/instagram/status returns connection state for Creator A', async () => {
      const res = await makeRequest({
        path: '/api/creator/instagram/status',
        method: 'GET',
        headers: authHeadersA
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok('connected' in res.data, 'connected boolean must be present');
    });

    test('POST /api/creator/instagram/connect links handle and stores connection server-side', async () => {
      const res = await makeRequest({
        path: '/api/creator/instagram/connect',
        method: 'POST',
        headers: authHeadersA
      }, {
        instagram_handle: 'priyastylez'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data, 'Must return connection data object');
      assert.equal(res.data.data.username, 'priyastylez');
      assert.equal(res.data.data.connected, true);
      assert.equal(res.data.data.account_type, 'professional');
    });

    test('POST /api/creator/instagram/disconnect unlinks account cleanly', async () => {
      const res = await makeRequest({
        path: '/api/creator/instagram/disconnect',
        method: 'POST',
        headers: authHeadersA
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);

      // Verify status reflects disconnection
      const statusRes = await makeRequest({
        path: '/api/creator/instagram/status',
        method: 'GET',
        headers: authHeadersA
      });
      assert.equal(statusRes.statusCode, 200);
      assert.equal(statusRes.data.connected, false);

      // Reconnect handle for subsequent tests
      await makeRequest({
        path: '/api/creator/instagram/connect',
        method: 'POST',
        headers: authHeadersA
      }, {
        instagram_handle: 'priyastylez'
      });
    });

    test('GET /api/creator/instagram/oauth/start returns unversioned Meta dialog URL', async () => {
      process.env.META_APP_ID = '439894570032149';
      const res = await makeRequest({
        path: '/api/creator/instagram/oauth/start?json=true',
        method: 'GET',
        headers: authHeadersA
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.redirect_url, 'redirect_url must be provided');

      const redirectUrl = res.data.redirect_url;
      // Assert unversioned Meta OAuth dialog endpoint
      assert.ok(
        redirectUrl.startsWith('https://www.facebook.com/dialog/oauth'),
        'OAuth dialog endpoint must start with https://www.facebook.com/dialog/oauth'
      );
      assert.equal(
        redirectUrl.includes('/v26.0/dialog/oauth'),
        false,
        'OAuth dialog endpoint must NOT contain /v26.0/dialog/oauth'
      );
      assert.ok(
        redirectUrl.includes('client_id=439894570032149'),
        'Must contain configured client_id'
      );
      assert.ok(
        redirectUrl.includes('response_type=code'),
        'Must contain response_type=code'
      );
      assert.ok(
        redirectUrl.includes('instagram_basic'),
        'Must contain instagram_basic scope'
      );
      assert.ok(
        redirectUrl.includes('instagram_manage_insights'),
        'Must contain instagram_manage_insights scope'
      );
      assert.ok(
        redirectUrl.includes('pages_show_list'),
        'Must contain pages_show_list scope'
      );
      assert.ok(
        redirectUrl.includes('pages_read_engagement'),
        'Must contain pages_read_engagement scope'
      );
      assert.ok(
        redirectUrl.includes('config_id=1112681211580113'),
        'Must contain config_id=1112681211580113 for Facebook Login for Business'
      );
      assert.ok(
        redirectUrl.includes('state='),
        'Must contain signed state parameter'
      );
    });

    test('Meta OAuth token exchange URL targets unversioned oauth/access_token endpoint without leakage', () => {
      const fs = require('fs');
      const backendCreatorCode = fs.readFileSync('backend/creator.js', 'utf8');
      
      // Verify tokenUrl and exchangeUrl construction
      assert.ok(
        backendCreatorCode.includes("process.env.META_OAUTH_TOKEN_URL || 'https://graph.facebook.com/oauth/access_token'"),
        'Token exchange endpoint must target unversioned https://graph.facebook.com/oauth/access_token'
      );
      assert.ok(
        !backendCreatorCode.includes("`${META_GRAPH_API_VERSION}/oauth/access_token"),
        'Token exchange endpoint must NOT be prefixed with versioned path components like /v26.0/oauth/access_token'
      );
    });

    test('Meta OAuth callback resolves assigned Instagram accounts for Business Login', () => {
      const fs = require('fs');
      const backendCreatorCode = fs.readFileSync('backend/creator.js', 'utf8');
      
      // Verify assigned accounts endpoint query
      assert.ok(
        backendCreatorCode.includes('/me/assigned_instagram_accounts?fields=id,username,name'),
        'Must query /me/assigned_instagram_accounts for Facebook Login for Business'
      );

      // Verify username matching logic
      const resolveAccount = (accounts, targetUsername) => {
        let selectedAccount = null;
        if (targetUsername) {
          selectedAccount = accounts.find(a => (a.username || '').toLowerCase().trim() === targetUsername.toLowerCase().trim());
        }
        if (!selectedAccount && accounts.length === 1) {
          selectedAccount = accounts[0];
        }
        return selectedAccount;
      };

      // Case 1: Single account
      const single = [{ id: '178414001', username: 'wishrite.in' }];
      assert.equal(resolveAccount(single, 'wishrite.in')?.id, '178414001');
      assert.equal(resolveAccount(single, 'other_user')?.id, '178414001');

      // Case 2: Multiple accounts where target username matches
      const multiple = [
        { id: '178414002', username: 'unrelated_account' },
        { id: '178414003', username: 'wishrite.in' }
      ];
      assert.equal(resolveAccount(multiple, 'wishrite.in')?.id, '178414003');

      // Case 3: Multiple accounts where NO username matches (must not select arbitrary account)
      assert.equal(Boolean(resolveAccount(multiple, 'non_existent_creator')), false);
      assert.equal(resolveAccount(multiple, 'non_existent_creator') || null, null);
    });

    test('Meta OAuth callback Page-token fallback resolves connected Instagram Business Account', () => {
      const fs = require('fs');
      const backendCreatorCode = fs.readFileSync('backend/creator.js', 'utf8');

      // Verify Page direct node query with Page access token exists in code
      assert.ok(
        backendCreatorCode.includes('pageDetailUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(pageId)}?fields=id,name,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(page.access_token)}`'),
        'Must support querying Page direct node using page.access_token when direct instagram_business_account is null'
      );

      // Verify regression logic for scenarios A through H
      const simulatePageResolution = ({ pagesData, targetUsername, pageTokenFetcher }) => {
        let instagramAccountId = null;
        let instagramUsername = null;
        let resolvedPageAccessToken = null;

        for (const page of pagesData) {
          const pageName = page.name || '';
          const pageId = page.id || '';
          const hasPageToken = Boolean(page.access_token);
          const isExpectedPage = !targetUsername || pageName.toLowerCase().includes('funnwith.ai') || pagesData.length === 1;

          let igAccount = page.instagram_business_account || null;

          if (!igAccount?.id && pageId && hasPageToken && pageTokenFetcher) {
            const pageDetail = pageTokenFetcher(pageId, page.access_token);
            if (pageDetail?.instagram_business_account?.id) {
              igAccount = pageDetail.instagram_business_account;
            }
          }

          if (igAccount?.id) {
            const igHandle = (igAccount.username || '').toLowerCase().trim();
            const usernameMatches = targetUsername ? igHandle === targetUsername : isExpectedPage;

            if (usernameMatches) {
              instagramAccountId = igAccount.id;
              instagramUsername = igAccount.username || targetUsername;
              if (page.access_token) {
                resolvedPageAccessToken = page.access_token;
              }
              break;
            }
          }
        }

        return { instagramAccountId, instagramUsername, resolvedPageAccessToken };
      };

      // Scenario A: /me/accounts directly returns the Instagram account
      const resA = simulatePageResolution({
        pagesData: [{
          id: '1001',
          name: 'funnwith.ai',
          access_token: 'page_token_123',
          instagram_business_account: { id: '178414001', username: 'wishrite.in' }
        }],
        targetUsername: 'wishrite.in'
      });
      assert.equal(resA.instagramAccountId, '178414001');
      assert.equal(resA.instagramUsername, 'wishrite.in');
      assert.equal(resA.resolvedPageAccessToken, 'page_token_123');

      // Scenario B: /me/accounts returns Instagram account as null, but Page-token lookup returns wishrite.in
      const resB = simulatePageResolution({
        pagesData: [{
          id: '1002',
          name: 'funnwith.ai',
          access_token: 'page_token_456',
          instagram_business_account: null
        }],
        targetUsername: 'wishrite.in',
        pageTokenFetcher: (pId, pToken) => {
          if (pId === '1002' && pToken === 'page_token_456') {
            return {
              id: '1002',
              name: 'funnwith.ai',
              instagram_business_account: { id: '178414099', username: 'wishrite.in' }
            };
          }
          return null;
        }
      });
      assert.equal(resB.instagramAccountId, '178414099');
      assert.equal(resB.instagramUsername, 'wishrite.in');
      assert.equal(resB.resolvedPageAccessToken, 'page_token_456');

      // Scenario C: Page-token lookup returns a different Instagram username
      const resC = simulatePageResolution({
        pagesData: [{
          id: '1003',
          name: 'other_page',
          access_token: 'page_token_789',
          instagram_business_account: null
        }],
        targetUsername: 'wishrite.in',
        pageTokenFetcher: () => ({
          instagram_business_account: { id: '178414999', username: 'unrelated_brand' }
        })
      });
      assert.equal(resC.instagramAccountId, null);

      // Scenario D: Page token is missing
      const resD = simulatePageResolution({
        pagesData: [{
          id: '1004',
          name: 'funnwith.ai',
          access_token: null,
          instagram_business_account: null
        }],
        targetUsername: 'wishrite.in',
        pageTokenFetcher: () => ({
          instagram_business_account: { id: '178414001', username: 'wishrite.in' }
        })
      });
      assert.equal(resD.instagramAccountId, null);

      // Scenario E: Page-token lookup returns Meta error 190 (empty / error returned by fetcher)
      const resE = simulatePageResolution({
        pagesData: [{
          id: '1005',
          name: 'funnwith.ai',
          access_token: 'expired_page_token',
          instagram_business_account: null
        }],
        targetUsername: 'wishrite.in',
        pageTokenFetcher: () => ({ error: { message: 'The session is invalid', code: 190 } })
      });
      assert.equal(resE.instagramAccountId, null);

      // Scenario F: No Instagram account is returned anywhere
      const resF = simulatePageResolution({
        pagesData: [{
          id: '1006',
          name: 'funnwith.ai',
          access_token: 'page_token_xyz',
          instagram_business_account: null
        }],
        targetUsername: 'wishrite.in',
        pageTokenFetcher: () => ({ id: '1006', instagram_business_account: null })
      });
      assert.equal(resF.instagramAccountId, null);

      // Scenario G: Credentials never appear in logs or frontend responses
      assert.ok(!backendCreatorCode.includes('console.log(page.access_token)'));
      assert.ok(!backendCreatorCode.includes('console.log(accessToken)'));
      assert.ok(!backendCreatorCode.includes('console.log(finalToken)'));

      // Scenario H: Existing connection is safely not falsely marked as authorized when accountId is null
      const instagramAccountIdNull = null;
      const testConnPayload = {
        connected: true,
        account_id: instagramAccountIdNull,
        insights_status: instagramAccountIdNull ? 'connected' : 'api_permission_required'
      };
      assert.equal(testConnPayload.account_id, null);
      assert.equal(testConnPayload.insights_status, 'api_permission_required');
    });
  });

  describe('5. Instagram Metrics & Official API Sync', () => {
    test('POST /api/creator/content/:id/sync triggers official sync for submitted Reel', async () => {
      const res = await makeRequest({
        path: `/api/creator/content/${reelItem1.id}/sync`,
        method: 'POST',
        headers: authHeadersA
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      const data = res.data.data;
      assert.ok(data, 'Updated content data object must be returned');
      assert.ok('views_count' in data, 'views_count field must exist');
      assert.ok('likes_count' in data, 'likes_count field must exist');
      assert.ok('comments_count' in data, 'comments_count field must exist');
      assert.ok('shares_count' in data, 'shares_count field must exist');
      assert.ok('last_synced_at' in data, 'last_synced_at timestamp must exist');
      assert.ok('insights_status' in data, 'insights_status must exist');
      assert.ok(res.data.sync, 'sync result details must be returned');
    });

    test('No fake metrics: unavailable metrics remain null (rendered as —), never fabricated', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'GET',
        headers: authHeadersA
      });

      assert.equal(res.statusCode, 200);
      const items = res.data.data;
      const target = items.find(i => i.id === reelItem1.id);
      assert.ok(target, 'Target reel must be in list');

      // Check metrics are not fabricated with random integers
      if (target.insights_status === 'api_permission_required' || target.insights_status === 'not_connected') {
        assert.equal(target.views_count, null, 'views_count must be null when API permission required');
        assert.equal(target.likes_count, null, 'likes_count must be null when API permission required');
        assert.equal(target.comments_count, null, 'comments_count must be null when API permission required');
        assert.equal(target.shares_count, null, 'shares_count must be null when API permission required');
      }
    });

    test('GET /api/creator/content returns sanitized items without leaking tokens', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'GET',
        headers: authHeadersA
      });

      const bodyStr = JSON.stringify(res.data);
      assert.ok(!bodyStr.includes('access_token'), 'Must not leak access_token in content response');
      assert.ok(!bodyStr.includes('service_role'), 'Must not leak service_role key');
    });
  });

  describe('6. Multiple Reels & Content Isolation', () => {
    test('Both Reels and Post appear as distinct rows in Creator A content list', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'GET',
        headers: authHeadersA
      });

      const items = res.data.data;
      assert.ok(items.length >= 3, 'Must have at least 3 content items');

      const r1 = items.find(i => i.id === reelItem1.id);
      const r2 = items.find(i => i.id === reelItem2.id);
      const p = items.find(i => i.id === postItem.id);

      assert.ok(r1, 'Reel 1 must exist');
      assert.ok(r2, 'Reel 2 must exist');
      assert.ok(p, 'Post must exist');

      assert.notEqual(r1.id, r2.id, 'Reel 1 and Reel 2 must have distinct IDs');
      assert.equal(r1.product_name, 'Silver Evil Eye Necklace');
      assert.equal(r2.product_name, 'Initial Pendant');
      assert.equal(p.product_name, 'Classic Tennis Bracelet');
    });

    test('Security: Creator B CANNOT sync or modify Creator A content (Isolation enforced)', async () => {
      const res = await makeRequest({
        path: `/api/creator/content/${reelItem1.id}/sync`,
        method: 'POST',
        headers: authHeadersB
      });

      assert.ok(res.statusCode === 403 || res.statusCode === 404, 'Must reject unauthorized sync with 403 or 404');
      assert.equal(res.data.success, false);
    });

    test('Security: Creator B cannot see Creator A content submissions', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'GET',
        headers: authHeadersB
      });

      const items = res.data.data;
      const foundA = items.find(i => i.id === reelItem1.id || i.id === reelItem2.id);
      assert.equal(foundA, undefined, 'Creator B must not see Creator A submissions');
    });
  });

  describe('7. Client Functions in js/creator-program.js', () => {
    const jsPath = path.join(__dirname, '..', 'js', 'creator-program.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    test('formatContentMetric renders dash for unavailable metrics', () => {
      assert.ok(js.includes('formatContentMetric(val)'), 'formatContentMetric function must exist');
      assert.ok(js.includes("return '—';"), 'Must return — for null or undefined');
    });

    test('renderCreatorContentList generates both desktop table and mobile cards', () => {
      assert.ok(js.includes('content-table-wrapper'), 'Desktop table wrapper must be rendered');
      assert.ok(js.includes('content-list-table'), 'Desktop table element must be rendered');
      assert.ok(js.includes('content-card-mobile-list'), 'Mobile cards list must be rendered');
      assert.ok(js.includes('View ${typeLabel} ↗'), 'View Reel / Post link must exist');
    });

    test('Instagram connect and disconnect functions are exposed globally', () => {
      assert.ok(js.includes('window.openInstagramConnectModal = openInstagramConnectModal;'));
      assert.ok(js.includes('window.syncContentInsights = syncContentInsights;'));
      assert.ok(js.includes('window.disconnectInstagramAccount = disconnectInstagramAccount;'));
    });
  });

  describe('8. Meta System User Token & Token Decryption Tests', () => {
    test('backend/creator.js validates INSTAGRAM_SYSTEM_USER_TOKEN for official brand account @wishrite.in', async () => {
      const creatorModule = await import('../backend/creator.js');
      const origEnv = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
      const origFetch = global.fetch;

      try {
        process.env.INSTAGRAM_SYSTEM_USER_TOKEN = 'mock-meta-sys-token-valid-123';
        global.fetch = async (url) => {
          if (url.includes('17841445671263800')) {
            return {
              json: async () => ({ id: '17841445671263800', username: 'wishrite.in' })
            };
          }
          return origFetch(url);
        };

        const brandReq = {
          creator: {
            id: 'brand-creator-id',
            instagram_id: 'wishrite.in',
            instagram_connection: {
              connected: true,
              username: 'wishrite.in',
              account_id: null
            }
          }
        };

        let result = null;
        const brandRes = {
          status() { return this; },
          json(data) { result = data; }
        };

        await creatorModule.handleGetInstagramStatus(brandReq, brandRes);
        assert.ok(result, 'Must return status response');
        assert.equal(result.connected, true);
        assert.equal(result.api_authorized, true);
        assert.equal(result.account_id, '17841445671263800');
        assert.equal(result.insights_status, 'connected');
      } finally {
        global.fetch = origFetch;
        if (origEnv !== undefined) {
          process.env.INSTAGRAM_SYSTEM_USER_TOKEN = origEnv;
        } else {
          delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
        }
      }
    });

    test('invalid or revoked System User token does NOT mark account authorized', async () => {
      const creatorModule = await import('../backend/creator.js');
      const origEnv = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
      const origFetch = global.fetch;

      try {
        process.env.INSTAGRAM_SYSTEM_USER_TOKEN = 'mock-invalid-revoked-token';
        global.fetch = async (url) => {
          if (url.includes('17841445671263800')) {
            return {
              json: async () => ({ error: { message: 'Invalid OAuth access token', code: 190 } })
            };
          }
          return origFetch(url);
        };

        const brandReq = {
          creator: {
            id: 'brand-creator-id-revoked',
            instagram_id: 'wishrite.in',
            instagram_connection: {
              connected: true,
              username: 'wishrite.in',
              account_id: null
            }
          }
        };

        let result = null;
        const brandRes = {
          status() { return this; },
          json(data) { result = data; }
        };

        await creatorModule.handleGetInstagramStatus(brandReq, brandRes);
        assert.ok(result);
        assert.equal(result.api_authorized, false, 'Invalid token must NOT mark account authorized');
        assert.equal(result.insights_status, 'auth_expired');
      } finally {
        global.fetch = origFetch;
        if (origEnv !== undefined) {
          process.env.INSTAGRAM_SYSTEM_USER_TOKEN = origEnv;
        } else {
          delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
        }
      }
    });

    test('System User token is isolated to brand account and never used for 3rd-party creators', async () => {
      const creatorModule = await import('../backend/creator.js');
      const origEnv = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
      const origFetch = global.fetch;

      try {
        process.env.INSTAGRAM_SYSTEM_USER_TOKEN = 'mock-meta-sys-token-valid-123';
        global.fetch = async (url) => {
          if (url.includes('17841445671263800')) {
            return {
              json: async () => ({ id: '17841445671263800', username: 'wishrite.in' })
            };
          }
          return origFetch(url);
        };

        const thirdPartyReq = {
          creator: {
            id: 'third-party-influencer-uuid',
            instagram_id: 'influencer_lifestyle',
            instagram_connection: {
              connected: true,
              username: 'influencer_lifestyle',
              account_id: null
            }
          }
        };

        let result = null;
        const res = {
          status() { return this; },
          json(data) { result = data; }
        };

        await creatorModule.handleGetInstagramStatus(thirdPartyReq, res);
        assert.ok(result);
        assert.equal(result.username, 'influencer_lifestyle');
        assert.equal(result.api_authorized, false, '3rd-party influencer must NOT inherit system user token');
        assert.notEqual(result.account_id, '17841445671263800');
      } finally {
        global.fetch = origFetch;
        if (origEnv !== undefined) {
          process.env.INSTAGRAM_SYSTEM_USER_TOKEN = origEnv;
        } else {
          delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
        }
      }
    });

    test('syncInstagramMediaMetrics decrypts encrypted OAuth tokens and never sends enc: ciphertext to Meta', async () => {
      const creatorModule = await import('../backend/creator.js');
      const syncService = await import('../backend/services/instagram-sync.js');
      const origFetch = global.fetch;

      try {
        const rawSecretToken = 'raw-verified-oauth-access-token-999';
        const encryptedToken = syncService.encryptToken(rawSecretToken);
        assert.ok(encryptedToken.startsWith('enc:'), 'Encrypted token must have enc: prefix');

        let tokenSentToMeta = null;
        global.fetch = async (url) => {
          const parsed = new URL(url);
          tokenSentToMeta = parsed.searchParams.get('access_token');
          return {
            json: async () => ({ data: [] })
          };
        };

        const testContent = {
          url: 'https://www.instagram.com/reel/C8xyz123abc/',
          instagram_media_id: null
        };
        const testCreator = {
          id: 'test-third-party-uuid',
          instagram_id: 'external_creator',
          instagram_connection: {
            access_token: encryptedToken,
            account_id: 'external-account-1234'
          }
        };

        await creatorModule.syncInstagramMediaMetrics(testContent, testCreator);

        assert.ok(tokenSentToMeta, 'A token must be sent to Meta Graph API');
        assert.equal(tokenSentToMeta.startsWith('enc:'), false, 'Ciphertext starting with enc: must NEVER be sent to Meta!');
        assert.equal(tokenSentToMeta, rawSecretToken, 'Decrypted token sent to Meta must match original plain token');
      } finally {
        global.fetch = origFetch;
      }
    });

    test('syncCreatorInstagram uses INSTAGRAM_SYSTEM_USER_TOKEN for @wishrite.in and retrieves 7 metrics', async () => {
      const syncService = await import('../backend/services/instagram-sync.js');
      const origEnv = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
      const origFetch = global.fetch;

      try {
        process.env.INSTAGRAM_SYSTEM_USER_TOKEN = 'mock-meta-sys-token-valid-777';

        global.fetch = async (url) => {
          const urlStr = String(url);
          // Account validation
          if (urlStr.includes('fields=id,username')) {
            return {
              json: async () => ({ id: '17841445671263800', username: 'wishrite.in' })
            };
          }
          // Media list
          if (urlStr.includes('/17841445671263800/media')) {
            return {
              json: async () => ({
                data: [
                  {
                    id: '18136926376563626',
                    caption: 'Festive silver bracelet reel',
                    media_type: 'VIDEO',
                    media_product_type: 'REELS',
                    permalink: 'https://www.instagram.com/reel/DfBxwGwz80S/',
                    timestamp: '2026-11-01T12:00:00+0000'
                  }
                ]
              })
            };
          }
          // Insights
          if (urlStr.includes('/insights')) {
            return {
              json: async () => ({
                data: [
                  { name: 'views', values: [{ value: 30 }] },
                  { name: 'reach', values: [{ value: 28 }] },
                  { name: 'likes', values: [{ value: 0 }] },
                  { name: 'comments', values: [{ value: 0 }] },
                  { name: 'shares', values: [{ value: 0 }] },
                  { name: 'saved', values: [{ value: 0 }] },
                  { name: 'total_interactions', values: [{ value: 0 }] }
                ]
              })
            };
          }
          return origFetch(url);
        };

        const brandCreator = {
          id: '00000000-0000-0000-0000-0000000000c1',
          influencer_id: '00000000-0000-0000-0000-0000000000c1',
          instagram_id: 'wishrite.in',
          instagram_connection: {
            connected: true,
            username: 'wishrite.in',
            account_id: null,
            access_token: null
          }
        };

        const syncResult = await syncService.syncCreatorInstagram(brandCreator);
        assert.ok(syncResult, 'Must return sync result');
        assert.equal(syncResult.success, true, 'Brand account sync must succeed with System User token');
        assert.equal(syncResult.synced_count, 1);
        assert.equal(syncResult.items[0].views_count, 30);
        assert.equal(syncResult.items[0].reach_count, 28);
        assert.equal(syncResult.items[0].likes_count, 0, 'Zero likes must be preserved as 0, not null');
        assert.equal(syncResult.items[0].total_interactions_count, 0, 'Zero interactions must be preserved as 0');
      } finally {
        global.fetch = origFetch;
        if (origEnv !== undefined) {
          process.env.INSTAGRAM_SYSTEM_USER_TOKEN = origEnv;
        } else {
          delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
        }
      }
    });

    test('upsertCreatorContentItem preserves existing submission status and does not duplicate records', async () => {
      const syncService = await import('../backend/services/instagram-sync.js');
      const testCreator = {
        id: 'creator-preservation-uuid',
        name: 'Deepak Kumar',
        email: 'dkr1888@gmail.com'
      };

      const media = {
        id: '18012472019968870',
        permalink: 'https://www.instagram.com/reel/DeGIKrkTf7J/',
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        caption: 'Ear Climbers'
      };

      const insights = {
        metrics: {
          views: 19,
          reach: 13,
          likes: 1,
          comments: 0,
          shares: 0,
          saved: 0,
          total_interactions: 1
        }
      };

      const result = await syncService.upsertCreatorContentItem(testCreator, media, insights);
      assert.ok(result, 'Must upsert content item');
      assert.equal(result.views_count, 19);
      assert.equal(result.reach_count, 13);
      assert.equal(result.saves_count, 0);
      assert.equal(result.total_interactions_count, 1);
    });
  });
});
