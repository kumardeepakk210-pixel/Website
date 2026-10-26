/* ==============================================================================
   WISHRITE — INTEGRATED CREATOR PROGRAM INSIDE MY ACCOUNT
   Powers Tab 2: CREATOR inside the customer's My Account view.
   Single identity, single session, seamless onboarding, content sharing & earnings.
   ============================================================================== */

let currentCreatorData = null;
let liveProductsCache = [];
let creatorRealtimeChannel = null;

/**
 * Initializes Supabase Realtime listener for creator financial & profile updates
 */
function initCreatorRealtimeSync(influencerId) {
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client || typeof client.channel !== 'function') return null;
    if (creatorRealtimeChannel) return creatorRealtimeChannel;

    try {
        creatorRealtimeChannel = client
            .channel('wishrite-creator-realtime-sync')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'influencer_wallets'
                },
                (payload) => {
                    console.log('[WishRite Creator] Realtime update on influencer_wallets:', payload.eventType);
                    loadCustomerCreatorStatus();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'customers'
                },
                (payload) => {
                    console.log('[WishRite Creator] Realtime update on customers:', payload.eventType);
                    loadCustomerCreatorStatus();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[WishRite Creator] Subscribed to creator realtime updates.');
                }
            });
    } catch (err) {
        console.warn('[WishRite Creator] Realtime subscription notice:', err);
    }
    return creatorRealtimeChannel;
}
window.initCreatorRealtimeSync = initCreatorRealtimeSync;

/**
 * Switches between ACCOUNT and CREATOR tabs in My Account
 */
function switchProfileTab(tabId) {
    const btnAccount = document.getElementById('tab-btn-account');
    const btnCreator = document.getElementById('tab-btn-creator');
    const paneAccount = document.getElementById('tab-pane-account');
    const paneCreator = document.getElementById('tab-pane-creator');

    if (!paneAccount || !paneCreator) return;

    if (tabId === 'creator') {
        btnAccount?.classList.remove('active');
        btnAccount?.setAttribute('aria-selected', 'false');
        btnCreator?.classList.add('active');
        btnCreator?.setAttribute('aria-selected', 'true');

        paneAccount.style.display = 'none';
        paneCreator.style.display = 'block';

        try {
            if (window.location.pathname === '/account' || window.location.pathname === '/profile') {
                history.replaceState({ view: 'profile', tab: 'creator' }, '', '/account?tab=creator');
            }
        } catch (_) {}

        loadCustomerCreatorStatus();
        fetchLiveProductsForPicker();
    } else {
        btnCreator?.classList.remove('active');
        btnCreator?.setAttribute('aria-selected', 'false');
        btnAccount?.classList.add('active');
        btnAccount?.setAttribute('aria-selected', 'true');

        paneCreator.style.display = 'none';
        paneAccount.style.display = 'block';

        try {
            if (window.location.pathname === '/account' || window.location.pathname === '/profile') {
                history.replaceState({ view: 'profile', tab: 'account' }, '', '/account');
            }
        } catch (_) {}
    }
}
window.switchProfileTab = switchProfileTab;

// Bind direct DOM event listeners as backup to inline onclick
function initCreatorTabListeners() {
    const btnAccount = document.getElementById('tab-btn-account');
    const btnCreator = document.getElementById('tab-btn-creator');
    if (btnAccount && !btnAccount._hasTabListener) {
        btnAccount._hasTabListener = true;
        btnAccount.addEventListener('click', () => switchProfileTab('account'));
    }
    if (btnCreator && !btnCreator._hasTabListener) {
        btnCreator._hasTabListener = true;
        btnCreator.addEventListener('click', () => switchProfileTab('creator'));
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreatorTabListeners);
} else {
    initCreatorTabListeners();
}

/**
 * Returns authorization headers using customer session or creator token
 */
async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    
    // Check Supabase customer session
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (client && client.auth) {
        try {
            const { data } = await client.auth.getSession();
            if (data?.session?.access_token) {
                headers['Authorization'] = `Bearer ${data.session.access_token}`;
            }
            if (data?.session?.user?.email) {
                headers['x-customer-email'] = data.session.user.email;
            }
            if (data?.session?.user?.id) {
                headers['x-customer-id'] = data.session.user.id;
            }
        } catch (_) {}
    }

    // Fallback to local creator token if present
    if (!headers['Authorization']) {
        const creatorToken = localStorage.getItem('wishrite_creator_token');
        if (creatorToken) {
            headers['Authorization'] = `Bearer ${creatorToken}`;
        }
    }

    // Customer email & id from getWishriteAuthUser / getWishriteCustomerProfile / window.currentUser
    const authUser = (typeof window.getWishriteAuthUser === 'function') ? window.getWishriteAuthUser() : (window.currentUser || null);
    const custProfile = (typeof window.getWishriteCustomerProfile === 'function') ? window.getWishriteCustomerProfile() : null;

    if (!headers['x-customer-email']) {
        if (authUser?.email) {
            headers['x-customer-email'] = authUser.email;
        } else if (custProfile?.email) {
            headers['x-customer-email'] = custProfile.email;
        }
    }
    if (!headers['x-customer-id']) {
        if (authUser?.id) {
            headers['x-customer-id'] = authUser.id;
        } else if (custProfile?.id) {
            headers['x-customer-id'] = custProfile.id;
        }
    }

    return headers;
}

/**
 * Loads authoritatively whether current customer has an active creator profile
 */
async function loadCustomerCreatorStatus() {
    const onboardState = document.getElementById('creator-onboard-state');
    const dashboardState = document.getElementById('creator-dashboard-state');
    const reviewState = document.getElementById('creator-review-state');
    const loadingState = document.getElementById('creator-loading-state');

    if (loadingState) loadingState.style.display = 'block';
    if (onboardState) onboardState.style.display = 'none';
    if (dashboardState) dashboardState.style.display = 'none';
    if (reviewState) reviewState.style.display = 'none';

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/status', { headers });
        const data = await res.json();

        if (loadingState) loadingState.style.display = 'none';

        if (data.success && data.is_creator && data.creator) {
            currentCreatorData = data;
            if (data.token) {
                localStorage.setItem('wishrite_creator_token', data.token);
            }

            initCreatorRealtimeSync(data.creator.id);

            if (data.status === 'under_review') {
                if (reviewState) reviewState.style.display = 'block';
            } else {
                if (dashboardState) dashboardState.style.display = 'block';
                renderCreatorDashboard(data);
            }
        } else {
            // Not a creator yet -> show Onboard invite & details form
            currentCreatorData = null;
            if (onboardState) onboardState.style.display = 'block';
            const heroCard = document.querySelector('.creator-onboard-hero') || document.getElementById('creator-onboard-hero');
            const formCard = document.getElementById('creator-onboard-form-card');
            if (heroCard) heroCard.style.display = 'block';
            if (formCard) formCard.style.display = 'none';
            const becomeBtn = document.getElementById('btn-become-creator');
            if (becomeBtn && !becomeBtn._boundClick) {
                becomeBtn._boundClick = true;
                becomeBtn.addEventListener('click', showCreatorOnboardForm);
            }
            prefillOnboardingForm();
        }
    } catch (err) {
        console.error('Error checking creator status:', err);
        if (loadingState) loadingState.style.display = 'none';
        if (onboardState) onboardState.style.display = 'block';
        const heroCard = document.querySelector('.creator-onboard-hero') || document.getElementById('creator-onboard-hero');
        const formCard = document.getElementById('creator-onboard-form-card');
        if (heroCard) heroCard.style.display = 'block';
        if (formCard) formCard.style.display = 'none';
        prefillOnboardingForm();
    }
}
window.loadCustomerCreatorStatus = loadCustomerCreatorStatus;

/**
 * Opens the Creator Onboarding Form inside My Account
 * Replaces the Creator welcome/hero card with the Creator Details form
 */
function showCreatorOnboardForm() {
    // Check if user is signed in
    const authUser = (typeof getWishriteAuthUser === 'function') ? getWishriteAuthUser() : window.currentUser;
    const custProfile = (typeof getWishriteCustomerProfile === 'function') ? getWishriteCustomerProfile() : null;
    const isUserLoggedIn = !!(authUser || custProfile || (window.isLoggedIn));

    if (!isUserLoggedIn) {
        if (typeof showToast === 'function') {
            showToast('Please sign in to activate your Creator profile.', 'warning');
        }
        if (typeof navigateTo === 'function') {
            navigateTo('login');
        }
        return;
    }

    const heroCard = document.querySelector('.creator-onboard-hero') || document.getElementById('creator-onboard-hero');
    const formCard = document.getElementById('creator-onboard-form-card');
    const errorBox = document.getElementById('creator-onboard-error') || document.getElementById('creator-onboard-message');

    if (errorBox) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Prefill customer details from existing account
    prefillOnboardingForm();

    // Replace welcome card with Creator Details form in-page
    if (heroCard) {
        heroCard.style.display = 'none';
    }
    if (formCard) {
        formCard.style.display = 'block';
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const nameInput = document.getElementById('creator-input-name');
        const instaInput = document.getElementById('creator-input-instagram');
        if (nameInput && !nameInput.value.trim()) {
            nameInput.focus();
        } else if (instaInput) {
            instaInput.focus();
        }
    }
}
window.showCreatorOnboardForm = showCreatorOnboardForm;

/**
 * Cancels/hides Creator Onboarding Form and restores the Welcome Card
 */
function hideCreatorOnboardForm() {
    const heroCard = document.querySelector('.creator-onboard-hero') || document.getElementById('creator-onboard-hero');
    const formCard = document.getElementById('creator-onboard-form-card');
    const errorBox = document.getElementById('creator-onboard-error') || document.getElementById('creator-onboard-message');

    if (errorBox) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    if (formCard) {
        formCard.style.display = 'none';
    }
    if (heroCard) {
        heroCard.style.display = 'block';
        heroCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
window.hideCreatorOnboardForm = hideCreatorOnboardForm;

/**
 * Prefills onboarding details using existing customer account info
 */
function prefillOnboardingForm() {
    const nameInput = document.getElementById('creator-input-name');
    const countryInput = document.getElementById('creator-input-country');
    const emailLabel = document.getElementById('creator-onboard-email-label');

    const authUser = (typeof getWishriteAuthUser === 'function') ? getWishriteAuthUser() : window.currentUser;
    const custProfile = (typeof getWishriteCustomerProfile === 'function') ? getWishriteCustomerProfile() : null;

    const customerName = custProfile?.name || authUser?.user_metadata?.full_name || document.getElementById('account-name')?.innerText || '';
    const customerEmail = custProfile?.email || authUser?.email || document.getElementById('account-email')?.innerText || '';

    if (nameInput && (!nameInput.value || nameInput.value.trim() === '') && customerName && customerName !== '—') {
        nameInput.value = customerName;
    }
    if (countryInput && !countryInput.value) {
        countryInput.value = 'India';
    }
    if (emailLabel && customerEmail && customerEmail !== '—') {
        emailLabel.innerText = customerEmail;
    }
}

/**
 * Profile Photo Upload - Onboarding Form
 */
function triggerCreatorPhotoSelect() {
    const fileInput = document.getElementById('creator-photo-file-input');
    if (fileInput) fileInput.click();
}
window.triggerCreatorPhotoSelect = triggerCreatorPhotoSelect;

async function handleCreatorPhotoSelect(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const errorEl = document.getElementById('creator-photo-error');
    const previewImg = document.getElementById('creator-photo-preview-img');
    const placeholder = document.getElementById('creator-photo-placeholder');
    const emptyActions = document.getElementById('creator-photo-empty-actions');
    const activeActions = document.getElementById('creator-photo-active-actions');
    const statusText = document.getElementById('creator-photo-status-text');
    const avatarHidden = document.getElementById('creator-input-avatar');

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    // 1. Client-side Format Validation (JPG, PNG, WebP)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExts.some(ext => lowerName.endsWith(ext));
    if (!validTypes.includes(file.type) && !hasValidExt) {
        if (errorEl) {
            errorEl.textContent = 'Please upload a valid image file (JPG, PNG, or WebP).';
            errorEl.style.display = 'block';
        }
        event.target.value = '';
        return;
    }

    // 2. Client-side Size Validation (Max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
        if (errorEl) {
            errorEl.textContent = 'Please upload an image smaller than 5 MB.';
            errorEl.style.display = 'block';
        }
        event.target.value = '';
        return;
    }

    // 3. Immediate local preview
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        if (previewImg) {
            previewImg.src = base64Data;
            previewImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (emptyActions) emptyActions.style.display = 'none';
        if (activeActions) activeActions.style.display = 'block';
        if (statusText) statusText.textContent = 'Uploading photo...';

        // 4. Server-side upload
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/creator/profile-photo', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    image: base64Data,
                    mimeType: file.type || 'image/jpeg'
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data?.error?.message || 'Failed to upload photo.');
            }

            if (avatarHidden) avatarHidden.value = data.url;
            if (previewImg && data.url) previewImg.src = data.url;
            if (statusText) {
                statusText.textContent = '✓ Photo ready';
                statusText.style.color = '#047857';
            }
        } catch (uploadErr) {
            console.error('Photo upload error:', uploadErr);
            if (avatarHidden) avatarHidden.value = base64Data;
            if (statusText) {
                statusText.textContent = '✓ Photo ready';
                statusText.style.color = '#047857';
            }
        }
    };
    reader.readAsDataURL(file);
}
window.handleCreatorPhotoSelect = handleCreatorPhotoSelect;

async function removeCreatorPhoto() {
    const fileInput = document.getElementById('creator-photo-file-input');
    const avatarHidden = document.getElementById('creator-input-avatar');
    const previewImg = document.getElementById('creator-photo-preview-img');
    const placeholder = document.getElementById('creator-photo-placeholder');
    const emptyActions = document.getElementById('creator-photo-empty-actions');
    const activeActions = document.getElementById('creator-photo-active-actions');
    const errorEl = document.getElementById('creator-photo-error');

    if (fileInput) fileInput.value = '';
    if (avatarHidden) avatarHidden.value = '';
    if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (activeActions) activeActions.style.display = 'none';
    if (emptyActions) emptyActions.style.display = 'block';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    try {
        const headers = await getAuthHeaders();
        await fetch('/api/creator/profile-photo', {
            method: 'DELETE',
            headers
        });
    } catch (_) {}
}
window.removeCreatorPhoto = removeCreatorPhoto;

/**
 * Submits the Creator Onboarding Details Form & activates Creator Profile
 */
async function handleCreatorOnboardSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const nameInput = document.getElementById('creator-input-name');
    const avatarInput = document.getElementById('creator-input-avatar');
    const bioInput = document.getElementById('creator-input-bio');
    const cityInput = document.getElementById('creator-input-city');
    const stateInput = document.getElementById('creator-input-state');
    const countryInput = document.getElementById('creator-input-country');
    const instaInput = document.getElementById('creator-input-instagram') || document.getElementById('creator-input-instagram-user');
    const ytInput = document.getElementById('creator-input-youtube') || document.getElementById('creator-input-youtube-url');
    const fbInput = document.getElementById('creator-input-facebook') || document.getElementById('creator-input-facebook-url');
    const otherInput = document.getElementById('creator-input-other') || document.getElementById('creator-input-other-url');
    const agreementCheck = document.getElementById('creator-agreement-check');
    const errorBox = document.getElementById('creator-onboard-error') || document.getElementById('creator-onboard-message');
    const submitBtn = document.getElementById('creator-onboard-submit-btn') || document.getElementById('btn-activate-creator');

    function showError(msg) {
        if (errorBox) {
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
            errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (typeof showToast === 'function') {
            showToast(msg, 'error');
        } else {
            alert(msg);
        }
    }

    if (errorBox) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    const displayName = (nameInput?.value || '').trim();
    if (!displayName) {
        showError('Please provide your Creator display name.');
        nameInput?.focus();
        return;
    }
    if (displayName.length > 80) {
        showError('Creator display name must be 80 characters or fewer.');
        nameInput?.focus();
        return;
    }

    const cityVal = (cityInput?.value || '').trim();
    if (!cityVal) {
        showError('Please enter your City.');
        cityInput?.focus();
        return;
    }

    const stateVal = (stateInput?.value || '').trim();
    if (!stateVal) {
        showError('Please enter your State.');
        stateInput?.focus();
        return;
    }

    const instaVal = (instaInput?.value || '').trim();
    if (!instaVal) {
        showError('Please provide your Instagram username or profile link.');
        instaInput?.focus();
        return;
    }

    if (!agreementCheck?.checked) {
        showError('Please accept the WishRite Creator Program Terms & Content Guidelines.');
        agreementCheck?.focus();
        return;
    }

    // Process Instagram username vs URL cleanly
    const cleanInstaUser = instaVal.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '').trim();
    const cleanInstaUrl = instaVal.startsWith('http') ? instaVal : (cleanInstaUser ? `https://instagram.com/${cleanInstaUser}` : '');

    // Collect content preferences
    const selectedPreferences = [];
    document.querySelectorAll('input[name="content_pref"]:checked, .creator-chip-checkbox:checked').forEach(cb => {
        selectedPreferences.push(cb.value);
    });

    const authUser = (typeof getWishriteAuthUser === 'function') ? getWishriteAuthUser() : window.currentUser;
    const custProfile = (typeof getWishriteCustomerProfile === 'function') ? getWishriteCustomerProfile() : null;
    const customerEmail = custProfile?.email || authUser?.email || document.getElementById('account-email')?.innerText || '';

    const payload = {
        name: displayName,
        display_name: displayName,
        profile_image: (avatarInput?.value || '').trim(),
        bio: (bioInput?.value || '').trim(),
        city: (cityInput?.value || '').trim(),
        state: (stateInput?.value || '').trim(),
        country: (countryInput?.value || '').trim() || 'India',
        instagram: instaVal,
        instagram_username: cleanInstaUser,
        instagram_url: cleanInstaUrl,
        youtube: (ytInput?.value || '').trim(),
        youtube_url: (ytInput?.value || '').trim(),
        facebook: (fbInput?.value || '').trim(),
        facebook_url: (fbInput?.value || '').trim(),
        other_url: (otherInput?.value || '').trim(),
        content_preferences: selectedPreferences,
        preferences: selectedPreferences,
        agreement_accepted: true,
        email: customerEmail
    };

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'ACTIVATING...';
        }

        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/onboard', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (res.status === 401) {
            throw new Error('Please sign in to activate your Creator profile.');
        }

        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
            if (res.status >= 500) {
                throw new Error("We couldn't activate your Creator profile. Please try again.");
            }
            throw new Error(data?.error?.message || "We couldn't activate your Creator profile. Please try again.");
        }

        if (!data.success && !data.already_active) {
            throw new Error(data.error?.message || "We couldn't activate your Creator profile. Please try again.");
        }

        if (data.token) {
            localStorage.setItem('wishrite_creator_token', data.token);
        }

        if (typeof showToast === 'function') {
            showToast(data.already_active ? 'Welcome back to WishRite Creator Club!' : 'WishRite Creator Profile activated successfully!', 'success');
        }

        // Immediately transition into State 2: Creator Dashboard
        await loadCustomerCreatorStatus();
    } catch (err) {
        let msg = err.message || "We couldn't activate your Creator profile. Please try again.";
        if (err.name === 'TypeError' && String(err).includes('fetch')) {
            msg = 'Unable to connect. Please check your internet connection and try again.';
        }
        showError(msg);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'ACTIVATE CREATOR';
        }
    }
}
window.handleCreatorOnboardSubmit = handleCreatorOnboardSubmit;

/**
 * Renders State 2: Creator Dashboard
 */
function renderCreatorDashboard(data) {
    const creator = data.creator || data || {};
    const stats = data.stats || {};
    const wallet = data.wallet || {};
    const points = data.points || {};

    currentCreatorData = data;

    // 1. Profile Card
    const nameEl = document.getElementById('creator-dash-name') || document.getElementById('cd-creator-name');
    const avatarEl = document.getElementById('creator-dash-avatar') || document.getElementById('cd-creator-avatar');
    const slugEl = document.getElementById('creator-code-badge') || document.getElementById('cd-creator-slug');
    const bioEl = document.getElementById('creator-dash-bio');
    const linkInput = document.getElementById('creator-dash-link-input') || document.getElementById('cd-referral-link-input');
    const socialBadges = document.getElementById('creator-dash-socials') || document.getElementById('cd-social-badges');

    if (nameEl) nameEl.innerText = creator.name || creator.display_name || 'WishRite Creator';
    if (avatarEl && creator.profile_image) avatarEl.src = creator.profile_image;
    if (slugEl) slugEl.innerText = creator.influencer_code || `@${creator.public_slug}`;
    if (bioEl) bioEl.innerText = creator.bio || '';

    const referralUrl = creator.referral_url || `https://wishrite.in/creator/${creator.public_slug || creator.influencer_code}`;
    if (linkInput) linkInput.value = referralUrl;

    if (socialBadges) {
        let badgesHtml = '';
        if (creator.instagram_url || creator.instagram_id) {
            const iUrl = creator.instagram_url || `https://instagram.com/${creator.instagram_id}`;
            badgesHtml += `<a href="${iUrl}" target="_blank" rel="noopener" class="cd-social-pill">Instagram</a>`;
        }
        if (creator.youtube_url) {
            badgesHtml += `<a href="${creator.youtube_url}" target="_blank" rel="noopener" class="cd-social-pill">YouTube</a>`;
        }
        if (creator.facebook_url) {
            badgesHtml += `<a href="${creator.facebook_url}" target="_blank" rel="noopener" class="cd-social-pill">Facebook</a>`;
        }
        socialBadges.innerHTML = badgesHtml;
    }

    // 2. Performance Stats
    const clicksEl = document.getElementById('metric-creator-clicks') || document.getElementById('cd-stat-clicks');
    const ordersEl = document.getElementById('metric-creator-orders') || document.getElementById('cd-stat-orders');
    const availEl = document.getElementById('metric-creator-available') || document.getElementById('cd-stat-available');
    const pendEl = document.getElementById('metric-creator-pending') || document.getElementById('cd-stat-pending');
    const totalEl = document.getElementById('metric-creator-total') || document.getElementById('cd-stat-total');
    const pointsEl = document.getElementById('metric-creator-points') || document.getElementById('cd-stat-points');

    if (clicksEl) clicksEl.innerText = Number(stats.total_clicks || 0).toLocaleString();
    if (ordersEl) ordersEl.innerText = Number(stats.total_orders || 0).toLocaleString();
    if (availEl) availEl.innerText = `₹${Number(wallet.available_balance || stats.available_earnings || 0).toLocaleString()}`;
    if (pendEl) pendEl.innerText = `₹${Number(wallet.pending_balance || stats.pending_earnings || 0).toLocaleString()}`;
    if (totalEl) totalEl.innerText = `₹${Number(wallet.lifetime_earned || stats.total_sales || 0).toLocaleString()}`;
    if (pointsEl) pointsEl.innerText = Number(points.balance || stats.total_points || 0).toLocaleString();

    // 3. Load Submitted Content
    loadCreatorContent();

    // 4. Load Contest Leaderboard
    loadCreatorContest();

    // 5. Load Instagram Connection
    loadInstagramConnection();
}

/**
 * Copies the creator's personal referral link
 */
function copyCreatorReferralLink() {
    const linkInput = document.getElementById('creator-dash-link-input') || document.getElementById('cd-referral-link-input');
    const copyBtnText = document.getElementById('creator-copy-link-text');
    if (!linkInput) return;
    linkInput.select();

    const onCopied = () => {
        if (copyBtnText) {
            copyBtnText.innerText = 'Copied!';
            setTimeout(() => {
                copyBtnText.innerText = 'COPY LINK';
            }, 2500);
        }
        if (typeof showToast === 'function') {
            showToast('Referral link copied to clipboard!', 'success');
        }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linkInput.value).then(onCopied).catch(() => {
            document.execCommand('copy');
            onCopied();
        });
    } else {
        document.execCommand('copy');
        onCopied();
    }
}
window.copyCreatorReferralLink = copyCreatorReferralLink;

async function shareCreatorLink() {
    const linkInput = document.getElementById('creator-dash-link-input') || document.getElementById('cd-referral-link-input');
    const url = linkInput ? linkInput.value : window.location.origin;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'WishRite Jewellery',
                text: 'Discover fine 925 sterling silver jewellery on WishRite.',
                url
            });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    copyCreatorReferralLink();
    if (typeof showToast === 'function') {
        showToast('Share not available — link copied to clipboard!', 'info');
    }
}
window.shareCreatorLink = shareCreatorLink;

/**
 * Edit Creator Profile Modal Logic
 */
function triggerEditCreatorPhotoSelect() {
    const fileInput = document.getElementById('edit-creator-photo-file-input');
    if (fileInput) fileInput.click();
}
window.triggerEditCreatorPhotoSelect = triggerEditCreatorPhotoSelect;

async function handleEditCreatorPhotoSelect(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const errorEl = document.getElementById('edit-creator-photo-error');
    const previewImg = document.getElementById('edit-creator-photo-preview-img');
    const placeholder = document.getElementById('edit-creator-photo-placeholder');
    const emptyActions = document.getElementById('edit-creator-photo-empty-actions');
    const activeActions = document.getElementById('edit-creator-photo-active-actions');
    const statusText = document.getElementById('edit-creator-photo-status-text');
    const avatarHidden = document.getElementById('edit-creator-input-avatar');

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExts.some(ext => lowerName.endsWith(ext));
    if (!validTypes.includes(file.type) && !hasValidExt) {
        if (errorEl) {
            errorEl.textContent = 'Please upload a valid image file (JPG, PNG, or WebP).';
            errorEl.style.display = 'block';
        }
        event.target.value = '';
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        if (errorEl) {
            errorEl.textContent = 'Please upload an image smaller than 5 MB.';
            errorEl.style.display = 'block';
        }
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        if (previewImg) {
            previewImg.src = base64Data;
            previewImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (emptyActions) emptyActions.style.display = 'none';
        if (activeActions) activeActions.style.display = 'block';
        if (statusText) statusText.textContent = 'Uploading photo...';

        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/creator/profile-photo', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    image: base64Data,
                    mimeType: file.type || 'image/jpeg'
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data?.error?.message || 'Failed to upload photo.');
            }

            if (avatarHidden) avatarHidden.value = data.url;
            if (previewImg && data.url) previewImg.src = data.url;
            if (statusText) {
                statusText.textContent = '✓ Photo updated';
                statusText.style.color = '#047857';
            }
        } catch (uploadErr) {
            console.error('Edit photo upload error:', uploadErr);
            if (avatarHidden) avatarHidden.value = base64Data;
            if (statusText) {
                statusText.textContent = '✓ Photo ready';
                statusText.style.color = '#047857';
            }
        }
    };
    reader.readAsDataURL(file);
}
window.handleEditCreatorPhotoSelect = handleEditCreatorPhotoSelect;

async function removeEditCreatorPhoto() {
    const fileInput = document.getElementById('edit-creator-photo-file-input');
    const avatarHidden = document.getElementById('edit-creator-input-avatar');
    const previewImg = document.getElementById('edit-creator-photo-preview-img');
    const placeholder = document.getElementById('edit-creator-photo-placeholder');
    const emptyActions = document.getElementById('edit-creator-photo-empty-actions');
    const activeActions = document.getElementById('edit-creator-photo-active-actions');
    const errorEl = document.getElementById('edit-creator-photo-error');

    if (fileInput) fileInput.value = '';
    if (avatarHidden) avatarHidden.value = '';
    if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (activeActions) activeActions.style.display = 'none';
    if (emptyActions) emptyActions.style.display = 'block';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    try {
        const headers = await getAuthHeaders();
        await fetch('/api/creator/profile-photo', {
            method: 'DELETE',
            headers
        });
    } catch (_) {}
}
window.removeEditCreatorPhoto = removeEditCreatorPhoto;

function openEditCreatorProfileModal() {
    const modal = document.getElementById('modal-edit-creator-profile');
    if (!modal) return;

    const creator = currentCreatorData?.creator || currentCreatorData || {};

    const nameInput = document.getElementById('edit-creator-input-name');
    const bioInput = document.getElementById('edit-creator-input-bio');
    const cityInput = document.getElementById('edit-creator-input-city');
    const stateInput = document.getElementById('edit-creator-input-state');
    const countryInput = document.getElementById('edit-creator-input-country');
    const instaInput = document.getElementById('edit-creator-input-instagram');
    const ytInput = document.getElementById('edit-creator-input-youtube');
    const fbInput = document.getElementById('edit-creator-input-facebook');
    const otherInput = document.getElementById('edit-creator-input-other');
    const avatarHidden = document.getElementById('edit-creator-input-avatar');
    const previewImg = document.getElementById('edit-creator-photo-preview-img');
    const placeholder = document.getElementById('edit-creator-photo-placeholder');
    const emptyActions = document.getElementById('edit-creator-photo-empty-actions');
    const activeActions = document.getElementById('edit-creator-photo-active-actions');
    const errorBox = document.getElementById('edit-creator-error');
    const successBox = document.getElementById('edit-creator-success');

    if (errorBox) { errorBox.textContent = ''; errorBox.style.display = 'none'; }
    if (successBox) { successBox.textContent = ''; successBox.style.display = 'none'; }

    if (nameInput) nameInput.value = creator.name || creator.display_name || '';
    if (bioInput) bioInput.value = creator.bio || '';
    if (cityInput) cityInput.value = creator.city || '';
    if (stateInput) stateInput.value = creator.state || '';
    if (countryInput) countryInput.value = creator.country || 'India';
    if (instaInput) instaInput.value = creator.instagram_url || (creator.instagram_id ? `@${creator.instagram_id}` : '');
    if (ytInput) ytInput.value = creator.youtube_url || '';
    if (fbInput) fbInput.value = creator.facebook_url || '';
    if (otherInput) otherInput.value = creator.other_url || '';

    // Profile photo state
    const currentImg = creator.profile_image || '';
    if (avatarHidden) avatarHidden.value = currentImg;
    if (currentImg && !currentImg.includes('ui-avatars.com')) {
        if (previewImg) { previewImg.src = currentImg; previewImg.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
        if (emptyActions) emptyActions.style.display = 'none';
        if (activeActions) activeActions.style.display = 'block';
    } else {
        if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
        if (placeholder) placeholder.style.display = 'flex';
        if (activeActions) activeActions.style.display = 'none';
        if (emptyActions) emptyActions.style.display = 'block';
    }

    // Content preferences
    const existingPrefs = creator.content_preferences || [];
    document.querySelectorAll('input[name="edit_content_pref"]').forEach(cb => {
        cb.checked = existingPrefs.includes(cb.value);
    });

    modal.style.display = 'flex';
}
window.openEditCreatorProfileModal = openEditCreatorProfileModal;

function closeEditCreatorProfileModal() {
    const modal = document.getElementById('modal-edit-creator-profile');
    if (modal) modal.style.display = 'none';
}
window.closeEditCreatorProfileModal = closeEditCreatorProfileModal;

async function handleEditCreatorProfileSubmit(e) {
    if (e) e.preventDefault();

    const nameInput = document.getElementById('edit-creator-input-name');
    const bioInput = document.getElementById('edit-creator-input-bio');
    const cityInput = document.getElementById('edit-creator-input-city');
    const stateInput = document.getElementById('edit-creator-input-state');
    const countryInput = document.getElementById('edit-creator-input-country');
    const instaInput = document.getElementById('edit-creator-input-instagram');
    const ytInput = document.getElementById('edit-creator-input-youtube');
    const fbInput = document.getElementById('edit-creator-input-facebook');
    const otherInput = document.getElementById('edit-creator-input-other');
    const avatarHidden = document.getElementById('edit-creator-input-avatar');
    const errorBox = document.getElementById('edit-creator-error');
    const successBox = document.getElementById('edit-creator-success');
    const saveBtn = document.getElementById('btn-save-creator-profile');

    function showEditError(msg) {
        if (errorBox) {
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
            errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (typeof showToast === 'function') {
            showToast(msg, 'error');
        } else {
            alert(msg);
        }
    }

    if (errorBox) { errorBox.textContent = ''; errorBox.style.display = 'none'; }
    if (successBox) { successBox.textContent = ''; successBox.style.display = 'none'; }

    const nameVal = (nameInput?.value || '').trim();
    if (!nameVal) {
        showEditError('Please enter your Creator Display Name.');
        nameInput?.focus();
        return;
    }
    if (nameVal.length > 80) {
        showEditError('Creator Display Name must be 80 characters or fewer.');
        nameInput?.focus();
        return;
    }

    const cityVal = (cityInput?.value || '').trim();
    if (!cityVal) {
        showEditError('Please enter your City.');
        cityInput?.focus();
        return;
    }

    const stateVal = (stateInput?.value || '').trim();
    if (!stateVal) {
        showEditError('Please enter your State.');
        stateInput?.focus();
        return;
    }

    const instaVal = (instaInput?.value || '').trim();
    if (!instaVal) {
        showEditError('Please enter your Instagram username or URL.');
        instaInput?.focus();
        return;
    }

    const cleanInstaUser = instaVal.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '').trim();
    const cleanInstaUrl = instaVal.startsWith('http') ? instaVal : (cleanInstaUser ? `https://instagram.com/${cleanInstaUser}` : '');

    const selectedPrefs = [];
    document.querySelectorAll('input[name="edit_content_pref"]:checked').forEach(cb => {
        selectedPrefs.push(cb.value);
    });

    const payload = {
        name: nameVal,
        display_name: nameVal,
        bio: (bioInput?.value || '').trim(),
        city: cityVal,
        state: stateVal,
        country: (countryInput?.value || '').trim() || 'India',
        profile_image: (avatarHidden?.value || '').trim(),
        instagram_username: cleanInstaUser,
        instagram_url: cleanInstaUrl,
        youtube_url: (ytInput?.value || '').trim(),
        facebook_url: (fbInput?.value || '').trim(),
        other_url: (otherInput?.value || '').trim(),
        content_preferences: selectedPrefs
    };

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerText = 'Saving...';
        }

        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/profile', {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data?.error?.message || 'Could not update profile.');
        }

        if (successBox) {
            successBox.textContent = '✓ Profile updated successfully.';
            successBox.style.display = 'block';
        }
        if (typeof showToast === 'function') {
            showToast('Creator profile updated successfully.', 'success');
        }

        // Refresh dashboard immediately with updated profile
        if (data.data) {
            if (currentCreatorData) {
                currentCreatorData.creator = Object.assign(currentCreatorData.creator || {}, data.data);
            }
            renderCreatorDashboard(currentCreatorData || { creator: data.data });
        }

        setTimeout(() => {
            closeEditCreatorProfileModal();
        }, 800);
    } catch (err) {
        showEditError(err.message || 'Error saving changes. Please try again.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = 'SAVE CHANGES';
        }
    }
}
window.handleEditCreatorProfileSubmit = handleEditCreatorProfileSubmit;

// State for content and reel insights
let currentCreatorContent = [];
let currentReelsList = [];
let currentReelFilter = 'all';

/**
 * Filter and render Reel Insights
 */
function filterReelInsights(filter, btn) {
    currentReelFilter = filter || 'all';
    document.querySelectorAll('.reel-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReelInsightsGrid();
}
window.filterReelInsights = filterReelInsights;

function renderReelInsightsGrid() {
    const container = document.getElementById('reel-insights-container');
    if (!container) return;

    let list = [...currentReelsList];
    if (currentReelFilter === 'approved') {
        list = list.filter(r => (r.status || '').toLowerCase() === 'approved');
    } else if (currentReelFilter === 'pending') {
        list = list.filter(r => (r.status || '').toLowerCase() !== 'approved' && (r.status || '').toLowerCase() !== 'rejected');
    } else if (currentReelFilter === 'recent') {
        list = list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (currentReelFilter === 'top') {
        list = list.sort((a, b) => (Number(b.clicks || 0) + Number(b.orders || 0)) - (Number(a.clicks || 0) + Number(a.orders || 0)));
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="reel-insights-empty">
                <p style="margin:0 0 6px 0; font-weight:500;">No submitted reels found matching '${currentReelFilter}'.</p>
                <span style="font-size:0.82rem;">Share a Reel featuring WishRite jewellery to see its performance metrics here.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(reel => {
        const dateStr = reel.created_at ? new Date(reel.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently';
        const statusClass = (reel.status || '').toLowerCase() === 'approved' ? 'verified' : ((reel.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'pending');
        const statusLabel = (reel.status || '').toLowerCase() === 'approved' ? '✓ Approved' : ((reel.status || '').toLowerCase() === 'rejected' ? '✕ Rejected' : '⧖ Under Review');
        const thumbImg = reel.thumbnail_url || reel.product_image || 'https://placehold.co/180x240/5E3435/FFF?text=WishRite+Reel';
        const platformName = reel.platform === 'youtube' ? 'YouTube Short' : (reel.platform === 'facebook' ? 'Facebook Reel' : 'Instagram Reel');

        // Note: strictly no fabricated or random numbers. Only display social metrics if genuine API data is connected.
        const hasConnectedSocialApi = typeof reel.views === 'number' && reel.social_likes !== undefined;

        return `
            <div class="reel-insights-card">
                <div class="reel-insights-card-header">
                    <span style="font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#5E3435;">${platformName}</span>
                    <span class="content-status-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="reel-insights-card-main">
                    <img src="${thumbImg}" alt="Reel Thumbnail" class="reel-insights-thumb" onerror="this.src='/images/default-avatar.png'">
                    <div class="reel-insights-meta">
                        <span class="reel-insights-title">${reel.caption ? (reel.caption.length > 50 ? reel.caption.slice(0, 50) + '…' : reel.caption) : 'WishRite Jewellery Reel'}</span>
                        <span class="reel-insights-sub">Submitted: ${dateStr}</span>
                        ${reel.product_name ? `<span class="reel-insights-sub" style="color:#5E3435; font-weight:500;">Product: ${reel.product_name}</span>` : ''}
                        ${reel.product_category ? `<span class="reel-insights-sub">Category: ${reel.product_category}</span>` : ''}
                        <a href="${reel.url}" target="_blank" rel="noopener" style="font-size:0.78rem; color:#5E3435; text-decoration:underline; margin-top:2px;">View Reel ↗</a>
                    </div>
                </div>

                ${hasConnectedSocialApi ? `
                    <div class="reel-insights-metrics-grid">
                        <div class="reel-insights-metric-item">
                            <span class="reel-metric-val">${Number(reel.views || 0).toLocaleString()}</span>
                            <span class="reel-metric-label">Views</span>
                        </div>
                        <div class="reel-insights-metric-item">
                            <span class="reel-metric-val">${Number(reel.social_likes || 0).toLocaleString()}</span>
                            <span class="reel-metric-label">Likes</span>
                        </div>
                        <div class="reel-insights-metric-item">
                            <span class="reel-metric-val">${Number(reel.social_comments || 0).toLocaleString()}</span>
                            <span class="reel-metric-label">Comments</span>
                        </div>
                    </div>
                ` : `
                    <div class="reel-insights-notice">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <span>Performance insights will appear here when social-platform insights are available.</span>
                    </div>
                `}

                <!-- Real WishRite Attribution Performance -->
                <div class="reel-insights-tracking-box">
                    <div>
                        <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--wr-text-muted); display:block;">WishRite Performance</span>
                        <span style="font-size:0.85rem; font-weight:600; color:#5E3435;">
                            ${Number(reel.clicks || 0)} Clicks &bull; ${Number(reel.orders || 0)} Orders
                        </span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--wr-text-muted); display:block;">Commission</span>
                        <span style="font-size:0.85rem; font-weight:700; color:#2E7D32;">₹${Number(reel.commission_amount || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
window.renderReelInsightsGrid = renderReelInsightsGrid;

/**
 * Fetches and renders the creator's submitted content and updates Reel Insights
 */
/* ==============================================================================
   MY CONTENT — INSTAGRAM CONTENT LIST & AUTOMATIC INSIGHTS CONTROLLER
   Official Meta/Instagram API sync, responsive table on desktop, cards on mobile.
   ============================================================================== */

let currentContentFilter = 'all';
let currentContentSort = 'newest';
let currentInstagramConnection = null;

function formatContentMetric(val) {
    if (val === null || val === undefined) {
        return '<span class="content-metric-na">—</span>';
    }
    const num = Number(val);
    if (isNaN(num)) return '<span class="content-metric-na">—</span>';
    if (num >= 1000000) {
        return `<span class="content-metric-val">${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M</span>`;
    }
    if (num >= 1000) {
        return `<span class="content-metric-val">${(num / 1000).toFixed(1).replace(/\.0$/, '')}K</span>`;
    }
    return `<span class="content-metric-val">${num.toLocaleString()}</span>`;
}

function formatMobileMetricText(val) {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return '—';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}

function formatSyncTime(isoStr) {
    if (!isoStr) return 'Not synced yet';
    try {
        const d = new Date(isoStr);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (_) {
        return 'Not synced yet';
    }
}

function formatSubmissionDate(isoStr) {
    if (!isoStr) return '';
    try {
        return new Date(isoStr).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (_) {
        return '';
    }
}

/**
 * Loads Instagram Connection status and renders the connection card
 */
async function loadInstagramConnection() {
    const cardEl = document.getElementById('creator-instagram-conn-card');
    if (!cardEl) return;

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/instagram/status', { headers });
        const json = await res.json();
        currentInstagramConnection = json;
        renderInstagramConnectionCard(json);
    } catch (e) {
        console.warn('Could not load Instagram connection status:', e);
    }
}
window.loadInstagramConnection = loadInstagramConnection;

/**
 * Renders the Instagram Connection Card above the content list
 */
function renderInstagramConnectionCard(conn) {
    const cardEl = document.getElementById('creator-instagram-conn-card');
    if (!cardEl) return;

    if (conn && conn.connected && conn.username) {
        const syncText = conn.last_synced_at ? `Last synced: ${formatSyncTime(conn.last_synced_at)}` : 'Not synced yet';
        cardEl.innerHTML = `
            <div class="ig-conn-connected">
                <div class="ig-conn-header">
                    <div class="ig-conn-brand">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                        <span>INSTAGRAM CONNECTION</span>
                    </div>
                    <span class="ig-conn-badge connected">✓ Connected</span>
                </div>
                <div class="ig-conn-body">
                    <div>
                        <div class="ig-conn-handle">@${conn.username}</div>
                        <div class="ig-conn-sub">Eligible Professional Account &bull; Official Meta Graph API Connected</div>
                        <div class="ig-conn-synced">${syncText}</div>
                    </div>
                    <div class="ig-conn-actions">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="syncAllInstagramInsights()" id="btn-sync-all-ig" style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; font-size:0.75rem;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" id="icon-sync-all-ig"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <span>SYNC NOW</span>
                        </button>
                        <button type="button" class="btn btn-ghost btn-sm" onclick="disconnectInstagramAccount()" style="padding:6px 12px; font-size:0.75rem; color:#dc2626;">
                            <span>DISCONNECT</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        cardEl.innerHTML = `
            <div class="ig-conn-unconnected">
                <div class="ig-conn-header">
                    <div class="ig-conn-brand">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                        <span>INSTAGRAM CONNECTION</span>
                    </div>
                    <span class="ig-conn-badge unconnected">Not Connected</span>
                </div>
                <div class="ig-conn-body">
                    <div style="max-width:540px;">
                        <p style="margin:0 0 4px 0; font-weight:600; font-size:0.88rem; color:var(--wr-text);">Connect your Instagram account to automatically receive Reel and Post performance insights.</p>
                        <span style="font-size:0.78rem; color:var(--wr-text-muted);">Instagram insights require an eligible Instagram professional account connected to WishRite.</span>
                    </div>
                    <div class="ig-conn-actions">
                        <button type="button" class="btn btn-primary btn-sm" onclick="openInstagramConnectModal()" style="padding:8px 16px; font-size:0.78rem; letter-spacing:0.5px;">
                            <span>CONNECT INSTAGRAM</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}
window.renderInstagramConnectionCard = renderInstagramConnectionCard;

function openInstagramConnectModal() {
    const modal = document.getElementById('modal-connect-instagram');
    if (modal) modal.style.display = 'flex';
}
window.openInstagramConnectModal = openInstagramConnectModal;

function closeInstagramConnectModal() {
    const modal = document.getElementById('modal-connect-instagram');
    if (modal) modal.style.display = 'none';
}
window.closeInstagramConnectModal = closeInstagramConnectModal;

async function handleInstagramConnectSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const handleInput = document.getElementById('ig-connect-handle');
    const tokenInput = document.getElementById('ig-connect-token');
    const submitBtn = document.getElementById('btn-submit-ig-connect');

    const handle = handleInput ? handleInput.value.trim() : '';
    const token = tokenInput ? tokenInput.value.trim() : '';

    if (!handle) {
        alert('Please enter your Instagram username.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Connecting...';
    }

    try {
        const headers = await getAuthHeaders();
        headers['Content-Type'] = 'application/json';

        const res = await fetch('/api/creator/instagram/connect', {
            method: 'POST',
            headers,
            body: JSON.stringify({ instagram_handle: handle, access_token: token })
        });
        const json = await res.json();

        if (json.success) {
            if (typeof showToast === 'function') {
                showToast(json.message || 'Instagram account connected successfully!', 'success');
            }
            closeInstagramConnectModal();
            loadInstagramConnection();
            loadCreatorContent();
        } else {
            alert(json.error?.message || 'Failed to connect Instagram account.');
        }
    } catch (e) {
        alert('Error connecting Instagram: ' + e.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Connect Account';
        }
    }
}
window.handleInstagramConnectSubmit = handleInstagramConnectSubmit;

async function disconnectInstagramAccount() {
    if (!confirm('Are you sure you want to disconnect your Instagram account? Automatic metric synchronization will be paused.')) return;

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/instagram/disconnect', {
            method: 'POST',
            headers
        });
        const json = await res.json();
        if (json.success) {
            if (typeof showToast === 'function') {
                showToast('Instagram account disconnected.', 'success');
            }
            loadInstagramConnection();
            loadCreatorContent();
        }
    } catch (e) {
        alert('Error disconnecting Instagram: ' + e.message);
    }
}
window.disconnectInstagramAccount = disconnectInstagramAccount;

/**
 * Synchronizes metrics for a single content item via official Meta Graph API
 */
async function syncContentInsights(contentId, btnEl) {
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerText = '↻ Syncing...';
    }

    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/creator/content/${contentId}/sync`, {
            method: 'POST',
            headers
        });
        const json = await res.json();

        if (json.success) {
            if (json.sync && json.sync.synced) {
                if (typeof showToast === 'function') {
                    showToast('✓ Updated just now from Instagram API', 'success');
                }
            } else if (json.sync && json.sync.insights_status === 'not_connected') {
                if (typeof showToast === 'function') {
                    showToast('Connect your Instagram professional account to view official metrics.', 'info');
                }
            } else if (json.sync && json.sync.insights_status === 'auth_expired') {
                if (typeof showToast === 'function') {
                    showToast('Your Instagram connection needs attention. Please reconnect Instagram.', 'error');
                }
            } else if (json.sync && json.sync.message) {
                if (typeof showToast === 'function') {
                    showToast(json.sync.message, 'info');
                }
            }
            loadCreatorContent(currentContentFilter);
        } else {
            alert(json.error?.message || 'Insights temporarily unavailable. Please try again later.');
        }
    } catch (e) {
        console.error('Error syncing insights:', e);
        if (typeof showToast === 'function') {
            showToast('Instagram insights are temporarily unavailable. Please try again later.', 'error');
        }
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerText = '↻ Sync';
        }
    }
}
window.syncContentInsights = syncContentInsights;

/**
 * Batch synchronizes all Instagram content for the creator
 */
async function syncAllInstagramInsights() {
    const icon = document.getElementById('icon-sync-all-ig');
    const btn = document.getElementById('btn-sync-all-ig');
    if (icon) icon.classList.add('rotating');
    if (btn) btn.disabled = true;

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/instagram/sync', {
            method: 'POST',
            headers
        });
        const json = await res.json();
        if (json.success) {
            if (typeof showToast === 'function') {
                showToast(json.message || 'Instagram metrics synchronized.', 'success');
            }
            loadCreatorContent(currentContentFilter);
            loadInstagramConnection();
        } else {
            if (typeof showToast === 'function') {
                showToast('Instagram insights temporarily unavailable.', 'info');
            }
        }
    } catch (e) {
        console.error('Error syncing all Instagram insights:', e);
    } finally {
        if (icon) icon.classList.remove('rotating');
        if (btn) btn.disabled = false;
    }
}
window.syncAllInstagramInsights = syncAllInstagramInsights;

/**
 * Fetches and renders creator's submitted content in list/table view
 */
async function loadCreatorContent(statusFilter = 'all') {
    currentContentFilter = statusFilter;
    const container = document.getElementById('creator-content-list-container') || document.getElementById('creator-content-grid');

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/content', { headers });
        const json = await res.json();

        if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
            currentCreatorContent = [];
            currentReelsList = [];
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:36px 20px; background:#fff; border:1px solid rgba(94,52,53,0.12); border-radius:8px; color:var(--wr-text-muted);">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px; color:#5E3435;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                        <h4 style="margin:0 0 4px 0; color:#5E3435; font-size:1rem;">No Content Submitted Yet</h4>
                        <p style="margin:0; font-size:0.82rem;">Share a WishRite Instagram Reel or Post to track its performance metrics here.</p>
                    </div>
                `;
            }
            renderReelInsightsGrid();
            return;
        }

        currentCreatorContent = json.data;
        currentReelsList = json.data.filter(i => (i.content_type || '').toLowerCase() === 'reel');
        renderReelInsightsGrid();

        if (!container) return;

        let items = [...json.data];
        const normFilter = String(statusFilter || 'all').toLowerCase();
        if (normFilter !== 'all') {
            if (normFilter === 'post' || normFilter === 'posts') {
                items = items.filter(i => (i.content_type || '').toLowerCase() === 'post');
            } else if (normFilter === 'reel' || normFilter === 'reels') {
                items = items.filter(i => (i.content_type || '').toLowerCase() === 'reel');
            } else if (normFilter === 'pending') {
                items = items.filter(i => (i.status || '').toLowerCase() !== 'approved' && (i.status || '').toLowerCase() !== 'rejected');
            } else if (normFilter === 'approved') {
                items = items.filter(i => (i.status || '').toLowerCase() === 'approved');
            }
        }

        // Apply sorting
        if (currentContentSort === 'views') {
            items.sort((a, b) => (Number(b.views_count || b.views || -1)) - (Number(a.views_count || a.views || -1)));
        } else if (currentContentSort === 'likes') {
            items.sort((a, b) => (Number(b.likes_count || -1)) - (Number(a.likes_count || -1)));
        } else if (currentContentSort === 'comments') {
            items.sort((a, b) => (Number(b.comments_count || -1)) - (Number(a.comments_count || -1)));
        } else if (currentContentSort === 'shares') {
            items.sort((a, b) => (Number(b.shares_count || -1)) - (Number(a.shares_count || -1)));
        } else {
            // Newest default
            items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:32px 20px; background:#fff; border:1px solid rgba(94,52,53,0.12); border-radius:8px; color:var(--wr-text-muted);">
                    <p style="margin:0; font-size:0.85rem;">No content matching the '${statusFilter}' filter.</p>
                </div>
            `;
            return;
        }

        renderCreatorContentList(items, container);
    } catch (e) {
        console.error('Error loading creator content:', e);
    }
}
window.loadCreatorContent = loadCreatorContent;

/**
 * Renders both Desktop Table View and Mobile Cards
 */
function renderCreatorContentList(items, container) {
    if (!container) return;

    // 1. Desktop Table View
    let tableHtml = `
        <div class="content-table-wrapper">
            <table class="content-list-table">
                <thead>
                    <tr>
                        <th style="min-width:240px;">Content</th>
                        <th>Platform</th>
                        <th style="min-width:140px;">Product</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th style="text-align:right;">Views</th>
                        <th style="text-align:right;">Likes</th>
                        <th style="text-align:right;">Comments</th>
                        <th style="text-align:right;">Shares</th>
                        <th>Submitted</th>
                        <th style="text-align:right; min-width:130px;">Link / Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    items.forEach(item => {
        const isReel = (item.content_type || '').toLowerCase() === 'reel';
        const typeLabel = isReel ? 'Reel' : 'Post';
        const statusClass = (item.status || '').toLowerCase() === 'approved' ? 'verified' : ((item.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'pending');
        const statusLabel = (item.status || '').toLowerCase() === 'approved' ? '✓ Approved' : ((item.status || '').toLowerCase() === 'rejected' ? '✕ Rejected' : '⧖ Under Review');
        const thumbImg = item.thumbnail_url || item.product_image || 'https://images.wishrite.in/products/WR-ER-002.jpg';
        const safeUrl = (item.url || '').replace(/"/g, '&quot;');
        const safeName = (item.product_name || 'WishRite Piece').replace(/"/g, '&quot;');
        const safeCat = (item.product_category || 'Jewellery').replace(/"/g, '&quot;');

        tableHtml += `
            <tr data-content-id="${item.id}">
                <td>
                    <div class="content-col-media">
                        <a href="${safeUrl}" target="_blank" rel="noopener" title="Open on Instagram">
                            <img src="${thumbImg}" alt="${typeLabel}" class="content-table-thumb" onerror="this.src='/images/default-avatar.png'" />
                        </a>
                        <div>
                            <span class="content-table-type">Instagram ${typeLabel}</span>
                            <a href="${safeUrl}" target="_blank" rel="noopener" class="content-table-url" title="${safeUrl}">${item.url}</a>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-weight:600; color:#5E3435;">📸 Instagram</span>
                </td>
                <td>
                    <span class="content-product-name">${safeName}</span>
                    ${item.product_code ? `<span class="content-product-code">${item.product_code}</span>` : ''}
                </td>
                <td>
                    <span style="color:#5E3435; font-size:0.8rem;">${safeCat}</span>
                </td>
                <td>
                    <span class="content-status-badge ${statusClass}">${statusLabel}</span>
                </td>
                <td>${formatContentMetric(item.views_count)}</td>
                <td>${formatContentMetric(item.likes_count)}</td>
                <td>${formatContentMetric(item.comments_count)}</td>
                <td>${formatContentMetric(item.shares_count)}</td>
                <td>
                    <span style="font-size:0.78rem; color:var(--wr-text-muted);">${formatSubmissionDate(item.created_at)}</span>
                </td>
                <td>
                    <div class="content-table-actions">
                        <a href="${safeUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-xs btn-view-content" style="padding:4px 8px; font-size:0.75rem; text-decoration:none; white-space:nowrap;">View ${typeLabel} ↗</a>
                        <button type="button" class="btn btn-ghost btn-xs btn-sync-content" onclick="syncContentInsights('${item.id}', this)" title="Sync Insights" style="padding:4px 8px; font-size:0.75rem;">↻ Sync</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;

    // 2. Mobile Responsive Card List (Under 860px)
    let mobileCardsHtml = `<div class="content-card-mobile-list">`;
    items.forEach(item => {
        const isReel = (item.content_type || '').toLowerCase() === 'reel';
        const typeLabel = isReel ? 'Reel' : 'Post';
        const statusClass = (item.status || '').toLowerCase() === 'approved' ? 'verified' : ((item.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'pending');
        const statusLabel = (item.status || '').toLowerCase() === 'approved' ? '✓ Approved' : ((item.status || '').toLowerCase() === 'rejected' ? '✕ Rejected' : '⧖ Under Review');
        const thumbImg = item.thumbnail_url || item.product_image || 'https://images.wishrite.in/products/WR-ER-002.jpg';
        const safeUrl = (item.url || '').replace(/"/g, '&quot;');
        const safeName = (item.product_name || 'WishRite Piece').replace(/"/g, '&quot;');
        const safeCat = (item.product_category || 'Jewellery').replace(/"/g, '&quot;');

        mobileCardsHtml += `
            <div class="content-mobile-card" data-content-id="${item.id}">
                <div class="content-mobile-card-top">
                    <span style="font-size:0.75rem; font-weight:700; color:#5E3435; text-transform:uppercase; letter-spacing:0.5px;">📸 Instagram ${typeLabel}</span>
                    <span class="content-status-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div class="content-mobile-card-product">
                    <a href="${safeUrl}" target="_blank" rel="noopener">
                        <img src="${thumbImg}" alt="${typeLabel}" class="content-mobile-thumb" onerror="this.src='/images/default-avatar.png'" />
                    </a>
                    <div>
                        <div style="font-weight:600; font-size:0.9rem; color:var(--wr-text);">${safeName}</div>
                        <div style="font-size:0.78rem; color:#5E3435;">Category: ${safeCat}</div>
                    </div>
                </div>
                <div class="content-mobile-url-row">
                    <a href="${safeUrl}" target="_blank" rel="noopener">${item.url}</a>
                </div>
                <div class="content-mobile-metrics-grid">
                    <div class="content-mobile-metric-item">
                        <span>${formatMobileMetricText(item.views_count)}</span>
                        <span>Views</span>
                    </div>
                    <div class="content-mobile-metric-item">
                        <span>${formatMobileMetricText(item.likes_count)}</span>
                        <span>Likes</span>
                    </div>
                    <div class="content-mobile-metric-item">
                        <span>${formatMobileMetricText(item.comments_count)}</span>
                        <span>Comments</span>
                    </div>
                    <div class="content-mobile-metric-item">
                        <span>${formatMobileMetricText(item.shares_count)}</span>
                        <span>Shares</span>
                    </div>
                </div>
                <div class="content-mobile-card-footer">
                    <div style="font-size:0.72rem; color:var(--wr-text-muted);">
                        Submitted: ${formatSubmissionDate(item.created_at)}<br />
                        ${item.last_synced_at ? `Last synced: ${formatSyncTime(item.last_synced_at)}` : 'Not synced yet'}
                    </div>
                    <div class="content-mobile-actions">
                        <a href="${safeUrl}" target="_blank" rel="noopener" class="btn btn-outline btn-xs" style="padding:4px 8px; font-size:0.75rem; text-decoration:none;">View ${typeLabel} ↗</a>
                        <button type="button" class="btn btn-primary btn-xs" onclick="syncContentInsights('${item.id}', this)" style="padding:4px 8px; font-size:0.75rem;">↻ Sync</button>
                    </div>
                </div>
            </div>
        `;
    });
    mobileCardsHtml += `</div>`;

    container.innerHTML = tableHtml + mobileCardsHtml;
}
window.renderCreatorContentList = renderCreatorContentList;

function filterCreatorContent(filter, btn) {
    document.querySelectorAll('.content-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadCreatorContent(filter);
}
window.filterCreatorContent = filterCreatorContent;
window.setContentFilter = filterCreatorContent;

function sortCreatorContent(sortVal) {
    currentContentSort = sortVal;
    loadCreatorContent(currentContentFilter);
}
window.sortCreatorContent = sortCreatorContent;

/**
 * Fetches live WishRite products for the category & product selector
 */
function getNormalizedCategory(rawCat) {
    if (typeof window.normalizeCategory === 'function') {
        return window.normalizeCategory(rawCat);
    }
    if (!rawCat) return 'Other';
    const c = String(rawCat).trim();
    return c.charAt(0).toUpperCase() + c.slice(1);
}

async function fetchLiveProductsForPicker() {
    if (liveProductsCache.length > 0) {
        populateCategoryAndProductPickers();
        return liveProductsCache;
    }
    try {
        if (window.productLoader && typeof window.productLoader.ensureLoaded === 'function') {
            const prods = await window.productLoader.ensureLoaded();
            if (Array.isArray(prods) && prods.length > 0) {
                liveProductsCache = prods;
                populateCategoryAndProductPickers();
                return liveProductsCache;
            }
        }
    } catch (_) {}
    if (window.productsDB && Array.isArray(window.productsDB) && window.productsDB.length > 0) {
        liveProductsCache = window.productsDB;
        populateCategoryAndProductPickers();
        return liveProductsCache;
    }
    try {
        const res = await fetch('/api/public/products');
        const json = await res.json();
        const items = json.products || json.data || [];
        if (Array.isArray(items) && items.length > 0) {
            liveProductsCache = items;
            populateCategoryAndProductPickers();
            return liveProductsCache;
        }
    } catch (_) {}
    return liveProductsCache;
}

function populateCategoryAndProductPickers() {
    const postCatSelect = document.getElementById('share-post-category');
    const reelCatSelect = document.getElementById('share-reel-category');
    const postProdSelect = document.getElementById('share-post-product') || document.getElementById('share-post-product-select');
    const reelProdSelect = document.getElementById('share-reel-product') || document.getElementById('share-reel-product-select');

    if (!liveProductsCache || liveProductsCache.length === 0) return;

    // Dynamically extract distinct categories from live inventory catalog
    const catSet = new Set();
    liveProductsCache.forEach(p => {
        const norm = getNormalizedCategory(p.category);
        if (norm) catSet.add(norm);
    });

    const sortedCategories = Array.from(catSet).sort();
    const catOptions = `<option value="">Select Product Category ▼</option>` +
        sortedCategories.map(c => `<option value="${c}">${c}</option>`).join('');

    if (postCatSelect && (!postCatSelect.options || postCatSelect.options.length <= 1)) {
        postCatSelect.innerHTML = catOptions;
    }
    if (reelCatSelect && (!reelCatSelect.options || reelCatSelect.options.length <= 1)) {
        reelCatSelect.innerHTML = catOptions;
    }

    // Initial state: Product dropdowns disabled until a category is selected
    if (postProdSelect && (!postCatSelect || !postCatSelect.value)) {
        postProdSelect.innerHTML = `<option value="">Select a category first ▼</option>`;
        postProdSelect.disabled = true;
    }
    if (reelProdSelect && (!reelCatSelect || !reelCatSelect.value)) {
        reelProdSelect.innerHTML = `<option value="">Select a category first ▼</option>`;
        reelProdSelect.disabled = true;
    }
}
window.populateCategoryAndProductPickers = populateCategoryAndProductPickers;

function handleCategoryChange(type) {
    const catSelect = document.getElementById(`share-${type}-category`);
    const prodSelect = document.getElementById(`share-${type}-product`) || document.getElementById(`share-${type}-product-select`);
    const previewBox = document.getElementById(`share-${type}-product-preview`);

    if (previewBox) {
        previewBox.style.display = 'none';
        previewBox.innerHTML = '';
    }

    if (!prodSelect) return;

    const selectedCategory = catSelect?.value?.trim() || '';
    if (!selectedCategory) {
        prodSelect.innerHTML = `<option value="">Select a category first ▼</option>`;
        prodSelect.disabled = true;
        return;
    }

    // Filter live products belonging strictly to the selected category
    const matchingProducts = liveProductsCache.filter(p => {
        const norm = getNormalizedCategory(p.category);
        return norm.toLowerCase() === selectedCategory.toLowerCase() ||
               (p.category && String(p.category).toLowerCase() === selectedCategory.toLowerCase());
    });

    if (matchingProducts.length === 0) {
        prodSelect.innerHTML = `<option value="">No products are currently available in this category.</option>`;
        prodSelect.disabled = true;
        return;
    }

    prodSelect.disabled = false;
    prodSelect.innerHTML = `<option value="">Select Product ▼</option>` +
        matchingProducts.map(p => {
            const imgUrl = p.image_url || (Array.isArray(p.images) ? p.images[0] : '') || '';
            const code = p.product_code || '';
            const name = p.product_name || '';
            return `<option value="${code}" data-name="${name}" data-img="${imgUrl}" data-category="${selectedCategory}">${name} — ${code}</option>`;
        }).join('');
}
window.handleCategoryChange = handleCategoryChange;

function handleProductChange(type) {
    const prodSelect = document.getElementById(`share-${type}-product`) || document.getElementById(`share-${type}-product-select`);
    const previewBox = document.getElementById(`share-${type}-product-preview`);
    if (!previewBox) return;

    const selectedOption = prodSelect?.selectedOptions?.[0];
    const code = selectedOption?.value || '';
    const name = selectedOption?.getAttribute('data-name') || '';
    const img = selectedOption?.getAttribute('data-img') || '';

    if (!code || !name) {
        previewBox.style.display = 'none';
        previewBox.innerHTML = '';
        return;
    }

    previewBox.style.display = 'flex';
    previewBox.innerHTML = `
        <img src="${img || '/images/default-avatar.png'}" alt="${name}" class="product-preview-thumb" onerror="this.src='/images/default-avatar.png'">
        <div class="product-preview-info">
            <span class="product-preview-title">${name}</span>
            <span class="product-preview-code">Product Code: ${code}</span>
        </div>
    `;
}
window.handleProductChange = handleProductChange;

/**
 * Open Share Post / Reel Modals
 */
function openSharePostModal() {
    const modal = document.getElementById('modal-share-post');
    if (modal) modal.style.display = 'flex';
    fetchLiveProductsForPicker();
}
window.openSharePostModal = openSharePostModal;

function closeSharePostModal() {
    const modal = document.getElementById('modal-share-post');
    if (modal) modal.style.display = 'none';
}
window.closeSharePostModal = closeSharePostModal;

function openShareReelModal() {
    const modal = document.getElementById('modal-share-reel');
    if (modal) modal.style.display = 'flex';
    fetchLiveProductsForPicker();
}
window.openShareReelModal = openShareReelModal;

function closeShareReelModal() {
    const modal = document.getElementById('modal-share-reel');
    if (modal) modal.style.display = 'none';
}
window.closeShareReelModal = closeShareReelModal;

/**
 * Handles Post submission
 */
async function handleSharePostSubmit(e) {
    if (e) e.preventDefault();

    const urlInput = document.getElementById('share-post-url');
    const platformSelect = document.getElementById('share-post-platform');
    const catSelect = document.getElementById('share-post-category');
    const productSelect = document.getElementById('share-post-product') || document.getElementById('share-post-product-select');
    const captionInput = document.getElementById('share-post-caption');
    const imgInput = document.getElementById('share-post-image');
    const tagsInput = document.getElementById('share-post-tags');
    const errorEl = document.getElementById('share-post-error') || document.getElementById('share-post-msg');
    const successEl = document.getElementById('share-post-success');
    const btn = document.getElementById('share-post-submit-btn') || document.getElementById('btn-submit-post');

    if (errorEl) {
        errorEl.innerText = '';
        errorEl.style.display = 'none';
    }
    if (successEl) {
        successEl.style.display = 'none';
    }

    const url = urlInput?.value?.trim();
    if (!url) {
        if (errorEl) {
            errorEl.innerText = 'Please enter a valid Post URL.';
            errorEl.style.display = 'block';
        }
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (errorEl) {
            errorEl.innerText = 'Post URL must begin with http:// or https://';
            errorEl.style.display = 'block';
        }
        return;
    }

    const category = catSelect?.value?.trim() || '';
    if (!category) {
        if (errorEl) {
            errorEl.innerText = 'Please select a Product Category.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const selectedOption = productSelect?.selectedOptions?.[0];
    const productCode = selectedOption?.value || '';
    const productName = selectedOption?.getAttribute('data-name') || '';
    const productImg = selectedOption?.getAttribute('data-img') || '';

    if (!productCode) {
        if (errorEl) {
            errorEl.innerText = 'Please select a Featured WishRite Product.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const payload = {
        content_type: 'post',
        platform: (platformSelect?.value || 'instagram').toLowerCase(),
        url,
        caption: captionInput?.value?.trim() || '',
        product_category: category,
        product_code: productCode,
        product_name: productName,
        product_image: productImg,
        thumbnail_url: imgInput?.value?.trim() || productImg || '',
        tags: tagsInput?.value?.trim() || ''
    };

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Submitting…';
        }

        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/content', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error?.message || 'Could not submit post.');
        }

        if (successEl) {
            successEl.style.display = 'block';
        }
        if (typeof showToast === 'function') {
            showToast('Post submitted successfully and is now under review!', 'success');
        }

        setTimeout(() => {
            closeSharePostModal();
            loadCreatorContent();
        }, 800);
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = err.message;
            errorEl.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'SUBMIT POST FOR REVIEW';
        }
    }
}
window.handleSharePostSubmit = handleSharePostSubmit;

/**
 * Handles Reel submission
 */
async function handleShareReelSubmit(e) {
    if (e) e.preventDefault();

    const urlInput = document.getElementById('share-reel-url');
    const platformSelect = document.getElementById('share-reel-platform');
    const catSelect = document.getElementById('share-reel-category');
    const productSelect = document.getElementById('share-reel-product') || document.getElementById('share-reel-product-select');
    const captionInput = document.getElementById('share-reel-caption');
    const imgInput = document.getElementById('share-reel-thumbnail') || document.getElementById('share-reel-image');
    const tagsInput = document.getElementById('share-reel-tags');
    const errorEl = document.getElementById('share-reel-error') || document.getElementById('share-reel-msg');
    const successEl = document.getElementById('share-reel-success');
    const btn = document.getElementById('share-reel-submit-btn') || document.getElementById('btn-submit-reel');

    if (errorEl) {
        errorEl.innerText = '';
        errorEl.style.display = 'none';
    }
    if (successEl) {
        successEl.style.display = 'none';
    }

    const url = urlInput?.value?.trim();
    if (!url) {
        if (errorEl) {
            errorEl.innerText = 'Please enter a valid Reel URL.';
            errorEl.style.display = 'block';
        }
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (errorEl) {
            errorEl.innerText = 'Reel URL must begin with http:// or https://';
            errorEl.style.display = 'block';
        }
        return;
    }

    const category = catSelect?.value?.trim() || '';
    if (!category) {
        if (errorEl) {
            errorEl.innerText = 'Please select a Product Category.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const selectedOption = productSelect?.selectedOptions?.[0];
    const productCode = selectedOption?.value || '';
    const productName = selectedOption?.getAttribute('data-name') || '';
    const productImg = selectedOption?.getAttribute('data-img') || '';

    if (!productCode) {
        if (errorEl) {
            errorEl.innerText = 'Please select a Featured WishRite Product.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const payload = {
        content_type: 'reel',
        platform: (platformSelect?.value || 'instagram').toLowerCase(),
        url,
        caption: captionInput?.value?.trim() || '',
        product_category: category,
        product_code: productCode,
        product_name: productName,
        product_image: productImg,
        thumbnail_url: imgInput?.value?.trim() || productImg || '',
        tags: tagsInput?.value?.trim() || ''
    };

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Submitting…';
        }

        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/content', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error?.message || 'Could not submit reel.');
        }

        if (successEl) {
            successEl.style.display = 'block';
        }
        if (typeof showToast === 'function') {
            showToast('Reel submitted successfully and is now under review!', 'success');
        }

        setTimeout(() => {
            closeShareReelModal();
            loadCreatorContent();
        }, 800);
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = err.message;
            errorEl.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'SUBMIT REEL FOR REVIEW';
        }
    }
}
window.handleShareReelSubmit = handleShareReelSubmit;

/**
 * Rewards Modal
 */
async function openCreatorRewardsModal() {
    const modal = document.getElementById('modal-creator-rewards');
    const list = document.getElementById('creator-rewards-list');
    if (!modal) return;
    modal.style.display = 'flex';

    if (list) {
        list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--wr-text-muted);">Loading rewards catalogue…</p>';
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/creator/rewards', { headers });
            const json = await res.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                list.innerHTML = json.data.map(r => `
                    <div class="reward-catalogue-item">
                        <img src="${r.image_url || 'https://placehold.co/120x120/5E3435/FFF?text=Reward'}" alt="${r.name}" />
                        <div class="reward-info">
                            <h4>${r.name}</h4>
                            <p>${r.description || ''}</p>
                            <span class="reward-points-badge">${r.points_cost} Points</span>
                        </div>
                        <button class="btn btn-outline btn-sm" onclick="redeemCreatorReward('${r.id}')">Redeem</button>
                    </div>
                `).join('');
            } else {
                list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--wr-text-muted);">No rewards currently available.</p>';
            }
        } catch (_) {
            list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--wr-text-muted);">Could not load rewards.</p>';
        }
    }
}
window.openCreatorRewardsModal = openCreatorRewardsModal;

function closeCreatorRewardsModal() {
    const modal = document.getElementById('modal-creator-rewards');
    if (modal) modal.style.display = 'none';
}
window.closeCreatorRewardsModal = closeCreatorRewardsModal;

async function redeemCreatorReward(rewardId) {
    if (!confirm('Are you sure you want to redeem this reward with your WishRite points?')) return;
    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/creator/rewards/${rewardId}/redeem`, {
            method: 'POST',
            headers
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') {
                showToast(data.message || 'Reward redeemed successfully!', 'success');
            }
            closeCreatorRewardsModal();
            loadCustomerCreatorStatus();
        } else {
            alert(data.error?.message || 'Could not redeem reward.');
        }
    } catch (e) {
        alert(e.message);
    }
}
window.redeemCreatorReward = redeemCreatorReward;

/* ==============================================================================
   CREATOR CONTEST LEADERBOARD CONTROLLER
   Server-authoritative, deterministic rankings, zero client-side score tampering.
   ============================================================================== */

function escapeContestHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Authoritatively fetches and renders the current Creator Contest Leaderboard
 */
async function loadCreatorContest(showLoading = false) {
    const container = document.getElementById('creator-contest-container');
    if (!container) return;

    if (showLoading || !container.children.length) {
        container.innerHTML = `
            <div class="contest-loading-state" id="contest-loading-card">
                <div class="contest-spinner"></div>
                <div class="contest-loading-title">Loading current standings...</div>
                <p class="contest-loading-desc">Calculating real-time verified creator scores</p>
            </div>
        `;
    }

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/contest', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error?.message || 'Failed to load contest standings');
        renderCreatorContest(data);
    } catch (err) {
        console.error('Error loading contest leaderboard:', err);
        container.innerHTML = `
            <div class="contest-error-card" id="contest-error-card">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#dc2626" stroke-width="2" style="margin-bottom:8px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div class="contest-error-title">We couldn't load the current standings.</div>
                <p class="contest-error-desc">Please check your connection and try again.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="loadCreatorContest(true)" style="margin-top:12px; padding:6px 16px; font-size:0.75rem; letter-spacing:0.5px;">TRY AGAIN</button>
            </div>
        `;
    }
}
window.loadCreatorContest = loadCreatorContest;

/**
 * Handles user clicking the manual Refresh button
 */
async function refreshCreatorContestLeaderboard() {
    const icon = document.getElementById('icon-refresh-contest');
    if (icon) icon.classList.add('rotating');
    try {
        await loadCreatorContest(false);
        if (typeof showToast === 'function') {
            showToast('Leaderboard updated with latest standings', 'success');
        }
    } finally {
        if (icon) {
            setTimeout(() => icon.classList.remove('rotating'), 600);
        }
    }
}
window.refreshCreatorContestLeaderboard = refreshCreatorContestLeaderboard;

/**
 * Renders the Contest Leaderboard into #creator-contest-container
 */
function renderCreatorContest(data) {
    const container = document.getElementById('creator-contest-container');
    if (!container) return;

    const contest = data && data.contest;
    if (!contest) {
        // Section 20 Empty state:
        // "No active contest right now. New Creator contests will appear here when available."
        container.innerHTML = `
            <div class="contest-empty-card" id="contest-empty-card">
                <div class="contest-empty-icon">🏆</div>
                <h4 class="contest-empty-title">No active contest right now.</h4>
                <p class="contest-empty-desc">New Creator contests will appear here when available.</p>
            </div>
        `;
        return;
    }

    const current = data.currentCreator || null;
    const leaders = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    const nearby = Array.isArray(data.nearby) ? data.nearby : [];
    const totalParticipants = Number(data.totalParticipants || contest.total_participants || leaders.length || 0);

    // Section 15 Contest Status
    let statusPillClass = 'active';
    let statusText = 'ACTIVE';
    let timeLabel = '';
    if (contest.status === 'upcoming') {
        statusPillClass = 'upcoming';
        statusText = 'UPCOMING';
        timeLabel = `Contest starts on ${contest.startsAt || '1 Nov 2026'}`;
    } else if (contest.status === 'ended') {
        statusPillClass = 'ended';
        statusText = 'ENDED';
        timeLabel = `Contest ended • Final position: ${current ? '#' + current.rank : 'N/A'}`;
    } else {
        statusPillClass = 'active';
        statusText = 'ACTIVE';
        timeLabel = contest.daysRemaining !== undefined && contest.daysRemaining !== null
            ? `Contest ends in ${contest.daysRemaining} days (${contest.endsAt || '26 Nov 2026'})`
            : `Ends: ${contest.endsAt || '26 Nov 2026'}`;
    }

    // Helper for medals
    const getRankDisplay = (rank) => {
        if (rank === 1) return '<span class="contest-medal">🥇 1</span>';
        if (rank === 2) return '<span class="contest-medal">🥈 2</span>';
        if (rank === 3) return '<span class="contest-medal">🥉 3</span>';
        return `<span class="contest-rank-plain">${rank}</span>`;
    };

    // Helper for avatar with graceful fallback to initial
    const getAvatarHtml = (name, img) => {
        const safeName = escapeContestHtml(name || 'Creator');
        const initial = (name || 'C').charAt(0).toUpperCase();
        if (img) {
            return `<img src="${img}" alt="${safeName}" class="contest-avatar" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'contest-avatar-fallback\\'>${initial}</span>';" />`;
        }
        return `<span class="contest-avatar-fallback">${initial}</span>`;
    };

    let html = '';

    // 1. ACTIVE CONTEST BANNER (Section 2 & 15)
    html += `
        <div class="contest-banner">
            <div class="contest-banner-header">
                <span class="contest-banner-kicker">ACTIVE CONTEST</span>
                <span class="contest-status-pill ${statusPillClass}">${statusText}</span>
            </div>
            <h4 class="contest-banner-title">${escapeContestHtml(contest.name || 'WishRite Creator Challenge')}</h4>
            <div class="contest-banner-meta">
                <span class="contest-banner-timer">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>${timeLabel}</span>
                </span>
                <span class="contest-banner-participants">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>${totalParticipants.toLocaleString()} Creators Participating</span>
                </span>
            </div>
        </div>
    `;

    // 2. CURRENT CREATOR POSITION HERO CARD (Section 3 & 14)
    if (current && current.rank) {
        let progressMsg = '';
        if (current.isFirst) {
            progressMsg = '🏆 You are currently #1!';
        } else if (current.pointsToNext && current.nextRank) {
            progressMsg = `You need <strong>${current.pointsToNext.toLocaleString()}</strong> more points to reach <strong>#${current.nextRank}</strong>.`;
            if (current.positionsFromTop10 > 0) {
                progressMsg += ` <span style="opacity:0.85;">(${current.positionsFromTop10} ${current.positionsFromTop10 === 1 ? 'position' : 'positions'} away from Top 10)</span>`;
            }
        } else if (current.positionsFromTop10 > 0) {
            progressMsg = `${current.positionsFromTop10} ${current.positionsFromTop10 === 1 ? 'position' : 'positions'} away from Top 10`;
        }

        const percentileText = current.topPercentile ? `You are currently in the <strong>TOP ${current.topPercentile}%</strong>` : 'Keep creating to climb higher!';

        html += `
            <div class="contest-position-card" id="contest-position-card">
                <div class="contest-position-header">
                    <span class="contest-position-label">Current Position</span>
                    <span class="contest-percentile-pill">TOP ${current.topPercentile || 10}%</span>
                </div>
                <div class="contest-position-main">
                    <div class="contest-rank-number">#${current.rank}</div>
                    <div class="contest-rank-out-of">out of ${totalParticipants.toLocaleString()}</div>
                </div>
                <div class="contest-position-percentile">${percentileText}</div>
                <div class="contest-position-footer">
                    <div class="contest-points-pill">
                        <span class="contest-points-val">${Number(current.points || 0).toLocaleString()}</span>
                        <span class="contest-points-lbl">Points</span>
                    </div>
                    ${progressMsg ? `<div class="contest-progress-msg">${progressMsg}</div>` : ''}
                </div>
            </div>
        `;
    } else if (current) {
        html += `
            <div class="contest-position-card" id="contest-position-card" style="padding:20px; text-align:center;">
                <div class="contest-position-header" style="justify-content:center; margin-bottom:8px;">
                    <span class="contest-position-label">Your Contest Standing</span>
                </div>
                <div style="font-size:1.15rem; font-weight:700; color:var(--wr-primary, #5E3435); margin-bottom:6px;">
                    0 Contest Points
                </div>
                <div style="font-size:0.82rem; color:var(--wr-text-muted, #71717a); max-width:440px; margin:0 auto;">
                    No qualifying activity yet. Share your creator links or submit approved Instagram content to earn contest points and rank on the leaderboard!
                </div>
            </div>
        `;
    }

    // 3. LEADERBOARD TABLE (TOP 10) (Section 4, 5, 6 & 12)
    html += `
        <div class="contest-table-card">
            <div class="contest-table-header">
                <span class="contest-th col-rank">RANK</span>
                <span class="contest-th col-creator">CREATOR</span>
                <span class="contest-th col-points">POINTS</span>
            </div>
            <div class="contest-table-body">
    `;

    if (!leaders.length) {
        html += `<div style="text-align:center; padding:24px; color:var(--wr-text-muted); font-size:0.85rem;">No entries yet. Be the first to earn contest points!</div>`;
    } else {
        leaders.forEach(item => {
            const isMe = item.is_current_user || (current && String(item.rank) === String(current.rank) && item.points === current.points);
            const rowClass = isMe ? 'contest-row contest-row-you' : 'contest-row';
            const youTag = isMe ? '<span class="contest-you-badge">👉 YOU</span>' : '';
            const safeName = escapeContestHtml(item.name || 'WishRite Creator');

            html += `
                <div class="${rowClass}">
                    <div class="contest-cell col-rank">
                        ${getRankDisplay(item.rank)}
                    </div>
                    <div class="contest-cell col-creator">
                        <div class="contest-creator-info">
                            ${getAvatarHtml(item.name, item.profile_image)}
                            <div class="contest-creator-text">
                                <span class="contest-creator-name">${safeName}</span>
                                ${youTag}
                            </div>
                        </div>
                    </div>
                    <div class="contest-cell col-points">
                        <span class="contest-cell-points-val">${Number(item.points || 0).toLocaleString()}</span>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    // 4. NEARBY RANKS (Section 12 & 13: If current creator is outside Top 10)
    if (current && !current.isTop10 && nearby.length > 0) {
        html += `
            <div class="contest-nearby-card" style="margin-top:16px;">
                <div class="contest-nearby-header">
                    <div>
                        <h4 style="margin:0; font-size:0.9rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">YOUR POSITION &amp; NEARBY CREATORS</h4>
                        <span style="font-size:0.75rem; color:var(--wr-text-muted);">
                            ${current.positionsFromTop10 > 0 ? `<strong>${current.positionsFromTop10}</strong> ${current.positionsFromTop10 === 1 ? 'position' : 'positions'} away from Top 10` : 'Track your closest competitors'}
                        </span>
                    </div>
                </div>
                <div class="contest-table-body" style="margin-top:8px;">
        `;

        nearby.forEach(item => {
            const isMe = item.is_current_user || (current && String(item.rank) === String(current.rank));
            const rowClass = isMe ? 'contest-row contest-row-you' : 'contest-row';
            const youTag = isMe ? '<span class="contest-you-badge">👉 YOU</span>' : '';
            const safeName = escapeContestHtml(item.name || 'WishRite Creator');

            html += `
                <div class="${rowClass}">
                    <div class="contest-cell col-rank">
                        ${getRankDisplay(item.rank)}
                    </div>
                    <div class="contest-cell col-creator">
                        <div class="contest-creator-info">
                            ${getAvatarHtml(item.name, item.profile_image)}
                            <div class="contest-creator-text">
                                <span class="contest-creator-name">${safeName}</span>
                                ${youTag}
                            </div>
                        </div>
                    </div>
                    <div class="contest-cell col-points">
                        <span class="contest-cell-points-val">${Number(item.points || 0).toLocaleString()}</span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}
window.renderCreatorContest = renderCreatorContest;

// Ensure exposure on window.creatorProgram
if (!window.creatorProgram) window.creatorProgram = {};
window.creatorProgram.loadContest = loadCreatorContest;
window.creatorProgram.renderContest = renderCreatorContest;
window.creatorProgram.refreshContest = refreshCreatorContestLeaderboard;
