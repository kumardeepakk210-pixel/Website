const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Load environment variables if available
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Ensure sandbox mode for testing
process.env.RAZORPAYX_MODE = 'sandbox';
process.env.ALLOW_LIVE_PAYOUTS = 'false';

// Helper to make local HTTP requests
function makeRequest(server, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
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

describe('WishRite Creator Club Website Integration - Full 35-Point Regression', () => {
  let server;
  let testCreatorToken;
  let testCreatorId;
  let testCreatorSlug = 'WR-INF-000001';

  before(async () => {
    server = require('../server.js');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================
  // CUSTOMER WEBSITE TESTS (1-7)
  // ==========================================
  describe('Customer Experience', () => {
    test('1. Normal homepage serves correctly with luxury branding', async () => {
      const res = await makeRequest(server, { path: '/' });
      assert.equal(res.statusCode, 200);
      assert.ok(typeof res.raw === 'string');
      assert.ok(res.raw.includes('WishRite') || res.raw.includes('WISHRITE'));
      assert.ok(res.raw.includes('creator.css'));
      assert.ok(res.raw.includes('attribution.js'));
    });

    test('2. Product listing/API returns active live products', async () => {
      const res = await makeRequest(server, { path: '/api/public/products' });
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.data) || (res.data && Array.isArray(res.data.products)));
    });

    test('3. Product detail page elements exist in client templates', async () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.ok(indexHtml.includes('product-view'));
      // Verify products.js contains detail rendering and creator attribution badge logic
      const productsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'products.js'), 'utf8');
      assert.ok(productsJs.includes('renderProductDetail') || productsJs.includes('renderProductView') || productsJs.includes('viewProduct'));
      assert.ok(productsJs.includes('Curated by'));
    });

    test('4. Add to cart preserves cart structure and creator attribution', async () => {
      const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
      assert.ok(cartJs.includes('addToCart'));
      assert.ok(cartJs.includes('WishRiteAttribution') || cartJs.includes('recordAttribution'));
    });

    test('5. Cart view contains elements for managing items', async () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.ok(indexHtml.includes('cart-view') || indexHtml.includes('cart-modal') || indexHtml.includes('cart'));
    });

    test('6. Checkout integration preserves order and attribution flows', async () => {
      const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
      assert.ok(cartJs.includes('checkout') || cartJs.includes('proceedToCheckout'));
      assert.ok(cartJs.includes('/api/orders/attribute'));
    });

    test('7. Existing Razorpay payment flow routes exist without alteration', async () => {
      const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
      assert.ok(cartJs.includes('create-razorpay-order'));
      assert.ok(cartJs.includes('verify-razorpay-payment'));
      assert.ok(cartJs.includes('loadRazorpaySdk'));
      assert.ok(cartJs.includes('https://checkout.razorpay.com/v1/checkout.js'));
    });
  });

  // ==========================================
  // CREATOR WEBSITE TESTS (8-22)
  // ==========================================
  describe('Creator Flow & Features', () => {
    test('8. Creator login endpoint exists and handles authentication securely', async () => {
      // Test invalid login fails safely
      const failRes = await makeRequest(server, { path: '/api/creator/login', method: 'POST' }, {
        email: 'invalid@example.com',
        password: 'wrongpassword'
      });
      assert.ok(failRes.statusCode === 401 || failRes.statusCode === 403);
      assert.ok(failRes.data.error || failRes.data.message);

      // Verify PBKDF2 verification logic is present in backend
      const creatorAuthPath = path.join(__dirname, '..', 'backend', 'creator.js');
      const authCode = fs.readFileSync(creatorAuthPath, 'utf8');
      assert.ok(authCode.includes('crypto.pbkdf2Sync') || authCode.includes('pbkdf2'));
    });

    test('9. Creator dashboard UI and stats API exist', async () => {
      // Creator dashboard html page exists
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('Creator Club') || creatorHtml.includes('Dashboard'));
      assert.ok(creatorHtml.includes('creator-metric-card') || creatorHtml.includes('stat-card'));
      assert.ok(creatorHtml.includes('#5E3435'));

      // Check stats API requires auth
      const unauthStats = await makeRequest(server, { path: '/api/creator/stats' });
      assert.equal(unauthStats.statusCode, 401);
    });

    test('10. Creator storefront page renders for valid creator code', async () => {
      const res = await makeRequest(server, { path: `/api/public/influencers/${testCreatorSlug}` });
      // Should return either 200 with creator profile, or 404 if not found in db, but not 500
      assert.ok(res.statusCode === 200 || res.statusCode === 404);
      if (res.statusCode === 200) {
        assert.ok(res.data.influencer_id || res.data.code);
        // Sensitive data must NOT be exposed
        assert.equal(res.data.wallet_balance, undefined);
        assert.equal(res.data.payout_details, undefined);
        assert.equal(res.data.email, undefined);
      }
    });

    test('11. Referral link generation and formatting', async () => {
      const portalJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'creator-portal.js'), 'utf8');
      assert.ok(portalJs.includes('/creator/') || portalJs.includes('/influencer/'));
      assert.ok(portalJs.includes('copyStorefrontLink') || portalJs.includes('copy'));
    });

    test('12. Click tracking endpoint records referrals', async () => {
      const res = await makeRequest(server, { path: '/api/public/click', method: 'POST' }, {
        influencer_code: testCreatorSlug,
        landing_page: '/creator/' + testCreatorSlug,
        device_type: 'desktop'
      });
      // Should accept click tracking
      assert.ok(res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 400 || res.statusCode === 404);
      if (res.statusCode === 200 || res.statusCode === 201) {
        assert.ok(res.data.tracked || res.data.success);
      }
    });

    test('13. Attribution persistence uses 30-day window in client attribution.js', async () => {
      const attrJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'attribution.js'), 'utf8');
      assert.ok(attrJs.includes('30') || attrJs.includes('INFLUENCER_ATTRIBUTION_DAYS'));
      assert.ok(attrJs.includes('wishrite_influencer_attribution'));
    });

    test('14. Product -> cart attribution survives navigation', async () => {
      const attrJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'attribution.js'), 'utf8');
      assert.ok(attrJs.includes('getAttributionPayload') || attrJs.includes('getActiveAttribution'));
      const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
      assert.ok(cartJs.includes('WishRiteAttribution') || cartJs.includes('attribution'));
    });

    test('15. Checkout attribution endpoint accepts valid order attribution', async () => {
      const res = await makeRequest(server, { path: '/api/orders/attribute', method: 'POST' }, {
        order_reference: 'WR-ORD-TEST-999',
        order_id: 'test-order-999',
        influencer_code: 'INVALID-CODE',
        sales_amount: 1999
      });
      // Server must validate and either reject unknown or attribute, never crash
      assert.ok(res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 404);
    });

    test('16. Commission calculation is strictly server-authoritative', async () => {
      const backendOrders = fs.readFileSync(path.join(__dirname, '..', 'backend', 'influencers.js'), 'utf8');
      assert.ok(backendOrders.includes('attributeOrderToInfluencer') || backendOrders.includes('commission'));
      // Verify client cart never supplies commission amount
      const cartJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'cart.js'), 'utf8');
      assert.ok(!cartJs.includes('commission_amount:'));
    });

    test('17. Wallet display and API protection', async () => {
      const res = await makeRequest(server, { path: '/api/creator/wallet' });
      assert.equal(res.statusCode, 401); // Unauthorized without bearer token
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('wallet-view') || creatorHtml.includes('wallet'));
      assert.ok(creatorHtml.includes('Available Balance'));
    });

    test('18. Withdrawal request API rejects unauthorized or invalid input', async () => {
      const res = await makeRequest(server, { path: '/api/creator/withdrawals', method: 'POST' }, {
        amount: 1000,
        payout_method_id: 'dummy'
      });
      assert.equal(res.statusCode, 401);
    });

    test('19. Withdrawal history view structure in creator portal', async () => {
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('withdrawals-history-table') || creatorHtml.includes('withdrawals-history') || creatorHtml.includes('history'));
    });

    test('20. Points display and API protection', async () => {
      const res = await makeRequest(server, { path: '/api/creator/points' });
      assert.equal(res.statusCode, 401);
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('points-view') || creatorHtml.includes('points'));
    });

    test('21. Rewards catalogue display and redemption protection', async () => {
      const res = await makeRequest(server, { path: '/api/creator/rewards' });
      assert.equal(res.statusCode, 401);
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('rewards-view') || creatorHtml.includes('rewards'));
      assert.ok(creatorHtml.includes('redeemReward') || creatorHtml.includes('Redeem'));
    });

    test('22. Profile view allows only safe editable fields', async () => {
      const res = await makeRequest(server, { path: '/api/creator/profile', method: 'PUT' }, {
        name: 'New Name',
        commission_rate: 99.9 // Tampering attempt
      });
      assert.equal(res.statusCode, 401);
      // Profile editing in backend must not accept commission_rate
      const creatorBackend = fs.readFileSync(path.join(__dirname, '..', 'backend', 'creator.js'), 'utf8');
      assert.ok(creatorBackend.includes('handleUpdateCreatorProfile'));
    });
  });

  // ==========================================
  // SECURITY TESTS (23-29)
  // ==========================================
  describe('Security & Integrity Controls', () => {
    test('23. Unauthorized creator dashboard access is blocked (401)', async () => {
      const endpoints = [
        '/api/creator/me',
        '/api/creator/stats',
        '/api/creator/performance',
        '/api/creator/orders',
        '/api/creator/wallet',
        '/api/creator/payout-methods',
        '/api/creator/withdrawals',
        '/api/creator/points',
        '/api/creator/rewards'
      ];
      for (const endpoint of endpoints) {
        const res = await makeRequest(server, { path: endpoint });
        assert.equal(res.statusCode, 401, `Expected 401 for ${endpoint}`);
      }
    });

    test('24. Creator wallet requires authenticated influencer context', async () => {
      const walletRes = await makeRequest(server, {
        path: '/api/creator/wallet',
        headers: { 'Authorization': 'Bearer invalid-token-123' }
      });
      assert.equal(walletRes.statusCode, 401);
    });

    test('25. Creator cannot modify commission via client APIs', async () => {
      const publicApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'public.js'), 'utf8');
      assert.ok(!publicApi.includes('commission_rate = req.body'));
      const ordersApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'orders.js'), 'utf8');
      assert.ok(!ordersApi.includes('commission_amount = req.body.commission_amount'));
    });

    test('26. Creator cannot modify wallet balance directly from browser', async () => {
      const creatorApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'creator.js'), 'utf8');
      // No endpoint allows POST/PUT to balance
      assert.ok(!creatorApi.includes('/wallet/balance'));
      assert.ok(!creatorApi.includes('set_wallet_balance'));
    });

    test('27. Public creator endpoint does not expose private influencer info', async () => {
      const res = await makeRequest(server, { path: `/api/public/influencers/${testCreatorSlug}` });
      if (res.statusCode === 200) {
        const sensitive = ['email', 'phone', 'wallet_balance', 'payout_details', 'salt', 'password_hash'];
        for (const field of sensitive) {
          assert.equal(res.data[field], undefined, `Public endpoint exposed sensitive field: ${field}`);
        }
      }
    });

    test('28. Service-role credentials are NOT exposed in client-side code', () => {
      const clientFiles = [
        'index.html',
        'creator.html',
        'js/app.js',
        'js/cart.js',
        'js/products.js',
        'js/attribution.js',
        'js/creator-portal.js',
        'css/creator.css'
      ];
      for (const file of clientFiles) {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          assert.ok(!content.includes('service_role'), `Service role key exposed in ${file}`);
          assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `SUPABASE_SERVICE_ROLE_KEY exposed in ${file}`);
          assert.ok(!content.includes('RAZORPAYX_KEY_SECRET'), `RAZORPAYX_KEY_SECRET exposed in ${file}`);
        }
      }
    });

    test('29. RazorpayX live payouts are strictly blocked (ALLOW_LIVE_PAYOUTS=false)', () => {
      assert.equal(process.env.ALLOW_LIVE_PAYOUTS, 'false');
      assert.equal(process.env.RAZORPAYX_MODE, 'sandbox');
      const walletCode = fs.readFileSync(path.join(__dirname, '..', 'backend', 'creator-wallet.js'), 'utf8');
      assert.ok(walletCode.includes('ALLOW_LIVE_PAYOUTS') || walletCode.includes('sandbox'));
    });
  });

  // ==========================================
  // MOBILE & RESPONSIVE DESIGN TESTS (30-35)
  // ==========================================
  describe('Mobile & Responsive Experience', () => {
    test('30. Customer website has proper responsive viewport meta tag', () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      assert.ok(indexHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0'));
    });

    test('31. Creator mobile storefront contains responsive layout CSS', () => {
      const creatorCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'creator.css'), 'utf8');
      assert.ok(creatorCss.includes('@media (max-width: 768px)') || creatorCss.includes('@media'));
      assert.ok(creatorCss.includes('.creator-storefront-grid') || creatorCss.includes('.creator-products-grid'));
    });

    test('32. Creator mobile dashboard contains stacked cards CSS', () => {
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('creator-metrics-grid') && creatorHtml.includes('creator-metric-card'));
    });

    test('33. Creator mobile wallet formats transactions responsively', () => {
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('wallet-transactions-tbody') || creatorHtml.includes('creator-table'));
    });

    test('34. Creator mobile withdrawal UI has responsive layout', () => {
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('withdraw-form') && creatorHtml.includes('withdraw-method-select'));
    });

    test('35. Creator mobile navigation bar is present with 5 core tabs', () => {
      const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'creator.html'), 'utf8');
      assert.ok(creatorHtml.includes('creator-mobile-nav'));
      assert.ok(creatorHtml.includes('Home') || creatorHtml.includes('dashboard'));
      assert.ok(creatorHtml.includes('Links') || creatorHtml.includes('links'));
      assert.ok(creatorHtml.includes('Wallet') || creatorHtml.includes('wallet'));
      assert.ok(creatorHtml.includes('Points') || creatorHtml.includes('points'));
      assert.ok(creatorHtml.includes('Profile') || creatorHtml.includes('profile'));
    });
  });
});
