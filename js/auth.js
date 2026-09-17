/* ============================================
   WISHRITE — AUTHENTICATION & EMAIL VERIFICATION
   Complete Supabase Email Verification System
   ============================================ */

let isLoggedIn = false;
let currentUser = null;
let pendingRegistrationEmail = '';
let resendCooldownTimer = null;
let resendCooldownSeconds = 0;

// Initialize Supabase Client with Session Persistence
window.supabaseClient = (window.supabase && (window.SUPABASE_URL || typeof SUPABASE_URL !== 'undefined') && (window.SUPABASE_ANON_KEY || typeof SUPABASE_ANON_KEY !== 'undefined')) ?
    window.supabase.createClient(window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://ptpuepejciqiktmcpuon.supabase.co'), window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX'), {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }) : null;
const supabaseClient = window.supabaseClient;

// ── Customer-friendly Error Mapping ──
function getFriendlyAuthErrorMessage(rawMessage) {
    if (!rawMessage) return 'An unexpected error occurred. Please try again.';
    const msg = String(rawMessage).toLowerCase();

    if (msg.includes('email not confirmed')) {
        return 'Please verify your email address before signing in.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
        return 'An account with this email already exists. Please sign in or reset your password.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return 'Invalid email or password. Please verify your credentials and try again.';
    }
    if (msg.includes('password should be at least 6 characters') || msg.includes('weak password')) {
        return 'Password must be at least 6 characters long.';
    }
    if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('over_email_send_rate_limit')) {
        return 'Too many email requests sent. Please wait a few moments before trying again.';
    }
    if (msg.includes('otp expired') || msg.includes('token expired') || msg.includes('expired')) {
        return 'The verification link has expired. Please request a new verification email.';
    }
    if (msg.includes('invalid token') || msg.includes('token has expired or is invalid')) {
        return 'This verification link is invalid or has already been used. Please request a new one.';
    }
    if (msg.includes('network') || msg.includes('failed to fetch')) {
        return 'Network connection error. Please check your internet connection and try again.';
    }

    return rawMessage;
}

// ── UI Helper Functions ──
function setAuthMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerText = message;
    element.className = `auth-message ${type}`;
}

function getPhoneNumber(countryCode, inputId) {
    const el = document.getElementById(inputId);
    const number = el ? el.value.trim().replace(/\D/g, '') : '';
    return { number, phone: `${countryCode}${number}` };
}

function switchLoginMethod(method) {
    const emailMode = method === 'email';
    const emailField = document.getElementById('email-login-field');
    const mobileField = document.getElementById('mobile-login-field');
    const emailInput = document.getElementById('login-email');
    const mobileInput = document.getElementById('login-mobile');
    const emailTab = document.getElementById('email-login-tab');
    const mobileTab = document.getElementById('mobile-login-tab');

    if (emailField) emailField.style.display = emailMode ? 'block' : 'none';
    if (mobileField) mobileField.style.display = emailMode ? 'none' : 'block';
    if (emailInput) emailInput.required = emailMode;
    if (mobileInput) mobileInput.required = !emailMode;
    if (emailTab) emailTab.classList.toggle('active', emailMode);
    if (mobileTab) mobileTab.classList.toggle('active', !emailMode);

    // Hide any previous unverified warning
    const unverifiedBox = document.getElementById('login-unverified-box');
    if (unverifiedBox) unverifiedBox.style.display = 'none';
    setAuthMessage('login-message', '');
}

function updateAuthDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = isLoggedIn ?
        `<a onclick="navigateTo('profile')">My Account</a><a onclick="handleLogout()">Sign Out</a>` :
        `<a onclick="navigateTo('login')">Login</a><a onclick="navigateTo('register')">Register</a>`;
}

function toggleUserDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

// ── Resend Verification Flow with 60-Second Cooldown ──
function getResendRedirectUrl() {
    return `${window.location.origin}/auth/callback`;
}

function startResendCooldown(seconds = 60) {
    resendCooldownSeconds = seconds;
    sessionStorage.setItem('wishrite_resend_cooldown_until', String(Date.now() + (seconds * 1000)));

    clearInterval(resendCooldownTimer);
    updateResendButtonsUI();

    resendCooldownTimer = setInterval(() => {
        resendCooldownSeconds--;
        if (resendCooldownSeconds <= 0) {
            clearInterval(resendCooldownTimer);
            resendCooldownSeconds = 0;
            sessionStorage.removeItem('wishrite_resend_cooldown_until');
        }
        updateResendButtonsUI();
    }, 1000);
}

function initResendCooldownFromStorage() {
    const savedUntil = sessionStorage.getItem('wishrite_resend_cooldown_until');
    if (savedUntil) {
        const remainingMs = parseInt(savedUntil, 10) - Date.now();
        if (remainingMs > 0) {
            startResendCooldown(Math.ceil(remainingMs / 1000));
        } else {
            sessionStorage.removeItem('wishrite_resend_cooldown_until');
        }
    }
}

function updateResendButtonsUI() {
    const isCoolingDown = resendCooldownSeconds > 0;
    const cooldownText = isCoolingDown ? `Resend available in ${resendCooldownSeconds}s` : 'Resend verification email';

    // 1. Register Card Resend Button
    const regBtn = document.getElementById('register-resend-btn');
    if (regBtn) {
        regBtn.disabled = isCoolingDown;
        regBtn.innerText = cooldownText;
    }

    // 2. Login Unverified Alert Resend Button
    const loginResendBtn = document.getElementById('login-resend-btn');
    if (loginResendBtn) {
        loginResendBtn.disabled = isCoolingDown;
        loginResendBtn.innerText = isCoolingDown ? `Resend link (${resendCooldownSeconds}s)` : 'Resend verification email';
    }

    // 3. Account Card Resend Button
    const accBtn = document.getElementById('account-resend-btn');
    if (accBtn) {
        accBtn.disabled = isCoolingDown;
        accBtn.innerText = isCoolingDown ? `Resend available in ${resendCooldownSeconds}s` : 'VERIFY EMAIL / RESEND EMAIL';
    }
}

function promptResendEmail() {
    const unverifiedBox = document.getElementById('login-unverified-box');
    if (unverifiedBox) {
        unverifiedBox.style.display = 'block';
        const loginEmail = document.getElementById('login-email')?.value?.trim();
        if (loginEmail) {
            setAuthMessage('login-message', 'Click below to resend the verification email to ' + loginEmail);
        } else {
            setAuthMessage('login-message', 'Please enter your email above and click "Resend verification email".');
        }
    }
}

async function sendVerificationEmail(emailAddress) {
    if (!emailAddress) {
        throw new Error('Email address is required.');
    }
    if (resendCooldownSeconds > 0) {
        throw new Error(`Please wait ${resendCooldownSeconds}s before requesting another verification email.`);
    }

    if (!supabaseClient) {
        startResendCooldown(60);
        return { success: true };
    }

    const { error } = await supabaseClient.auth.resend({
        type: 'signup',
        email: emailAddress.trim(),
        options: {
            emailRedirectTo: getResendRedirectUrl()
        }
    });

    if (error) {
        throw new Error(getFriendlyAuthErrorMessage(error.message));
    }

    startResendCooldown(60);
    return { success: true };
}

// ── Action Handlers for Resend ──
async function handleResendFromRegister() {
    const email = pendingRegistrationEmail || (document.getElementById('register-email')?.value?.trim());
    if (!email) {
        setAuthMessage('register-resend-status', 'No email address found to resend.', 'error');
        return;
    }

    try {
        setAuthMessage('register-resend-status', 'Sending fresh verification email...');
        await sendVerificationEmail(email);
        setAuthMessage('register-resend-status', 'A fresh verification email has been sent! Please check your inbox.', 'success');
        if (typeof showToast === 'function') showToast('Verification email resent successfully!', 'success');
    } catch (err) {
        setAuthMessage('register-resend-status', err.message, 'error');
    }
}

async function handleResendFromLogin() {
    const email = document.getElementById('login-email')?.value?.trim() || pendingRegistrationEmail;
    if (!email) {
        setAuthMessage('login-message', 'Please enter your email address to resend the verification link.', 'error');
        return;
    }

    try {
        setAuthMessage('login-message', 'Sending verification email...');
        await sendVerificationEmail(email);
        setAuthMessage('login-message', 'Verification email sent! Please check your inbox and click the link.', 'success');
        if (typeof showToast === 'function') showToast('Verification email sent! Please check your inbox.', 'success');
    } catch (err) {
        setAuthMessage('login-message', err.message, 'error');
    }
}

async function handleResendFromAccount() {
    const email = currentUser?.email || pendingRegistrationEmail;
    const msgEl = document.getElementById('account-resend-msg');
    if (!email) return;

    try {
        if (msgEl) setAuthMessage('account-resend-msg', 'Sending verification email...');
        await sendVerificationEmail(email);
        if (msgEl) setAuthMessage('account-resend-msg', 'Verification email sent! Please check your inbox.', 'success');
        if (typeof showToast === 'function') showToast('Verification email sent! Check your inbox.', 'success');
    } catch (err) {
        if (msgEl) setAuthMessage('account-resend-msg', err.message, 'error');
    }
}

// ── Sign In Flow ──
async function handleLogin(e) {
    if (e) e.preventDefault();

    const unverifiedBox = document.getElementById('login-unverified-box');
    if (unverifiedBox) unverifiedBox.style.display = 'none';
    setAuthMessage('login-message', '');

    if (!supabaseClient) {
        isLoggedIn = true;
        updateAuthDropdown();
        navigateTo('profile');
        return;
    }

    const emailMode = document.getElementById('email-login-field')?.style.display !== 'none';
    const password = document.getElementById('login-password')?.value;
    const submitBtn = document.getElementById('login-submit-btn');

    let credentials;
    let userEmail = '';

    if (emailMode) {
        userEmail = document.getElementById('login-email')?.value?.trim();
        if (!userEmail) {
            setAuthMessage('login-message', 'Please enter your email address.', 'error');
            return;
        }
        credentials = { email: userEmail, password };
    } else {
        const mobileData = getPhoneNumber(document.getElementById('login-country-code')?.value || '+91', 'login-mobile');
        if (mobileData.number.length !== 10) {
            setAuthMessage('login-message', 'Enter a valid 10-digit mobile number.', 'error');
            return;
        }
        credentials = { phone: mobileData.phone, password };
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Signing In...';
        }
        setAuthMessage('login-message', 'Signing you in...');

        const { data, error } = await supabaseClient.auth.signInWithPassword(credentials);

        if (error) {
            const rawMsg = error.message || '';
            // Check specifically for unconfirmed email
            if (rawMsg.toLowerCase().includes('email not confirmed')) {
                pendingRegistrationEmail = userEmail;
                if (unverifiedBox) unverifiedBox.style.display = 'block';
                setAuthMessage('login-message', 'Please verify your email address before signing in.', 'error');
            } else {
                setAuthMessage('login-message', getFriendlyAuthErrorMessage(rawMsg), 'error');
            }
            return;
        }

        const sessionUser = data?.user;
        if (sessionUser && !sessionUser.email_confirmed_at && emailMode) {
            // Unconfirmed edge case fallback
            pendingRegistrationEmail = userEmail;
            if (unverifiedBox) unverifiedBox.style.display = 'block';
            setAuthMessage('login-message', 'Please verify your email address before signing in.', 'error');
            await supabaseClient.auth.signOut();
            return;
        }

        isLoggedIn = true;
        currentUser = sessionUser;
        updateAuthDropdown();
        setAuthMessage('login-message', '');
        if (typeof showToast === 'function') showToast('Welcome back to WishRite!', 'success');
        navigateTo('profile');
    } catch (err) {
        setAuthMessage('login-message', getFriendlyAuthErrorMessage(err.message), 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In';
        }
    }
}

// ── Sign Up Flow ──
async function handleRegister(e) {
    if (e) e.preventDefault();

    const name = document.getElementById('register-name')?.value?.trim();
    const email = document.getElementById('register-email')?.value?.trim();
    const mobileData = getPhoneNumber(document.getElementById('register-country-code')?.value || '+91', 'register-mobile');
    const password = document.getElementById('register-password')?.value;
    const submitBtn = document.getElementById('register-submit-btn');

    if (!email || !email.includes('@')) {
        setAuthMessage('register-message', 'Please enter a valid email address.', 'error');
        return;
    }
    if (!password || password.length < 6) {
        setAuthMessage('register-message', 'Password must be at least 6 characters long.', 'error');
        return;
    }

    pendingRegistrationEmail = email;

    if (!supabaseClient) {
        document.getElementById('register-step-1').style.display = 'none';
        document.getElementById('register-step-2').style.display = 'block';
        const displayEmailEl = document.getElementById('display-email');
        if (displayEmailEl) displayEmailEl.innerText = email;
        startResendCooldown(60);
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Creating Account...';
        }
        setAuthMessage('register-message', 'Creating your account and sending verification link...');

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: getResendRedirectUrl(),
                data: {
                    full_name: name,
                    phone: mobileData.number.length === 10 ? mobileData.phone : ''
                }
            }
        });

        if (error) {
            setAuthMessage('register-message', getFriendlyAuthErrorMessage(error.message), 'error');
            return;
        }

        // Transition UI to "Verify your email" Card
        document.getElementById('register-step-1').style.display = 'none';
        document.getElementById('register-step-2').style.display = 'block';
        const displayEmailEl = document.getElementById('display-email');
        if (displayEmailEl) displayEmailEl.innerText = email;
        setAuthMessage('register-message', '');
        setAuthMessage('register-resend-status', '');

        // Start 60-second countdown for resend
        startResendCooldown(60);
        if (typeof showToast === 'function') {
            showToast('Verification link sent! Please check your email inbox.', 'info');
        }
    } catch (err) {
        setAuthMessage('register-message', getFriendlyAuthErrorMessage(err.message), 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Create Account';
        }
    }
}

function resetRegistration() {
    const step2 = document.getElementById('register-step-2');
    const step1 = document.getElementById('register-step-1');
    if (step2) step2.style.display = 'none';
    if (step1) step1.style.display = 'block';
    setAuthMessage('register-message', '');
    setAuthMessage('register-resend-status', '');
}

// ── Email Verification Callback Processing ──
async function handleAuthCallback() {
    // 1. Inspect URL hash and query string for tokens or errors
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash);

    const error = searchParams.get('error') || hashParams.get('error');
    const errorCode = searchParams.get('error_code') || hashParams.get('error_code');
    const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');

    // Clean URL to prevent stale tokens or bookmark issues
    if (window.history && window.history.replaceState) {
        const cleanPath = window.location.pathname === '/auth/callback' ? '/account' : window.location.pathname;
        window.history.replaceState(null, '', cleanPath);
    }

    if (error || errorCode) {
        console.warn('Auth callback returned error:', { error, errorCode, errorDescription });
        let userMessage = 'The verification link has expired or has already been used. Please request a new verification email.';
        if (errorCode === 'otp_expired' || (errorDescription && errorDescription.includes('expired'))) {
            userMessage = 'Your verification link has expired. Please request a fresh link below.';
        }
        if (typeof showToast === 'function') {
            showToast(userMessage, 'error');
        }
        navigateTo('login');
        const unverifiedBox = document.getElementById('login-unverified-box');
        if (unverifiedBox) unverifiedBox.style.display = 'block';
        setAuthMessage('login-message', userMessage, 'error');
        return;
    }

    // 2. Query session from Supabase client
    if (!supabaseClient) {
        isLoggedIn = true;
        navigateTo('profile');
        return;
    }

    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) {
            console.error('Error fetching session in callback:', sessionError);
            navigateTo('login');
            return;
        }

        if (session && session.user) {
            currentUser = session.user;
            isLoggedIn = true;
            updateAuthDropdown();

            // Synchronize verified user with customers table if appropriate
            syncCustomerProfile(session.user);

            if (typeof showToast === 'function') {
                showToast('Email verified successfully! Your WishRite account is now active.', 'success');
            }
            navigateTo('profile');
        } else {
            // If no immediate session, redirect to login
            navigateTo('login');
            if (typeof showToast === 'function') {
                showToast('Email verified! Please sign in with your credentials.', 'success');
            }
        }
    } catch (err) {
        console.error('Callback exception:', err);
        navigateTo('login');
    }
}

// ── Customer Profile Syncing ──
async function syncCustomerProfile(user) {
    if (!supabaseClient || !user || !user.email) return;
    try {
        const fullName = user.user_metadata?.full_name || '';
        const phone = user.user_metadata?.phone || '';

        // Safely update last login or record
        await supabaseClient
            .from('customers')
            .upsert({
                customer_email: user.email.toLowerCase(),
                customer_name: fullName || 'Valued Customer',
                customer_phone: phone,
                last_login_at: new Date().toISOString()
            }, { onConflict: 'customer_email' });
    } catch (e) {
        // Non-blocking sync error
        console.log('Customer sync info:', e?.message);
    }
}

// ── Account / Profile Details Renderer ──
function renderProfileAccountDetails() {
    const nameEl = document.getElementById('account-name');
    const emailEl = document.getElementById('account-email');
    const statusBadge = document.getElementById('account-status-badge');
    const statusText = document.getElementById('account-status-text');
    const actionField = document.getElementById('account-verify-action-field');

    if (!currentUser) {
        if (nameEl) nameEl.innerText = 'Guest Customer';
        if (emailEl) emailEl.innerText = '—';
        if (statusBadge) {
            statusBadge.className = 'status-badge unverified';
            statusBadge.innerText = '⚠ Email Not Verified';
        }
        if (statusText) statusText.innerText = '⚠ Email Not Verified';
        if (actionField) actionField.style.display = 'none';
        return;
    }

    const email = currentUser.email || '';
    const fullName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Valued Customer';
    const isVerified = !!currentUser.email_confirmed_at;

    if (nameEl) nameEl.innerText = fullName;
    if (emailEl) emailEl.innerText = email;

    if (statusBadge) {
        if (isVerified) {
            statusBadge.className = 'status-badge verified';
            statusBadge.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ✓ Email Verified
            `;
        } else {
            statusBadge.className = 'status-badge unverified';
            statusBadge.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                ⚠ Email Not Verified
            `;
        }
    }

    if (statusText) {
        statusText.innerText = isVerified ? '✓ Email Verified' : '⚠ Email Not Verified';
        statusText.style.color = isVerified ? 'var(--wr-success)' : 'var(--wr-gold)';
    }

    if (actionField) {
        actionField.style.display = isVerified ? 'none' : 'flex';
    }

    updateResendButtonsUI();
}

// ── Logout Flow ──
async function handleLogout() {
    try {
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }
    } catch (e) {
        console.warn('Sign out error:', e);
    }
    isLoggedIn = false;
    currentUser = null;
    updateAuthDropdown();
    if (typeof showToast === 'function') {
        showToast('Signed out successfully.', 'info');
    }
    navigateTo('home');
}

// ── Auth Initialization & State Listener ──
async function initAuthSystem() {
    initResendCooldownFromStorage();

    if (!supabaseClient) {
        updateAuthDropdown();
        return;
    }

    try {
        // Initial session check
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            currentUser = session.user;
            isLoggedIn = true;
        } else {
            currentUser = null;
            isLoggedIn = false;
        }
        updateAuthDropdown();

        // Single authoritative auth state listener
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                currentUser = session.user;
                isLoggedIn = true;
                if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                    syncCustomerProfile(session.user);
                }
            } else {
                currentUser = null;
                isLoggedIn = false;
            }
            updateAuthDropdown();

            // Refresh profile view if actively open
            if (typeof getCurrentView === 'function' && getCurrentView() === 'profile') {
                renderProfileAccountDetails();
            }
        });
    } catch (err) {
        console.error('Failed to initialize Supabase auth listener:', err);
    }
}

// Close user dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu-wrapper')) {
        document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('show'));
    }
});

// Run auth initialization
document.addEventListener('DOMContentLoaded', () => {
    initAuthSystem();
});
