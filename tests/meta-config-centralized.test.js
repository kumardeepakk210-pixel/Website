process.env.NODE_ENV = 'test';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    META_APP_ID,
    META_GRAPH_API_VERSION,
    META_CONFIG_ID,
    WISHRITE_OFFICIAL_IG_HANDLE,
    WISHRITE_OFFICIAL_IG_ACCOUNT_ID,
    WISHRITE_OFFICIAL_PAGE_ID,
    WISHRITE_OFFICIAL_PAGE_NAME,
    PRODUCTION_OAUTH_CALLBACK,
    LOCAL_OAUTH_CALLBACK,
    getMetaConfig,
    getOAuthRedirectUri,
    validateMetaConfig,
    getPublicMetaConfig,
    getOAuthSigningSecret,
    normalizeGraphApiVersion
} from '../backend/meta-config.js';

describe('WishRite Centralized Meta Configuration Module', () => {
    test('1. Exports verified Meta Constants and brand assets', () => {
        assert.equal(META_APP_ID, '4398945700321494');
        assert.equal(META_GRAPH_API_VERSION, 'v26.0');
        assert.equal(WISHRITE_OFFICIAL_IG_HANDLE, 'wishrite.in');
        assert.equal(WISHRITE_OFFICIAL_IG_ACCOUNT_ID, '17841445671263800');
        assert.equal(WISHRITE_OFFICIAL_PAGE_ID, '591667860696059');
        assert.equal(WISHRITE_OFFICIAL_PAGE_NAME, 'funnwith.ai');
        assert.equal(PRODUCTION_OAUTH_CALLBACK, 'https://www.wishrite.in/api/creator/instagram/oauth/callback');
        assert.equal(LOCAL_OAUTH_CALLBACK, 'http://localhost:8085/api/creator/instagram/oauth/callback');
    });

    test('2. getMetaConfig returns active configuration without leaking secrets to public', () => {
        const config = getMetaConfig();
        assert.ok(config);
        assert.equal(config.appId, '4398945700321494');
        assert.equal(config.graphApiVersion, 'v26.0');
        assert.equal(config.official.handle, 'wishrite.in');
        assert.equal(config.official.accountId, '17841445671263800');
    });

    test('3. getOAuthRedirectUri resolves dynamically from request context', () => {
        const origRedirect = process.env.META_REDIRECT_URI;
        const origOAuthRedirect = process.env.META_OAUTH_REDIRECT_URI;
        delete process.env.META_REDIRECT_URI;
        delete process.env.META_OAUTH_REDIRECT_URI;

        try {
            // Production request simulation
            const prodReq = {
                headers: {
                    host: 'www.wishrite.in',
                    'x-forwarded-proto': 'https'
                }
            };
            const prodUri = getOAuthRedirectUri(prodReq);
            assert.equal(prodUri, 'https://www.wishrite.in/api/creator/instagram/oauth/callback');

            // Local development request simulation
            const localReq = {
                headers: {
                    host: 'localhost:8085'
                }
            };
            const localUri = getOAuthRedirectUri(localReq);
            assert.equal(localUri, 'http://localhost:8085/api/creator/instagram/oauth/callback');

            // Explicit environment override
            process.env.META_OAUTH_REDIRECT_URI = 'https://custom.wishrite.in/callback';
            assert.equal(getOAuthRedirectUri(prodReq), 'https://custom.wishrite.in/callback');
        } finally {
            if (origRedirect) process.env.META_REDIRECT_URI = origRedirect;
            else delete process.env.META_REDIRECT_URI;
            if (origOAuthRedirect) process.env.META_OAUTH_REDIRECT_URI = origOAuthRedirect;
            else delete process.env.META_OAUTH_REDIRECT_URI;
        }
    });

    test('4. validateMetaConfig checks configuration readiness without exposing secrets', () => {
        const validation = validateMetaConfig();
        assert.ok(typeof validation.valid === 'boolean');
        assert.ok(validation.status);
        assert.ok(typeof validation.status.app_secret_configured === 'boolean');
        assert.ok(typeof validation.status.system_user_token_configured === 'boolean');
        // Must never return plaintext secret values in status object
        assert.equal(validation.status.app_secret, undefined);
        assert.equal(validation.status.system_user_token, undefined);
    });

    test('5. getPublicMetaConfig produces non-privileged representation', () => {
        const pub = getPublicMetaConfig();
        assert.ok(typeof pub.meta_configured === 'boolean');
        assert.equal(pub.graph_api_version, 'v26.0');
        assert.equal(pub.official_handle, 'wishrite.in');
        assert.equal(pub.appSecret, undefined);
        assert.equal(pub.systemUserToken, undefined);
    });

    test('6. getOAuthSigningSecret provides HMAC key in test environment', () => {
        const secret = getOAuthSigningSecret();
        assert.ok(secret && typeof secret === 'string' && secret.length >= 16);
    });

    test('7. normalizeGraphApiVersion and getMetaConfig normalize uppercase Graph API versions to lowercase', () => {
        assert.equal(normalizeGraphApiVersion('V26.0'), 'v26.0');
        assert.equal(normalizeGraphApiVersion(' v26.0 '), 'v26.0');
        const origVersion = process.env.META_GRAPH_API_VERSION;
        try {
            process.env.META_GRAPH_API_VERSION = 'V26.0';
            assert.equal(getMetaConfig().graphApiVersion, 'v26.0');
            assert.equal(getPublicMetaConfig().graph_api_version, 'v26.0');
        } finally {
            if (origVersion !== undefined) process.env.META_GRAPH_API_VERSION = origVersion;
            else delete process.env.META_GRAPH_API_VERSION;
        }
    });
});
