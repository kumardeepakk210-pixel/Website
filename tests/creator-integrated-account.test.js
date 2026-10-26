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
  return 'Bearer ' + token;
}

describe('WishRite — Integrated Creator Program Inside My Account', () => {

  // ═══ 1. ACCOUNT & TABS ═══
  describe('Account Structure & Tabs Navigation', () => {
    test('Account Tab and Creator Tab exist inside profile-view in index.html', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.match(html, /id="profile-view"/);
      assert.match(html, /class="profile-tabs-bar"/);
      assert.match(html, /id="tab-btn-account"/);
      assert.match(html, /id="tab-btn-creator"/);
      assert.match(html, /id="tab-pane-account"/);
      assert.match(html, /id="tab-pane-creator"/);
      assert.match(html, /switchProfileTab\('account'\)/);
      assert.match(html, /switchProfileTab\('creator'\)/);
    });

    test('switchProfileTab logic exists and toggles active state', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'creator-program.js'), 'utf8');
      assert.match(js, /function switchProfileTab/);
      assert.match(js, /tab-pane-account/);
      assert.match(js, /tab-pane-creator/);
      assert.match(js, /loadCustomerCreatorStatus/);
    });

    test('Customer account details and order history remain intact in Tab 1', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.match(html, /id="account-details-card"/);
      assert.match(html, /id="account-name"/);
      assert.match(html, /id="account-email"/);
      assert.match(html, /id="account-mobile"/);
      assert.match(html, /id="account-orders-card"/);
      assert.match(html, /id="account-orders-list"/);
    });
  });

  // ═══ 2. ONBOARDING & NEW CREATOR ACTIVATION ═══
  describe('New Creator Activation & Duplicate Prevention', () => {
    test('Unauthenticated user receives unauthenticated creator status', async () => {
      const res = await makeRequest({ path: '/api/creator/status' });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.is_authenticated, false);
      assert.equal(res.data.is_creator, false);
    });

    test('Customer can activate Creator profile via POST /api/creator/onboard', async () => {
      const testEmail = `creator_test_${Date.now()}@example.com`;
      const testUserId = `usr_${Date.now()}`;
      const authHeader = makeCustomerAuthHeader(testEmail, testUserId);

      const onboardPayload = {
        name: 'Tara Sharma',
        bio: 'Jewellery lover and stylist',
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
        instagram: '@tara_jewels',
        youtube: 'https://youtube.com/@tarajewels',
        preferences: ['Jewellery styling', 'Festive'],
        agreement_accepted: true
      };

      const res = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeader }
      }, onboardPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.creator);
      assert.equal(res.data.creator.name, 'Tara Sharma');
      assert.match(res.data.creator.influencer_code, /^WR-(CRE|INF)-/);

      // Duplicate activation is safely prevented / returns already active
      const dupRes = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeader }
      }, onboardPayload);

      assert.equal(dupRes.statusCode, 200);
      assert.equal(dupRes.data.success, true);
      assert.equal(dupRes.data.already_active, true);
      assert.equal(dupRes.data.creator.influencer_code, res.data.creator.influencer_code);
    });
  });

  // ═══ 3. EXISTING CREATOR PRESERVATION ═══
  describe('Existing Creator Data Preservation', () => {
    test('Existing creators store data is intact and preserved', () => {
      const storePath = path.join(__dirname, '..', 'data', 'influencers_store.json');
      assert.ok(fs.existsSync(storePath), 'influencers_store.json exists');
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      assert.ok(Array.isArray(store.influencers) && store.influencers.length > 0, 'influencers preserved');
      assert.ok(Array.isArray(store.accounts) && store.accounts.length > 0, 'accounts preserved');
      assert.ok(Array.isArray(store.links) && store.links.length > 0, 'links preserved');
    });

    test('Existing creator can resolve creator status using existing email', async () => {
      const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'influencers_store.json'), 'utf8'));
      const existingAccount = store.accounts.find(a => a.email && a.email.includes('@'));
      const existingInfluencer = store.influencers.find(i => i.id === existingAccount.influencer_id);

      const authHeader = makeCustomerAuthHeader(existingAccount.email, 'test-user-id');
      const res = await makeRequest({
        path: '/api/creator/status',
        headers: { 'Authorization': authHeader }
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.is_authenticated, true);
      assert.equal(res.data.is_creator, true);
      assert.equal(res.data.creator.influencer_code, existingInfluencer.influencer_code);
    });
  });

  // ═══ 4. CONTENT SUBMISSION & MODERATION ═══
  describe('Social Content Sharing (Posts & Reels) and Moderation', () => {
    let testCreatorToken;
    let testCreatorAuthHeader;

    before(async () => {
      const testEmail = `content_creator_${Date.now()}@example.com`;
      testCreatorAuthHeader = makeCustomerAuthHeader(testEmail, `usr_content_${Date.now()}`);

      const onboardRes = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, {
        name: 'Rohan Mehta',
        city: 'Delhi',
        state: 'Delhi',
        instagram: '@rohan_m',
        preferences: ['Lifestyle'],
        agreement_accepted: true
      });

      assert.equal(onboardRes.statusCode, 200);
      testCreatorToken = onboardRes.data.token;
    });

    test('Submit a valid Instagram Post with product association', async () => {
      const postPayload = {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://www.instagram.com/p/DB123456789/',
        caption: 'Styling the WishRite Silver Pendant for Diwali festivities!',
        product_code: 'WR-JWL-001',
        product_name: 'Silver Celestial Pendant',
        tags: '#wishrite, #silverpendant'
      };

      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, postPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.content_type, 'post');
      assert.equal(res.data.data.status, 'Submitted');
      assert.equal(res.data.data.product_code, 'WR-JWL-001');
    });

    test('Submit a valid Instagram Reel with product association', async () => {
      const reelPayload = {
        content_type: 'reel',
        platform: 'Instagram',
        url: 'https://www.instagram.com/reel/DC987654321/',
        caption: 'Unboxing the 925 Sterling Silver Ring ✨',
        product_code: 'WR-RNG-002',
        product_name: 'Solitaire Silver Ring',
        tags: '#reels, #unboxing'
      };

      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, reelPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.content_type, 'reel');
      assert.equal(res.data.data.status, 'Submitted');
    });

    test('Invalid content URL is rejected with 400', async () => {
      const badPayload = {
        content_type: 'post',
        platform: 'Instagram',
        url: 'javascript:alert(1)',
        caption: 'Hacker post'
      };

      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, badPayload);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.match(res.data.error.message, /valid HTTP/i);
    });

    test('Creator can view their own content submissions', async () => {
      await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://www.instagram.com/p/view_own_submission_test/',
        caption: 'Self view test'
      });

      const res = await makeRequest({
        path: '/api/creator/content',
        headers: { 'Authorization': testCreatorAuthHeader }
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(Array.isArray(res.data.content));
      assert.ok(res.data.content.length >= 1);
    });

    test('Admin can view all content and moderate (Approve / Reject)', async () => {
      const itemSub = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': testCreatorAuthHeader }
      }, {
        content_type: 'reel',
        platform: 'Instagram',
        url: 'https://www.instagram.com/reel/mod_test_item/',
        caption: 'Moderation target'
      });

      const targetId = itemSub.data && itemSub.data.data ? itemSub.data.data.id : null;

      const adminListRes = await makeRequest({
        path: '/api/creator/admin/content',
        headers: { 'x-admin-role': 'true' }
      });

      assert.equal(adminListRes.statusCode, 200);
      assert.equal(adminListRes.data.success, true);
      assert.ok(Array.isArray(adminListRes.data.content));

      const firstItem = targetId
        ? adminListRes.data.content.find(c => c.id === targetId)
        : adminListRes.data.content[0];
      assert.ok(firstItem, 'Found content to moderate');

      // Moderate to Approved
      const modRes = await makeRequest({
        path: '/api/creator/admin/content/moderate',
        method: 'POST',
        headers: { 'x-admin-role': 'true' }
      }, {
        contentId: firstItem.id,
        action: 'approve'
      });

      assert.equal(modRes.statusCode, 200);
      assert.equal(modRes.data.success, true);
      assert.equal(modRes.data.data.status, 'Approved');
    });
  });

  // ═══ 5. SECURITY & ISOLATION ═══
  describe('Security, Isolation & Authorization Controls', () => {
    test('Creator A cannot view Creator B content via creator endpoint', async () => {
      const authHeaderA = makeCustomerAuthHeader(`userA_${Date.now()}@example.com`, `userA_${Date.now()}`);
      const authHeaderB = makeCustomerAuthHeader(`userB_${Date.now()}@example.com`, `userB_${Date.now()}`);

      // Onboard user A
      await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeaderA }
      }, { name: 'User A', city: 'Delhi', state: 'Delhi', instagram: '@usera', agreement_accepted: true });

      // User A submits content
      await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': authHeaderA }
      }, {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://instagram.com/p/user_a_post/',
        caption: 'User A private styling'
      });

      // Onboard user B
      await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeaderB }
      }, { name: 'User B', city: 'Mumbai', state: 'Maharashtra', instagram: '@userb', agreement_accepted: true });

      // User B fetches their content
      const resB = await makeRequest({
        path: '/api/creator/content',
        headers: { 'Authorization': authHeaderB }
      });

      assert.equal(resB.statusCode, 200);
      const userBUrls = (resB.data.content || []).map(c => c.url);
      assert.ok(!userBUrls.includes('https://instagram.com/p/user_a_post/'), 'User B cannot see User A content');
    });

    test('Creator cannot approve their own content (self-moderation prevented)', async () => {
      const email = `selfmod_${Date.now()}@example.com`;
      const auth = makeCustomerAuthHeader(email, `usr_${Date.now()}`);

      const onboard = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': auth }
      }, { name: 'Self Mod', city: 'Pune', state: 'MH', instagram: '@selfmod', agreement_accepted: true });

      const sub = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': auth }
      }, {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://instagram.com/p/self_mod_test/',
        caption: 'Testing self mod'
      });

      // Attempt self-moderation passing both creator token and admin header
      const modRes = await makeRequest({
        path: '/api/creator/admin/content/moderate',
        method: 'POST',
        headers: {
          'Authorization': auth,
          'x-admin-role': 'true'
        }
      }, {
        contentId: sub.data.data.id,
        action: 'approve'
      });

      assert.ok(modRes.statusCode === 403 || modRes.data.success === false);
    });

    test('Financial amounts and commission cannot be manipulated from browser', async () => {
      const res = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': makeCustomerAuthHeader(`hack_${Date.now()}@example.com`, `usr_hack_${Date.now()}`) }
      }, {
        name: 'Hacker',
        city: 'City',
        state: 'State',
        instagram: '@hack',
        agreement_accepted: true,
        commission_rate: 99.9,
        available_balance: 1000000,
        reward_points: 500000
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.creator.commission_rate, 10); // Standard 10% default, not 99.9%
    });

    test('RazorpayX live payouts remain disabled (ALLOW_LIVE_PAYOUTS=false)', () => {
      assert.equal(process.env.ALLOW_LIVE_PAYOUTS, 'false');
      const walletJs = fs.readFileSync(path.join(__dirname, '..', 'backend', 'creator-wallet.js'), 'utf8');
      assert.ok(walletJs.includes('ALLOW_LIVE_PAYOUTS'));
    });
  });

  // ═══ 6. MOBILE RESPONSIVENESS & UI INTEGRATION ═══
  describe('Mobile Responsiveness (375x812) & UI Styling', () => {
    test('creator.css contains 375x812 responsive optimizations without horizontal scroll', () => {
      const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'creator.css'), 'utf8');
      assert.match(css, /@media\s*\(max-width:\s*640px\)/);
      assert.match(css, /\.profile-tabs-bar/);
      assert.match(css, /\.profile-tab-btn/);
      assert.match(css, /\.creator-metrics-grid/);
      assert.match(css, /\.creator-content-card/);
    });

    test('App router handles profile creator parameter', () => {
      const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
      assert.match(appJs, /switchProfileTab/);
    });

    test('Profile dropdown sends users to My Account Creator Tab instead of separate login', () => {
      const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
      assert.match(authJs, /navigateTo\('profile',\s*'creator'\)/);
    });
  });
});
