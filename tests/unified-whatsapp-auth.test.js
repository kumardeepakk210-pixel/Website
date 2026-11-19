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
        assert.equal(detect('+14155552671').type, 'invalid');
        assert.equal(detect('5123456789').type, 'invalid');
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

    // 4b. WhatsApp OTP Phone Number Validation & Error Cases
    {
        // 4b1. Invalid OTP rejection
        {
            const env = createMockEnv();
            env.window.supabaseClient.auth.verifyOtp = async () => ({
                data: { user: null },
                error: { message: 'Token is invalid' }
            });
            env.elements['login-identifier'].value = '9876543210';
            await env.window.sendUnifiedOTP();
            ['1', '1', '1', '1', '1', '1'].forEach((d, i) => {
                env.elements[`otp-digit-${i + 1}`].value = d;
            });
            const verified = await env.window.verifyUnifiedOTP();
            assert.equal(verified, false);
            assert.equal(env.window.isLoggedIn, false);
            assert.ok(env.elements['login-message'].innerText.toLowerCase().includes('invalid verification code'));
        }

        // 4b2. Expired OTP rejection
        {
            const env = createMockEnv();
            env.window.supabaseClient.auth.verifyOtp = async () => ({
                data: { user: null },
                error: { message: 'Token has expired' }
            });
            env.elements['login-identifier'].value = '9876543210';
            await env.window.sendUnifiedOTP();
            ['2', '2', '2', '2', '2', '2'].forEach((d, i) => {
                env.elements[`otp-digit-${i + 1}`].value = d;
            });
            const verified = await env.window.verifyUnifiedOTP();
            assert.equal(verified, false);
            assert.equal(env.window.isLoggedIn, false);
            assert.ok(env.elements['login-message'].innerText.toLowerCase().includes('expired'));
        }

        // 4b3. Meta API delivery mock verification
        {
            const handler = (await import('../api/whatsapp.js')).default || (await import('../api/whatsapp.js'));
            const fn = handler.default || handler;

            let capturedMetaUrl = null;
            let capturedMetaHeaders = null;
            let capturedMetaBody = null;

            const originalFetch = global.fetch;
            global.fetch = async (url, opts) => {
                capturedMetaUrl = url;
                capturedMetaHeaders = opts?.headers;
                capturedMetaBody = JSON.parse(opts?.body || '{}');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ messages: [{ id: 'wamid.HBgLMTIzNDU2' }] })
                };
            };

            const savedNodeEnv = process.env.NODE_ENV;
            const savedMock = process.env.LOCAL_WHATSAPP_MOCK;
            const savedToken = process.env.WHATSAPP_ACCESS_TOKEN;
            const savedPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

            try {
                process.env.NODE_ENV = 'production';
                delete process.env.LOCAL_WHATSAPP_MOCK;
                process.env.WHATSAPP_ACCESS_TOKEN = 'mock_whatsapp_access_token_123';
                process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321098765';
                const testSec = 'whsec_' + Buffer.from('test_secret_for_meta_api_mock_12').toString('base64');
                process.env.SEND_SMS_HOOK_SECRETS = testSec;

                const bodyPayload = { user: { phone: '9876543210' }, sms: { otp: '852963' } };
                const rawB = JSON.stringify(bodyPayload);
                const mId = 'meta_test_001';
                const tStamp = String(Math.floor(Date.now() / 1000));
                const sigB = crypto.createHmac('sha256', Buffer.from(testSec.slice(6), 'base64'))
                    .update(`${mId}.${tStamp}.${rawB}`)
                    .digest('base64');

                let resStatus = 0;
                let resJson = null;
                const mockReq = {
                    method: 'POST',
                    url: '/api/whatsapp/send-otp',
                    rawBody: rawB,
                    headers: {
                        'webhook-id': mId,
                        'webhook-timestamp': tStamp,
                        'webhook-signature': `v1,${sigB}`
                    },
                    body: bodyPayload
                };
                const mockRes = {
                    setHeader: () => {},
                    status(code) { resStatus = code; return this; },
                    json(data) { resJson = data; return this; }
                };

                await fn(mockReq, mockRes);
                assert.equal(resStatus, 200);
                assert.equal(resJson.success, true);
                assert.equal(resJson.messageId, 'wamid.HBgLMTIzNDU2');

                assert.ok(capturedMetaUrl.includes('987654321098765/messages'));
                assert.equal(capturedMetaHeaders['Authorization'], 'Bearer mock_whatsapp_access_token_123');
                assert.equal(capturedMetaBody.to, '919876543210');
                assert.equal(capturedMetaBody.template.components[0].parameters[0].text, '852963');
            } finally {
                global.fetch = originalFetch;
                process.env.NODE_ENV = savedNodeEnv;
                process.env.LOCAL_WHATSAPP_MOCK = savedMock;
                process.env.WHATSAPP_ACCESS_TOKEN = savedToken;
                process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhoneId;
            }
        }

        // 4b4. URL Construction & Graph API Version Normalization Regression Test
        {
            const { buildMetaMessagesEndpoint, normalizeGraphApiVersion, normalizeIndianMobileNumber } = await import('../api/whatsapp.js');

            assert.equal(typeof buildMetaMessagesEndpoint, 'function', 'buildMetaMessagesEndpoint must be exported');
            assert.equal(typeof normalizeGraphApiVersion, 'function', 'normalizeGraphApiVersion must be exported');
            assert.equal(typeof normalizeIndianMobileNumber, 'function', 'normalizeIndianMobileNumber must be exported');

            // Hook-side phone normalization must match the frontend's Indian mobile validation.
            assert.equal(normalizeIndianMobileNumber('9876543210'), '919876543210');
            assert.equal(normalizeIndianMobileNumber('+91 98765 43210'), '919876543210');
            assert.equal(normalizeIndianMobileNumber('09876543210'), '919876543210');
            assert.equal(normalizeIndianMobileNumber('919876543210'), '919876543210');
            assert.equal(normalizeIndianMobileNumber('+1 415 555 2671'), null);
            assert.equal(normalizeIndianMobileNumber('5123456789'), null);
            assert.equal(normalizeIndianMobileNumber('12345'), null);

            // Test cases for version normalization
            assert.equal(normalizeGraphApiVersion('v21.0'), 'v21.0');
            assert.equal(normalizeGraphApiVersion('V21.0'), 'v21.0');
            assert.equal(normalizeGraphApiVersion('21.0'), 'v21.0');
            assert.equal(normalizeGraphApiVersion('/v21.0/'), 'v21.0');
            assert.equal(normalizeGraphApiVersion(''), 'v21.0');
            assert.equal(normalizeGraphApiVersion(null), 'v21.0');
            assert.equal(normalizeGraphApiVersion(undefined), 'v21.0');
            assert.equal(normalizeGraphApiVersion('   '), 'v21.0');
            assert.equal(normalizeGraphApiVersion('v22.0'), 'v22.0');

            // Test cases for buildMetaMessagesEndpoint: Must never produce //1481161675077194/messages
            const phoneId = '1481161675077194';
            assert.equal(
                buildMetaMessagesEndpoint('', phoneId),
                'https://graph.facebook.com/v21.0/1481161675077194/messages',
                'Empty version must default to v21.0 and never produce double slash'
            );
            assert.equal(
                buildMetaMessagesEndpoint('   ', `  ${phoneId}  `),
                'https://graph.facebook.com/v21.0/1481161675077194/messages',
                'Whitespace in version or phone ID must be trimmed cleanly'
            );
            assert.equal(
                buildMetaMessagesEndpoint('/v21.0/', `/${phoneId}/`),
                'https://graph.facebook.com/v21.0/1481161675077194/messages',
                'Stray leading/trailing slashes must be stripped'
            );
            assert.equal(
                buildMetaMessagesEndpoint('21.0', phoneId),
                'https://graph.facebook.com/v21.0/1481161675077194/messages',
                'Numeric version string must have v prepended'
            );
            assert.equal(
                buildMetaMessagesEndpoint('v26.0', phoneId),
                'https://graph.facebook.com/v26.0/1481161675077194/messages',
                'Specific valid Graph API version must be preserved'
            );
        }

        console.log('✔ 4b. Invalid/Expired OTP rejection and Meta API payload formatting verified');
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

        // 5c2. Wrong Secret Signature (Signed with completely different secret)
        {
            const wrongSecretBytes = Buffer.from('completely_wrong_secret_32_bytes');
            const wrongSig = crypto.createHmac('sha256', wrongSecretBytes).update(toSign).digest('base64');

            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': ts,
                    'webhook-signature': `v1,${wrongSig}`
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

        // 5c3. Malformed Signature (Non-base64 garbage or missing v1 prefix)
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
                    'webhook-signature': `v2,malformed_sig_format`
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

        // 5d. Missing Webhook Headers (Fails with missing_webhook_headers)
        {
            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {},
                body: bodyObj
            };
            const mockRes = {
                setHeader: () => {},
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            await fn(mockReq, mockRes);
            assert.equal(resStatus, 401);
            assert.equal(resJson.error.code, 'missing_webhook_headers');
        }

        // 5e. Secret Rotation: Multiple secrets configured with comma, signed by second secret
        {
            const secondSecret = 'v1,whsec_' + Buffer.from('another_rotated_secret_key_12345').toString('base64');
            process.env.SEND_SMS_HOOK_SECRETS = `${secret}, ${secondSecret}`;

            const rotTs = String(Math.floor(Date.now() / 1000));
            const rotToSign = `${msgId}.${rotTs}.${rawBody}`;
            const rotSecretBytes = Buffer.from(secondSecret.slice(9), 'base64');
            const rotSig = crypto.createHmac('sha256', rotSecretBytes).update(rotToSign).digest('base64');

            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': rotTs,
                    'webhook-signature': `v1,${rotSig}`
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
        }

        // 5e2. Secret Rotation: Multiple secrets configured with pipe (|), signed by second secret
        {
            const pipeSecret = 'v1,whsec_' + Buffer.from('pipe_delimited_secret_key_123456').toString('base64');
            process.env.SEND_SMS_HOOK_SECRETS = `${secret} | ${pipeSecret}`;

            const rotTs = String(Math.floor(Date.now() / 1000));
            const rotToSign = `${msgId}.${rotTs}.${rawBody}`;
            const rotSecretBytes = Buffer.from(pipeSecret.slice(9), 'base64');
            const rotSig = crypto.createHmac('sha256', rotSecretBytes).update(rotToSign).digest('base64');

            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': rotTs,
                    'webhook-signature': `v1,${rotSig}`
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
        }

        // 5f. Direct v1,whsec_ formatted secret decoding
        {
            const v1WhsecSecret = 'v1,whsec_' + Buffer.from('v1_whsec_secret_key_32_bytes_12').toString('base64');
            process.env.SEND_SMS_HOOK_SECRETS = v1WhsecSecret;

            const v1Ts = String(Math.floor(Date.now() / 1000));
            const v1ToSign = `${msgId}.${v1Ts}.${rawBody}`;
            const v1SecretBytes = Buffer.from(v1WhsecSecret.slice(9), 'base64');
            const v1Sig = crypto.createHmac('sha256', v1SecretBytes).update(v1ToSign).digest('base64');

            let resStatus = 0;
            let resJson = null;
            const mockReq = {
                method: 'POST',
                url: '/api/whatsapp/send-otp',
                rawBody,
                headers: {
                    'webhook-id': msgId,
                    'webhook-timestamp': v1Ts,
                    'webhook-signature': `v1,${v1Sig}`
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
        }

        // 5g. Missing Production Secret (Fail Closed with 500)
        {
            const savedNodeEnv = process.env.NODE_ENV;
            const savedMock = process.env.LOCAL_WHATSAPP_MOCK;
            try {
                process.env.NODE_ENV = 'production';
                delete process.env.LOCAL_WHATSAPP_MOCK;
                process.env.SEND_SMS_HOOK_SECRETS = '';
                process.env.SUPABASE_SMS_HOOK_SECRET = '';

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
                assert.equal(resStatus, 500);
                assert.equal(resJson.error.message, 'Server security configuration error');
            } finally {
                process.env.NODE_ENV = savedNodeEnv;
                process.env.LOCAL_WHATSAPP_MOCK = savedMock;
                process.env.SEND_SMS_HOOK_SECRETS = secret;
            }
        }

        // 5h. Production Missing Signature Header (Fail Closed with 401)
        {
            const savedNodeEnv = process.env.NODE_ENV;
            const savedMock = process.env.LOCAL_WHATSAPP_MOCK;
            try {
                process.env.NODE_ENV = 'production';
                delete process.env.LOCAL_WHATSAPP_MOCK;
                process.env.SEND_SMS_HOOK_SECRETS = secret;

                let resStatus = 0;
                let resJson = null;
                const mockReq = {
                    method: 'POST',
                    url: '/api/whatsapp/send-otp',
                    rawBody,
                    headers: {}, // No signature headers
                    body: bodyObj
                };
                const mockRes = {
                    setHeader: () => {},
                    status(code) { resStatus = code; return this; },
                    json(data) { resJson = data; return this; }
                };

                await fn(mockReq, mockRes);
                assert.equal(resStatus, 401);
                assert.equal(resJson.error.code, 'missing_webhook_headers');
            } finally {
                process.env.NODE_ENV = savedNodeEnv;
                process.env.LOCAL_WHATSAPP_MOCK = savedMock;
                process.env.SEND_SMS_HOOK_SECRETS = secret;
            }
        }

        // 5i. Stream Raw Body Reading verification
        {
            const streamBody = JSON.stringify({ user: { id: 'usr_stream', phone: '+919999999999' }, sms: { otp: '999999' } });
            const streamTs = String(Math.floor(Date.now() / 1000));
            const streamToSign = `${msgId}.${streamTs}.${streamBody}`;
            const streamSig = crypto.createHmac('sha256', secretBytes).update(streamToSign).digest('base64');

            const EventEmitter = (await import('node:events')).EventEmitter;
            const reqEmitter = new EventEmitter();
            reqEmitter.method = 'POST';
            reqEmitter.url = '/api/whatsapp/send-otp';
            reqEmitter.headers = {
                'webhook-id': msgId,
                'webhook-timestamp': streamTs,
                'webhook-signature': `v1,${streamSig}`
            };
            reqEmitter[Symbol.asyncIterator] = async function* () {
                yield Buffer.from(streamBody);
            };

            let resStatus = 0;
            let resJson = null;
            const mockRes = {
                setHeader: () => {},
                status(code) { resStatus = code; return this; },
                json(data) { resJson = data; return this; }
            };

            await fn(reqEmitter, mockRes);
            assert.equal(resStatus, 200);
            assert.equal(resJson.success, true);
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
