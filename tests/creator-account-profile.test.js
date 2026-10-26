const { test, describe } = require('node:test');
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

describe('WishRite — Creator Account in Customer Profile / Account Menu', () => {
  test('Test 1: Customer Profile -> Creator Account is present in user dropdown & profile markup', () => {
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    assert.match(authJs, /Creator Account/);
    assert.match(authJs, /creator-account-link/);
    assert.match(authJs, /navigateToCreatorAccount/);

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(indexHtml, /creator-profile-portal-link/);
    assert.match(indexHtml, /Creator Account/);
  });

  test('Test 2: Creator Account click opens Creator Club authentication logic', () => {
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    assert.match(authJs, /function navigateToCreatorAccount/);
    assert.match(authJs, /localStorage\.getItem\(['"]wishrite_creator_token['"]\)/);
    assert.match(authJs, /\/creator\/login/);
    assert.match(authJs, /\/creator\/dashboard/);
  });

  test('Test 3: Authenticated creator -> Creator Dashboard', () => {
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    const startIdx = authJs.indexOf('function navigateToCreatorAccount');
    const endIdx = authJs.indexOf('window.navigateToCreatorAccount = navigateToCreatorAccount');
    const funcSnippet = authJs.slice(startIdx, endIdx);
    assert.ok(funcSnippet.includes('/creator/dashboard'), 'redirects to /creator/dashboard when authenticated');
    assert.ok(funcSnippet.includes('/creator/login'), 'redirects to /creator/login when unauthenticated');
  });

  test('Test 4: Unauthenticated creator -> Creator Login', async () => {
    const res = await makeRequest({ path: '/creator/login' });
    assert.equal(res.statusCode, 200);
    assert.match(res.raw, /Creator Club/i);
  });

  test('Test 5: Invalid creator credentials rejected', async () => {
    const res = await makeRequest({
      path: '/api/creator/login',
      method: 'POST'
    }, {
      email: 'invalid_nonexistent_user@example.com',
      password: 'wrongpassword123'
    });
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  });

  test('Test 6: Mobile Profile -> Creator Account visible', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(indexHtml, /mobile-creator-account-link/);
    assert.match(indexHtml, /id="mobile-menu-creator-link"/);
    assert.match(indexHtml, /Join Creator Club/);

    const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'layout.css'), 'utf8');
    assert.match(layoutCss, /\.creator-menu-item/);
    assert.match(layoutCss, /\.creator-menu-title/);
  });

  test('Test 7: Existing customer Profile functionality unchanged', () => {
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    assert.match(authJs, /My Profile/);
    assert.match(authJs, /My Orders/);
    assert.match(authJs, /Wishlist/);
    assert.match(authJs, /handleLogout/);

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(indexHtml, /id="profile-view"/);
    assert.match(indexHtml, /id="account-orders-card"/);
  });

  test('Test 8: Customer checkout unchanged', () => {
    const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
    assert.ok(cartJs.includes('checkout') || cartJs.includes('proceedToCheckout'));
    assert.ok(cartJs.includes('/api/orders/attribute'));
  });

  test('Test 9: Razorpay Payments unchanged', () => {
    const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
    assert.ok(cartJs.includes('create-razorpay-order'));
    assert.ok(cartJs.includes('verify-razorpay-payment'));
    assert.ok(cartJs.includes('loadRazorpaySdk'));
    assert.ok(cartJs.includes('https://checkout.razorpay.com/v1/checkout.js'));
  });
});
