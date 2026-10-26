/* ==============================================================================
   WISHRITE — INTEGRATED CREATOR PROGRAM INSIDE MY ACCOUNT
   Powers Tab 2: CREATOR inside the customer's My Account view.
   Single identity, single session, seamless onboarding, content sharing & earnings.
   ============================================================================== */

let currentCreatorData = null;
let liveProductsCache = [];

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

        loadCustomerCreatorStatus();
        fetchLiveProductsForPicker();
    } else {
        btnCreator?.classList.remove('active');
        btnCreator?.setAttribute('aria-selected', 'false');
        btnAccount?.classList.add('active');
        btnAccount?.setAttribute('aria-selected', 'true');

        paneCreator.style.display = 'none';
        paneAccount.style.display = 'block';
    }
}
window.switchProfileTab = switchProfileTab;

/**
 * Returns authorization headers using customer session or creator token
 */
async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    
    // Check Supabase customer session
    if (window.supabaseClient && window.supabaseClient.auth) {
        try {
            const { data } = await window.supabaseClient.auth.getSession();
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

    // Customer email from currentUser in auth.js
    if (!headers['x-customer-email'] && window.currentUser?.email) {
        headers['x-customer-email'] = window.currentUser.email;
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
async function loadCreatorContent(statusFilter = 'all') {
    const grid = document.getElementById('creator-content-grid') || document.getElementById('creator-my-content-grid');
    const emptyEl = document.getElementById('creator-content-empty');

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/content', { headers });
        const json = await res.json();

        if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
            currentCreatorContent = [];
            currentReelsList = [];
            if (grid) grid.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            renderReelInsightsGrid();
            return;
        }

        currentCreatorContent = json.data;
        currentReelsList = json.data.filter(i => i.content_type === 'reel');
        renderReelInsightsGrid();

        if (!grid) return;

        let items = [...json.data];
        const normFilter = String(statusFilter || 'all').toLowerCase();
        if (normFilter !== 'all') {
            if (normFilter === 'post' || normFilter === 'posts') {
                items = items.filter(i => i.content_type === 'post');
            } else if (normFilter === 'reel' || normFilter === 'reels') {
                items = items.filter(i => i.content_type === 'reel');
            } else if (normFilter === 'pending') {
                items = items.filter(i => (i.status || '').toLowerCase() !== 'approved' && (i.status || '').toLowerCase() !== 'rejected');
            } else if (normFilter === 'approved') {
                items = items.filter(i => (i.status || '').toLowerCase() === 'approved');
            }
        }

        if (items.length === 0) {
            grid.innerHTML = '<p style="color:var(--wr-text-muted);grid-column:1/-1;text-align:center;padding:24px;">No content matching this filter.</p>';
            if (emptyEl) emptyEl.style.display = 'none';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        grid.innerHTML = items.map(item => {
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            const statusClass = (item.status || '').toLowerCase() === 'approved' ? 'verified' : ((item.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'pending');
            const statusLabel = (item.status || '').toLowerCase() === 'approved' ? '✓ Approved' : ((item.status || '').toLowerCase() === 'rejected' ? '✕ Rejected' : '⧖ Under Review');
            const platformIcon = item.platform === 'instagram' ? '📸 Instagram' : (item.platform === 'youtube' ? '▶ YouTube' : (item.platform === 'facebook' ? '👥 Facebook' : '🔗 Web'));
            const typeLabel = item.content_type === 'reel' ? 'Reel' : 'Post';
            const imgUrl = item.thumbnail_url || item.product_image || 'https://placehold.co/400x400/5E3435/FFF?text=WishRite+Jewellery';

            return `
                <div class="creator-content-card">
                    <div class="content-thumb-wrap">
                        <img src="${imgUrl}" alt="${item.caption || 'WishRite Content'}" loading="lazy" onerror="this.src='/images/default-avatar.png'" />
                        <span class="content-type-pill">${platformIcon} ${typeLabel}</span>
                        <span class="content-status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="content-card-body">
                        ${item.product_name ? `
                            <div style="margin-bottom:6px;">
                                <div class="content-product-tag" style="margin-bottom:2px;">✨ Product: ${item.product_name}</div>
                                ${item.product_category ? `<div style="font-size:0.75rem; color:var(--wr-text-muted); padding-left:4px;">Category: ${item.product_category}</div>` : ''}
                            </div>
                        ` : ''}
                        <p class="content-caption">${item.caption || 'Shared WishRite styling piece'}</p>
                        ${item.rejection_reason ? `<div class="content-reject-reason">Feedback: ${item.rejection_reason}</div>` : ''}
                        <div class="content-card-footer">
                            <span class="content-date">${dateStr}</span>
                            <a href="${item.url}" target="_blank" rel="noopener" class="content-external-link">View ${typeLabel} ↗</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading creator content:', e);
    }
}
window.loadCreatorContent = loadCreatorContent;

/**
 * Filter buttons for My Content
 */
function filterCreatorContent(filter, btn) {
    document.querySelectorAll('.content-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadCreatorContent(filter);
}
window.filterCreatorContent = filterCreatorContent;
window.setContentFilter = filterCreatorContent;

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
