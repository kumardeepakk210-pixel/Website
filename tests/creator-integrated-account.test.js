process.env.NODE_ENV = 'test';
process.env.CREATOR_USE_LOCAL_STORE = 'true';
require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let server = null;
let PORT = process.env.PORT || 8085;
const STORE_PATH = path.join(__dirname, '..', 'data', 'influencers_store.json');
let backupStoreRaw = null;

before(async () => {
  if (fs.existsSync(STORE_PATH)) {
    backupStoreRaw = fs.readFileSync(STORE_PATH, 'utf8');
  }
  const serverModule = require('../server.js');
  const handler = serverModule.listeners('request')[0];
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  PORT = server.address().port;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});



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

    test('BECOME A CREATOR button and showCreatorOnboardForm function are properly wired', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.match(html, /id="btn-become-creator"/);
      assert.match(html, /onclick="showCreatorOnboardForm\(\)"/);
      assert.match(html, /BECOME A CREATOR/);
      assert.match(html, /id="creator-onboard-form-card"/);
      assert.match(html, /onclick="hideCreatorOnboardForm\(\)"/);
      assert.match(html, /id="creator-onboard-submit-btn"/);
      assert.match(html, /ACTIVATE CREATOR/);

      const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'creator-program.js'), 'utf8');
      assert.match(js, /function showCreatorOnboardForm/);
      assert.match(js, /window\.showCreatorOnboardForm\s*=\s*showCreatorOnboardForm/);
      assert.match(js, /function hideCreatorOnboardForm/);
      assert.match(js, /window\.hideCreatorOnboardForm\s*=\s*hideCreatorOnboardForm/);
      assert.match(js, /function handleCreatorOnboardSubmit/);
    });

    test('POST /api/creator/activate alias works identically to /api/creator/onboard', async () => {
      const testEmail = `activate_alias_${Date.now()}@example.com`;
      const authHeader = makeCustomerAuthHeader(testEmail, `usr_alias_${Date.now()}`);

      const res = await makeRequest({
        path: '/api/creator/activate',
        method: 'POST',
        headers: { 'Authorization': authHeader }
      }, {
        name: 'Alias Creator',
        city: 'Bangalore',
        state: 'Karnataka',
        instagram: '@alias_creator',
        agreement_accepted: true
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.creator);
      assert.equal(res.data.creator.name, 'Alias Creator');
    });

    test('Activation without terms agreement is rejected with 400', async () => {
      const res = await makeRequest({
        path: '/api/creator/activate',
        method: 'POST',
        headers: { 'Authorization': makeCustomerAuthHeader(`no_terms_${Date.now()}@example.com`, 'usr_1') }
      }, {
        name: 'No Agreement',
        city: 'Delhi',
        state: 'Delhi',
        instagram: '@noagree',
        agreement_accepted: false
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.match(res.data.error.message, /agree to the WishRite Creator Program Terms/i);
    });
  });

  // ═══ 3. EXISTING CREATOR PRESERVATION ═══
  describe('Existing Creator Data Preservation', () => {
    test('Creators store data schema is valid and initialized', () => {
      const storePath = path.join(__dirname, '..', 'data', 'influencers_store.json');
      assert.ok(fs.existsSync(storePath), 'influencers_store.json exists');
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      assert.ok(Array.isArray(store.influencers), 'influencers array initialized');
      assert.ok(Array.isArray(store.accounts), 'accounts array initialized');
      assert.ok(Array.isArray(store.links), 'links array initialized');
    });

    test('Creator can resolve creator status using authenticated email', async () => {
      const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'influencers_store.json'), 'utf8'));
      let existingAccount = (store.accounts || []).find(a => a.email && a.email.includes('@'));
      let existingInfluencer = existingAccount ? store.influencers.find(i => i.id === existingAccount.influencer_id) : null;

      if (!existingAccount || !existingInfluencer) {
        const testEmail = `existing_test_${Date.now()}@wishrite-test.in`;
        const obRes = await makeRequest({
          path: '/api/creator/onboard',
          method: 'POST',
          headers: { 'Authorization': makeCustomerAuthHeader(testEmail, 'temp-id') },
          body: {
            email: testEmail,
            display_name: 'Existing Test Creator',
            agreement_accepted: true
          }
        });
        existingAccount = { email: testEmail, influencer_id: obRes.data.creator.id };
        existingInfluencer = obRes.data.creator;
      }

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
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
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
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
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
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
      }, badPayload);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.match(res.data.error.message, /valid HTTP/i);
    });

    test('Creator can view their own content submissions', async () => {
      await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
      }, {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://www.instagram.com/p/view_own_submission_test/',
        caption: 'Self view test'
      });

      const res = await makeRequest({
        path: '/api/creator/content',
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
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
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
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
      const obA = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeaderA }
      }, { name: 'User A', city: 'Delhi', state: 'Delhi', instagram: '@usera', agreement_accepted: true });
      const tokenA = obA.data && obA.data.token ? obA.data.token : null;

      // User A submits content
      await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}` }
      }, {
        content_type: 'post',
        platform: 'Instagram',
        url: 'https://instagram.com/p/user_a_post/',
        caption: 'User A private styling'
      });

      // Onboard user B
      const obB = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeaderB }
      }, { name: 'User B', city: 'Mumbai', state: 'Maharashtra', instagram: '@userb', agreement_accepted: true });
      const tokenB = obB.data && obB.data.token ? obB.data.token : null;

      // User B fetches their content
      const resB = await makeRequest({
        path: '/api/creator/content',
        headers: { 'Authorization': `Bearer ${tokenB}` }
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
      const token = onboard.data && onboard.data.token ? onboard.data.token : null;

      const sub = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
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
          'Authorization': `Bearer ${token}`,
          'x-admin-role': 'true'
        }
      }, {
        contentId: sub.data && sub.data.data ? sub.data.data.id : 'unknown',
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

  // ═══ 7. CREATOR PROFILE PHOTO UPLOAD & PROFILE EDITING FLOW ═══
  describe('Creator Profile Photo Upload & Profile Editing Flow', () => {
    const photoUserEmail = `photo_creator_${Date.now()}@example.com`;
    const photoUserId = `usr_photo_${Date.now()}`;
    const photoAuthHeader = makeCustomerAuthHeader(photoUserEmail, photoUserId);
    let photoCreatorToken = null;

    // Minimal valid 1x1 transparent PNG:
    const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    // Minimal valid 1x1 JPEG:
    const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9]);
    const validJpegBase64 = `data:image/jpeg;base64,${validJpegBuffer.toString('base64')}`;

    test('Customer can upload a valid JPEG profile photo before/during onboarding', async () => {
      const res = await makeRequest({
        path: '/api/creator/profile-photo',
        method: 'POST',
        headers: { 'Authorization': photoAuthHeader }
      }, {
        image: validJpegBase64,
        mimeType: 'image/jpeg'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.url, 'Expected public URL to be returned');
      assert.equal(res.data.message, 'Profile photo uploaded successfully.');
    });

    test('Customer can upload a valid PNG profile photo', async () => {
      const res = await makeRequest({
        path: '/api/creator/profile-photo',
        method: 'POST',
        headers: { 'Authorization': photoAuthHeader }
      }, {
        image: validPngBase64,
        mimeType: 'image/png'
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.url);
    });

    test('Reject oversized profile photo (>5 MB) with exact error message', async () => {
      // 5.2 MB payload
      const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0xFF);
      largeBuffer[0] = 0xFF; largeBuffer[1] = 0xD8; largeBuffer[2] = 0xFF;
      const largeBase64 = `data:image/jpeg;base64,${largeBuffer.toString('base64')}`;

      const res = await makeRequest({
        path: '/api/creator/profile-photo',
        method: 'POST',
        headers: { 'Authorization': photoAuthHeader }
      }, {
        image: largeBase64
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.message, 'Please upload an image smaller than 5 MB.');
    });

    test('Reject invalid file format (e.g. SVG or arbitrary executable) with 400', async () => {
      const svgBase64 = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>').toString('base64')}`;

      const res = await makeRequest({
        path: '/api/creator/profile-photo',
        method: 'POST',
        headers: { 'Authorization': photoAuthHeader }
      }, {
        image: svgBase64,
        mimeType: 'image/svg+xml'
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.success, false);
      assert.ok(res.data.error.message.includes('Unsupported image format'));
    });

    test('Activate creator profile with the uploaded profile photo', async () => {
      const onboardRes = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': photoAuthHeader }
      }, {
        name: 'Aanya Verma',
        bio: 'Silver jewellery enthusiast & designer',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        instagram: '@aanya_silver',
        preferences: ['Jewellery styling', 'Wedding'],
        agreement_accepted: true,
        profile_image: validJpegBase64
      });

      assert.equal(onboardRes.statusCode, 200);
      assert.equal(onboardRes.data.success, true);
      assert.ok(onboardRes.data.creator);
      photoCreatorToken = onboardRes.data.token;
    });

    test('Edit creator profile via PATCH /api/creator/profile', async () => {
      const updatePayload = {
        name: 'Aanya Verma Luxury',
        bio: 'Official 925 sterling silver curator and fashion stylist.',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        instagram: '@aanya_luxury_silver',
        youtube_url: 'https://youtube.com/@aanyastyle',
        facebook_url: 'https://facebook.com/aanya.official',
        content_preferences: ['Jewellery styling', 'Festive', 'Wedding']
      };

      const res = await makeRequest({
        path: '/api/creator/profile',
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${photoCreatorToken}` }
      }, updatePayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.name, 'Aanya Verma Luxury');
      assert.equal(res.data.data.city, 'Mumbai');
      assert.equal(res.data.data.state, 'Maharashtra');
      assert.equal(res.data.data.youtube_url, 'https://youtube.com/@aanyastyle');
      assert.deepEqual(res.data.data.content_preferences, ['Jewellery styling', 'Festive', 'Wedding']);
    });

    test('GET /api/creator/profile returns updated creator details', async () => {
      const res = await makeRequest({
        path: '/api/creator/profile',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${photoCreatorToken}` }
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.name, 'Aanya Verma Luxury');
      assert.equal(res.data.data.city, 'Mumbai');
    });

    test('Remove profile photo via DELETE /api/creator/profile-photo resets to default avatar', async () => {
      const delRes = await makeRequest({
        path: '/api/creator/profile-photo',
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${photoCreatorToken}` }
      });

      assert.equal(delRes.statusCode, 200);
      assert.equal(delRes.data.success, true);

      const profileRes = await makeRequest({
        path: '/api/creator/profile',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${photoCreatorToken}` }
      });

      assert.equal(profileRes.statusCode, 200);
      assert.ok(profileRes.data.data.profile_image === null || (typeof profileRes.data.data.profile_image === 'string' && profileRes.data.data.profile_image.includes('ui-avatars.com')));
    });
  });

  describe('Product Category, Creator Link & Reel Insights', () => {
    let testCreatorToken;

    before(async () => {
      const uniqueEmail = `creator_cat_${Date.now()}@test.com`;
      const authHeader = makeCustomerAuthHeader(uniqueEmail, `usr_cat_${Date.now()}`);

      const onboardRes = await makeRequest({
        path: '/api/creator/onboard',
        method: 'POST',
        headers: { 'Authorization': authHeader }
      }, {
        name: 'Rohan Sharma Creator',
        bio: 'Styling WishRite silver jewellery',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        instagram: '@rohan_silver',
        preferences: ['Jewellery styling'],
        agreement_accepted: true
      });

      assert.equal(onboardRes.statusCode, 200);
      testCreatorToken = onboardRes.data.token;
    });

    test('Live product catalog provides canonical categories without hardcoding', async () => {
      const res = await makeRequest({ path: '/api/public/products', method: 'GET' });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      const prods = res.data.products || res.data.data || [];
      assert.ok(Array.isArray(prods));

      // Extract distinct categories dynamically from catalog
      const categories = [...new Set(prods.map(p => p.category).filter(Boolean))];
      assert.ok(categories.length > 0, 'Catalog should contain categories from database');
    });

    test('HTML modals contain Category dropdown, disabled Product dropdown, and preview box', () => {
      const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

      // Post modal structure
      assert.ok(html.includes('id="share-post-category"'), 'share-post-category select exists');
      assert.ok(html.includes('id="share-post-product"'), 'share-post-product select exists');
      assert.ok(html.includes('id="share-post-product-preview"'), 'share-post-product-preview exists');
      assert.ok(html.includes('Select a category first ▼'), 'Post product selector starts disabled');

      // Reel modal structure
      assert.ok(html.includes('id="share-reel-category"'), 'share-reel-category select exists');
      assert.ok(html.includes('id="share-reel-product"'), 'share-reel-product select exists');
      assert.ok(html.includes('id="share-reel-product-preview"'), 'share-reel-product-preview exists');
    });

    test('Submit Post with Product Category persists category and product relationship', async () => {
      const postPayload = {
        content_type: 'post',
        platform: 'instagram',
        url: 'https://www.instagram.com/p/DBxyz123/',
        caption: 'Styling the Silver Evil Eye Necklace with modern festive outfits',
        product_category: 'Necklaces',
        product_code: 'WR-NC-001',
        product_name: 'Silver Evil Eye Necklace',
        product_image: 'https://images.wishrite.in/products/WR-NC-001.jpg',
        tags: ['#wishrite', '#silverjewellery']
      };

      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
      }, postPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.product_category, 'Necklaces');
      assert.equal(res.data.data.product_code, 'WR-NC-001');
      assert.equal(res.data.data.product_name, 'Silver Evil Eye Necklace');
    });

    test('Submit Reel with Product Category persists category and product relationship', async () => {
      const reelPayload = {
        content_type: 'reel',
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/C89abcDEF/',
        caption: 'Sparkle in 925 Silver Solitaire Studs',
        product_category: 'Earrings',
        product_code: 'WR-ER-002',
        product_name: 'Solitaire Studs',
        product_image: 'https://images.wishrite.in/products/WR-ER-002.jpg',
        tags: ['#wishrite', '#reels']
      };

      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
      }, reelPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.product_category, 'Earrings');
      assert.equal(res.data.data.product_code, 'WR-ER-002');
      assert.equal(res.data.data.product_name, 'Solitaire Studs');
    });

    test('GET /api/creator/content returns submitted items with product category', async () => {
      const res = await makeRequest({
        path: '/api/creator/content',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${testCreatorToken}` }
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.success, true);
      assert.ok(Array.isArray(res.data.data));

      const postItem = res.data.data.find(c => c.content_type === 'post' && c.product_code === 'WR-NC-001');
      assert.ok(postItem, 'Submitted post exists');
      assert.equal(postItem.product_category, 'Necklaces');

      const reelItem = res.data.data.find(c => c.content_type === 'reel' && c.product_code === 'WR-ER-002');
      assert.ok(reelItem, 'Submitted reel exists');
      assert.equal(reelItem.product_category, 'Earrings');
    });

    test('Creator Link Card is positioned below Creator Performance and above Reel Insights', () => {
      const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

      const perfPos = html.indexOf('class="creator-metrics-grid"');
      const linkCardPos = html.indexOf('id="creator-link-card"');
      const reelInsightsPos = html.indexOf('id="creator-reel-insights-section"');
      const contentPos = html.indexOf('id="creator-content-grid"');

      assert.ok(perfPos > 0, 'Performance grid exists');
      assert.ok(linkCardPos > perfPos, 'Creator Link card is placed after Creator Performance');
      assert.ok(reelInsightsPos > linkCardPos, 'Reel Insights section is placed after Creator Link card');
      assert.ok(contentPos > reelInsightsPos, 'My Content is placed after Reel Insights');

      // Verify description text required by prompt item 10
      assert.ok(html.includes('Share this link with your audience to help them discover WishRite jewellery.'));
    });

    test('Creator Link Card contains Copy and Share buttons', () => {
      const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
      assert.ok(html.includes('id="creator-copy-link-btn"'));
      assert.ok(html.includes('id="creator-share-link-btn"'));
      assert.ok(html.includes('copyCreatorReferralLink()'));
      assert.ok(html.includes('shareCreatorLink()'));
    });

    test('Reel Insights and client logic strictly avoids fake statistics', () => {
      const js = fs.readFileSync(path.join(__dirname, '../js/creator-program.js'), 'utf8');

      // Verify that notice for unintegrated social platform insights is present
      assert.ok(js.includes('Performance insights will appear here when social-platform insights are available.'));

      // Verify that random/fake generation functions (e.g. Math.random() for views/likes/comments) are NOT present
      assert.ok(!js.includes('Math.floor(Math.random() * 1000)'), 'No fake views generation');
      assert.ok(!js.includes('Math.floor(Math.random() * 100)'), 'No fake likes generation');

      // Verify real WishRite attribution performance is rendered
      assert.ok(js.includes('WishRite Performance'));
      assert.ok(js.includes('commission_amount'));
    });

    test('Responsive CSS contains styles for Creator Link card, product selector preview & Reel Insights', () => {
      const css = fs.readFileSync(path.join(__dirname, '../css/creator.css'), 'utf8');
      assert.ok(css.includes('.creator-link-card'));
      assert.ok(css.includes('.product-preview-thumb-box'));
      assert.ok(css.includes('.reel-insights-container'));
      assert.ok(css.includes('.reel-insights-card'));
      assert.ok(css.includes('.reel-insights-notice'));
      assert.ok(css.includes('@media (max-width: 600px)'));
    });
  });
});
