import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
        'mobile-login-form', 'login-country-code', 'login-password', 'login-submit-btn',
        'login-message', 'email-login-tab', 'mobile-login-tab',
        'onboarding-name', 'onboarding-mobile', 'onboarding-country-code', 'onboarding-referral-code', 'onboarding-submit-btn',
        'user-dropdown'
    ].forEach(id => getEl(id));

    const windowMock = {
        location: { hostname: 'localhost' },
        E2E_LOCAL_AUTH: false,
        document: {
            getElementById: (id) => getEl(id),
            querySelectorAll: () => [],
            addEventListener: () => {}
        },
        localStorage: {
            data: {},
            getItem(k) { return this.data[k] || null; },
            setItem(k, v) { this.data[k] = String(v); },
            removeItem(k) { delete this.data[k]; }
        },
        sessionStorage: {
            data: {},
            getItem(k) { return this.data[k] || null; },
            setItem(k, v) { this.data[k] = String(v); },
            removeItem(k) { delete this.data[k]; }
        },
        showToast: (msg, type) => {
            windowMock.lastToast = { msg, type };
        },
        navigateTo: (view, param) => {
            windowMock.lastNavigation = { view, param };
        }
    };
    windowMock.window = windowMock;

    const supabaseCalls = {
        signInWithOtp: [],
        verifyOtp: [],
        signOut: [],
        customersSelect: [],
        customersUpdate: [],
        customersInsert: []
    };

    const mockSupabase = {
        auth: {
            async signInWithOtp(opts) {
                supabaseCalls.signInWithOtp.push(opts);
                if (initialData.signInWithOtpError) {
                    return { data: null, error: initialData.signInWithOtpError };
                }
                return { data: { user: null, session: null }, error: null };
            },
            async verifyOtp(opts) {
                supabaseCalls.verifyOtp.push(opts);
                if (initialData.verifyOtpError) {
                    return { data: null, error: initialData.verifyOtpError };
                }
                const user = initialData.authUser || {
                    id: 'usr_mock_123',
                    email: opts.email || null,
                    phone: opts.phone || null,
                    user_metadata: initialData.userMetadata || {}
                };
                return { data: { user, session: { user } }, error: null };
            },
            async signOut() {
                supabaseCalls.signOut.push({});
                return { error: null };
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
                                    return { data: { id: 'cust_new_auto_id', ...payload }, error: null };
                                }
                            };
                        }
                    };
                }
            };
        }
    };

    windowMock.supabaseClient = mockSupabase;

    const sandbox = {
        window: windowMock,
        document: windowMock.document,
        localStorage: windowMock.localStorage,
        sessionStorage: windowMock.sessionStorage,
        supabaseClient: mockSupabase,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };

    vm.createContext(sandbox);
    vm.runInContext(authJsCode, sandbox);

    return {
        window: sandbox.window,
        elements,
        supabaseCalls
    };
}

async function runUnifiedSuite() {
    // 1. UI Structure in index.html
    assert.ok(indexHtml.includes('id="login-identifier"'), 'Must have unified login-identifier input');
    assert.ok(indexHtml.includes('Welcome Back'), 'Must have Welcome Back heading');
    assert.ok(indexHtml.includes('Mobile Number or Email Address'), 'Must have Mobile Number or Email Address label');
    assert.ok(indexHtml.includes('CONTINUE'), 'Must have CONTINUE button text');
    assert.ok(indexHtml.includes("We'll send you a verification code via WhatsApp or Email"), 'Must have supporting text');
    console.log('✔ 1. HTML structure and unified elements verified');

    // 2. Input Detection Unit Logic
    {
        const env = createMockEnv();
        const detect = env.window.detectAuthIdentifier;
        assert.equal(typeof detect, 'function', 'detectAuthIdentifier must be exposed');

        // Email detections
        const e1 = detect('user@example.com');
        assert.equal(e1.type, 'email');
        assert.equal(e1.normalized, 'user@example.com');

        const e2 = detect('  TEST.USER@WISHRITE.IN  ');
        assert.equal(e2.type, 'email');
        assert.equal(e2.normalized, 'test.user@wishrite.in');

        // Invalid email
        const badEmail = detect('bademail@domain');
        assert.equal(badEmail.type, 'invalid_email');

        // Mobile detections (10 digits Indian)
        const m1 = detect('9876543210');
        assert.equal(m1.type, 'mobile');
        assert.equal(m1.normalized, '+919876543210');

        // Mobile with +91
        const m2 = detect('+91 98765 43210');
        assert.equal(m2.type, 'mobile');
        assert.equal(m2.normalized, '+919876543210');

        // Mobile with 91 prefix
        const m3 = detect('919876543210');
        assert.equal(m3.type, 'mobile');
        assert.equal(m3.normalized, '+919876543210');

        // Mobile with 0 prefix
        const m4 = detect('09876543210');
        assert.equal(m4.type, 'mobile');
        assert.equal(m4.normalized, '+919876543210');

        // Invalid numbers
        const badNum = detect('12345');
        assert.equal(badNum.type, 'invalid');

        console.log('✔ 2. detectAuthIdentifier parses emails and Indian mobile variants accurately');
    }

    // 3. Email OTP Flow (Existing customer)
    {
        const env = createMockEnv({
            existingCustomer: {
                id: 'cust_email_1',
                customer_email: 'test@wishrite.test',
                customer_name: 'Priya Sharma'
            },
            authUser: {
                id: 'usr_email_1',
                email: 'test@wishrite.test'
            }
        });

        env.elements['login-identifier'].value = 'test@wishrite.test';
        const sent = await env.window.sendUnifiedOTP();
        assert.equal(sent, true);
        assert.equal(env.supabaseCalls.signInWithOtp.length, 1);
        assert.equal(env.supabaseCalls.signInWithOtp[0].email, 'test@wishrite.test');

        ['1', '2', '3', '4', '5', '6'].forEach((d, i) => {
            env.elements[`otp-digit-${i + 1}`].value = d;
        });

        const verified = await env.window.verifyUnifiedOTP();
        assert.equal(verified, true);
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.window.currentUser.email, 'test@wishrite.test');
        console.log('✔ 3. Email OTP flow operates with unified input and establishes session');
    }

    // 4. WhatsApp / Phone OTP Flow (Existing mobile customer account linking)
    {
        const env = createMockEnv({
            existingCustomer: {
                id: 'cust_phone_1',
                customer_phone: '+919876543210',
                customer_name: 'Rohan Verma',
                user_id: 'usr_old_id'
            },
            authUser: {
                id: 'usr_phone_new_auth',
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
        console.log('✔ 4. WhatsApp Phone OTP resolves to existing customer record by phone');
    }

    // 5. Server-side Supabase Send SMS Hook (/api/whatsapp/send-otp)
    {
        // Load handler dynamically into sandbox
        const handler = (await import('../api/whatsapp.js')).default || (await import('../api/whatsapp.js'));
        const fn = handler.default || handler;

        // Mock test request simulating Supabase Auth Hook
        let resStatus = 0;
        let resJson = null;
        const mockReq = {
            method: 'POST',
            url: '/api/whatsapp/send-otp',
            headers: {},
            body: {
                user: { id: 'usr_hook_1', phone: '+919876543210' },
                sms: { otp: '482910' }
            }
        };
        const mockRes = {
            setHeader: () => {},
            status(code) { resStatus = code; return this; },
            json(data) { resJson = data; return this; }
        };

        process.env.NODE_ENV = 'test';
        await fn(mockReq, mockRes);

        assert.equal(resStatus, 200);
        assert.equal(resJson.success, true);
        assert.equal(resJson.mock, true);
        assert.ok(resJson.destination.includes('9198****10'));
        console.log('✔ 5. Server-side /api/whatsapp/send-otp handles Supabase Auth Send SMS hook safely');
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
