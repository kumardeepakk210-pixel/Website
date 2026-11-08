#!/usr/bin/env node

/**
 * ==============================================================================
 * WISHRITE — META INSTAGRAM SYSTEM USER TOKEN DIAGNOSTIC SUITE
 * ==============================================================================
 * 
 * Standalone backend diagnostic script to verify Meta System User Token
 * connectivity, permissions, Facebook Page linkage, Instagram account matching,
 * media retrieval, and Reel Insights capabilities for WishRite.
 * 
 * Verified Meta Assets:
 * - Official Facebook Page: funnwith.ai (Page ID: 591667860696059)
 * - Official Instagram: @wishrite.in (Account ID: 17841445671263800)
 * - System User: Wishrite Influencer API
 * - Meta Graph API Version: v26.0
 * 
 * Security:
 * - Reads INSTAGRAM_SYSTEM_USER_TOKEN exclusively from server-side environment.
 * - Never prints, logs, stores, or leaks tokens.
 * - Read-only operations only — no mutations to database or Meta assets.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

// Optional dotenv load if .env exists
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
} catch {
  // dotenv is optional
}

// ------------------------------------------------------------------------------
// Configuration & Constants
// ------------------------------------------------------------------------------
const META_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const EXPECTED_PAGE_ID = '591667860696059';
const EXPECTED_PAGE_NAME = 'funnwith.ai';
const EXPECTED_IG_ACCOUNT_ID = '17841445671263800';
const EXPECTED_IG_USERNAME = 'wishrite.in';
const TIMEOUT_MS = 12000;

// ------------------------------------------------------------------------------
// Security & Masking Helpers
// ------------------------------------------------------------------------------
let activeTokensToMask = new Set();

function registerTokenForMasking(token) {
  if (token && typeof token === 'string' && token.length > 5) {
    activeTokensToMask.add(token);
  }
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return str;
  let sanitized = str;
  for (const t of activeTokensToMask) {
    sanitized = sanitized.split(t).join('[REDACTED_TOKEN]');
  }
  // Mask any OAuth/System User tokens matching Meta formats (EAA...)
  sanitized = sanitized.replace(/EAA[a-zA-Z0-9_\-]+/gi, '[REDACTED_TOKEN]');
  // Mask any query param access_token=...
  sanitized = sanitized.replace(/access_token=[a-zA-Z0-9_\-]+/gi, 'access_token=[REDACTED]');
  return sanitized;
}

function sanitizeObject(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
  if (typeof obj === 'object') {
    const copy = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().includes('token') && typeof v === 'string') {
        copy[k] = '[REDACTED_TOKEN]';
      } else {
        copy[k] = sanitizeObject(v);
      }
    }
    return copy;
  }
  return obj;
}

function sanitizeError(err) {
  if (!err) return null;
  const msg = err.message ? sanitizeString(err.message) : sanitizeString(String(err));
  return {
    message: msg,
    code: err.code || null,
    subcode: err.error_subcode || null,
    type: err.type || null,
    fbtrace_id: err.fbtrace_id || null
  };
}

// Safe Graph API Fetch Wrapper
async function callMetaGraph(endpoint, token, options = {}) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${GRAPH_BASE}${endpoint}${separator}access_token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const fbtraceId = res.headers.get('x-fb-trace-id') || res.headers.get('fbtrace-id') || null;

    let data = null;
    let rawData = null;
    const text = await res.text();
    try {
      rawData = JSON.parse(text);
      data = sanitizeObject(rawData);
    } catch {
      data = { rawText: sanitizeString(text) };
    }

    return {
      status: res.status,
      ok: res.ok,
      fbtraceId: fbtraceId || data?.error?.fbtrace_id || null,
      data: data,
      rawData: rawData // Internal memory only, never logged or printed
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: err.name === 'AbortError' ? 408 : 0,
      ok: false,
      fbtraceId: null,
      error: sanitizeError(err)
    };
  }
}

// ------------------------------------------------------------------------------
// Diagnostic Runner
// ------------------------------------------------------------------------------
async function runDiagnostic() {
  console.log('\n==============================================================================');
  console.log('WISHRITE — META INSTAGRAM SYSTEM USER TOKEN DIAGNOSTIC');
  console.log(`Meta Graph API: ${META_API_VERSION}`);
  console.log(`Execution Timestamp: ${new Date().toISOString()}`);
  console.log('==============================================================================\n');

  const report = [];
  let pageAccessToken = null;
  let sampleMediaItem = null;
  let exactMetaErrors = [];

  const SYSTEM_USER_TOKEN = (process.env.INSTAGRAM_SYSTEM_USER_TOKEN || '').trim();

  // ----------------------------------------------------------------------------
  // STEP 0: Check Environment Variable
  // ----------------------------------------------------------------------------
  if (!SYSTEM_USER_TOKEN) {
    console.error('❌ ERROR: INSTAGRAM_SYSTEM_USER_TOKEN is not configured in environment.');
    console.log('\nTo run this diagnostic with your Meta System User Token, execute:');
    console.log('  INSTAGRAM_SYSTEM_USER_TOKEN="<your-token>" node scripts/meta-system-user-diagnostic.js\n');

    report.push({
      test: 'Token validity',
      result: 'FAIL',
      details: 'INSTAGRAM_SYSTEM_USER_TOKEN environment variable is missing.'
    });
    report.push({
      test: 'Required permissions',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Page access',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Page tasks',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Instagram account matching',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Instagram media access',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Reel Insights',
      result: 'SKIPPED',
      details: 'Prerequisite token not provided.'
    });
    report.push({
      test: 'Missing permissions',
      result: 'UNKNOWN',
      details: 'Token required to inspect permissions.'
    });
    report.push({
      test: 'Exact Meta error',
      result: 'FAIL',
      details: 'Token not configured in process.env.'
    });

    printReportTable(report);
    return;
  }

  registerTokenForMasking(SYSTEM_USER_TOKEN);
  console.log(`✓ Detected INSTAGRAM_SYSTEM_USER_TOKEN [Configured: Yes, Length: ${SYSTEM_USER_TOKEN.length} chars]`);

  // ----------------------------------------------------------------------------
  // TEST 1: Token Validity & Principal Identity
  // GET /v26.0/me?fields=id,name
  // ----------------------------------------------------------------------------
  console.log('\n[1/8] Verifying token validity and principal identity (GET /me)...');
  const meRes = await callMetaGraph('/me?fields=id,name', SYSTEM_USER_TOKEN);

  if (meRes.ok && meRes.data && meRes.data.id) {
    const principalName = meRes.data.name || 'Unknown';
    const principalId = meRes.data.id;
    console.log(`  ✓ Token Valid! Principal: "${principalName}" (ID: ${principalId})`);
    report.push({
      test: 'Token validity',
      result: 'PASS',
      details: `Valid. Principal: "${principalName}" (ID: ${principalId})`
    });
  } else {
    const errMsg = sanitizeString(meRes.data?.error?.message || meRes.error?.message || `HTTP ${meRes.status}`);
    const code = meRes.data?.error?.code || meRes.error?.code;
    const subcode = meRes.data?.error?.error_subcode || meRes.error?.subcode;
    const fbtrace = meRes.fbtraceId || 'N/A';
    console.error(`  ❌ Token validation failed: ${errMsg} (code: ${code}, subcode: ${subcode}, fbtrace_id: ${fbtrace})`);
    exactMetaErrors.push(`GET /me failed: ${errMsg} (Code: ${code})`);
    report.push({
      test: 'Token validity',
      result: 'FAIL',
      details: `Failed: ${errMsg} (Code: ${code}, Trace: ${fbtrace})`
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Inspect Permissions
  // GET /v26.0/me/permissions
  // ----------------------------------------------------------------------------
  console.log('\n[2/8] Inspecting assigned permissions (GET /me/permissions)...');
  const permRes = await callMetaGraph('/me/permissions', SYSTEM_USER_TOKEN);

  const REQUIRED_PERMS = [
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_insights'
  ];

  const ADDITIONAL_PERMS = [
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_messages'
  ];

  const permMap = new Map();
  if (permRes.ok && Array.isArray(permRes.data?.data)) {
    for (const p of permRes.data.data) {
      permMap.set(p.permission, p.status);
    }
  }

  const missingRequired = [];
  const grantedRequired = [];

  for (const perm of REQUIRED_PERMS) {
    const status = permMap.get(perm);
    if (status === 'granted') {
      grantedRequired.push(perm);
      console.log(`  ✓ Required: ${perm} -> GRANTED`);
    } else {
      missingRequired.push(perm);
      console.log(`  ❌ Required: ${perm} -> ${status ? status.toUpperCase() : 'MISSING'}`);
    }
  }

  const additionalReport = [];
  for (const perm of ADDITIONAL_PERMS) {
    const status = permMap.get(perm);
    additionalReport.push(`${perm}: ${status ? status.toUpperCase() : 'MISSING'}`);
    console.log(`  ℹ Additional: ${perm} -> ${status ? status.toUpperCase() : 'MISSING'}`);
  }

  if (missingRequired.length === 0) {
    report.push({
      test: 'Required permissions',
      result: 'PASS',
      details: `All 4 core permissions granted (${grantedRequired.join(', ')})`
    });
    report.push({
      test: 'Missing permissions',
      result: 'NONE',
      details: `Additional: ${additionalReport.join(' | ')}`
    });
  } else {
    report.push({
      test: 'Required permissions',
      result: 'FAIL',
      details: `Missing: ${missingRequired.join(', ')}`
    });
    report.push({
      test: 'Missing permissions',
      result: 'FAIL',
      details: `Missing required: [${missingRequired.join(', ')}]. Additional: [${additionalReport.join(', ')}]`
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 3: Verify Facebook Page & Connected Instagram Link
  // GET /v26.0/591667860696059?fields=id,name,connected_instagram_account,instagram_business_account
  // ----------------------------------------------------------------------------
  console.log(`\n[3/8] Verifying Facebook Page ${EXPECTED_PAGE_ID} (GET /${EXPECTED_PAGE_ID})...`);
  const pageRes = await callMetaGraph(
    `/${EXPECTED_PAGE_ID}?fields=id,name,connected_instagram_account,instagram_business_account`,
    SYSTEM_USER_TOKEN
  );

  let pageVerified = false;
  if (pageRes.ok && pageRes.data && pageRes.data.id === EXPECTED_PAGE_ID) {
    const pageName = pageRes.data.name;
    const connectedIg = pageRes.data.connected_instagram_account?.id;
    const businessIg = pageRes.data.instagram_business_account?.id;
    const linkedIg = connectedIg || businessIg;

    console.log(`  ✓ Page Verified: "${pageName}" (ID: ${pageRes.data.id})`);
    console.log(`    - connected_instagram_account: ${connectedIg || 'None'}`);
    console.log(`    - instagram_business_account: ${businessIg || 'None'}`);

    if (linkedIg === EXPECTED_IG_ACCOUNT_ID) {
      pageVerified = true;
      report.push({
        test: 'Page access',
        result: 'PASS',
        details: `Page "${pageName}" accessible. Connected IG ID matches ${EXPECTED_IG_ACCOUNT_ID}`
      });
    } else if (linkedIg) {
      report.push({
        test: 'Page access',
        result: 'PARTIAL',
        details: `Page found but IG ID mismatch: got ${linkedIg}, expected ${EXPECTED_IG_ACCOUNT_ID}`
      });
    } else {
      report.push({
        test: 'Page access',
        result: 'PARTIAL',
        details: `Page "${pageName}" found, but no linked Instagram account returned on Page endpoint.`
      });
    }
  } else {
    const errMsg = pageRes.data?.error?.message || pageRes.error?.message || `HTTP ${pageRes.status}`;
    const code = pageRes.data?.error?.code || pageRes.error?.code;
    console.error(`  ❌ Page query failed: ${errMsg} (code: ${code})`);
    exactMetaErrors.push(`GET /${EXPECTED_PAGE_ID} failed: ${errMsg}`);
    report.push({
      test: 'Page access',
      result: 'FAIL',
      details: `Failed to access Page ${EXPECTED_PAGE_ID}: ${errMsg} (Code: ${code})`
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Verify Page Access Token & Tasks
  // GET /v26.0/me/accounts?fields=id,name,access_token,tasks
  // ----------------------------------------------------------------------------
  console.log('\n[4/8] Inspecting Page Access Tokens & Tasks (GET /me/accounts)...');
  const accountsRes = await callMetaGraph('/me/accounts?fields=id,name,access_token,tasks', SYSTEM_USER_TOKEN);

  let targetAccount = null;
  let targetRawAccount = null;
  if (accountsRes.ok && Array.isArray(accountsRes.data?.data)) {
    targetAccount = accountsRes.data.data.find(acc => acc.id === EXPECTED_PAGE_ID);
    if (Array.isArray(accountsRes.rawData?.data)) {
      targetRawAccount = accountsRes.rawData.data.find(acc => acc.id === EXPECTED_PAGE_ID);
    }
  }

  if (targetAccount) {
    const tasks = targetAccount.tasks || [];
    const hasToken = Boolean(targetRawAccount?.access_token);
    if (hasToken) {
      pageAccessToken = targetRawAccount.access_token; // Kept in memory only for step 8
      registerTokenForMasking(pageAccessToken);
    }
    console.log(`  ✓ Found Page "${targetAccount.name}" in accounts list.`);
    console.log(`  ✓ Tasks assigned: [${tasks.join(', ')}]`);
    console.log(`  ✓ Page Access Token available: ${hasToken ? 'Yes (Present in memory, NEVER printed)' : 'No'}`);

    report.push({
      test: 'Page tasks',
      result: 'PASS',
      details: `Page found. Tasks: [${tasks.join(', ')}]. Page token available: ${hasToken ? 'Yes' : 'No'}`
    });
  } else {
    const accountsCount = Array.isArray(accountsRes.data?.data) ? accountsRes.data.data.length : 0;
    const errMsg = accountsRes.data?.error?.message || `Page ${EXPECTED_PAGE_ID} not in returned accounts (${accountsCount} accounts found)`;
    console.warn(`  ⚠ ${errMsg}`);
    report.push({
      test: 'Page tasks',
      result: 'FAIL',
      details: errMsg
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Verify Instagram Account Matching
  // GET /v26.0/17841445671263800?fields=id,username,name,media_count
  // ----------------------------------------------------------------------------
  console.log(`\n[5/8] Verifying Instagram account ${EXPECTED_IG_ACCOUNT_ID} (GET /${EXPECTED_IG_ACCOUNT_ID})...`);
  const igRes = await callMetaGraph(
    `/${EXPECTED_IG_ACCOUNT_ID}?fields=id,username,name,media_count`,
    SYSTEM_USER_TOKEN
  );

  let igVerified = false;
  if (igRes.ok && igRes.data && igRes.data.id === EXPECTED_IG_ACCOUNT_ID) {
    const uname = igRes.data.username;
    const name = igRes.data.name;
    const mediaCount = igRes.data.media_count;

    console.log(`  ✓ Instagram Account Verified!`);
    console.log(`    - Username: @${uname}`);
    console.log(`    - Name: ${name}`);
    console.log(`    - Media Count: ${mediaCount}`);

    if (uname === EXPECTED_IG_USERNAME) {
      igVerified = true;
      report.push({
        test: 'Instagram account matching',
        result: 'PASS',
        details: `Matched @${uname} (ID: ${igRes.data.id}, Media: ${mediaCount})`
      });
    } else {
      report.push({
        test: 'Instagram account matching',
        result: 'PARTIAL',
        details: `ID matched but username mismatch: expected @${EXPECTED_IG_USERNAME}, got @${uname}`
      });
    }
  } else {
    const errMsg = igRes.data?.error?.message || igRes.error?.message || `HTTP ${igRes.status}`;
    const code = igRes.data?.error?.code || igRes.error?.code;
    console.error(`  ❌ Instagram account lookup failed: ${errMsg} (code: ${code})`);
    exactMetaErrors.push(`GET /${EXPECTED_IG_ACCOUNT_ID} failed: ${errMsg}`);
    report.push({
      test: 'Instagram account matching',
      result: 'FAIL',
      details: `Failed to query @${EXPECTED_IG_USERNAME}: ${errMsg} (Code: ${code})`
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 6: Test Instagram Media Access
  // GET /v26.0/17841445671263800/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=5
  // ----------------------------------------------------------------------------
  console.log(`\n[6/8] Testing media retrieval (GET /${EXPECTED_IG_ACCOUNT_ID}/media)...`);
  const mediaRes = await callMetaGraph(
    `/${EXPECTED_IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=5`,
    SYSTEM_USER_TOKEN
  );

  let mediaItems = [];
  if (mediaRes.ok && Array.isArray(mediaRes.data?.data)) {
    mediaItems = mediaRes.data.data;
    console.log(`  ✓ Successfully fetched ${mediaItems.length} media items.`);
    mediaItems.forEach((m, idx) => {
      const type = m.media_product_type || m.media_type;
      const cap = (m.caption || '').slice(0, 30).replace(/\n/g, ' ');
      console.log(`    [${idx + 1}] ID: ${m.id} | Type: ${type} | Caption: "${cap}..."`);
      if (!sampleMediaItem && (type === 'REELS' || m.media_type === 'VIDEO')) {
        sampleMediaItem = m;
      }
    });
    if (!sampleMediaItem && mediaItems.length > 0) {
      sampleMediaItem = mediaItems[0];
    }

    report.push({
      test: 'Instagram media access',
      result: 'PASS',
      details: `Retrieved ${mediaItems.length} items. Sample media ID: ${sampleMediaItem?.id || 'none'}`
    });
  } else {
    const errMsg = mediaRes.data?.error?.message || mediaRes.error?.message || `HTTP ${mediaRes.status}`;
    const code = mediaRes.data?.error?.code || mediaRes.error?.code;
    console.error(`  ❌ Media retrieval failed: ${errMsg} (code: ${code})`);
    exactMetaErrors.push(`GET /${EXPECTED_IG_ACCOUNT_ID}/media failed: ${errMsg}`);
    report.push({
      test: 'Instagram media access',
      result: 'FAIL',
      details: `Failed: ${errMsg} (Code: ${code})`
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Test Reel / Media Insights
  // GET /v26.0/{media_id}/insights?metric=...
  // ----------------------------------------------------------------------------
  console.log('\n[7/8] Testing Reel / Media Insights endpoint...');
  if (sampleMediaItem) {
    const isReel = (sampleMediaItem.media_product_type === 'REELS' || sampleMediaItem.media_type === 'VIDEO');
    console.log(`  Testing insights for media ID: ${sampleMediaItem.id} (Type: ${sampleMediaItem.media_type}, Product: ${sampleMediaItem.media_product_type || 'N/A'})...`);

    // In Meta Graph API v26.0/v21.0+, test supported reel metrics:
    // Try primary modern metric suite: views, reach, likes, comments, shares, saved, total_interactions
    const candidateMetricSets = isReel ? [
      'views,reach,likes,comments,shares,saved,total_interactions',
      'reach,saved,likes,comments,shares,total_interactions',
      'reach,likes,comments,saved,shares'
    ] : [
      'reach,likes,comments,shares,saved,total_interactions',
      'reach,likes,comments,saved,shares',
      'impressions,reach,saved'
    ];

    let insightsSucceeded = false;
    let successfulMetrics = [];
    let lastInsightError = null;
    let traceId = null;

    for (const metricList of candidateMetricSets) {
      console.log(`    Trying metrics: [${metricList}]...`);
      const insightRes = await callMetaGraph(
        `/${sampleMediaItem.id}/insights?metric=${encodeURIComponent(metricList)}`,
        SYSTEM_USER_TOKEN
      );

      traceId = insightRes.fbtraceId;
      if (insightRes.ok && Array.isArray(insightRes.data?.data)) {
        insightsSucceeded = true;
        successfulMetrics = insightRes.data.data.map(m => m.name);
        console.log(`    ✓ Insights successfully retrieved!`);
        console.log(`      Returned metrics: [${successfulMetrics.join(', ')}]`);
        insightRes.data.data.forEach(m => {
          const val = m.values?.[0]?.value ?? m.value ?? 'N/A';
          console.log(`      - ${m.name}: ${val}`);
        });
        break;
      } else {
        lastInsightError = insightRes.data?.error || insightRes.error;
        console.warn(`    ⚠ Metric set [${metricList}] returned error: ${lastInsightError?.message} (code: ${lastInsightError?.code})`);
      }
    }

    if (insightsSucceeded) {
      report.push({
        test: 'Reel Insights',
        result: 'PASS',
        details: `Retrieved successfully for media ${sampleMediaItem.id}. Metrics: [${successfulMetrics.join(', ')}]`
      });
    } else {
      const errMsg = lastInsightError?.message || 'Failed to retrieve insights';
      const code = lastInsightError?.code || 'N/A';
      const subcode = lastInsightError?.error_subcode || 'N/A';
      exactMetaErrors.push(`Reel Insights failed: ${errMsg} (Code: ${code}, Subcode: ${subcode})`);
      report.push({
        test: 'Reel Insights',
        result: 'FAIL',
        details: `HTTP error: ${errMsg} (Code: ${code}, Subcode: ${subcode}, Trace: ${traceId || 'N/A'})`
      });
    }
  } else {
    console.log('  ⚠ No media items available to test insights.');
    report.push({
      test: 'Reel Insights',
      result: 'SKIPPED',
      details: 'No media items available to test on account.'
    });
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Test Page Token Requirements vs System User Token
  // ----------------------------------------------------------------------------
  console.log('\n[8/8] Testing Page Access Token vs System User Token behavior...');
  if (pageAccessToken) {
    console.log('  Testing Instagram query using Page Access Token (kept in memory, NEVER logged)...');
    const pageTokenIgRes = await callMetaGraph(
      `/${EXPECTED_IG_ACCOUNT_ID}?fields=id,username`,
      pageAccessToken
    );

    if (pageTokenIgRes.ok && pageTokenIgRes.data?.id === EXPECTED_IG_ACCOUNT_ID) {
      console.log('  ✓ Page Access Token also successfully queries Instagram Business Account.');
    } else {
      console.log(`  ℹ Page Access Token returned: ${pageTokenIgRes.data?.error?.message || 'Incompatible'}`);
    }
  } else {
    console.log('  ℹ No Page Access Token was available from /me/accounts; testing System User token directly.');
  }

  // ----------------------------------------------------------------------------
  // STEP 9: Summary & Exact Meta Errors
  // ----------------------------------------------------------------------------
  if (exactMetaErrors.length === 0) {
    report.push({
      test: 'Exact Meta error',
      result: 'NONE',
      details: 'All tested Meta API endpoints responded with HTTP 200 OK without errors.'
    });
  } else {
    report.push({
      test: 'Exact Meta error',
      result: 'FAIL',
      details: exactMetaErrors.join(' | ')
    });
  }

  printReportTable(report);
}

// ------------------------------------------------------------------------------
// Report Formatter
// ------------------------------------------------------------------------------
function printReportTable(report) {
  console.log('\n==============================================================================');
  console.log('FINAL DIAGNOSTIC REPORT');
  console.log('==============================================================================\n');

  console.log('| Test | Result | Details |');
  console.log('| :--- | :--- | :--- |');
  for (const row of report) {
    // Escape pipes in details for markdown table format
    const cleanDetails = (row.details || '').replace(/\|/g, '\\|');
    console.log(`| ${row.test} | ${row.result} | ${cleanDetails} |`);
  }
  console.log('\n==============================================================================\n');
}

// ------------------------------------------------------------------------------
// Exports & CLI Execution
// ------------------------------------------------------------------------------
if (require.main === module) {
  runDiagnostic().catch(err => {
    console.error('\nFatal diagnostic runner error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runDiagnostic,
  callMetaGraph,
  sanitizeString,
  sanitizeObject,
  sanitizeError
};

