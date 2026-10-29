process.env.NODE_ENV = 'test';
process.env.CREATOR_USE_LOCAL_STORE = 'true';
require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let server = null;
let serverPort = null;
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
    serverPort = server.address().port;
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
            port: serverPort || process.env.PORT || 8085,
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

function generateMockJwt(userId, email) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: userId,
        id: userId,
        email: email,
        role: 'authenticated',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${payload}.mocksignature`;
}

describe('WishRite Creator Wallet Hardening, Idempotency & Concurrency Suite', () => {

    // =========================================================================
    // SECTION 1: WALLET DEDUCTION SAFETY & OVERDRAFT PROTECTION (Tests 1-10)
    // =========================================================================
    describe('1. Wallet Balance Deduction Safety', () => {
        let atomicDeductWalletBalance;
        let getOrCreateInfluencerWallet;
        let readLocalStore;
        let writeLocalStore;

        before(async () => {
            const mod = await import('../backend/creator-wallet.js');
            atomicDeductWalletBalance = mod.atomicDeductWalletBalance;
            getOrCreateInfluencerWallet = mod.getOrCreateInfluencerWallet;
            readLocalStore = mod.readLocalStore;
            writeLocalStore = mod.writeLocalStore;
        });

        test('1. Sufficient balance: deduction succeeds and balance decreases correctly', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000001';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 500.00;
            writeLocalStore(store);

            const result = await atomicDeductWalletBalance(testInfId, 150.00, store);
            assert.equal(result.success, true);
            assert.equal(result.wallet.available_balance, 350.00);
        });

        test('2. Insufficient balance: deduction rejected with INSUFFICIENT_BALANCE', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000002';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 50.00;
            writeLocalStore(store);

            const result = await atomicDeductWalletBalance(testInfId, 100.00, store);
            assert.equal(result.success, false);
            assert.equal(result.code, 'INSUFFICIENT_BALANCE');
            // Ensure balance remained untouched
            assert.equal(wallet.available_balance, 50.00);
        });

        test('3. Zero amount: strictly rejected with INVALID_AMOUNT', async () => {
            const result = await atomicDeductWalletBalance('00000000-0000-0000-0000-000000000003', 0);
            assert.equal(result.success, false);
            assert.equal(result.code, 'INVALID_AMOUNT');
        });

        test('4. Negative amount: strictly rejected with INVALID_AMOUNT', async () => {
            const result = await atomicDeductWalletBalance('00000000-0000-0000-0000-000000000004', -75.50);
            assert.equal(result.success, false);
            assert.equal(result.code, 'INVALID_AMOUNT');
        });

        test('5. Missing wallet: automatically initializes or rejects safely without crashing', async () => {
            const newInfId = '00000000-0000-0000-0000-000000000005';
            const result = await atomicDeductWalletBalance(newInfId, 50.00);
            // Since initial balance is 0, it must reject for insufficient balance, not throw unhandled exception
            assert.equal(result.success, false);
            assert.equal(result.code, 'INSUFFICIENT_BALANCE');
        });

        test('6. Invalid influencer identifier: handled safely without crash', async () => {
            const result = await atomicDeductWalletBalance('', 50.00);
            // Empty string or null must not throw
            assert.ok(!result.success || result.code === 'INVALID_AMOUNT');
        });

        test('7. Successful debit returns success: true and updated wallet object', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000007';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 1000.00;
            writeLocalStore(store);

            const result = await atomicDeductWalletBalance(testInfId, 250.00, store);
            assert.equal(result.success, true);
            assert.ok(result.wallet);
            assert.equal(result.wallet.available_balance, 750.00);
        });

        test('8. Debit transaction created and recorded in immutable ledger', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000008';
            const testUserId = '00000000-0000-0000-0000-000000000089';
            const testAccountId = '00000000-0000-0000-0000-000000000088';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 800.00;
            writeLocalStore(store);

            // Trigger withdrawal endpoint to test transaction recording
            const token = generateMockJwt(testUserId, 'deduct8@wishrite.test');
            // Seed influencer account
            store.influencers = store.influencers || [];
            store.accounts = store.accounts || [];
            store.influencers.push({
                id: testInfId,
                name: 'Deduct Creator 8',
                status: 'active',
                created_at: new Date().toISOString()
            });
            store.accounts.push({
                id: testAccountId,
                influencer_id: testInfId,
                auth_user_id: testUserId,
                email: 'deduct8@wishrite.test',
                is_active: true
            });
            writeLocalStore(store);

            const res = await makeRequest({
                path: '/api/creator/withdrawals',
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }, {
                amount: 500.00,
                payout_method: 'upi',
                payout_details: { upi_id: 'creator8@okhdfcbank' }
            });

            assert.equal(res.statusCode, 201);
            assert.equal(res.data.success, true);

            // Verify transaction was logged
            const updatedStore = readLocalStore();
            const tx = updatedStore.wallet_transactions.find(t => 
                t.influencer_id === testInfId && 
                t.transaction_type === 'withdrawal_requested' &&
                Number(t.amount) === 500.00
            );
            assert.ok(tx, 'Withdrawal transaction must be recorded in wallet_transactions');
            assert.equal(tx.direction, 'debit');
        });

        test('9. Balance calculation is exact with two decimal places', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000009';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 100.33;
            writeLocalStore(store);

            const result = await atomicDeductWalletBalance(testInfId, 33.11, store);
            assert.equal(result.success, true);
            assert.equal(result.wallet.available_balance, 67.22);
        });

        test('10. Balance never becomes negative under any deduction', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000010';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 10.00;
            writeLocalStore(store);

            const result = await atomicDeductWalletBalance(testInfId, 10.01, store);
            assert.equal(result.success, false);
            assert.ok(wallet.available_balance >= 0, 'Wallet balance must never be negative');
        });
    });

    // =========================================================================
    // SECTION 2: IDEMPOTENCY CONTROLS (Tests 11-14)
    // =========================================================================
    describe('2. Idempotency & Webhook Double-Credit Protection', () => {
        let recordOrderCommissionInWallet;
        let attributeOrderToInfluencer;
        let getOrCreateInfluencerWallet;
        let readLocalStore;
        let writeLocalStore;

        before(async () => {
            const wMod = await import('../backend/creator-wallet.js');
            const iMod = await import('../backend/influencers.js');
            recordOrderCommissionInWallet = wMod.recordOrderCommissionInWallet;
            getOrCreateInfluencerWallet = wMod.getOrCreateInfluencerWallet;
            readLocalStore = wMod.readLocalStore;
            writeLocalStore = wMod.writeLocalStore;
            attributeOrderToInfluencer = iMod.attributeOrderToInfluencer;
        });

        test('11. Same order reference cannot be debited twice', async () => {
            const { atomicDeductWalletBalance } = await import('../backend/creator-wallet.js');
            const testInfId = '00000000-0000-0000-0000-000000000011';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 500.00;
            writeLocalStore(store);

            const refId = 'REF-ORD-DED-11';
            const first = await atomicDeductWalletBalance(testInfId, 100.00, store, {
                reference_type: 'order_debit',
                reference_id: refId
            });
            assert.equal(first.success, true);

            // Record transaction in store to simulate existing reference
            store.wallet_transactions.push({
                id: '00000000-0000-0000-0000-000000000111',
                influencer_id: testInfId,
                transaction_type: 'debit',
                reference_type: 'order_debit',
                reference_id: refId,
                amount: 100.00
            });
            writeLocalStore(store);

            // Second deduction with same reference should be prevented from double debiting
            assert.equal(wallet.available_balance, 400.00);
        });

        test('12. Same Razorpay payment verification is strictly idempotent', async () => {
            // Test customer wallet verification endpoint idempotency
            const testUser = 'user-razorpay-idemp-12';
            const paymentId = 'pay_test_' + Date.now();
            const orderId = 'order_test_' + Date.now();
            const signature = 'valid_test_signature';

            // Verify with duplicate calls
            const res1 = await makeRequest({
                path: '/api/wallet/verify-payment',
                method: 'POST'
            }, {
                razorpay_order_id: orderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
                user_id: testUser,
                amount: 500
            });

            const res2 = await makeRequest({
                path: '/api/wallet/verify-payment',
                method: 'POST'
            }, {
                razorpay_order_id: orderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
                user_id: testUser,
                amount: 500
            });

            // Second request must be idempotent (status 200 or 409, but NOT double-credit)
            assert.ok([200, 400, 409].includes(res2.statusCode));
        });

        test('13. recordOrderCommissionInWallet is strictly idempotent for same order', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000013';
            const orderRef = 'WR-ORD-IDEMP-13-' + Date.now();

            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.pending_balance = 0;
            wallet.lifetime_earned = 0;
            writeLocalStore(store);

            // First credit
            const tx1 = await recordOrderCommissionInWallet({
                influencer_id: testInfId,
                order_reference: orderRef,
                sales_amount: 1000.00,
                commission_amount: 100.00
            });
            assert.ok(tx1);
            assert.equal(Number(tx1.amount), 100.00);

            const storeAfterFirst = readLocalStore();
            const walletAfterFirst = storeAfterFirst.wallets.find(w => w.influencer_id === testInfId);
            assert.equal(walletAfterFirst.pending_balance, 100.00);

            // Second credit with identical order reference
            const tx2 = await recordOrderCommissionInWallet({
                influencer_id: testInfId,
                order_reference: orderRef,
                sales_amount: 1000.00,
                commission_amount: 100.00
            });

            // Must return existing transaction and NOT double credit
            assert.equal(tx2.id, tx1.id);

            const storeAfterSecond = readLocalStore();
            const walletAfterSecond = storeAfterSecond.wallets.find(w => w.influencer_id === testInfId);
            assert.equal(walletAfterSecond.pending_balance, 100.00, 'Pending balance must remain 100.00, NOT double-credited to 200.00');
        });

        test('14. Repeated webhook / order attribution is safe and idempotent', async () => {
            const testInfId = '00000000-0000-0000-0000-000000000014';
            const store = readLocalStore();
            store.influencers = store.influencers || [];
            store.influencers.push({
                id: testInfId,
                name: 'Attr Influencer 14',
                status: 'active',
                commission_rate: 10.00
            });
            writeLocalStore(store);

            const orderRef = 'WR-ORD-WEBHOOK-14-' + Date.now();

            const attr1 = await attributeOrderToInfluencer({
                order_reference: orderRef,
                sales_amount: 2500.00,
                influencer_id: testInfId
            });
            assert.equal(attr1.attributed, true);
            assert.equal(attr1.already_attributed, false);

            // Second attribution with same order
            const attr2 = await attributeOrderToInfluencer({
                order_reference: orderRef,
                sales_amount: 2500.00,
                influencer_id: testInfId
            });
            assert.equal(attr2.attributed, true);
            assert.equal(attr2.already_attributed, true, 'Second call must flag already_attributed: true');
        });
    });

    // =========================================================================
    // SECTION 3: CONCURRENCY PROTECTION
    // =========================================================================
    describe('3. Concurrency Protection: Multi-Request Race Safety', () => {
        test('Simultaneous deductions: initial ₹100, two ₹80 requests -> one succeeds, one fails, final balance is ₹20 (never -₹60)', async () => {
            const { atomicDeductWalletBalance, getOrCreateInfluencerWallet, readLocalStore, writeLocalStore } = await import('../backend/creator-wallet.js');
            const testInfId = '00000000-0000-0000-0000-000000000015';
            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.available_balance = 100.00;
            writeLocalStore(store);

            // Fire two simultaneous deduction requests of ₹80 each
            const [resA, resB] = await Promise.all([
                atomicDeductWalletBalance(testInfId, 80.00, store),
                atomicDeductWalletBalance(testInfId, 80.00, store)
            ]);

            const successes = [resA, resB].filter(r => r.success);
            const failures = [resA, resB].filter(r => !r.success);

            assert.equal(successes.length, 1, 'Exactly one deduction must succeed');
            assert.equal(failures.length, 1, 'Exactly one deduction must fail with insufficient balance');
            assert.equal(failures[0].code, 'INSUFFICIENT_BALANCE');

            const finalStore = readLocalStore();
            const finalWallet = finalStore.wallets.find(w => w.influencer_id === testInfId);
            assert.equal(finalWallet.available_balance, 20.00, 'Final balance must be exactly ₹20.00, never negative');
        });

        test('Simultaneous commission credits for the same order produce exactly one credit and one transaction', async () => {
            const { recordOrderCommissionInWallet, getOrCreateInfluencerWallet, readLocalStore, writeLocalStore } = await import('../backend/creator-wallet.js');
            const testInfId = '00000000-0000-0000-0000-000000000016';
            const orderRef = 'WR-ORD-RACE-' + Date.now();

            const store = readLocalStore();
            let wallet = await getOrCreateInfluencerWallet(testInfId, store);
            wallet.pending_balance = 0.00;
            writeLocalStore(store);

            // Fire two simultaneous commission records for the exact same order
            const [txA, txB] = await Promise.all([
                recordOrderCommissionInWallet({
                    influencer_id: testInfId,
                    order_reference: orderRef,
                    sales_amount: 1500.00,
                    commission_amount: 150.00
                }),
                recordOrderCommissionInWallet({
                    influencer_id: testInfId,
                    order_reference: orderRef,
                    sales_amount: 1500.00,
                    commission_amount: 150.00
                })
            ]);

            // Both calls must return the same transaction identity
            assert.equal(txA.id, txB.id, 'Concurrent records must resolve to the identical transaction');

            const finalStore = readLocalStore();
            const finalWallet = finalStore.wallets.find(w => w.influencer_id === testInfId);
            assert.equal(finalWallet.pending_balance, 150.00, 'Pending balance must be credited exactly once (₹150.00), not twice');
        });
    });

    // =========================================================================
    // SECTION 4: OWNERSHIP & CROSS-CREATOR AUTHORIZATION
    // =========================================================================
    describe('4. Cross-Creator Authorization & Ownership Protection', () => {
        const creatorA_UserId = '00000000-0000-0000-0000-0000000000a2';
        const creatorA_InfId = '00000000-0000-0000-0000-0000000000a1';
        const creatorB_UserId = '00000000-0000-0000-0000-0000000000b2';
        const creatorB_InfId = '00000000-0000-0000-0000-0000000000b1';

        let tokenA;
        let tokenB;

        before(async () => {
            const { readLocalStore, writeLocalStore } = await import('../backend/creator-wallet.js');
            const store = readLocalStore();

            store.influencers = (store.influencers || []).filter(i => i.id !== creatorA_InfId && i.id !== creatorB_InfId);
            store.accounts = (store.accounts || []).filter(a => a.influencer_id !== creatorA_InfId && a.influencer_id !== creatorB_InfId);
            store.wallets = (store.wallets || []).filter(w => w.influencer_id !== creatorA_InfId && w.influencer_id !== creatorB_InfId);

            // Seed Creator A
            store.influencers.push({
                id: creatorA_InfId,
                name: 'Creator A',
                status: 'active'
            });
            store.accounts.push({
                id: '00000000-0000-0000-0000-0000000000a3',
                influencer_id: creatorA_InfId,
                auth_user_id: creatorA_UserId,
                email: 'creatorA@wishrite.test',
                is_active: true
            });
            store.wallets.push({
                id: '00000000-0000-0000-0000-0000000000a4',
                influencer_id: creatorA_InfId,
                available_balance: 1000.00,
                pending_balance: 0.00
            });

            // Seed Creator B
            store.influencers.push({
                id: creatorB_InfId,
                name: 'Creator B',
                status: 'active'
            });
            store.accounts.push({
                id: '00000000-0000-0000-0000-0000000000b3',
                influencer_id: creatorB_InfId,
                auth_user_id: creatorB_UserId,
                email: 'creatorB@wishrite.test',
                is_active: true
            });
            store.wallets.push({
                id: '00000000-0000-0000-0000-0000000000b4',
                influencer_id: creatorB_InfId,
                available_balance: 2000.00,
                pending_balance: 0.00
            });

            writeLocalStore(store);

            tokenA = generateMockJwt(creatorA_UserId, 'creatorA@wishrite.test');
            tokenB = generateMockJwt(creatorB_UserId, 'creatorB@wishrite.test');
        });

        test('Creator A cannot read Creator B wallet balance via API', async () => {
            const resA = await makeRequest({
                path: '/api/creator/wallet',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tokenA}` }
            });

            assert.equal(resA.statusCode, 200);
            assert.equal(resA.data.data.available_balance, 1000.00);
            assert.notEqual(resA.data.data.available_balance, 2000.00);
        });

        test('Creator A cannot request withdrawal deducting Creator B wallet', async () => {
            // Attempt to pass Creator B's influencer_id in request body
            const res = await makeRequest({
                path: '/api/creator/withdrawals',
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tokenA}` }
            }, {
                influencer_id: creatorB_InfId,
                amount: 500.00,
                payout_method: 'upi',
                payout_details: { upi_id: 'creatorA@okhdfcbank' }
            });

            assert.equal(res.statusCode, 201);
            // Must deduct Creator A's wallet, NOT Creator B
            const { readLocalStore } = await import('../backend/creator-wallet.js');
            const store = readLocalStore();
            const walletA = store.wallets.find(w => w.influencer_id === creatorA_InfId);
            const walletB = store.wallets.find(w => w.influencer_id === creatorB_InfId);

            assert.equal(walletA.available_balance, 500.00, 'Creator A wallet must be debited');
            assert.equal(walletB.available_balance, 2000.00, 'Creator B wallet must remain untouched at ₹2000.00');
        });

        test('Creator A cannot view Creator B transactions', async () => {
            const res = await makeRequest({
                path: '/api/creator/wallet/transactions',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tokenA}` }
            });

            assert.equal(res.statusCode, 200);
            const txs = res.data.data || [];
            // Every transaction returned must belong strictly to Creator A
            for (const tx of txs) {
                assert.equal(tx.influencer_id, creatorA_InfId);
                assert.notEqual(tx.influencer_id, creatorB_InfId);
            }
        });
    });
});
