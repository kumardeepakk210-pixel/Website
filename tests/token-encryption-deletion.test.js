import test from 'node:test';
import assert from 'node:assert/strict';
import {
    encryptToken,
    decryptToken,
    getCreatorInstagramConnection,
    migrateLegacyPlaintextTokens
} from '../backend/services/instagram-sync.js';
import { handleDisconnectInstagram } from '../backend/creator.js';
import { handleDeleteInfluencer, _dbHooks } from '../backend/influencers.js';

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

    await t.test('6. Legacy plaintext token auto-migration in getCreatorInstagramConnection', async () => {
        const mockCreator = {
            id: 'legacy-creator-id-5555',
            instagram_id: 'legacy_creator_handle',
            instagram_connection: {
                connected: true,
                username: 'legacy_creator_handle',
                access_token: 'EAALegacyPlaintextUnencryptedTokenVal123' // plaintext!
            }
        };

        const resolved = await getCreatorInstagramConnection(mockCreator);
        assert.ok(resolved, 'Resolved connection must exist');
        assert.equal(resolved.decrypted_token, 'EAALegacyPlaintextUnencryptedTokenVal123');
        assert.ok(resolved.access_token.startsWith('enc:'), 'Access token must have been automatically converted to enc: format');
    });

    await t.test('7. Batch legacy plaintext token migration scanner', async () => {
        const stats = await migrateLegacyPlaintextTokens();
        assert.ok(typeof stats.total_creators_scanned === 'number');
        assert.ok(typeof stats.already_encrypted === 'number');
        assert.ok(typeof stats.migrated_to_encrypted === 'number');
        assert.equal(stats.failed_migrations, 0, 'No migration failures should occur');
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

test('Cascading Influencer Deletion Integrity & Failure Scenarios', async (t) => {
    const testInfId = '00000000-0000-0000-0000-deltest000001';
    const mockFound = {
        id: testInfId,
        influencer_id: testInfId,
        influencer_code: 'WR-INF-DEL01',
        name: 'Deletion Test Influencer'
    };

    await t.test('1. Successful cascading deletion when database succeeds', async () => {
        const deletedTables = [];
        const origDbDelete = _dbHooks.dbDelete;
        const origGetAll = _dbHooks.getAllInfluencersFromDB;

        // Mock dbDelete hook to capture calls and report success
        _dbHooks.dbDelete = async (table, filterCol, filterVal) => {
            deletedTables.push({ table, filterCol, filterVal });
            return true;
        };
        _dbHooks.getAllInfluencersFromDB = async () => ({
            data: [mockFound],
            fromDb: true
        });

        const req = {
            params: { id: testInfId }
        };

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

        try {
            await handleDeleteInfluencer(req, res);

            assert.equal(statusCode, 200);
            assert.equal(responseJson.success, true);
            assert.ok(responseJson.message.includes('deleted successfully'));

            // Verify all child tables were targeted with foreign key 'influencer_id'
            const expectedChildTables = [
                'creator_content',
                'influencer_links',
                'influencer_stats',
                'influencer_wallets',
                'influencer_accounts'
            ];

            for (const table of expectedChildTables) {
                const foundDel = deletedTables.find(d => d.table === table);
                assert.ok(foundDel, `Table ${table} must be deleted`);
                assert.equal(foundDel.filterCol, 'influencer_id', `${table} must use influencer_id as foreign key`);
                assert.equal(foundDel.filterVal, testInfId);
            }

            // Verify parent table deletion targeted influencer_id
            const parentDel = deletedTables.find(d => d.table === 'influencers');
            assert.ok(parentDel, 'Parent table influencers must be deleted');
            assert.equal(parentDel.filterCol, 'influencer_id');
            assert.equal(parentDel.filterVal, testInfId);
        } finally {
            _dbHooks.dbDelete = origDbDelete;
            _dbHooks.getAllInfluencersFromDB = origGetAll;
        }
    });

    await t.test('2. Child table deletion failure aborts deletion and returns 500 error', async () => {
        const origDbDelete = _dbHooks.dbDelete;
        const origGetAll = _dbHooks.getAllInfluencersFromDB;

        // Mock dbDelete to simulate a failure in creator_content
        _dbHooks.dbDelete = async (table) => {
            if (table === 'creator_content') {
                throw new Error('Database foreign key deadlock on creator_content');
            }
            return true;
        };
        _dbHooks.getAllInfluencersFromDB = async () => ({
            data: [mockFound],
            fromDb: true
        });

        const req = {
            params: { id: testInfId }
        };

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

        try {
            await handleDeleteInfluencer(req, res);

            assert.equal(statusCode, 500, 'Must return 500 when child table deletion fails');
            assert.equal(responseJson.success, false);
            assert.equal(responseJson.error.code, 'CASCADING_DELETION_FAILED');
            assert.ok(responseJson.error.details.some(d => d.table === 'creator_content'));
        } finally {
            _dbHooks.dbDelete = origDbDelete;
            _dbHooks.getAllInfluencersFromDB = origGetAll;
        }
    });

    await t.test('3. Parent table deletion failure aborts deletion and returns 500 error', async () => {
        const origDbDelete = _dbHooks.dbDelete;
        const origGetAll = _dbHooks.getAllInfluencersFromDB;

        // Mock dbDelete to succeed on child tables but fail on influencers
        _dbHooks.dbDelete = async (table) => {
            if (table === 'influencers') {
                throw new Error('Database permission denied on table influencers');
            }
            return true;
        };
        _dbHooks.getAllInfluencersFromDB = async () => ({
            data: [mockFound],
            fromDb: true
        });

        const req = {
            params: { id: testInfId }
        };

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

        try {
            await handleDeleteInfluencer(req, res);

            assert.equal(statusCode, 500, 'Must return 500 when parent table deletion fails');
            assert.equal(responseJson.success, false);
            assert.equal(responseJson.error.code, 'CASCADING_DELETION_FAILED');
            assert.ok(responseJson.error.details.some(d => d.table === 'influencers'));
        } finally {
            _dbHooks.dbDelete = origDbDelete;
            _dbHooks.getAllInfluencersFromDB = origGetAll;
        }
    });

    await t.test('4. Non-existent influencer returns 404', async () => {
        const req = {
            params: { id: '00000000-0000-0000-0000-nonexistent9999' }
        };

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

        await handleDeleteInfluencer(req, res);
        assert.equal(statusCode, 404);
        assert.equal(responseJson.success, false);
        assert.equal(responseJson.error.message, 'Influencer not found');
    });
});
