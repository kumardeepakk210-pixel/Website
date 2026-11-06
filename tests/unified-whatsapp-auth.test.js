import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

console.log('--- RUNNING UNIFIED EMAIL + WHATSAPP OTP TEST SUITE ---');

const authJsCode = fs.readFileSync('js/auth.js', 'utf-8');
const indexHtml = fs.readFileSync('index.html', 'utf-8');
const whatsappRouteCode = fs.readFileSync('api/whatsapp.js', 'utf-8');

function createMockEnv(initialData = {}) {
    const elements = {};
    function getEl(id) {
        if (!elements[id]) {
            elements[id] = {
                id,
                value: '',
                innerText: '',
                innerHTML: '',
                style: { display: '' },
                disabled: false,
                classList: {
                    classes: new Set(),
                    add(c) { this.classes.add(c); },
                    remove(c) { this.classes.delete(c); },
                    toggle(c, force) {
                        if (force !== undefined) {
                            force ? this.classes.add(c) : this.classes.delete(c);
                        } else {
                            this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
                        }
                    },
                    contains(c) { return this.classes.has(c); }
                },
                listeners: {},
                addEventListener(evt, fn) {
                    this.listeners[evt] = this.listeners[evt] || [];
                    this.listeners[evt].push(fn);
                },
                focus() { this.focused = true; }
            };
        }
        return elements[id];
    }

    [
        'email-login-container', 'email-otp-request-form', 'email-otp-verify-form',
        'email-onboarding-container', 'login-identifier', 'login-email', 'login-mobile', 'email-send-otp-btn',
        'otp-digit-1', 'otp-digit-2', 'otp-digit-3', 'otp-digit-4', 'otp-digit-5', 'otp-digit-6',
        'email-verify-otp-btn', 'email-resend-otp-btn', 'otp-timer-text', 'otp-masked-destination', 'otp-masked-email',
        'login-message', 'onboarding-name', 'onboarding-mobile'
    ].forEach(id => getEl(id));

    const supabaseCalls = {
        signInWithOtp: [],
        verifyOtp: [],
        customersSelect: [],
        customersUpdate: [],
        customersInsert: []
    };

    const mockSupabase = {
        auth: {
            signInWithOtp: async (args) => {
                supabaseCalls.signInWithOtp.push(args);
                return { data: { user: null }, error: null };
            },
            verifyOtp: async (args) => {
                supabaseCalls.verifyOtp.push(args);
                return {
                    data: {
                        user: initialData.authUser || {
                            id: 'usr_test_auth_1',
                            email: args.email || null,
                            phone: args.phone || null,
                            user_metadata: { full_name: 'Test Customer' }
                        }
                    },
                    error: null
                };
            }
        },
        from(tableName) {
            return {
                select(fields) {
                    return {
                        eq(col, val) {
                            return {
                                maybeSingle: async () => {
                                    supabaseCalls.customersSelect.push({ col, val });
                                    if (initialData.existingCustomer &&
                                        (initialData.existingCustomer[col] === val ||
                                         (col === 'customer_phone' && initialData.existingCustomer.customer_phone?.includes(val)))) {
                                        return { data: initialData.existingCustomer, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        },
                        ilike(col, val) {
                            return {
                                maybeSingle: async () => {
                                    supabaseCalls.customersSelect.push({ col, val });
                                    if (initialData.existingCustomer &&
                                        initialData.existingCustomer[col]?.toLowerCase() === val?.toLowerCase()) {
                                        return { data: initialData.existingCustomer, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        }
                    };
                },
                update(payload) {
                    return {
                        eq(col, val) {
                            return {
                                select() {
                                    return {
                                        maybeSingle: async () => {
                                            supabaseCalls.customersUpdate.push({ col, val, payload });
                                            return { data: { ...(initialData.existingCustomer || {}), ...payload }, error: null };
                                        }
                                    };
                                }
                            };
                        }
                    };
                },
                insert(payload) {
                    return {
                        select() {
                            return {
                                maybeSingle: async () => {
                                    supabaseCalls.customersInsert.push(payload);
                                    return { data: { id: 'cust_new_auto', ...payload }, error: null };
                                }
                            };
                        }
                    };
                }
            };
        }
    };

    const sandbox = {
        console,
        window: {
            location: { hostname: 'test.local' },
            supabaseClient: mockSupabase,
            addEventListener: () => {},
            localStorage: {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {}
            },
            history: { replaceState: () => {} }
        },
        document: {
            getElementById: (id) => getEl(id),
            querySelectorAll: () => [],
            addEventListener: () => {}
        },
        supabase: {
            createClient: () => mockSupabase
        },
        supabaseClient: mockSupabase,
        currentCustomerProfile: null,
        setTimeout: (fn) => fn(),
        setInterval: () => 123,
        clearInterval: () => {},
        showToast: () => {},
        navigateTo: () => {}
    };

    sandbox.window.document = sandbox.document;
    vm.createContext(sandbox);

    // Bootstrap auth.js inside vm
    vm.runInContext(authJsCode, sandbox);

    return {
        context: sandbox,
        window: sandbox.window,
        elements,
        supabaseCalls
    };
}

async function runUnifiedSuite() {
    // 1. UI Structure
    {
        assert.ok(indexHtml.includes('id="login-identifier"'), 'index.html must contain login-identifier input');
        assert.ok(indexHtml.includes('CONTINUE'), 'index.html must contain CONTINUE primary CTA');
        assert.ok(indexHtml.includes('otp-masked-destination'), 'index.html must contain otp-masked-destination span');
        console.log('✔ 1. HTML structure and unified elements verified');
    }

    // 2. detectAuthIdentifier
    {
        const env = createMockEnv();
        const detect = env.window.detectAuthIdentifier;
        assert.equal(typeof detect, 'function', 'detectAuthIdentifier should be exposed');

        const e1 = detect('deepak@wishrite.in');
        assert.equal(e1.type, 'email');
        assert.equal(e1.normalized, 'deepak@wishrite.in');

        const m1 = detect('9876543210');
        assert.equal(m1.type, 'mobile');
        assert.equal(m1.normalized, '+919876543210');

        const m2 = detect('+91 98765 43210');
        assert.equal(m2.type, 'mobile');
        assert.equal(m2.normalized, '+919876543210');

        const m3 = detect('09876543210');
        assert.equal(m3.type, 'mobile');
        assert.equal(m3.normalized, '+919876543210');

        const inv = detect('12345');
        assert.equal(inv.type, 'invalid');
        assert.ok(inv.error.includes('valid 10-digit mobile number'));
        console.log('✔ 2. detectAuthIdentifier parses emails and Indian mobile variants accurately');
    }

    // 3. Email OTP Flow
    {
        const env = createMockEnv({
            existingCustomer: {
                id: 'cust_email_1',
                customer_email: 'test@example.com',
                customer_name: 'Priya Sharma',
                user_id: 'usr_auth_existing'
            }
        });

        env.elements['login-identifier'].value = 'test@example.com';
        const sent = await env.window.sendUnifiedOTP();
        assert.equal(sent, true);
        assert.equal(env.supabaseCalls.signInWithOtp.length, 1);
        assert.equal(env.supabaseCalls.signInWithOtp[0].email, 'test@example.com');

        ['1', '2', '3', '4', '5', '6'].forEach((d, i) => {
            env.elements[`otp-digit-${i + 1}`].value = d;
        });

        const verified = await env.window.verifyUnifiedOTP();
        assert.equal(verified, true);
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.supabaseCalls.verifyOtp.length, 1);
        assert.equal(env.supabaseCalls.verifyOtp[0].type, 'email');
        assert.equal(env.supabaseCalls.verifyOtp[0].token, '123456');
        assert.equal(env.window.currentCustomerProfile.customerId, 'cust_email_1');
        console.log('✔ 3. Email OTP flow operates with unified input and establishes session');
    }

    // 4. WhatsApp Phone OTP & Canonical Account Guard
    {
        const env = createMockEnv({
            existingCustomer: {
                id: 'cust_phone_1',
                customer_phone: '+919876543210',
                customer_name: 'Rohan Verma',
                user_id: 'usr_canonical_email_user'
            },
            authUser: {
                id: 'usr_new_phone_auth_user',
                phone: '+919876543210'
            }
        });

        env.elements['login-identifier'].value = '9876543210';
        const sent = await env.window.sendUnifiedOTP();
        assert.equal(sent, true);
        assert.equal(env.supabaseCalls.signInWithOtp.length, 1);
        assert.equal(env.supabaseCalls.signInWithOtp[0].phone, '+919876543210');
        assert.equal(env.supabaseCalls.signInWithOtp[0].options.channel, 'sms');

        ['6', '5', '4', '3', '2', '1'].forEach((d, i) => {
            env.elements[`otp-digit-${i + 1}`].value = d;
        });

        const verified = await env.window.verifyUnifiedOTP();
        assert.equal(verified, true);
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.supabaseCalls.verifyOtp.length, 1);
        assert.equal(env.supabaseCalls.verifyOtp[0].type, 'sms');
        assert.equal(env.supabaseCalls.verifyOtp[0].token, '654321');
        assert.equal(env.supabaseCalls.verifyOtp[0].phone, '+919876543210');
        assert.equal(env.window.currentCustomerProfile.customerId, 'cust_phone_1');

        // CRITICAL CHECK: customers.user_id must NOT have been overwritten with usr_new_phone_auth_user
        const updatePayload = env.supabaseCalls.customersUpdate[0]?.payload;
        assert.ok(!updatePayload || !updatePayload.user_id, 'Must NOT reassign canonical user_id to new auth user');
        console.log('✔ 4. WhatsApp Phone OTP resolves to existing customer record and PRESERVES canonical user_id');
    }

    // 5. Standard Webhooks Signature Verification (/api/whatsapp/send-otp)
    {
        const handler = (await import('../api/whatsapp.js')).default || (await import('../api/whatsapp.js'));
        const fn = handler.default || handler;

        const secret = 'whsec_' + Buffer.from('test_secret_key_32_bytes_long_1234').toString('base64');
        process.env.SEND_SMS_HOOK_SECRETS = secret;
        process.env.LOCAL_WHATSAPP_MOCK = 'true';

        const bodyObj = {
            user: { id: 'usr_hook_1', phone: '+919876543210' },
            sms: { otp: '482910' }
        };
        const rawBody = JSON.stringify(bodyObj);
        const msgId = 'msg_test_001';
        const ts = String(Math.floor(Date.now() / 1000));
        const toSign = `${msgId}.${ts}.${rawBody}`;
        const secretBytes = Buffer.from(secret.slice(6), 'base64');
        const expectedSig = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');

        // 5a. Valid Standard Webhook Signature
        {
            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': ts,
                    'webhook-signature': `v1,${expectedSig}`
                },
                body: bodyObj
            };
            const mockRes = {
                setHeader: () => {},
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            await fn(mockReq, mockRes);
            assert.equal(resStatus, 200);
            assert.equal(resJson.success, true);
            assert.equal(resJson.mock, true);
        }

        // 5b. Tampered Body / Invalid Signature
        {
            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody: rawBody + 'tamper',
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': ts,
                    'webhook-signature': `v1,${expectedSig}`
                },
                body: bodyObj
            };
            const mockRes = {
                setHeader: () => {},
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            await fn(mockReq, mockRes);
            assert.equal(resStatus, 401);
            assert.equal(resJson.error.code, 'invalid_signature');
        }

        // 5c. Stale Timestamp (> 300 seconds)
        {
            let resStatus = 0;
            let resJson = null;
            const oldTs = String(Math.floor(Date.now() / 1000) - 400);
            const oldToSign = `${msgId}.${oldTs}.${rawBody}`;
            const oldSig = crypto.createHmac('sha256', secretBytes).update(oldToSign).digest('base64');
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': oldTs,
                    'webhook-signature': `v1,${oldSig}`
                },
                body: bodyObj
            };
            const mockRes = {
                setHeader: () => {},
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            await fn(mockReq, mockRes);
            assert.equal(resStatus, 401);
            assert.equal(resJson.error.code, 'timestamp_out_of_tolerance');
        }

        console.log('✔ 5. Server-side Standard Webhooks signature verification and replay prevention verified');
    }

    // 6. Resend Cooldown and Masking
    {
        const env = createMockEnv();
        const mask = env.window.maskDestination;
        assert.equal(mask('rohan@example.com', 'email'), 'r*****@example.com');
        assert.equal(mask('+919876543210', 'whatsapp'), '+91******3210');
        console.log('✔ 6. Destination masking produces secure outputs');
    }

    console.log('\n======================================================');
    console.log('ALL UNIFIED EMAIL + WHATSAPP OTP TESTS PASSED (6/6)');
    console.log('======================================================');
}

runUnifiedSuite().catch((err) => {
    console.error('Unified OTP Test Suite Failed:', err);
    process.exit(1);
});
