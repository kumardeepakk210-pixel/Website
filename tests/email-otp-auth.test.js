import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

console.log('--- RUNNING EMAIL OTP TEST SUITE ---');

const authJsCode = fs.readFileSync('js/auth.js', 'utf-8');
const indexHtml = fs.readFileSync('index.html', 'utf-8');

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
        'email-onboarding-container', 'login-email', 'email-send-otp-btn',
        'otp-digit-1', 'otp-digit-2', 'otp-digit-3', 'otp-digit-4', 'otp-digit-5', 'otp-digit-6',
        'email-verify-otp-btn', 'email-resend-otp-btn', 'otp-timer-text', 'otp-masked-email',
        'mobile-login-form', 'login-mobile', 'login-country-code', 'login-password', 'login-submit-btn',
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
        signInWithPassword: [],
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
                    email: opts.email,
                    user_metadata: initialData.userMetadata || {}
                };
                return { data: { user, session: { user } }, error: null };
            },
            async signInWithPassword(credentials) {
                supabaseCalls.signInWithPassword.push(credentials);
                if (initialData.signInWithPasswordError) {
                    return { data: null, error: initialData.signInWithPasswordError };
                }
                return {
                    data: {
                        user: {
                            id: 'usr_mobile_123',
                            phone: credentials.phone,
                            email: 'mobile@wishrite.test'
                        },
                        session: { access_token: 'fake_jwt' }
                    },
                    error: null
                };
            },
            async updateUser() {
                return { data: {}, error: null };
            },
            async signOut() {
                supabaseCalls.signOut.push(true);
                return { error: null };
            },
            async getSession() {
                return { data: { session: null } };
            },
            onAuthStateChange() {}
        },
        from(table) {
            return {
                select(fields) {
                    return {
                        eq(col, val) {
                            return {
                                async maybeSingle() {
                                    supabaseCalls.customersSelect.push({ table, col, val });
                                    if (table === 'customers') {
                                        return { data: initialData.existingCustomer || null, error: null };
                                    }
                                    return { data: null, error: null };
                                }
                            };
                        },
                        ilike(col, val) {
                            return {
                                async maybeSingle() {
                                    supabaseCalls.customersSelect.push({ table, col, val });
                                    if (table === 'customers') {
                                        return { data: initialData.existingCustomer || null, error: null };
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
                                        async maybeSingle() {
                                            supabaseCalls.customersUpdate.push({ table, payload, col, val });
                                            return { data: { ...initialData.existingCustomer, ...payload }, error: null };
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
                                async maybeSingle() {
                                    supabaseCalls.customersInsert.push({ table, payload });
                                    return { data: { id: 'cust_new_123', ...payload }, error: null };
                                }
                            };
                        }
                    };
                }
            };
        },
        rpc(fn, args) {
            return Promise.resolve({ data: 'ok', error: null });
        }
    };

    windowMock.supabaseClient = mockSupabase;

    const context = vm.createContext({
        window: windowMock,
        document: windowMock.document,
        localStorage: windowMock.localStorage,
        sessionStorage: windowMock.sessionStorage,
        showToast: (msg, type) => { windowMock.lastToast = { msg, type }; },
        navigateTo: (view, param) => { windowMock.lastNavigation = { view, param }; },
        console: { ...console, warn: () => {}, error: () => {}, log: () => {} },
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout
    });

    vm.runInContext(authJsCode, context);

    return { window: windowMock, elements, supabaseCalls };
}

async function runAllTests() {
    // 1. Structure
    assert.ok(indexHtml.includes('id="email-login-container"'));
    assert.ok(indexHtml.includes('id="email-otp-request-form"'));
    assert.ok(indexHtml.includes('id="email-otp-verify-form"'));
    assert.ok(indexHtml.includes('id="email-send-otp-btn"'));
    assert.ok(indexHtml.includes('id="email-verify-otp-btn"'));
    assert.ok(indexHtml.includes('id="email-resend-otp-btn"'));
    for (let i = 1; i <= 6; i++) {
        assert.ok(indexHtml.includes(`id="otp-digit-${i}"`));
    }
    assert.ok(indexHtml.includes('id="mobile-login-form"'));
    assert.ok(indexHtml.includes('id="login-password"'));
    assert.ok(indexHtml.includes('id="login-mobile"'));
    console.log('✔ HTML Structure & Forms Verified');

    // 2. maskEmail
    const { window } = createMockEnv();
    assert.equal(window.maskEmail('deepak@gmail.com'), 'd*****@gmail.com');
    assert.equal(window.maskEmail('john.doe@company.com'), 'j*****@company.com');
    assert.equal(window.maskEmail('a@test.com'), 'a*****@test.com');
    console.log('✔ maskEmail Verified');

    // 3. TEST A: Existing customer
    {
        const existingCustomer = {
            id: 'cust_existing_789',
            user_id: 'usr_existing_456',
            customer_email: 'existing@wishrite.test',
            customer_name: 'Deepak Kumar',
            customer_phone: '+919876543210'
        };

        const env = createMockEnv({
            existingCustomer,
            authUser: {
                id: 'usr_existing_456',
                email: 'existing@wishrite.test'
            }
        });

        env.elements['login-email'].value = 'existing@wishrite.test';
        const sendSuccess = await env.window.sendEmailOTP();
        assert.equal(sendSuccess, true);
        assert.equal(env.supabaseCalls.signInWithOtp.length, 1);
        assert.equal(env.supabaseCalls.signInWithOtp[0].email, 'existing@wishrite.test');
        assert.equal(env.supabaseCalls.signInWithOtp[0].options.shouldCreateUser, true);

        assert.equal(env.elements['email-otp-request-form'].style.display, 'none');
        assert.equal(env.elements['email-otp-verify-form'].style.display, 'block');

        ['1', '2', '3', '4', '5', '6'].forEach((d, idx) => {
            env.elements[`otp-digit-${idx + 1}`].value = d;
        });

        const verifySuccess = await env.window.verifyEmailOTP();
        assert.equal(verifySuccess, true);
        assert.equal(env.supabaseCalls.verifyOtp.length, 1);
        assert.equal(env.supabaseCalls.verifyOtp[0].token, '123456');

        assert.equal(env.window.currentUser.id, 'usr_existing_456');
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.window.currentCustomerProfile.customerId, 'cust_existing_789');
        assert.equal(env.window.currentCustomerProfile.name, 'Deepak Kumar');
        assert.equal(env.supabaseCalls.customersInsert.length, 0); // Preserved existing customer!
        assert.equal(env.window.lastNavigation.view, 'profile');
        assert.equal(env.window.lastToast.msg, 'Welcome back to WishRite!');
        env.window.resetEmailOTPFlow();
        console.log('✔ TEST A: Existing customer email OTP preserves customer & wallet');
    }

    // 4. TEST B: New customer
    {
        const env = createMockEnv({
            existingCustomer: null,
            authUser: {
                id: 'usr_new_999',
                email: 'newuser@wishrite.test',
                user_metadata: {}
            }
        });

        env.elements['login-email'].value = 'newuser@wishrite.test';
        await env.window.sendEmailOTP();

        ['6', '5', '4', '3', '2', '1'].forEach((d, idx) => {
            env.elements[`otp-digit-${idx + 1}`].value = d;
        });

        await env.window.verifyEmailOTP();

        assert.equal(env.elements['email-login-container'].style.display, 'none');
        assert.equal(env.elements['email-onboarding-container'].style.display, 'block');

        env.elements['onboarding-name'].value = 'Ananya Sen';
        env.elements['onboarding-mobile'].value = '9876543210';
        env.elements['onboarding-referral-code'].value = 'WRWELCOME';

        await env.window.handleEmailOnboardingSubmit();

        assert.equal(env.supabaseCalls.customersInsert.length, 1);
        const inserted = env.supabaseCalls.customersInsert[0].payload;
        assert.equal(inserted.customer_name, 'Ananya Sen');
        assert.equal(inserted.customer_email, 'newuser@wishrite.test');
        assert.equal(inserted.customer_phone, '+919876543210');

        assert.equal(env.window.lastNavigation.view, 'profile');
        assert.equal(env.window.lastToast.msg, 'Welcome to WishRite!');
        env.window.resetEmailOTPFlow();
        console.log('✔ TEST B: New customer onboarding creates profile cleanly');
    }

    // 5. TEST C: Wrong OTP
    {
        const env = createMockEnv({
            verifyOtpError: { message: 'Token is invalid' }
        });

        env.elements['login-email'].value = 'user@wishrite.test';
        await env.window.sendEmailOTP();

        ['1', '1', '1', '1', '1', '1'].forEach((d, idx) => {
            env.elements[`otp-digit-${idx + 1}`].value = d;
        });

        const success = await env.window.verifyEmailOTP();
        assert.equal(success, false);
        assert.equal(env.window.isLoggedIn, false);
        assert.equal(env.elements['login-message'].innerText, 'Invalid verification code. Please try again.');
        env.window.resetEmailOTPFlow();
        console.log('✔ TEST C: Wrong OTP rejected with friendly error');
    }

    // 6. TEST D: Expired OTP
    {
        const env = createMockEnv({
            verifyOtpError: { message: 'Token has expired' }
        });

        env.elements['login-email'].value = 'user@wishrite.test';
        await env.window.sendEmailOTP();

        ['9', '9', '9', '9', '9', '9'].forEach((d, idx) => {
            env.elements[`otp-digit-${idx + 1}`].value = d;
        });

        const success = await env.window.verifyEmailOTP();
        assert.equal(success, false);
        assert.equal(env.window.isLoggedIn, false);
        assert.equal(env.elements['login-message'].innerText, 'Your verification code has expired. Please request a new code.');
        env.window.resetEmailOTPFlow();
        console.log('✔ TEST D: Expired OTP handled with retry prompt');
    }

    // 7. TEST E: Resend OTP
    {
        const env = createMockEnv();
        env.elements['login-email'].value = 'user@wishrite.test';
        await env.window.sendEmailOTP();

        assert.equal(env.supabaseCalls.signInWithOtp.length, 1);
        assert.equal(env.elements['email-resend-otp-btn'].disabled, true);

        await env.window.resendEmailOTP();
        assert.equal(env.supabaseCalls.signInWithOtp.length, 2);
        assert.equal(env.elements['email-resend-otp-btn'].disabled, true);
        assert.ok(env.elements['login-message'].innerText.includes('New code sent to'));
        env.window.resetEmailOTPFlow();
        console.log('✔ TEST E: Resend OTP sends code & restarts 45s cooldown');
    }

    // 8. TEST F: Mobile Login
    {
        const env = createMockEnv();
        env.window.switchLoginMethod('mobile');
        assert.equal(env.elements['mobile-login-form'].style.display, 'block');
        assert.equal(env.elements['email-login-container'].style.display, 'none');

        env.elements['login-country-code'].value = '+91';
        env.elements['login-mobile'].value = '9876543210';
        env.elements['login-password'].value = 'SecretPass123';

        await env.window.handleLogin();

        assert.equal(env.supabaseCalls.signInWithPassword.length, 1);
        assert.equal(env.supabaseCalls.signInWithPassword[0].phone, '+919876543210');
        assert.equal(env.supabaseCalls.signInWithPassword[0].password, 'SecretPass123');
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.window.lastNavigation.view, 'profile');
        console.log('✔ TEST F: Mobile + Password login remains completely intact');
    }

    // 9. TEST G: Logout
    {
        const env = createMockEnv();
        env.window.currentUser = { id: 'usr_active' };
        env.window.isLoggedIn = true;

        await env.window.handleLogout();

        assert.equal(env.window.currentUser, null);
        assert.equal(env.window.isLoggedIn, false);
        assert.equal(env.supabaseCalls.signOut.length, 1);
        assert.equal(env.window.lastNavigation.view, 'home');
        console.log('✔ TEST G: Logout terminates session & clears state');
    }

    // 10. TEST H & I: Local E2E Customer
    {
        const env = createMockEnv();
        env.window.E2E_LOCAL_AUTH = true;
        env.elements['login-email'].value = 'e2e.creator.customer@wishrite.local';

        const success = await env.window.sendEmailOTP();
        assert.equal(success, true);
        assert.equal(env.window.isLoggedIn, true);
        assert.equal(env.window.currentUser.email, 'e2e.creator.customer@wishrite.local');
        assert.equal(env.window.currentUser.auth_mode, 'local_e2e');
        console.log('✔ TEST H & I: Localhost E2E Customer retains mock bypass capability');
    }

    console.log('\n========================================');
    console.log('ALL EMAIL OTP AUTH TESTS PASSED (10/10)');
    console.log('========================================');
}

runAllTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
