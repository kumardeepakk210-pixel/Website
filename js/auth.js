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
    window.supabaseClient ||
    ((window.supabase &&
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
        : null);

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
        msg.includes('token has expired') ||
        msg.includes('otp expired') ||
        msg.includes('token is expired')
    ) {
        return 'Your verification code has expired. Please request a new code.';
    }

    if (
        msg.includes('invalid token') ||
        msg.includes('token is invalid') ||
        msg.includes('otp is invalid') ||
        msg.includes('token has expired or is invalid')
    ) {
        return 'Invalid verification code. Please try again.';
    }

    if (
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('over_email_send_rate_limit')
    ) {
        return 'Too many requests. Please wait a moment before trying again.';
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
// Email Masking Helper
// ─────────────────────────────────────────────

function maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return email || '';
    }
    const [localPart, domain] = email.split('@');
    if (!localPart) return email;
    if (localPart.length <= 1) {
        return `${localPart}*****@${domain}`;
    }
    const firstChar = localPart[0];
    return `${firstChar}*****@${domain}`;
}
window.maskEmail = maskEmail;


// ─────────────────────────────────────────────
// Login Method Switch
// ─────────────────────────────────────────────

function switchLoginMethod(method) {
    const emailMode = method === 'email';

    const emailContainer = document.getElementById('email-login-container');
    const mobileForm = document.getElementById('mobile-login-form');
    const emailTab = document.getElementById('email-login-tab');
    const mobileTab = document.getElementById('mobile-login-tab');
    const onboardingContainer = document.getElementById('email-onboarding-container');

    if (emailContainer) {
        emailContainer.style.display = emailMode ? 'block' : 'none';
    }

    if (mobileForm) {
        mobileForm.style.display = emailMode ? 'none' : 'block';
    }

    if (onboardingContainer) {
        onboardingContainer.style.display = 'none';
    }

    if (emailTab) {
        emailTab.classList.toggle('active', emailMode);
    }

    if (mobileTab) {
        mobileTab.classList.toggle('active', !emailMode);
    }

    setAuthMessage('login-message', '');
}
window.switchLoginMethod = switchLoginMethod;


// ─────────────────────────────────────────────
// Header User Menu
// ─────────────────────────────────────────────

function navigateToCreatorAccount() {
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('show'));
    if (typeof navigateTo === 'function') {
        navigateTo('profile', 'creator');
    } else {
        window.location.href = '/account';
    }
}
window.navigateToCreatorAccount = navigateToCreatorAccount;

function updateAuthDropdown() {
    const dropdown =
        document.getElementById('user-dropdown');

    if (!dropdown) return;

    dropdown.innerHTML = isLoggedIn
        ? `
            <a onclick="navigateTo('profile', 'account')" role="menuitem">My Account</a>
            <a onclick="navigateTo('profile', 'creator')" class="creator-account-link" id="user-dropdown-creator-link" role="menuitem">
                <div class="creator-menu-item">
                    <div class="creator-menu-header-row">
                        <span class="creator-menu-title">Creator Program</span>
                        <span class="creator-menu-badge">Club</span>
                    </div>
                    <span class="creator-menu-sub">Available inside My Account</span>
                </div>
            </a>
            <a onclick="navigateTo('profile', 'account'); setTimeout(() => { const o = document.getElementById('account-orders-card'); if (o) o.scrollIntoView({ behavior: 'smooth' }); }, 150);" role="menuitem">My Orders</a>
            <a onclick="navigateTo('wishlist')" role="menuitem">Wishlist</a>
            <div class="user-dropdown-divider" role="separator"></div>
            <a onclick="handleLogout()" role="menuitem">Logout</a>
          `
        : `
            <a onclick="navigateTo('login')" role="menuitem">Login</a>
            <a onclick="navigateTo('register')" role="menuitem">Register</a>
            <a onclick="navigateTo('wishlist')" role="menuitem">Wishlist</a>
            <div class="user-dropdown-divider" role="separator"></div>
            <a onclick="navigateTo('login')" class="creator-account-link" id="user-dropdown-creator-link-guest" role="menuitem">
                <div class="creator-menu-item">
                    <div class="creator-menu-header-row">
                        <span class="creator-menu-title">Creator Program</span>
                        <span class="creator-menu-badge">Club</span>
                    </div>
                    <span class="creator-menu-sub">Sign in to access Creator tab</span>
                </div>
            </a>
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
// EMAIL OTP AUTHENTICATION SYSTEM
// ─────────────────────────────────────────────

let otpTimerInterval = null;
let otpTimerSeconds = 0;
let pendingOTPEmail = '';

function startOTPTimer(duration = 45) {
    if (otpTimerInterval) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
    }

    otpTimerSeconds = duration;
    const resendBtn = document.getElementById('email-resend-otp-btn');
    const timerText = document.getElementById('otp-timer-text');

    if (resendBtn) resendBtn.disabled = true;
    if (timerText) {
        timerText.style.display = 'inline';
        timerText.innerText = `Resend in ${otpTimerSeconds}s`;
    }

    otpTimerInterval = setInterval(() => {
        otpTimerSeconds--;
        if (otpTimerSeconds <= 0) {
            clearInterval(otpTimerInterval);
            otpTimerInterval = null;
            if (resendBtn) resendBtn.disabled = false;
            if (timerText) {
                timerText.innerText = '';
                timerText.style.display = 'none';
            }
        } else {
            if (timerText) {
                timerText.innerText = `Resend in ${otpTimerSeconds}s`;
            }
        }
    }, 1000);
}

function resetEmailOTPFlow() {
    if (otpTimerInterval) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
    }

    const requestForm = document.getElementById('email-otp-request-form');
    const verifyForm = document.getElementById('email-otp-verify-form');
    const onboardingContainer = document.getElementById('email-onboarding-container');
    const emailInput = document.getElementById('login-email');

    if (requestForm) requestForm.style.display = 'block';
    if (verifyForm) verifyForm.style.display = 'none';
    if (onboardingContainer) onboardingContainer.style.display = 'none';

    // Clear OTP inputs
    for (let i = 1; i <= 6; i++) {
        const box = document.getElementById(`otp-digit-${i}`);
        if (box) {
            box.value = '';
            box.classList.remove('filled');
        }
    }

    setAuthMessage('login-message', '');
    if (emailInput) {
        emailInput.disabled = false;
        emailInput.focus();
    }
}
window.resetEmailOTPFlow = resetEmailOTPFlow;

function setupOTPInputListeners() {
    const boxes = [];
    for (let i = 1; i <= 6; i++) {
        const box = document.getElementById(`otp-digit-${i}`);
        if (box) boxes.push(box);
    }

    boxes.forEach((box, index) => {
        // Handle input (numeric only, auto-focus next)
        box.addEventListener('input', (e) => {
            const val = box.value.replace(/\D/g, '');
            box.value = val ? val[0] : '';
            if (box.value) {
                box.classList.add('filled');
                if (index < boxes.length - 1) {
                    boxes[index + 1].focus();
                }
            } else {
                box.classList.remove('filled');
            }
        });

        // Handle Backspace navigation
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                boxes[index - 1].focus();
            }
        });

        // Handle Paste of complete 6-digit OTP
        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            const digits = pasteData.replace(/\D/g, '').slice(0, 6);
            if (digits) {
                for (let i = 0; i < digits.length; i++) {
                    if (boxes[i]) {
                        boxes[i].value = digits[i];
                        boxes[i].classList.add('filled');
                    }
                }
                const nextIndex = Math.min(digits.length, boxes.length - 1);
                boxes[nextIndex].focus();
            }
        });
    });
}

function getEnteredOTP() {
    let otp = '';
    for (let i = 1; i <= 6; i++) {
        const box = document.getElementById(`otp-digit-${i}`);
        if (box) {
            otp += box.value.trim();
        }
    }
    return otp;
}

async function sendEmailOTP() {
    const emailInput = document.getElementById('login-email');
    const sendBtn = document.getElementById('email-send-otp-btn');
    const email = emailInput?.value?.trim().toLowerCase();

    setAuthMessage('login-message', '');

    if (!email || !email.includes('@') || !email.includes('.')) {
        setAuthMessage('login-message', 'Please enter a valid email address.', 'error');
        return false;
    }

    // --- LOCAL E2E TEST LOGIN INTERCEPTOR ---
    const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isE2EAuthEnabled = (window.E2E_LOCAL_AUTH === true || window.E2E_LOCAL_AUTH === 'true');

    if (isLocalHost && isE2EAuthEnabled && email === 'e2e.creator.customer@wishrite.local') {
        const localE2ESession = {
            auth_mode: 'local_e2e',
            customer_id: 'local-e2e-customer-id',
            customer_name: 'E2E Creator Customer',
            customer_email: 'e2e.creator.customer@wishrite.local'
        };

        try {
            localStorage.setItem('wishrite_local_e2e_session', JSON.stringify(localE2ESession));
            sessionStorage.setItem('wishrite_local_e2e_session', JSON.stringify(localE2ESession));
        } catch (_) {}

        currentUser = {
            id: localE2ESession.customer_id,
            email: localE2ESession.customer_email,
            phone: '',
            auth_mode: 'local_e2e',
            user_metadata: {
                full_name: localE2ESession.customer_name
            }
        };
        isLoggedIn = true;

        window.currentCustomerProfile = {
            id: localE2ESession.customer_id,
            customerId: localE2ESession.customer_id,
            name: localE2ESession.customer_name,
            phone: '',
            email: localE2ESession.customer_email,
            auth_mode: 'local_e2e'
        };

        updateAuthDropdown();
        setAuthMessage('login-message', '');

        if (typeof showToast === 'function') {
            showToast('Welcome back, E2E Creator Customer!', 'success');
        }

        if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        return true;
    }

    if (!supabaseClient) {
        setAuthMessage('login-message', 'Authentication service is unavailable.', 'error');
        return false;
    }

    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerText = 'Sending Code...';
        }

        const { data, error } = await supabaseClient.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true
            }
        });

        if (error) {
            setAuthMessage('login-message', getFriendlyAuthErrorMessage(error.message), 'error');
            return false;
        }

        pendingOTPEmail = email;

        // Transition to OTP verification state
        const requestForm = document.getElementById('email-otp-request-form');
        const verifyForm = document.getElementById('email-otp-verify-form');
        const maskedEmailSpan = document.getElementById('otp-masked-email');

        if (requestForm) requestForm.style.display = 'none';
        if (verifyForm) verifyForm.style.display = 'block';
        if (maskedEmailSpan) maskedEmailSpan.innerText = maskEmail(email);

        startOTPTimer(45);
        setupOTPInputListeners();

        // Focus first OTP input
        const firstBox = document.getElementById('otp-digit-1');
        if (firstBox) firstBox.focus();

        setAuthMessage('login-message', `Verification code sent to ${maskEmail(email)}`, 'success');
        return true;

    } catch (err) {
        console.error('sendEmailOTP exception:', err);
        setAuthMessage('login-message', getFriendlyAuthErrorMessage(err.message), 'error');
        return false;
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerText = 'Send OTP';
        }
    }
}
window.sendEmailOTP = sendEmailOTP;

async function handleSendEmailOTP(e) {
    if (e) e.preventDefault();
    await sendEmailOTP();
}
window.handleSendEmailOTP = handleSendEmailOTP;

async function resendEmailOTP() {
    const email = pendingOTPEmail || document.getElementById('login-email')?.value?.trim().toLowerCase();
    if (!email) {
        setAuthMessage('login-message', 'Please enter your email address first.', 'error');
        return;
    }

    const resendBtn = document.getElementById('email-resend-otp-btn');
    if (resendBtn) resendBtn.disabled = true;

    setAuthMessage('login-message', 'Sending new code...');

    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true
            }
        });

        if (error) {
            setAuthMessage('login-message', getFriendlyAuthErrorMessage(error.message), 'error');
            if (resendBtn) resendBtn.disabled = false;
            return;
        }

        startOTPTimer(45);
        setAuthMessage('login-message', `New code sent to ${maskEmail(email)}`, 'success');

        // Clear boxes & focus first
        for (let i = 1; i <= 6; i++) {
            const box = document.getElementById(`otp-digit-${i}`);
            if (box) {
                box.value = '';
                box.classList.remove('filled');
            }
        }
        const firstBox = document.getElementById('otp-digit-1');
        if (firstBox) firstBox.focus();

    } catch (err) {
        setAuthMessage('login-message', getFriendlyAuthErrorMessage(err.message), 'error');
        if (resendBtn) resendBtn.disabled = false;
    }
}
window.resendEmailOTP = resendEmailOTP;

async function verifyEmailOTP() {
    const email = pendingOTPEmail || document.getElementById('login-email')?.value?.trim().toLowerCase();
    const otp = getEnteredOTP();
    const verifyBtn = document.getElementById('email-verify-otp-btn');

    setAuthMessage('login-message', '');

    if (!email) {
        setAuthMessage('login-message', 'Missing email address. Please start over.', 'error');
        return false;
    }

    if (!otp || otp.length !== 6) {
        setAuthMessage('login-message', 'Please enter the complete 6-digit code.', 'error');
        return false;
    }

    if (!supabaseClient) {
        setAuthMessage('login-message', 'Authentication service is unavailable.', 'error');
        return false;
    }

    try {
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.innerText = 'Verifying...';
        }

        setAuthMessage('login-message', 'Verifying code...');

        const { data, error } = await supabaseClient.auth.verifyOtp({
            email,
            token: otp,
            type: 'email'
        });

        if (error) {
            setAuthMessage('login-message', getFriendlyAuthErrorMessage(error.message), 'error');
            return false;
        }

        currentUser = data?.user || null;
        isLoggedIn = !!currentUser;

        if (!currentUser) {
            setAuthMessage('login-message', 'Verification succeeded, but session could not be established.', 'error');
            return false;
        }

        if (otpTimerInterval) {
            clearInterval(otpTimerInterval);
            otpTimerInterval = null;
        }

        updateAuthDropdown();

        // Check if customer profile exists
        let customerRecord = null;
        if (currentUser.id) {
            const { data: byUid } = await supabaseClient
                .from('customers')
                .select('id, user_id, customer_email, customer_phone, customer_name')
                .eq('user_id', currentUser.id)
                .maybeSingle();
            customerRecord = byUid;
        }

        if (!customerRecord && email) {
            const { data: byEmail } = await supabaseClient
                .from('customers')
                .select('id, user_id, customer_email, customer_phone, customer_name')
                .ilike('customer_email', email)
                .maybeSingle();
            customerRecord = byEmail;
        }

        // If user is brand new and has no customer record or missing name/phone, show onboarding step
        const isNewUser = !customerRecord || (!customerRecord.customer_name || customerRecord.customer_name === 'Valued Customer');

        if (isNewUser) {
            // Show Onboarding step
            const emailContainer = document.getElementById('email-login-container');
            const onboardingContainer = document.getElementById('email-onboarding-container');

            if (emailContainer) emailContainer.style.display = 'none';
            if (onboardingContainer) {
                onboardingContainer.style.display = 'block';
                const nameInput = document.getElementById('onboarding-name');
                if (nameInput) {
                    nameInput.value = currentUser.user_metadata?.full_name || '';
                    nameInput.focus();
                }
                const phoneInput = document.getElementById('onboarding-mobile');
                if (phoneInput) {
                    phoneInput.value = (currentUser.phone || currentUser.user_metadata?.phone || '').replace(/^\+91/, '');
                }
            }
            setAuthMessage('login-message', '');
            return true;
        }

        // Existing customer: sync customer profile directly without onboarding
        await syncCustomerProfile(currentUser);

        setAuthMessage('login-message', '');

        if (typeof showToast === 'function') {
            showToast('Welcome back to WishRite!', 'success');
        }

        if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }

        return true;

    } catch (err) {
        console.error('verifyEmailOTP error:', err);
        setAuthMessage('login-message', getFriendlyAuthErrorMessage(err.message), 'error');
        return false;
    } finally {
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.innerText = 'Verify & Sign In';
        }
    }
}
window.verifyEmailOTP = verifyEmailOTP;

async function handleVerifyEmailOTP(e) {
    if (e) e.preventDefault();
    await verifyEmailOTP();
}
window.handleVerifyEmailOTP = handleVerifyEmailOTP;

async function handleEmailOnboardingSubmit(e) {
    if (e) e.preventDefault();
    if (!currentUser) {
        setAuthMessage('login-message', 'Authentication session expired. Please sign in again.', 'error');
        return;
    }

    const name = document.getElementById('onboarding-name')?.value?.trim();
    const countryCode = document.getElementById('onboarding-country-code')?.value || '+91';
    const mobileRaw = document.getElementById('onboarding-mobile')?.value?.trim().replace(/\D/g, '') || '';
    const referralCode = document.getElementById('onboarding-referral-code')?.value?.trim().toUpperCase() || '';
    const submitBtn = document.getElementById('onboarding-submit-btn');

    if (!name) {
        setAuthMessage('login-message', 'Please enter your full name.', 'error');
        return;
    }

    const phone = mobileRaw.length === 10 ? `${countryCode}${mobileRaw}` : '';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Saving Profile...';
        }

        // Update auth metadata if available
        try {
            await supabaseClient.auth.updateUser({
                data: {
                    full_name: name,
                    ...(phone ? { phone } : {})
                }
            });
        } catch (_) {}

        // Sync customer profile with provided full name & phone
        await syncCustomerProfile(currentUser, {
            fullName: name,
            phone: phone
        });

        // Record referral if provided
        if (referralCode && currentUser?.id) {
            try {
                await supabaseClient.rpc('record_customer_referral', {
                    p_referred_user_id: currentUser.id,
                    p_referral_code: referralCode
                });
            } catch (refEx) {
                console.warn('[Referral Onboarding] Exception:', refEx);
            }
        }

        if (typeof WishRiteWalletRewards !== 'undefined') {
            await WishRiteWalletRewards.syncUser(currentUser);
        }

        updateAuthDropdown();

        if (typeof showToast === 'function') {
            showToast('Welcome to WishRite!', 'success');
        }

        if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }

    } catch (err) {
        console.error('handleEmailOnboardingSubmit error:', err);
        setAuthMessage('login-message', getFriendlyAuthErrorMessage(err.message), 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Save & Continue';
        }
    }
}
window.handleEmailOnboardingSubmit = handleEmailOnboardingSubmit;


// ─────────────────────────────────────────────
// MOBILE LOGIN (PASSWORD-BASED)
// ─────────────────────────────────────────────

async function handleLogin(e) {
    if (e) e.preventDefault();

    setAuthMessage('login-message', '');

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

    const credentials = {
        phone: mobileData.phone,
        password
    };

    if (!supabaseClient) {
        setAuthMessage(
            'login-message',
            'Authentication service is unavailable.',
            'error'
        );
        return;
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

        if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        }

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
window.handleLogin = handleLogin;


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

    const referralCode =
        document.getElementById('register-referral-code')
            ?.value
            ?.trim()
            ?.toUpperCase() || '';

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
        await syncCustomerProfile(currentUser, {
            fullName: name,
            phone: mobileData.phone
        });

        /*
         * Link referral if code was entered.
         */
        if (referralCode && currentUser?.id) {
            try {
                const { data: refData, error: refErr } = await supabaseClient.rpc(
                    'record_customer_referral',
                    {
                        p_referred_user_id: currentUser.id,
                        p_referral_code: referralCode
                    }
                );
                if (refErr) {
                    console.warn('[Referral Registration] Notice:', refErr.message);
                } else {
                    console.log('[Referral Registration] Referral recorded:', refData);
                }
            } catch (refEx) {
                console.warn('[Referral Registration] Exception:', refEx);
            }
        }

        if (typeof WishRiteWalletRewards !== 'undefined') {
            await WishRiteWalletRewards.syncUser(currentUser);
        }

        updateAuthDropdown();


        if (typeof showToast === 'function') {
            showToast(
                'Welcome to WishRite!',
                'success'
            );
        }


        if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        }


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

            if (typeof navigateTo === 'function') {
            if (typeof navigateTo === 'function') {
            navigateTo('profile');
        } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
            window.navigateTo('profile');
        }
        }

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

async function syncCustomerProfile(user, extraData = {}) {
    if (!supabaseClient || !user) {
        return;
    }

    try {
        const email = user.email ? user.email.toLowerCase().trim() : null;
        const fullName =
            extraData.fullName ||
            user.user_metadata?.full_name ||
            '';

        const phone =
            extraData.phone ||
            user.phone ||
            user.user_metadata?.phone ||
            '';

        const now = new Date().toISOString();

        // 1. Check if customer record exists for this user_id
        let existingCustomer = null;

        if (user.id) {
            const { data: byUserId, error: errUserId } = await supabaseClient
                .from('customers')
                .select('id, user_id, customer_email, customer_phone, customer_name')
                .eq('user_id', user.id)
                .maybeSingle();

            if (!errUserId && byUserId) {
                existingCustomer = byUserId;
            }
        }

        // 2. If not found by user_id, check by customer_email (case-insensitive)
        if (!existingCustomer && email) {
            const { data: byEmail, error: errEmail } = await supabaseClient
                .from('customers')
                .select('id, user_id, customer_email, customer_phone, customer_name')
                .ilike('customer_email', email)
                .maybeSingle();

            if (!errEmail && byEmail) {
                existingCustomer = byEmail;
            }
        }

        let savedCustomer = null;

        if (existingCustomer?.id) {
            // Update existing customer record
            const updatePayload = {
                user_id: user.id,
                last_login_at: now,
                updated_at: now
            };

            if (email && (!existingCustomer.customer_email || existingCustomer.customer_email.toLowerCase() !== email)) {
                updatePayload.customer_email = email;
            }

            if (fullName && (!existingCustomer.customer_name || existingCustomer.customer_name === 'Valued Customer')) {
                updatePayload.customer_name = fullName;
            }

            if (phone && !existingCustomer.customer_phone) {
                updatePayload.customer_phone = phone;
            }

            const { data: updated, error: updateErr } = await supabaseClient
                .from('customers')
                .update(updatePayload)
                .eq('id', existingCustomer.id)
                .select()
                .maybeSingle();

            if (updateErr) {
                console.error('[Customer Sync] Update error:', updateErr.message);
            } else {
                savedCustomer = updated || existingCustomer;
                console.log('[Customer Sync] Updated customer profile:', savedCustomer?.id);
            }
        } else {
            // Insert new customer record
            const insertPayload = {
                user_id: user.id,
                customer_email: email,
                customer_name: fullName || (email ? email.split('@')[0] : 'Valued Customer'),
                customer_phone: phone || null,
                last_login_at: now,
                created_at: now,
                updated_at: now
            };

            const { data: inserted, error: insertErr } = await supabaseClient
                .from('customers')
                .insert(insertPayload)
                .select()
                .maybeSingle();

            if (insertErr) {
                console.error('[Customer Sync] Insert error:', insertErr.message);
            } else {
                savedCustomer = inserted;
                console.log('[Customer Sync] Created new customer profile:', savedCustomer?.id);
            }
        }

        window.currentCustomerProfile = {
            id: user.id,
            customerId: savedCustomer?.id || existingCustomer?.id || null,
            name: fullName || savedCustomer?.customer_name || user.email?.split('@')[0] || '',
            phone: phone || savedCustomer?.customer_phone || '',
            email: email || ''
        };

        if (typeof WishRiteWalletRewards !== 'undefined') {
            WishRiteWalletRewards.syncUser(user);
        }

    } catch (e) {
        console.error('[Customer Sync] Exception:', e);
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

    // Render WishRite Wallet, Points & Referral system
    if (typeof WishRiteWalletRewards !== 'undefined' && currentUser) {
        if (currentUser.auth_mode === 'local_e2e') {
            WishRiteWalletRewards.resetState();
        } else {
            WishRiteWalletRewards.syncUser(currentUser);
        }
        WishRiteWalletRewards.renderAccountSection();
    }

    // Render Customer Order History
    renderCustomerOrderHistory(currentUser);
}

// ─────────────────────────────────────────────
// Customer Order History
// ─────────────────────────────────────────────

async function renderCustomerOrderHistory(user) {
    const ordersListEl = document.getElementById('account-orders-list');
    const emptyNotice = document.getElementById('account-orders-empty');
    if (!ordersListEl) return;

    if (!user || !supabaseClient) {
        if (emptyNotice) emptyNotice.style.display = 'block';
        ordersListEl.innerHTML = '';
        return;
    }

    try {
        const emailFilter = user.email ? user.email.toLowerCase() : '';
        let query = supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (emailFilter) {
            query = query.eq('customer_email', emailFilter);
        } else {
            if (emptyNotice) emptyNotice.style.display = 'block';
            ordersListEl.innerHTML = '';
            return;
        }

        const queryPromise = query;
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Orders query timeout')), 4000));
        const { data: orders, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (error || !orders || !orders.length) {
            if (emptyNotice) emptyNotice.style.display = 'block';
            ordersListEl.innerHTML = '';
            return;
        }

        if (emptyNotice) emptyNotice.style.display = 'none';

        ordersListEl.innerHTML = orders.map(ord => {
            const dateStr = new Date(ord.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            const grandTotal = Number(ord.grand_total || 0).toLocaleString('en-IN');
            const status = (ord.order_status || 'processing').toUpperCase();
            const pointsEarned = Number(ord.purchase_points_awarded || 0);
            const pointsUsed = Number(ord.points_redeemed || 0);
            const walletUsed = Number(ord.wallet_amount_used || 0);

            return `
                <div class="account-order-item" style="border:1px solid var(--wr-silver-mist); border-radius:var(--radius-lg); padding:16px; margin-bottom:12px; background:var(--wr-white); box-shadow:var(--shadow-xs);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                        <div>
                            <strong style="color:var(--wr-midnight); font-size:1.05rem;">Order #${ord.order_number || ord.id.slice(0, 8)}</strong>
                            <div style="font-size:0.82rem; color:var(--wr-text-muted); margin-top:2px;">Placed on ${dateStr}</div>
                        </div>
                        <div style="text-align:right;">
                            <span class="status-badge" style="background:#FFF; border:1px solid var(--wr-silver-mist); font-size:0.75rem; padding:4px 10px;">
                                ${status}
                            </span>
                            <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:700; color:var(--wr-midnight); margin-top:4px;">
                                ₹${grandTotal}
                            </div>
                        </div>
                    </div>

                    <!-- Rewards & Wallet Summary Badges -->
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; padding-top:10px; border-top:1px dashed var(--wr-border-light);">
                        ${pointsEarned > 0 ? `
                            <span style="font-size:0.78rem; background:rgba(85, 68, 83, 0.1); color:var(--wr-plum); padding:3px 8px; border-radius:4px; font-weight:600;">
                                ✨ +${pointsEarned} Points Earned
                            </span>
                        ` : ''}
                        ${pointsUsed > 0 ? `
                            <span style="font-size:0.78rem; background:rgba(40, 33, 44, 0.06); color:var(--wr-midnight); padding:3px 8px; border-radius:4px; font-weight:600;">
                                🪙 ${pointsUsed} Points Used (-₹${pointsUsed})
                            </span>
                        ` : ''}
                        ${walletUsed > 0 ? `
                            <span style="font-size:0.78rem; background:rgba(24, 121, 78, 0.1); color:var(--wr-success); padding:3px 8px; border-radius:4px; font-weight:600;">
                                💳 ₹${walletUsed} Paid via Wallet
                            </span>
                        ` : ''}
                        <span style="font-size:0.78rem; color:var(--wr-text-muted); margin-left:auto;">
                            Payment: <strong>${(ord.payment_method || 'online').toUpperCase()}</strong> (${(ord.payment_status || 'pending').toUpperCase()})
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (ordErr) {
        console.warn('Could not render order history:', ordErr.message);
    }
}


// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

async function handleLogout() {
    const isLocalE2E = (currentUser?.auth_mode === 'local_e2e');
    try {
        localStorage.removeItem('wishrite_local_e2e_session');
        sessionStorage.removeItem('wishrite_local_e2e_session');
        localStorage.removeItem('wishrite_creator_token');
        window.currentCustomerProfile = null;
    } catch (_) {}

    try {

        if (!isLocalE2E && supabaseClient) {
            await supabaseClient.auth.signOut();
        }

    } catch (e) {

        console.warn(
            'Sign out error:',
            e
        );
    }

    if (typeof WishRiteWalletRewards !== 'undefined') {
        WishRiteWalletRewards.resetState();
    }

    isLoggedIn = false;
    currentUser = null;

    if (typeof resetEmailOTPFlow === 'function') {
        resetEmailOTPFlow();
    }

    updateAuthDropdown();


    if (typeof showToast === 'function') {
        showToast(
            'Signed out successfully.',
            'info'
        );
    }


    if (typeof navigateTo === 'function') {
        navigateTo('home');
    } else if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
        window.navigateTo('home');
    }
}


// ─────────────────────────────────────────────
// Auth Initialization
// ─────────────────────────────────────────────

async function initAuthSystem() {
    // Check Local E2E session on localhost
    const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isE2EAuthEnabled = (window.E2E_LOCAL_AUTH === true || window.E2E_LOCAL_AUTH === 'true');

    if (isLocalHost && isE2EAuthEnabled) {
        let storedE2E = null;
        try {
            storedE2E = localStorage.getItem('wishrite_local_e2e_session') || sessionStorage.getItem('wishrite_local_e2e_session');
        } catch (_) {}

        if (storedE2E) {
            try {
                const parsed = JSON.parse(storedE2E);
                if (parsed && parsed.auth_mode === 'local_e2e' && parsed.customer_email === 'e2e.creator.customer@wishrite.local') {
                    currentUser = {
                        id: parsed.customer_id,
                        email: parsed.customer_email,
                        phone: '',
                        auth_mode: 'local_e2e',
                        user_metadata: {
                            full_name: parsed.customer_name
                        }
                    };
                    isLoggedIn = true;

                    window.currentCustomerProfile = {
                        id: parsed.customer_id,
                        customerId: parsed.customer_id,
                        name: parsed.customer_name,
                        phone: '',
                        email: parsed.customer_email,
                        auth_mode: 'local_e2e'
                    };

                    updateAuthDropdown();
                    return;
                }
            } catch (_) {}
        }
    }

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
                if (currentUser?.auth_mode === 'local_e2e') {
                    return;
                }

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

window.getWishriteAuthUser = function() {
    window.currentUser = currentUser;
    return currentUser;
};
try {
    Object.defineProperty(window, 'currentUser', {
        get: () => currentUser,
        set: (val) => { currentUser = val; },
        configurable: true
    });
} catch (_) {}

window.getWishriteCustomerProfile = function() {
    if (window.currentCustomerProfile) {
        return window.currentCustomerProfile;
    }
    if (!currentUser) return null;
    const email = currentUser.email || '';
    const phone = (currentUser.phone || currentUser.user_metadata?.phone || '').replace(/^\+91/, '').trim();
    const fullName = currentUser.user_metadata?.full_name || '';
    return {
        id: currentUser.id,
        name: fullName,
        phone: phone,
        email: email
    };
};

window.handleLogout = handleLogout;
window.initAuthSystem = initAuthSystem;
window.syncCustomerProfile = syncCustomerProfile;
try {
    Object.defineProperty(window, 'isLoggedIn', {
        get: () => isLoggedIn,
        set: (val) => { isLoggedIn = val; },
        configurable: true
    });
} catch (_) {}
