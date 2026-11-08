/**
 * ==============================================================================
 * TEST SUITE: Meta Instagram System User Token Diagnostic
 * ==============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runDiagnostic,
  callMetaGraph,
  sanitizeString,
  sanitizeObject,
  sanitizeError
} = require('../scripts/meta-system-user-diagnostic.js');

test('Meta System User Token Diagnostic Suite', async (t) => {

  await t.test('1. Security & Token Redaction', () => {
    const rawSecret = 'EAAG_super_secret_system_user_token_123456';
    const rawPageSecret = 'EAAG_page_access_token_abcdef_987654';

    // String sanitization
    const exposedStr = `Error communicating with token ${rawSecret} and page token ${rawPageSecret}`;
    const cleanStr = sanitizeString(exposedStr);
    assert.equal(cleanStr.includes(rawSecret), false, 'Raw system user token must be redacted');
    assert.equal(cleanStr.includes(rawPageSecret), false, 'Raw page access token must be redacted');
    assert.match(cleanStr, /\[REDACTED_TOKEN\]/);

    // Object sanitization
    const objWithTokens = {
      status: 'ok',
      access_token: rawSecret,
      page: {
        access_token: rawPageSecret,
        name: 'funnwith.ai'
      }
    };
    const sanitizedObj = sanitizeObject(objWithTokens);
    assert.equal(sanitizedObj.access_token, '[REDACTED_TOKEN]');
    assert.equal(sanitizedObj.page.access_token, '[REDACTED_TOKEN]');
    assert.equal(sanitizedObj.page.name, 'funnwith.ai');
  });

  await t.test('2. Token Missing Diagnostic Preflight', async () => {
    const origToken = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
    delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;

    const logs = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => logs.push(args.join(' '));

    try {
      await runDiagnostic();
      const output = logs.join('\n');
      assert.match(output, /INSTAGRAM_SYSTEM_USER_TOKEN is not configured in environment/);
      assert.match(output, /Token validity \| FAIL/);
    } finally {
      console.log = origLog;
      console.error = origError;
      if (origToken) process.env.INSTAGRAM_SYSTEM_USER_TOKEN = origToken;
    }
  });

  await t.test('3. Full Successful Diagnostic with Mocked Meta Graph API', async () => {
    const mockToken = 'EAAG_valid_mock_token_for_testing';
    process.env.INSTAGRAM_SYSTEM_USER_TOKEN = mockToken;

    const origFetch = global.fetch;
    const interceptedCalls = [];

    global.fetch = async (url, opts) => {
      interceptedCalls.push(url);
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // GET /v26.0/me
      if (pathname.endsWith('/me') && urlObj.searchParams.get('fields')?.includes('name')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_001' }),
          text: async () => JSON.stringify({ id: '998877665544', name: 'Wishrite Influencer API' })
        };
      }

      // GET /v26.0/me/permissions
      if (pathname.endsWith('/me/permissions')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_002' }),
          text: async () => JSON.stringify({
            data: [
              { permission: 'pages_show_list', status: 'granted' },
              { permission: 'pages_read_engagement', status: 'granted' },
              { permission: 'instagram_basic', status: 'granted' },
              { permission: 'instagram_manage_insights', status: 'granted' },
              { permission: 'instagram_content_publish', status: 'granted' },
              { permission: 'instagram_manage_comments', status: 'granted' },
              { permission: 'instagram_manage_messages', status: 'granted' }
            ]
          })
        };
      }

      // GET /v26.0/591667860696059 (Facebook Page)
      if (pathname.endsWith('/591667860696059')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_003' }),
          text: async () => JSON.stringify({
            id: '591667860696059',
            name: 'funnwith.ai',
            connected_instagram_account: { id: '17841445671263800' },
            instagram_business_account: { id: '17841445671263800' }
          })
        };
      }

      // GET /v26.0/me/accounts (Page Access Token & Tasks)
      if (pathname.endsWith('/me/accounts')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_004' }),
          text: async () => JSON.stringify({
            data: [
              {
                id: '591667860696059',
                name: 'funnwith.ai',
                access_token: 'EAAG_mock_page_access_token_123',
                tasks: ['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE']
              }
            ]
          })
        };
      }

      // GET /v26.0/17841445671263800 (Instagram Account)
      if (pathname.endsWith('/17841445671263800') && !pathname.includes('/media')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_005' }),
          text: async () => JSON.stringify({
            id: '17841445671263800',
            username: 'wishrite.in',
            name: 'WishRite Jewelry',
            media_count: 42
          })
        };
      }

      // GET /v26.0/17841445671263800/media
      if (pathname.endsWith('/17841445671263800/media')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_006' }),
          text: async () => JSON.stringify({
            data: [
              {
                id: '18099887766554433',
                caption: 'Handcrafted silver rings ✨ #wishrite',
                media_type: 'VIDEO',
                media_product_type: 'REELS',
                permalink: 'https://www.instagram.com/reel/Cxxxxxxxxx/',
                timestamp: '2026-11-01T12:00:00+0000'
              }
            ]
          })
        };
      }

      // GET /v26.0/18099887766554433/insights
      if (pathname.includes('/18099887766554433/insights')) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ 'x-fb-trace-id': 'mock_trace_007' }),
          text: async () => JSON.stringify({
            data: [
              { name: 'views', values: [{ value: 14250 }] },
              { name: 'reach', values: [{ value: 11200 }] },
              { name: 'likes', values: [{ value: 890 }] },
              { name: 'comments', values: [{ value: 45 }] },
              { name: 'shares', values: [{ value: 120 }] },
              { name: 'saved', values: [{ value: 310 }] },
              { name: 'total_interactions', values: [{ value: 1365 }] }
            ]
          })
        };
      }

      return {
        status: 404,
        ok: false,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: `Endpoint not mocked: ${pathname}` } })
      };
    };

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await runDiagnostic();
      const output = logs.join('\n');

      // Assertions on report table
      assert.match(output, /Token validity \| PASS \| Valid\. Principal: "Wishrite Influencer API"/);
      assert.match(output, /Required permissions \| PASS \| All 4 core permissions granted/);
      assert.match(output, /Page access \| PASS \| Page "funnwith\.ai" accessible/);
      assert.match(output, /Page tasks \| PASS \| Page found\. Tasks: \[MANAGE, CREATE_CONTENT/);
      assert.match(output, /Instagram account matching \| PASS \| Matched @wishrite\.in/);
      assert.match(output, /Instagram media access \| PASS \| Retrieved 1 items/);
      assert.match(output, /Reel Insights \| PASS \| Retrieved successfully/);
      assert.match(output, /Exact Meta error \| NONE/);

      // Verify token isolation & masking: zero raw token strings in logs
      assert.equal(output.includes(mockToken), false, 'Raw mock token must NEVER appear in output');
      assert.equal(output.includes('EAAG_mock_page_access_token_123'), false, 'Page access token must NEVER appear in output');
    } finally {
      global.fetch = origFetch;
      console.log = origLog;
      delete process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
    }
  });

});

