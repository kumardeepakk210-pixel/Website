import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('WishRite Creator Dashboard — Instagram Connection Card UI Rendering', () => {
  let cardHtml = '';
  const mockCardEl = {
    set innerHTML(val) {
      cardHtml = val;
    },
    get innerHTML() {
      return cardHtml;
    }
  };

  // Mock document and window environment for js/creator-program.js functions
  global.document = {
    getElementById(id) {
      if (id === 'creator-instagram-conn-card') return mockCardEl;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  global.window = {
    ...global,
    location: {
      hostname: 'wishrite.in',
      pathname: '/account',
      search: ''
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    history: { replaceState: () => {} },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    }
  };

  // Load creator-program.js code into execution context
  const jsPath = path.join(__dirname, '..', 'js', 'creator-program.js');
  const jsCode = fs.readFileSync(jsPath, 'utf8');

  // Evaluate the functions in global scope
  new Function(jsCode)();
  const renderInstagramConnectionCard = window.renderInstagramConnectionCard;

  test('renderInstagramConnectionCard displays green CONNECTED badge and Account ID for top-level brand response', () => {
    cardHtml = '';
    const conn = {
      success: true,
      connected: true,
      api_authorized: true,
      username: 'wishrite.in',
      account_id: '17841445671263800',
      account_type: 'professional',
      followers_count: 109,
      following_count: 25,
      media_count: 146,
      insights_status: 'connected',
      is_system_user: true
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('CONNECTED'), 'Must display CONNECTED badge');
    assert.ok(cardHtml.includes('@wishrite.in'), 'Must display handle @wishrite.in');
    assert.ok(cardHtml.includes('17841445671263800'), 'Must display Account ID 17841445671263800');
    assert.ok(cardHtml.includes('Official Meta Graph API Connected'), 'Must display Official Meta Graph API Connected');
    assert.ok(cardHtml.includes('Real-time Reel Insights Enabled'), 'Must display Real-time Reel Insights Enabled');
    assert.ok(!cardHtml.includes('Action Required'), 'Must NOT display Action Required');
    assert.ok(!cardHtml.includes('RECONNECT INSTAGRAM'), 'Must NOT display RECONNECT INSTAGRAM');
  });

  test('renderInstagramConnectionCard handles nested instagram_connection object safely', () => {
    cardHtml = '';
    const conn = {
      success: true,
      instagram_connection: {
        connected: true,
        api_authorized: true,
        username: 'wishrite.in',
        account_id: '17841445671263800',
        insights_status: 'connected'
      }
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('CONNECTED'), 'Must display CONNECTED badge');
    assert.ok(cardHtml.includes('@wishrite.in'), 'Must display handle @wishrite.in');
    assert.ok(cardHtml.includes('17841445671263800'), 'Must display Account ID');
    assert.ok(!cardHtml.includes('Action Required'), 'Must NOT display Action Required');
    assert.ok(!cardHtml.includes('RECONNECT INSTAGRAM'), 'Must NOT display RECONNECT INSTAGRAM');
  });

  test('renderInstagramConnectionCard handles creator profile object safely', () => {
    cardHtml = '';
    const conn = {
      creator: {
        instagram_id: 'wishrite.in',
        instagram_connection: {
          connected: true,
          api_authorized: true,
          username: 'wishrite.in',
          account_id: '17841445671263800'
        }
      }
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('CONNECTED'), 'Must display CONNECTED badge');
    assert.ok(cardHtml.includes('@wishrite.in'), 'Must display handle @wishrite.in');
    assert.ok(!cardHtml.includes('Action Required'), 'Must NOT display Action Required');
  });

  test('renderInstagramConnectionCard recognizes is_system_user flag', () => {
    cardHtml = '';
    const conn = {
      connected: true,
      username: 'wishrite.in',
      is_system_user: true
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('CONNECTED'), 'Must display CONNECTED badge');
    assert.ok(cardHtml.includes('17841445671263800'), 'Must resolve official Account ID');
    assert.ok(!cardHtml.includes('Action Required'), 'Must NOT display Action Required');
  });

  test('Third-party creator with expired OAuth token correctly displays Action Required and Reconnect', () => {
    cardHtml = '';
    const conn = {
      success: true,
      connected: true,
      api_authorized: false,
      account_id: null,
      username: 'fashion_creator_99',
      insights_status: 'auth_expired'
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('Action Required'), 'Must display Action Required for expired third-party creator');
    assert.ok(cardHtml.includes('RECONNECT INSTAGRAM'), 'Must display RECONNECT INSTAGRAM button for third-party creator');
    assert.ok(cardHtml.includes('@fashion_creator_99'), 'Must display third-party handle');
    assert.ok(!cardHtml.includes('CONNECTED</span>'), 'Must NOT display green connected badge for expired token');
  });

  test('Unconnected user correctly displays Not Connected banner', () => {
    cardHtml = '';
    const conn = {
      success: true,
      connected: false
    };

    renderInstagramConnectionCard(conn);

    assert.ok(cardHtml.includes('Not Connected'), 'Must display Not Connected');
    assert.ok(cardHtml.includes('CONNECT INSTAGRAM'), 'Must display CONNECT INSTAGRAM');
    assert.ok(!cardHtml.includes('Action Required'), 'Must NOT display Action Required');
  });
});
