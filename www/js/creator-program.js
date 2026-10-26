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
            prefillOnboardingForm();
        }
    } catch (err) {
        console.error('Error checking creator status:', err);
        if (loadingState) loadingState.style.display = 'none';
        if (onboardState) onboardState.style.display = 'block';
        prefillOnboardingForm();
    }
}
window.loadCustomerCreatorStatus = loadCustomerCreatorStatus;

/**
 * Prefills onboarding details using existing customer account info
 */
function prefillOnboardingForm() {
    const nameInput = document.getElementById('creator-input-name');
    const emailLabel = document.getElementById('creator-onboard-email-label');

    const customerName = document.getElementById('account-name')?.innerText || window.currentUser?.user_metadata?.full_name || '';
    const customerEmail = document.getElementById('account-email')?.innerText || window.currentUser?.email || '';

    if (nameInput && !nameInput.value && customerName && customerName !== '—') {
        nameInput.value = customerName;
    }
    if (emailLabel && customerEmail) {
        emailLabel.innerText = customerEmail;
    }
}

/**
 * Submits the Creator Onboarding Details Form
 */
async function handleCreatorOnboardSubmit(e) {
    if (e) e.preventDefault();

    const nameInput = document.getElementById('creator-input-name');
    const bioInput = document.getElementById('creator-input-bio');
    const cityInput = document.getElementById('creator-input-city');
    const stateInput = document.getElementById('creator-input-state');
    const countryInput = document.getElementById('creator-input-country');
    const instaUserInput = document.getElementById('creator-input-instagram-user');
    const instaUrlInput = document.getElementById('creator-input-instagram-url');
    const ytUrlInput = document.getElementById('creator-input-youtube-url');
    const fbUrlInput = document.getElementById('creator-input-facebook-url');
    const otherUrlInput = document.getElementById('creator-input-other-url');
    const agreementCheck = document.getElementById('creator-agreement-check');
    const msgEl = document.getElementById('creator-onboard-message');
    const btn = document.getElementById('btn-activate-creator');

    if (msgEl) {
        msgEl.innerText = '';
        msgEl.className = 'creator-msg';
    }

    if (!nameInput?.value?.trim()) {
        if (msgEl) {
            msgEl.innerText = 'Please provide your Creator display name.';
            msgEl.classList.add('error');
        }
        nameInput?.focus();
        return;
    }

    if (!agreementCheck?.checked) {
        if (msgEl) {
            msgEl.innerText = 'You must agree to the WishRite Creator Program Terms & Guidelines.';
            msgEl.classList.add('error');
        }
        return;
    }

    // Collect content preferences
    const selectedPreferences = [];
    document.querySelectorAll('.creator-chip-checkbox:checked').forEach(cb => {
        selectedPreferences.push(cb.value);
    });

    const payload = {
        display_name: nameInput.value.trim(),
        bio: bioInput?.value?.trim() || '',
        city: cityInput?.value?.trim() || '',
        state: stateInput?.value?.trim() || '',
        country: countryInput?.value?.trim() || 'India',
        instagram_username: instaUserInput?.value?.trim() || '',
        instagram_url: instaUrlInput?.value?.trim() || '',
        youtube_url: ytUrlInput?.value?.trim() || '',
        facebook_url: fbUrlInput?.value?.trim() || '',
        other_url: otherUrlInput?.value?.trim() || '',
        content_preferences: selectedPreferences,
        agreement_accepted: true
    };

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Activating Profile…';
        }

        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/onboard', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.error?.message || 'Could not activate creator profile.');
        }

        if (data.token) {
            localStorage.setItem('wishrite_creator_token', data.token);
        }

        if (typeof showToast === 'function') {
            showToast('WishRite Creator Profile activated successfully!', 'success');
        }

        // Immediately refresh into State 2: Creator Dashboard
        await loadCustomerCreatorStatus();
    } catch (err) {
        if (msgEl) {
            msgEl.innerText = err.message;
            msgEl.classList.add('error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'ACTIVATE CREATOR PROFILE';
        }
    }
}
window.handleCreatorOnboardSubmit = handleCreatorOnboardSubmit;

/**
 * Renders State 2: Creator Dashboard
 */
function renderCreatorDashboard(data) {
    const creator = data.creator || {};
    const stats = data.stats || {};
    const wallet = data.wallet || {};
    const points = data.points || {};

    // 1. Profile Card
    const nameEl = document.getElementById('cd-creator-name');
    const avatarEl = document.getElementById('cd-creator-avatar');
    const slugEl = document.getElementById('cd-creator-slug');
    const linkInput = document.getElementById('cd-referral-link-input');
    const socialBadges = document.getElementById('cd-social-badges');

    if (nameEl) nameEl.innerText = creator.name || 'WishRite Creator';
    if (avatarEl && creator.profile_image) avatarEl.src = creator.profile_image;
    if (slugEl) slugEl.innerText = `@${creator.public_slug || creator.influencer_code}`;

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
    const clicksEl = document.getElementById('cd-stat-clicks');
    const ordersEl = document.getElementById('cd-stat-orders');
    const availEl = document.getElementById('cd-stat-available');
    const pendEl = document.getElementById('cd-stat-pending');
    const totalEl = document.getElementById('cd-stat-total');
    const pointsEl = document.getElementById('cd-stat-points');

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
    const linkInput = document.getElementById('cd-referral-link-input');
    if (!linkInput) return;
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
        if (typeof showToast === 'function') {
            showToast('Referral link copied to clipboard!', 'success');
        }
    }).catch(() => {
        document.execCommand('copy');
        if (typeof showToast === 'function') {
            showToast('Referral link copied!', 'success');
        }
    });
}
window.copyCreatorReferralLink = copyCreatorReferralLink;

/**
 * Fetches and renders the creator's submitted content
 */
async function loadCreatorContent(statusFilter = 'all') {
    const grid = document.getElementById('creator-my-content-grid');
    const emptyEl = document.getElementById('creator-content-empty');
    if (!grid) return;

    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/creator/content', { headers });
        const json = await res.json();

        if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
            grid.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }

        let items = json.data;
        if (statusFilter !== 'all') {
            if (statusFilter === 'post' || statusFilter === 'reel') {
                items = items.filter(i => i.content_type === statusFilter);
            } else {
                items = items.filter(i => i.status === statusFilter);
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
            const statusClass = item.status === 'approved' ? 'verified' : (item.status === 'rejected' ? 'rejected' : 'pending');
            const statusLabel = item.status === 'approved' ? '✓ Approved' : (item.status === 'rejected' ? '✕ Rejected' : '⧖ Under Review');
            const platformIcon = item.platform === 'instagram' ? '📸 Instagram' : (item.platform === 'youtube' ? '▶ YouTube' : (item.platform === 'facebook' ? '👥 Facebook' : '🔗 Web'));
            const typeLabel = item.content_type === 'reel' ? 'Reel' : 'Post';
            const imgUrl = item.thumbnail_url || item.product_image || 'https://placehold.co/400x400/5E3435/FFF?text=WishRite+Jewellery';

            return `
                <div class="creator-content-card">
                    <div class="content-thumb-wrap">
                        <img src="${imgUrl}" alt="${item.caption || 'WishRite Content'}" loading="lazy" />
                        <span class="content-type-pill">${platformIcon} ${typeLabel}</span>
                        <span class="content-status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="content-card-body">
                        ${item.product_name ? `<div class="content-product-tag">✨ ${item.product_name}</div>` : ''}
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
function setContentFilter(filter, btn) {
    document.querySelectorAll('.content-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadCreatorContent(filter);
}
window.setContentFilter = setContentFilter;

/**
 * Fetches live WishRite products for the product selector
 */
async function fetchLiveProductsForPicker() {
    if (liveProductsCache.length > 0) return;
    try {
        const res = await fetch('/api/public/products');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
            liveProductsCache = json.data;
        } else if (Array.isArray(json.products)) {
            liveProductsCache = json.products;
        }
        populateProductPickers();
    } catch (_) {}
}

function populateProductPickers() {
    const postPicker = document.getElementById('share-post-product-select');
    const reelPicker = document.getElementById('share-reel-product-select');

    if (!liveProductsCache || liveProductsCache.length === 0) return;

    const options = `<option value="">-- Choose a WishRite Product (Optional) --</option>` +
        liveProductsCache.map(p => `<option value="${p.product_code}" data-name="${p.product_name}" data-img="${p.image_url || ''}">${p.product_name} (${p.product_code})</option>`).join('');

    if (postPicker) postPicker.innerHTML = options;
    if (reelPicker) reelPicker.innerHTML = options;
}

/**
 * Open Share Post / Reel Modals
 */
function openSharePostModal() {
    const modal = document.getElementById('modal-share-post');
    if (modal) modal.style.display = 'flex';
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
    const captionInput = document.getElementById('share-post-caption');
    const productSelect = document.getElementById('share-post-product-select');
    const imgInput = document.getElementById('share-post-image');
    const tagsInput = document.getElementById('share-post-tags');
    const msgEl = document.getElementById('share-post-msg');
    const btn = document.getElementById('btn-submit-post');

    if (msgEl) {
        msgEl.innerText = '';
        msgEl.className = 'creator-msg';
    }

    const url = urlInput?.value?.trim();
    if (!url) {
        if (msgEl) {
            msgEl.innerText = 'Please enter a valid Post URL.';
            msgEl.classList.add('error');
        }
        return;
    }

    const selectedOption = productSelect?.selectedOptions?.[0];
    const productCode = selectedOption?.value || '';
    const productName = selectedOption?.getAttribute('data-name') || '';
    const productImg = selectedOption?.getAttribute('data-img') || '';

    const payload = {
        content_type: 'post',
        platform: platformSelect?.value || 'instagram',
        url,
        caption: captionInput?.value?.trim() || '',
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

        closeSharePostModal();
        if (typeof showToast === 'function') {
            showToast('Post submitted successfully and is now under review!', 'success');
        }
        loadCreatorContent();
    } catch (err) {
        if (msgEl) {
            msgEl.innerText = err.message;
            msgEl.classList.add('error');
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
    const captionInput = document.getElementById('share-reel-caption');
    const productSelect = document.getElementById('share-reel-product-select');
    const imgInput = document.getElementById('share-reel-image');
    const tagsInput = document.getElementById('share-reel-tags');
    const msgEl = document.getElementById('share-reel-msg');
    const btn = document.getElementById('btn-submit-reel');

    if (msgEl) {
        msgEl.innerText = '';
        msgEl.className = 'creator-msg';
    }

    const url = urlInput?.value?.trim();
    if (!url) {
        if (msgEl) {
            msgEl.innerText = 'Please enter a valid Reel URL.';
            msgEl.classList.add('error');
        }
        return;
    }

    const selectedOption = productSelect?.selectedOptions?.[0];
    const productCode = selectedOption?.value || '';
    const productName = selectedOption?.getAttribute('data-name') || '';
    const productImg = selectedOption?.getAttribute('data-img') || '';

    const payload = {
        content_type: 'reel',
        platform: platformSelect?.value || 'instagram',
        url,
        caption: captionInput?.value?.trim() || '',
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

        closeShareReelModal();
        if (typeof showToast === 'function') {
            showToast('Reel submitted successfully and is now under review!', 'success');
        }
        loadCreatorContent();
    } catch (err) {
        if (msgEl) {
            msgEl.innerText = err.message;
            msgEl.classList.add('error');
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
