require('dotenv').config();
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8085;

function makeRequest(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: PORT,
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

function makeCustomerAuthHeader(email, id) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: id,
    email: email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400
  })).toString('base64url');
  const token = `${header}.${payload}.signature`;

  return {
    'Authorization': `Bearer ${token}`,
    'x-customer-email': email,
    'x-customer-id': id
  };
}

describe('WishRite Creator — Instagram Content List & Official Insights Sync', () => {
  const testEmailA = `creator_insta_a_${Date.now()}@wishrite.test`;
  const testIdA = `cust_insta_a_${Date.now()}`;
  const authHeadersA = makeCustomerAuthHeader(testEmailA, testIdA);

  const testEmailB = `creator_insta_b_${Date.now()}@wishrite.test`;
  const testIdB = `cust_insta_b_${Date.now()}`;
  const authHeadersB = makeCustomerAuthHeader(testEmailB, testIdB);

  let creatorA = null;
  let creatorB = null;
  let reelItem1 = null;
  let reelItem2 = null;
  let postItem = null;

  before(async () => {
    // 1. Onboard Creator A
    const resA = await makeRequest({
      path: '/api/creator/onboard',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Priya Sharma',
      instagram: 'priyastylez',
      bio: 'Fashion & Fine Jewelry Creator',
      agreement_accepted: true
    });
    if (resA.data && resA.data.creator) {
      creatorA = resA.data.creator;
    }

    // 2. Onboard Creator B
    const resB = await makeRequest({
      path: '/api/creator/onboard',
      method: 'POST',
      headers: authHeadersB
    }, {
      name: 'Rohan Verma',
      instagram: 'rohanv_luxury',
      bio: 'Luxury accessories collector',
      agreement_accepted: true
    });
    if (resB.data && resB.data.creator) {
      creatorB = resB.data.creator;
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
});
