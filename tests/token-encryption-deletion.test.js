import test from 'node:test';
import assert from 'node:assert/strict';
import {
    encryptToken,
    decryptToken,
    getCreatorInstagramConnection,
    migrateLegacyPlaintextTokens,
    _syncDbHooks
} from '../backend/services/instagram-sync.js';
import { handleDisconnectInstagram } from '../backend/creator.js';
import { handleDeleteInfluencer, _dbHooks } from '../backend/influencers.js';
import * as supabaseClient from '../backend/supabase-client.js';

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
        // Mock successful dbUpdate returning representation
        const origUpdate = _syncDbHooks.dbUpdate;
        try {
            _syncDbHooks.dbUpdate = async (table, filterCol, filterVal, payload) => ({
                data: {
                    influencer_id: filterVal,
                    instagram_connection: payload.instagram_connection
                }
            });

            const mockCreator = {
                id: '00000000-0000-0000-0000-legacymig0001',
                influencer_id: '00000000-0000-0000-0000-legacymig0001',
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
        } finally {
            _syncDbHooks.dbUpdate = origUpdate;
        }
    });

    await t.test('7. Controlled error when database persistence fails during legacy token migration', async () => {
        const origUpdate = _syncDbHooks.dbUpdate;
        try {
            _syncDbHooks.dbUpdate = async () => {
                throw new Error('Supabase network connection timeout during token persistence');
            };

            const mockCreator = {
                id: '00000000-0000-0000-0000-failmig000002',
                influencer_id: '00000000-0000-0000-0000-failmig000002',
                instagram_id: 'failed_mig_creator',
                instagram_connection: {
                    connected: true,
                    username: 'failed_mig_creator',
                    access_token: 'EAALegacyUnmigratedToken999'
                }
            };

            await assert.rejects(async () => {
                await getCreatorInstagramConnection(mockCreator);
            }, (err) => {
                assert.equal(err.code, 'LEGACY_TOKEN_MIGRATION_PERSISTENCE_FAILED');
                assert.ok(err.message.includes('Database persistence failed'));
                return true;
            }, 'Must throw controlled migration error and not treat as successful');
        } finally {
            _syncDbHooks.dbUpdate = origUpdate;
        }
    });

    await t.test('8. Database update returns zero affected rows: migration must fail and not report success', async () => {
        const origUpdate = _syncDbHooks.dbUpdate;
        try {
            // Simulate HTTP 200/204 response from database that updated 0 rows (data: null)
            _syncDbHooks.dbUpdate = async () => ({
                data: null,
                omittedColumns: []
            });

            const mockCreator = {
                id: '00000000-0000-0000-0000-zerorows00003',
                influencer_id: '00000000-0000-0000-0000-zerorows00003',
                instagram_id: 'zero_rows_creator',
                instagram_connection: {
                    connected: true,
                    username: 'zero_rows_creator',
                    access_token: 'EAALegacyZeroRowsToken123'
                }
            };

            await assert.rejects(async () => {
                await getCreatorInstagramConnection(mockCreator);
            }, (err) => {
                assert.equal(err.code, 'LEGACY_TOKEN_MIGRATION_PERSISTENCE_FAILED');
                assert.ok(err.message.includes('No influencer record was updated'));
                return true;
            }, 'Must reject when database update affects zero rows');
        } finally {
            _syncDbHooks.dbUpdate = origUpdate;
        }
    });

    await t.test('9. Batch legacy plaintext token migration scanner counts token mismatch as failure', async () => {
        const origQuery = _syncDbHooks.dbQuery;
        const origUpdate = _syncDbHooks.dbUpdate;

        try {
            // Mock single row returned with legacy plaintext token
            _syncDbHooks.dbQuery = async () => [
                {
                    influencer_id: '00000000-0000-0000-0000-mismatch00001',
                    instagram_connection: {
                        connected: true,
                        username: 'mismatch_creator',
                        access_token: 'EAAPlaintextTokenToMigrate456'
                    }
                }
            ];

            // Mock database update returning mismatched stored token
            _syncDbHooks.dbUpdate = async (table, filterCol, filterVal) => ({
                data: {
                    influencer_id: filterVal,
                    instagram_connection: {
                        connected: true,
                        username: 'mismatch_creator',
                        access_token: 'enc:different:corrupted:token' // does not match freshly encrypted token!
                    }
                }
            });

            const stats = await migrateLegacyPlaintextTokens();

            assert.equal(stats.total_creators_scanned, 1);
            assert.equal(stats.connections_inspected, 1);
            assert.equal(stats.already_encrypted, 0);
            assert.equal(stats.migrated_to_encrypted, 0, 'Must NOT count as migrated when stored token does not match');
            assert.equal(stats.failed_migrations, 1, 'Must count mismatch as failed migration');
        } finally {
            _syncDbHooks.dbQuery = origQuery;
            _syncDbHooks.dbUpdate = origUpdate;
        }
    });

    await t.test('10. Batch legacy plaintext token migration scanner with pagination', async () => {
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

test('Atomic Influencer Deletion Integrity & Complete Rollback', async (t) => {
    const testInfId = '00000000-0000-0000-0000-deltest000001';
    const mockFound = {
        id: testInfId,
        influencer_id: testInfId,
        influencer_code: 'WR-INF-DEL01',
        name: 'Deletion Test Influencer'
    };

    await t.test('1. Successful atomic deletion when PostgreSQL RPC succeeds', async () => {
        const origDbRpc = _dbHooks.dbRpc;
        const origGetAll = _dbHooks.getAllInfluencersFromDB;
        let rpcCalledWith = null;

        // Mock dbRpc hook to return success payload
        _dbHooks.dbRpc = async (fnName, params, opts) => {
            rpcCalledWith = { fnName, params, opts };
            return {
                success: true,
                message: 'Influencer and all associated child records deleted atomically.',
                influencer_id: params.p_influencer_id,
                deleted_counts: {
                    creator_content: 2,
                    influencer_links: 1,
                    influencer_stats: 1,
                    influencer_wallets: 1,
                    influencer_accounts: 1,
                    influencers: 1
                }
            };
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

            // Verify atomic RPC was invoked
            assert.ok(rpcCalledWith, 'Atomic deletion RPC must be called');
            assert.equal(rpcCalledWith.fnName, 'delete_influencer_atomic');
            assert.equal(rpcCalledWith.params.p_influencer_id, testInfId);
            assert.equal(rpcCalledWith.opts.useAdmin, true);
        } finally {
            _dbHooks.dbRpc = origDbRpc;
            _dbHooks.getAllInfluencersFromDB = origGetAll;
        }
    });

    await t.test('2. Atomic deletion rollback: RPC exception aborts deletion and returns 500 error', async () => {
        const origDbRpc = _dbHooks.dbRpc;
        const origGetAll = _dbHooks.getAllInfluencersFromDB;

        // Mock dbRpc to simulate a database transaction abort / rollback
        _dbHooks.dbRpc = async () => {
            throw new Error('Atomic influencer deletion failed: foreign key deadlock on creator_content (SQLSTATE: 40P01)');
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

            assert.equal(statusCode, 500, 'Must return 500 when atomic deletion rolls back');
            assert.equal(responseJson.success, false);
            assert.equal(responseJson.error.code, 'ATOMIC_DELETION_FAILED');
            assert.ok(responseJson.error.message.includes('rolled back completely'));
        } finally {
            _dbHooks.dbRpc = origDbRpc;
            _dbHooks.getAllInfluencersFromDB = origGetAll;
        }
    });

    await t.test('3. Non-existent influencer returns 404', async () => {
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
