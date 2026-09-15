/* ============================================
   WISHRITE — AUTH
   Authentication logic (preserved from existing)
   ============================================ */

let isLoggedIn = false;
let pendingRegistrationPhone = '';

// Safely init Supabase if config available
const supabaseClient = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY ?
    window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function setAuthMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerText = message;
    element.className = `auth-message ${type}`;
}

function getPhoneNumber(countryCode, inputId) {
    const number = document.getElementById(inputId).value.trim().replace(/\D/g, '');
    return { number, phone: `${countryCode}${number}` };
}

function switchLoginMethod(method) {
    const emailMode = method === 'email';
    document.getElementById('email-login-field').style.display = emailMode ? 'block' : 'none';
    document.getElementById('mobile-login-field').style.display = emailMode ? 'none' : 'block';
    document.getElementById('login-email').required = emailMode;
    document.getElementById('login-mobile').required = !emailMode;
    document.getElementById('email-login-tab').classList.toggle('active', emailMode);
    document.getElementById('mobile-login-tab').classList.toggle('active', !emailMode);
    setAuthMessage('login-message', '');
}

function updateAuthDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = isLoggedIn ?
        `<a onclick="navigateTo('profile')">My Profile</a><a onclick="handleLogout()">Logout</a>` :
        `<a onclick="navigateTo('login')">Login</a><a onclick="navigateTo('register')">Register</a>`;
}

function toggleUserDropdown(event) {
    event.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('show');
}

async function handleLogin(e) {
    e.preventDefault();

    if (!supabaseClient) {
        isLoggedIn = true;
        updateAuthDropdown();
        navigateTo('profile');
        return;
    }

    setAuthMessage('login-message', 'Signing you in...');
    const emailMode = document.getElementById('email-login-field').style.display !== 'none';
    const password = document.getElementById('login-password').value;
    const credentials = emailMode
        ? { email: document.getElementById('login-email').value.trim(), password }
        : { phone: getPhoneNumber(document.getElementById('login-country-code').value, 'login-mobile').phone, password };

    if (!emailMode && getPhoneNumber(document.getElementById('login-country-code').value, 'login-mobile').number.length !== 10) {
        setAuthMessage('login-message', 'Enter a valid 10-digit mobile number.', 'error');
        return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword(credentials);
    if (error) {
        setAuthMessage('login-message', error.message, 'error');
        return;
    }
    isLoggedIn = true;
    updateAuthDropdown();
    navigateTo('profile');
}

async function handleRegister(e) {
    e.preventDefault();
    const mobile = getPhoneNumber(document.getElementById('register-country-code').value, 'register-mobile');
    if (mobile.number.length !== 10) {
        setAuthMessage('register-message', 'A valid 10-digit mobile number is required.', 'error');
        return;
    }
    pendingRegistrationPhone = mobile.phone;

    if (!supabaseClient) {
        document.getElementById('register-step-1').style.display = 'none';
        document.getElementById('register-step-2').style.display = 'block';
        document.getElementById('display-phone').innerText = pendingRegistrationPhone;
        return;
    }

    setAuthMessage('register-message', 'Sending OTP...');
    const { error } = await supabaseClient.auth.signUp({
        phone: mobile.phone,
        password: document.getElementById('register-password').value,
        options: {
            data: {
                full_name: document.getElementById('register-name').value.trim(),
                email: document.getElementById('register-email').value.trim()
            }
        }
    });
    if (error) {
        setAuthMessage('register-message', error.message, 'error');
        return;
    }

    document.getElementById('register-step-1').style.display = 'none';
    document.getElementById('register-step-2').style.display = 'block';
    document.getElementById('display-phone').innerText = pendingRegistrationPhone;
}

function moveToNext(currentInput, event) {
    if (currentInput.value.length === 1) {
        const next = currentInput.nextElementSibling;
        if (next) next.focus();
    }
    if (event.key === "Backspace") {
        const prev = currentInput.previousElementSibling;
        if (prev) { prev.focus(); prev.value = ''; }
    }
}

async function verifyRegistrationOtp(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.otp-input');
    const otp = Array.from(inputs).map(i => i.value).join('');

    if (!supabaseClient) {
        isLoggedIn = true;
        updateAuthDropdown();
        resetRegistration();
        navigateTo('profile');
        return;
    }

    setAuthMessage('register-message', 'Verifying mobile number...');
    const { error } = await supabaseClient.auth.verifyOtp({ phone: pendingRegistrationPhone, token: otp, type: 'sms' });
    if (error) {
        setAuthMessage('register-message', error.message, 'error');
        return;
    }

    isLoggedIn = true;
    updateAuthDropdown();
    resetRegistration();
    navigateTo('profile');
}

function resetRegistration() {
    const step2 = document.getElementById('register-step-2');
    const step1 = document.getElementById('register-step-1');
    if (step2) step2.style.display = 'none';
    if (step1) step1.style.display = 'block';
    document.querySelectorAll('.otp-input').forEach(input => input.value = '');
    setAuthMessage('register-message', '');
}

async function handleLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    isLoggedIn = false;
    updateAuthDropdown();
    navigateTo('home');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu-wrapper')) {
        document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('show'));
    }
});
