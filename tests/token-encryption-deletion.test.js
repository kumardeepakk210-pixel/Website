import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken } from '../backend/services/instagram-sync.js';
import { handleDisconnectInstagram } from '../backend/creator.js';
import { handleDeleteInfluencer } from '../backend/influencers.js';

test('Token Encryption & Decryption Security Suite', async (t) => {
    await t.test('1. Successful encryption and decryption with AES-256-GCM', () => {
        const rawToken = 'EAAGNO4ExampleTokenString1234567890abcdef';
        const encrypted = encryptToken(rawToken);

        assert.ok(encrypted.startsWith('enc:'), 'Encrypted token must have enc: prefix');
        const parts = encrypted.split(':');
        assert.equal(parts.length, 4, 'Encrypted format must be enc:iv:tag:ciphertext');
        assert.notEqual(parts[3], rawToken, 'Ciphertext must not match raw token');

        // Decryption round-trip
        const decrypted = decryptToken(encrypted);
        assert.equal(decrypted, rawToken, 'Decrypted token must exactly match original plaintext');
    });

    await t.test('2. Missing or empty token handling', () => {
        assert.equal(encryptToken(null), null);
        assert.equal(encryptToken(''), null);
        assert.equal(decryptToken(null), null);
        assert.equal(decryptToken(''), null);
    });

    await t.test('3. Legacy unencrypted token support during decryption', () => {
        const legacyPlaintext = 'EAALegacyPlaintextToken9999999999';
        const resolved = decryptToken(legacyPlaintext);
        assert.equal(resolved, legacyPlaintext, 'Legacy unencrypted tokens must be returned as-is for backward compatibility');
    });

    await t.test('4. Malformed encrypted token fails gracefully and returns null', () => {
        const malformed = 'enc:123456:7890'; // Only 3 parts
        const result = decryptToken(malformed);
        assert.equal(result, null, 'Malformed tokens must return null, never throw unhandled exception');

        const badTag = 'enc:0102030405060708090a0b0c:deadbeefcafebabedeadbeefcafebabe:abcdef123456';
        const badResult = decryptToken(badTag);
        assert.equal(badResult, null, 'Corrupted ciphertext or authentication tag must fail decryption and return null');
    });

    await t.test('5. Missing encryption secret throws error and never returns plaintext', () => {
        // Temporarily clear environment secrets
        const origMetaSecret = process.env.META_APP_SECRET;
        const origSigningSecret = process.env.META_OAUTH_SIGNING_SECRET;
        const origSupaSecret = process.env.SUPABASE_SECRET_KEY;
        const origSupaRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const origFallbackFlag = process.env.ALLOW_TEST_ENCRYPTION_FALLBACK;

        delete process.env.META_APP_SECRET;
        delete process.env.META_OAUTH_SIGNING_SECRET;
        delete process.env.SUPABASE_SECRET_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.ALLOW_TEST_ENCRYPTION_FALLBACK;

        try {
            assert.throws(() => {
                encryptToken('EAASensitiveTokenShouldNeverBeStoredPlaintext');
            }, /Token Encryption Error.*Missing required server-side encryption secret/, 'Must throw error when server encryption secrets are missing');
        } finally {
            // Restore secrets
            if (origMetaSecret) process.env.META_APP_SECRET = origMetaSecret;
            if (origSigningSecret) process.env.META_OAUTH_SIGNING_SECRET = origSigningSecret;
            if (origSupaSecret) process.env.SUPABASE_SECRET_KEY = origSupaSecret;
            if (origSupaRole) process.env.SUPABASE_SERVICE_ROLE_KEY = origSupaRole;
            if (origFallbackFlag) process.env.ALLOW_TEST_ENCRYPTION_FALLBACK = origFallbackFlag;
        }
    });
});

test('Instagram Disconnect Workflow Security Suite', async (t) => {
    await t.test('1. Disconnecting Instagram cleanly resets instagram_connection to null', async () => {
        const mockCreator = {
            id: 'test-creator-uuid-1234',
            instagram_connection: {
                connected: true,
                username: 'wishrite_creator',
                access_token: encryptToken('EAATestSecretToken123')
            }
        };

        const req = {
            creator: mockCreator
        };

        let responseJson = null;
        const res = {
            status: () => res,
            json: (data) => {
                responseJson = data;
                return res;
            }
        };

        await handleDisconnectInstagram(req, res);

        assert.ok(responseJson, 'Must return response');
        assert.equal(responseJson.success, true);
        assert.equal(mockCreator.instagram_connection, null, 'Creator instagram_connection must be reset to null');
    });

    await t.test('2. Disconnect rejects unauthenticated request with 401', async () => {
        const req = { creator: null };
        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            json: (data) => {
                responseJson = data;
                return res;
            }
        };

        await handleDisconnectInstagram(req, res);
        assert.equal(statusCode, 401, 'Unauthenticated disconnect must return 401 status');
        assert.equal(responseJson.success, false);
    });
});
