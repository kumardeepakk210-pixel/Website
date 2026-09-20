/* ============================================
   WISHRITE — CUSTOMER AUTHENTICATION
   Email + Mobile + Password
   Email verification intentionally disabled
   ============================================ */

let isLoggedIn = false;
let currentUser = null;

// ─────────────────────────────────────────────
// Supabase Client
// ─────────────────────────────────────────────

window.supabaseClient =
    (window.supabase &&
        (window.SUPABASE_URL || typeof SUPABASE_URL !== 'undefined') &&
        (window.SUPABASE_ANON_KEY || typeof SUPABASE_ANON_KEY !== 'undefined'))
        ? window.supabase.createClient(
            window.SUPABASE_URL ||
            (typeof SUPABASE_URL !== 'undefined'
                ? SUPABASE_URL
                : 'https://ptpuepejciqiktmcpuon.supabase.co'),

            window.SUPABASE_ANON_KEY ||
            (typeof SUPABASE_ANON_KEY !== 'undefined'
                ? SUPABASE_ANON_KEY
                : 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX'),

            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false
                }
            }
        )
        : null;

const supabaseClient = window.supabaseClient;


// ─────────────────────────────────────────────
// Error Messages
// ─────────────────────────────────────────────

function getFriendlyAuthErrorMessage(rawMessage) {
    if (!rawMessage) {
        return 'An unexpected error occurred. Please try again.';
    }

    const msg = String(rawMessage).toLowerCase();

    if (
        msg.includes('user already registered') ||
        msg.includes('already exists')
    ) {
        return 'An account with these details already exists. Please sign in.';
    }

    if (
        msg.includes('invalid login credentials') ||
        msg.includes('invalid credentials')
    ) {
        return 'Invalid email/mobile number or password.';
    }

    if (
        msg.includes('password should be at least 6 characters') ||
        msg.includes('weak password')
    ) {
        return 'Password must be at least 6 characters long.';
    }

    if (
        msg.includes('network') ||
        msg.includes('failed to fetch')
    ) {
        return 'Network connection error. Please check your internet connection.';
    }

    return rawMessage;
}


// ─────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────

function setAuthMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.innerText = message;
    element.className = `auth-message ${type}`;
}


function getPhoneNumber(countryCode, inputId) {
    const el = document.getElementById(inputId);

    const number = el
        ? el.value.trim().replace(/\D/g, '')
        : '';

    return {
        number,
        phone: `${countryCode}${number}`
    };
}


// ─────────────────────────────────────────────
// Login Method Switch
// ─────────────────────────────────────────────

function switchLoginMethod(method) {
    const emailMode = method === 'email';

    const emailField =
        document.getElementById('email-login-field');

    const mobileField =
        document.getElementById('mobile-login-field');

    const emailInput =
        document.getElementById('login-email');

    const mobileInput =
        document.getElementById('login-mobile');

    const emailTab =
        document.getElementById('email-login-tab');

    const mobileTab =
        document.getElementById('mobile-login-tab');


    if (emailField) {
        emailField.style.display =
            emailMode ? 'block' : 'none';
    }

    if (mobileField) {
        mobileField.style.display =
            emailMode ? 'none' : 'block';
    }

    if (emailInput) {
        emailInput.required = emailMode;
    }

    if (mobileInput) {
        mobileInput.required = !emailMode;
    }

    if (emailTab) {
        emailTab.classList.toggle('active', emailMode);
    }

    if (mobileTab) {
        mobileTab.classList.toggle('active', !emailMode);
    }

    setAuthMessage('login-message', '');
}


// ─────────────────────────────────────────────
// Header User Menu
// ─────────────────────────────────────────────

function updateAuthDropdown() {
    const dropdown =
        document.getElementById('user-dropdown');

    if (!dropdown) return;

    dropdown.innerHTML = isLoggedIn
        ? `
            <a onclick="navigateTo('profile')">My Account</a>
            <a onclick="handleLogout()">Sign Out</a>
          `
        : `
            <a onclick="navigateTo('login')">Login</a>
            <a onclick="navigateTo('register')">Register</a>
          `;
}


function toggleUserDropdown(event) {
    if (event) {
        event.stopPropagation();
    }

    const dropdown =
        document.getElementById('user-dropdown');

    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}


// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

async function handleLogin(e) {
    if (e) e.preventDefault();

    setAuthMessage('login-message', '');

    if (!supabaseClient) {
        setAuthMessage(
            'login-message',
            'Authentication service is unavailable.',
            'error'
        );
        return;
    }

    const emailMode =
        document.getElementById('email-login-field')
            ?.style.display !== 'none';

    const password =
        document.getElementById('login-password')
            ?.value || '';

    const submitBtn =
        document.getElementById('login-submit-btn');


    if (!password) {
        setAuthMessage(
            'login-message',
            'Please enter your password.',
            'error'
        );
        return;
    }


    let credentials;


    // EMAIL LOGIN
    if (emailMode) {

        const email =
            document.getElementById('login-email')
                ?.value
                ?.trim()
                .toLowerCase();

        if (!email) {
            setAuthMessage(
                'login-message',
                'Please enter your email address.',
                'error'
            );
            return;
        }

        credentials = {
            email,
            password
        };
    }


    // MOBILE LOGIN
    else {

        const mobileData = getPhoneNumber(
            document.getElementById('login-country-code')
                ?.value || '+91',
            'login-mobile'
        );

        if (mobileData.number.length !== 10) {
            setAuthMessage(
                'login-message',
                'Enter a valid 10-digit mobile number.',
                'error'
            );
            return;
        }

        credentials = {
            phone: mobileData.phone,
            password
        };
    }


    try {

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Signing In...';
        }

        setAuthMessage(
            'login-message',
            'Signing you in...'
        );


        const {
            data,
            error
        } = await supabaseClient.auth.signInWithPassword(
            credentials
        );


        if (error) {
            setAuthMessage(
                'login-message',
                getFriendlyAuthErrorMessage(error.message),
                'error'
            );
            return;
        }


        currentUser = data?.user || null;
        isLoggedIn = !!currentUser;

        updateAuthDropdown();

        if (currentUser) {
            await syncCustomerProfile(currentUser);
        }

        setAuthMessage('login-message', '');

        if (typeof showToast === 'function') {
            showToast(
                'Welcome back to WishRite!',
                'success'
            );
        }

        navigateTo('profile');

    } catch (err) {

        console.error('Login error:', err);

        setAuthMessage(
            'login-message',
            getFriendlyAuthErrorMessage(err.message),
            'error'
        );

    } finally {

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In';
        }
    }
}


// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

async function handleRegister(e) {
    if (e) e.preventDefault();

    const name =
        document.getElementById('register-name')
            ?.value
            ?.trim();

    const email =
        document.getElementById('register-email')
            ?.value
            ?.trim()
            ?.toLowerCase();

    const mobileData = getPhoneNumber(
        document.getElementById('register-country-code')
            ?.value || '+91',
        'register-mobile'
    );

    const password =
        document.getElementById('register-password')
            ?.value || '';

    const submitBtn =
        document.getElementById('register-submit-btn');


    // VALIDATION

    if (!name) {
        setAuthMessage(
            'register-message',
            'Please enter your full name.',
            'error'
        );
        return;
    }

    if (!email || !email.includes('@')) {
        setAuthMessage(
            'register-message',
            'Please enter a valid email address.',
            'error'
        );
        return;
    }

    if (mobileData.number.length !== 10) {
        setAuthMessage(
            'register-message',
            'Please enter a valid 10-digit mobile number.',
            'error'
        );
        return;
    }

    if (password.length < 6) {
        setAuthMessage(
            'register-message',
            'Password must be at least 6 characters long.',
            'error'
        );
        return;
    }


    if (!supabaseClient) {
        setAuthMessage(
            'register-message',
            'Authentication service is unavailable.',
            'error'
        );
        return;
    }


    try {

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Creating Account...';
        }

        setAuthMessage(
            'register-message',
            'Creating your WishRite account...'
        );


        /*
         * IMPORTANT:
         *
         * Confirm Email must be OFF in Supabase.
         *
         * That allows signUp() to return a session
         * immediately without sending a verification email.
         */

        const {
            data,
            error
        } = await supabaseClient.auth.signUp({

            email,

            password,

            options: {

                data: {
                    full_name: name,
                    phone: mobileData.phone
                }
            }
        });


        if (error) {
            setAuthMessage(
                'register-message',
                getFriendlyAuthErrorMessage(error.message),
                'error'
            );
            return;
        }


        currentUser = data?.user || null;

        /*
         * With Confirm Email OFF, Supabase should
         * return a session here.
         */

        if (!data?.session || !currentUser) {

            setAuthMessage(
                'register-message',
                'Account created, but automatic sign-in was not completed. Please check the Supabase Email Confirmation setting.',
                'error'
            );

            return;
        }


        isLoggedIn = true;

        /*
         * Update user's actual Supabase Auth phone number
         * via secure Supabase Edge Function.
         */
        if (mobileData.phone) {
            try {
                const { error: phoneError } =
                    await supabaseClient.functions.invoke(
                        'update-user-phone',
                        {
                            body: {
                                phone: mobileData.phone
                            }
                        }
                    );

                if (phoneError) {
                    console.warn(
                        'Could not update auth phone via edge function:',
                        phoneError.message || phoneError
                    );
                } else {
                    /*
                     * Refresh current user so currentUser.phone
                     * contains the registered mobile number.
                     */
                    const {
                        data: refreshedData
                    } = await supabaseClient.auth.getUser();

                    if (refreshedData?.user) {
                        currentUser = refreshedData.user;
                    }
                }
            } catch (phoneFnErr) {
                console.warn(
                    'Unable to update auth phone via edge function:',
                    phoneFnErr
                );
            }
        }

        /*
         * Sync customer record.
         */
        await syncCustomerProfile(currentUser);


        updateAuthDropdown();


        if (typeof showToast === 'function') {
            showToast(
                'Welcome to WishRite!',
                'success'
            );
        }


        navigateTo('profile');


    } catch (err) {

        console.error('Registration error:', err);

        setAuthMessage(
            'register-message',
            getFriendlyAuthErrorMessage(err.message),
            'error'
        );

    } finally {

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Account';
        }
    }
}


// ─────────────────────────────────────────────
// Registration Reset
// ─────────────────────────────────────────────

function resetRegistration() {

    const step1 =
        document.getElementById('register-step-1');

    if (step1) {
        step1.style.display = 'block';
    }

    setAuthMessage(
        'register-message',
        ''
    );
}


// ─────────────────────────────────────────────
// Legacy Auth Callback Compatibility
// ─────────────────────────────────────────────

async function handleAuthCallback() {

    if (!supabaseClient) {
        navigateTo('login');
        return;
    }

    try {

        const {
            data: { session }
        } = await supabaseClient.auth.getSession();

        if (session?.user) {

            currentUser = session.user;
            isLoggedIn = true;

            updateAuthDropdown();

            await syncCustomerProfile(
                session.user
            );

            navigateTo('profile');

        } else {

            navigateTo('login');

        }

        if (window.history?.replaceState) {
            window.history.replaceState(
                null,
                '',
                '/'
            );
        }

    } catch (err) {

        console.error(
            'Auth callback error:',
            err
        );

        navigateTo('login');
    }
}


// ─────────────────────────────────────────────
// Customer Profile Sync
// ─────────────────────────────────────────────

async function syncCustomerProfile(user) {

    if (
        !supabaseClient ||
        !user
    ) {
        return;
    }

    try {

        const fullName =
            user.user_metadata?.full_name || '';

        const phone =
            user.phone ||
            user.user_metadata?.phone ||
            '';


        /*
         * Email remains the customer's email.
         * Mobile remains the customer's phone.
         */

        await supabaseClient
            .from('customers')
            .upsert(
                {
                    customer_email:
                        user.email
                            ? user.email.toLowerCase()
                            : null,

                    customer_name:
                        fullName ||
                        user.email?.split('@')[0] ||
                        'Valued Customer',

                    customer_phone:
                        phone,

                    last_login_at:
                        new Date().toISOString()
                },
                {
                    onConflict:
                        'customer_email'
                }
            );

    } catch (e) {

        /*
         * Customer profile sync should never
         * prevent authentication.
         */

        console.log(
            'Customer sync info:',
            e?.message
        );
    }
}


// ─────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────

function renderProfileAccountDetails() {

    const nameEl =
        document.getElementById('account-name');

    const emailEl =
        document.getElementById('account-email');

    const mobileEl =
        document.getElementById('account-mobile');

    const statusBadge =
        document.getElementById('account-status-badge');

    const statusText =
        document.getElementById('account-status-text');


    if (!currentUser) {

        if (nameEl) {
            nameEl.innerText =
                'Guest Customer';
        }

        if (emailEl) {
            emailEl.innerText = '—';
        }

        if (statusBadge) {
            statusBadge.className =
                'status-badge verified';

            statusBadge.innerText =
                '✓ Account Active';
        }

        if (statusText) {
            statusText.innerText =
                '✓ Account Active';
        }

        return;
    }


    const email =
        currentUser.email || '';

    const phone =
        currentUser.phone ||
        currentUser.user_metadata?.phone ||
        '';

    const fullName =
        currentUser.user_metadata?.full_name ||
        email.split('@')[0] ||
        'Valued Customer';


    if (nameEl) {
        nameEl.innerText =
            fullName;
    }

    if (emailEl) {
        emailEl.innerText =
            email || '—';
    }

    if (mobileEl) {
        mobileEl.innerText = phone || '—';
    }


    if (statusBadge) {

        statusBadge.className =
            'status-badge verified';

        statusBadge.innerHTML = `
            ✓ Account Active
        `;
    }


    if (statusText) {

        statusText.innerText =
            '✓ Account Active';

        statusText.style.color =
            'var(--wr-success)';
    }
}


// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

async function handleLogout() {

    try {

        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }

    } catch (e) {

        console.warn(
            'Sign out error:',
            e
        );
    }


    isLoggedIn = false;
    currentUser = null;

    updateAuthDropdown();


    if (typeof showToast === 'function') {
        showToast(
            'Signed out successfully.',
            'info'
        );
    }


    navigateTo('home');
}


// ─────────────────────────────────────────────
// Auth Initialization
// ─────────────────────────────────────────────

async function initAuthSystem() {

    if (!supabaseClient) {
        updateAuthDropdown();
        return;
    }


    try {

        const {
            data: { session }
        } = await supabaseClient.auth.getSession();


        if (session?.user) {

            currentUser =
                session.user;

            isLoggedIn = true;

        } else {

            currentUser = null;
            isLoggedIn = false;

        }


        updateAuthDropdown();


        supabaseClient.auth.onAuthStateChange(
            async (event, session) => {

                if (session?.user) {

                    currentUser =
                        session.user;

                    isLoggedIn = true;


                    if (
                        event === 'SIGNED_IN' ||
                        event === 'USER_UPDATED'
                    ) {
                        syncCustomerProfile(
                            session.user
                        );
                    }

                } else {

                    currentUser = null;
                    isLoggedIn = false;
                }


                updateAuthDropdown();


                if (
                    typeof getCurrentView ===
                    'function' &&
                    getCurrentView() ===
                    'profile'
                ) {
                    renderProfileAccountDetails();
                }
            }
        );

    } catch (err) {

        console.error(
            'Failed to initialize Supabase auth:',
            err
        );
    }
}


// ─────────────────────────────────────────────
// Close User Dropdown
// ─────────────────────────────────────────────

document.addEventListener(
    'click',
    (e) => {

        if (
            !e.target.closest(
                '.user-menu-wrapper'
            )
        ) {

            document
                .querySelectorAll(
                    '.user-dropdown'
                )
                .forEach(
                    d =>
                        d.classList.remove(
                            'show'
                        )
                );
        }
    }
);


// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

document.addEventListener(
    'DOMContentLoaded',
    () => {
        initAuthSystem();
    }
);