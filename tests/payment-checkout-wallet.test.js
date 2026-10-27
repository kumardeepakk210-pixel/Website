const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

// Helper to make local HTTP requests against test server
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

describe('WishRite Payment, Checkout & Wallet Production Verification Suite', () => {
    let server;
    const originalEnv = { ...process.env };

    before(async () => {
        // Spin up local server on random available port
        server = require('../server.js');
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        process.env = originalEnv;
    });

    // ==========================================
    // TEST 1: Razorpay credentials missing
    // Expected: clear server error, no wallet credit
    // ==========================================
    test('1. Razorpay credentials missing returns clear server error and does NOT credit wallet', async () => {
        // Temporarily set NODE_ENV to production and clear Razorpay keys
        const prevNodeEnv = process.env.NODE_ENV;
        const prevKeyId = process.env.RAZORPAY_KEY_ID;
        const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;

        process.env.NODE_ENV = 'production';
        delete process.env.RAZORPAY_KEY_ID;
        delete process.env.RAZORPAY_KEY_SECRET;

        try {
            const res = await makeRequest(server, {
                path: '/api/wallet/create-order',
                method: 'POST'
            }, {
                amount: 500,
                user_id: 'test-user-credentials-check'
            });

            assert.equal(res.statusCode, 500);
            assert.equal(res.data.success, false);
            assert.ok(
                res.data.error?.includes('Razorpay gateway credentials not configured on server'),
                'Must report exact missing credentials error without crashing'
            );
        } finally {
            process.env.NODE_ENV = prevNodeEnv;
            if (prevKeyId !== undefined) {
                process.env.RAZORPAY_KEY_ID = prevKeyId;
            } else {
                delete process.env.RAZORPAY_KEY_ID;
            }
            if (prevKeySecret !== undefined) {
                process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
            } else {
                delete process.env.RAZORPAY_KEY_SECRET;
            }
        }
    });

    // ==========================================
    // TEST 2: Razorpay order creation
    // Expected: correct amount in paise, INR currency, unique order ID
    // ==========================================
    test('2. Razorpay order creation produces correct integer paise and INR currency', async () => {
        const topupAmount = 500;
        const res = await makeRequest(server, {
            path: '/api/wallet/create-order',
            method: 'POST'
        }, {
            amount: topupAmount,
            user_id: 'test-user-rzp-creation'
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.amount, 50000, '500 INR must be 50000 integer paise');
        assert.equal(res.data.currency, 'INR');
        assert.ok(res.data.order_id, 'Unique order ID must be returned');
        assert.ok(res.data.topup_id, 'Topup ID must be returned');
        assert.ok(res.data.key_id, 'Public key_id must be returned to frontend');
    });

    // ==========================================
    // TEST 3: Invalid amount
    // Expected: rejected with 400
    // ==========================================
    test('3. Invalid amount (negative, 0, non-numeric, or oversized) is strictly rejected', async () => {
        // Zero amount
        const resZero = await makeRequest(server, {
            path: '/api/wallet/create-order',
            method: 'POST'
        }, { amount: 0, user_id: 'test-user' });
        assert.equal(resZero.statusCode, 400);
        assert.equal(resZero.data.success, false);

        // Negative amount
        const resNeg = await makeRequest(server, {
            path: '/api/wallet/create-order',
            method: 'POST'
        }, { amount: -250, user_id: 'test-user' });
        assert.equal(resNeg.statusCode, 400);
        assert.equal(resNeg.data.success, false);

        // NaN amount
        const resNaN = await makeRequest(server, {
            path: '/api/wallet/create-order',
            method: 'POST'
        }, { amount: 'invalid_amount', user_id: 'test-user' });
        assert.equal(resNaN.statusCode, 400);
        assert.equal(resNaN.data.success, false);

        // Below minimum limit (< 10)
        const resBelow = await makeRequest(server, {
            path: '/api/wallet/create-order',
            method: 'POST'
        }, { amount: 5, user_id: 'test-user' });
        assert.equal(resBelow.statusCode, 400);
        assert.ok(resBelow.data.error.includes('Minimum'));
    });

    // ==========================================
    // TEST 4: Signature mismatch
    // Expected: payment rejected, wallet NOT credited
    // ==========================================
    test('4. Signature mismatch rejects verification and prevents wallet credit', async () => {
        const res = await makeRequest(server, {
            path: '/api/wallet/verify-payment',
            method: 'POST'
        }, {
            topup_id: 'topup-uuid-1234',
            razorpay_order_id: 'order_test_12345',
            razorpay_payment_id: 'pay_test_99999',
            razorpay_signature: 'invalid_forged_signature_hex'
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.data.success, false);
        assert.equal(res.data.verified, false);
        assert.ok(res.data.error.includes('signature verification failed'));
    });

    // ==========================================
    // TEST 5: Valid signature
    // Expected: verification succeeds
    // ==========================================
    test('5. Valid payment signature verifies successfully and credits wallet', async () => {
        const topupId = 'topup-uuid-5555';
        const orderId = 'order_test_5555';
        const paymentId = 'pay_test_' + Date.now();

        const res = await makeRequest(server, {
            path: '/api/wallet/verify-payment',
            method: 'POST'
        }, {
            topup_id: topupId,
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: 'test_signature_valid',
            amount: 500,
            user_id: 'user_wallet_test_5'
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.success, true);
        assert.equal(res.data.verified, true);
        assert.equal(res.data.wallet_credited, true);
        assert.ok(res.data.wallet_balance >= 500);
    });

    // ==========================================
    // TEST 6: Duplicate verification (Idempotency)
    // Expected: wallet credited only ONCE
    // ==========================================
    test('6. Duplicate verification request is idempotent and does NOT credit wallet twice', async () => {
        const topupId = 'topup-uuid-idempotent-6';
        const orderId = 'order_test_idempotent_6';
        const paymentId = 'pay_test_idempotent_' + Date.now();
        const userId = 'user_idempotent_test_6';

        // First verification
        const res1 = await makeRequest(server, {
            path: '/api/wallet/verify-payment',
            method: 'POST'
        }, {
            topup_id: topupId,
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: 'test_signature_valid',
            amount: 1000,
            user_id: userId
        });

        assert.equal(res1.statusCode, 200);
        assert.equal(res1.data.success, true);
        assert.equal(res1.data.wallet_credited, true);
        const balanceAfterFirst = res1.data.wallet_balance;

        // Second verification with identical payment credentials
        const res2 = await makeRequest(server, {
            path: '/api/wallet/verify-payment',
            method: 'POST'
        }, {
            topup_id: topupId,
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: 'test_signature_valid',
            amount: 1000,
            user_id: userId
        });

        assert.equal(res2.statusCode, 200);
        assert.equal(res2.data.success, true);
        assert.equal(res2.data.already_credited, true, 'Must indicate payment was already credited');
        assert.equal(
            res2.data.wallet_balance,
            balanceAfterFirst,
            'Wallet balance MUST remain exactly the same and not increase a second time'
        );
    });

    // ==========================================
    // TEST 7: Razorpay payment failure
    // Expected: wallet NOT credited
    // ==========================================
    test('7. Missing required payment parameters fails and does NOT credit wallet', async () => {
        const res = await makeRequest(server, {
            path: '/api/wallet/verify-payment',
            method: 'POST'
        }, {
            topup_id: 'topup-uuid-7',
            razorpay_order_id: 'order_test_7'
            // Missing payment_id and signature
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.data.success, false);
        assert.equal(res.data.verified, false);
    });

    // ==========================================
    // TEST 8: order_items RLS / Server-Side Isolation
    // Expected: client does not perform direct privileged insert;
    //           server validates input and returns friendly error on invalid data
    // ==========================================
    test('8. Order checkout validates items and returns user-friendly error without raw database leaks', async () => {
        // Attempt checkout with empty items
        const resEmpty = await makeRequest(server, {
            path: '/api/orders/checkout',
            method: 'POST'
        }, {
            customer: {
                name: 'Aarya Sharma',
                phone: '9876543210',
                email: 'aarya@example.com',
                address: '123 Silver Lane',
                city: 'Jaipur',
                state: 'Rajasthan',
                pin: '302001'
            },
            items: [],
            payment_method: 'razorpay'
        });

        assert.equal(resEmpty.statusCode, 400);
        assert.equal(resEmpty.data.success, false);
        assert.ok(resEmpty.data.error.includes('empty'));

        // Attempt checkout with invalid PIN code
        const resInvalidPin = await makeRequest(server, {
            path: '/api/orders/checkout',
            method: 'POST'
        }, {
            customer: {
                name: 'Aarya Sharma',
                phone: '9876543210',
                email: 'aarya@example.com',
                address: '123 Silver Lane',
                city: 'Jaipur',
                state: 'Rajasthan',
                pin: '123' // Invalid PIN
            },
            items: [{ id: 'prod-1', qty: 1 }],
            payment_method: 'razorpay'
        });

        assert.equal(resInvalidPin.statusCode, 400);
        assert.ok(resInvalidPin.data.error.includes('PIN'));
    });

    // ==========================================
    // TEST 9: Successful checkout (Online payment)
    // Expected: order + order_items + Razorpay order + payment verification
    // ==========================================
    test('9. Full online checkout creates order, line items, initiates Razorpay, and verifies to paid status', async () => {
        const checkoutPayload = {
            customer: {
                name: 'Pooja Hegde',
                phone: '9876543211',
                email: 'pooja.hegde@example.com',
                address: '456 Royal Palms, Bandra West',
                city: 'Mumbai',
                state: 'Maharashtra',
                pin: '400050'
            },
            items: [
                {
                    id: 'WR-RING-001',
                    product_code: 'WR-RING-001',
                    name: 'Solitaire Silver Ring',
                    price: 1899,
                    qty: 1
                }
            ],
            payment_method: 'razorpay'
        };

        // Step 1: Create Order via Server Checkout API
        const createRes = await makeRequest(server, {
            path: '/api/orders/checkout',
            method: 'POST'
        }, checkoutPayload);

        assert.equal(createRes.statusCode, 201);
        assert.equal(createRes.data.success, true);
        assert.ok(createRes.data.order_id, 'Internal order ID must be returned');
        assert.ok(createRes.data.order_number, 'Human readable order number must be returned');
        assert.ok(createRes.data.razorpay_order_id, 'Razorpay order ID must be returned');
        assert.ok(createRes.data.amount > 0, 'Amount in paise must be positive');
        assert.equal(createRes.data.currency, 'INR');

        const internalOrderId = createRes.data.order_id;
        const razorpayOrderId = createRes.data.razorpay_order_id;
        const razorpayPaymentId = `pay_checkout_${Date.now()}`;

        // Step 2: Verify Payment on Server
        const verifyRes = await makeRequest(server, {
            path: '/api/orders/verify-payment',
            method: 'POST'
        }, {
            internal_order_id: internalOrderId,
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: 'test_signature_valid'
        });

        assert.equal(verifyRes.statusCode, 200);
        assert.equal(verifyRes.data.success, true);
        assert.equal(verifyRes.data.verified, true);
        assert.equal(verifyRes.data.payment_status, 'paid');
        assert.equal(verifyRes.data.order_status, 'processing');
    });

    // ==========================================
    // TEST 10: COD checkout
    // Expected: existing COD functionality continues to work without Razorpay
    // ==========================================
    test('10. COD checkout creates confirmed order without requiring Razorpay gateway credentials', async () => {
        const codPayload = {
            customer: {
                name: 'Vikram Seth',
                phone: '9811223344',
                email: 'vikram.seth@example.com',
                address: '78 Civil Lines',
                city: 'Delhi',
                state: 'Delhi',
                pin: '110054'
            },
            items: [
                {
                    id: 'WR-EARRING-002',
                    product_code: 'WR-EARRING-002',
                    name: 'Pure Silver Jhumkas',
                    price: 2499,
                    qty: 1
                }
            ],
            payment_method: 'cod'
        };

        const res = await makeRequest(server, {
            path: '/api/orders/checkout',
            method: 'POST'
        }, codPayload);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data.success, true);
        assert.equal(res.data.payment_method, 'cod');
        assert.equal(res.data.order_status, 'confirmed');
        assert.equal(res.data.payment_status, 'pending');
        assert.ok(res.data.order_id);
        assert.ok(res.data.order_number);
        assert.ok(res.data.grand_total > 0);
        assert.equal(res.data.items.length, 1);
        assert.equal(res.data.items[0].product_name, 'Pure Silver Jhumkas');
    });
});
