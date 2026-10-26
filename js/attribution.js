/**
 * ==============================================================================
 * WISHRITE — CREATOR CLUB ATTRIBUTION & REFERRAL ENGINE
 * Single Source of Truth for Customer Referral Detection & 30-Day Attribution
 * Strict Last-Click Model, Server-Authoritative Integrity & PII Protection
 * ==============================================================================
 */

(function (window) {
    'use strict';

    const STORAGE_KEY = 'wishrite_influencer_attribution';
    const SESSION_ID_KEY = 'wishrite_browser_session_id';
    const INFLUENCER_ATTRIBUTION_DAYS = 30;
    const ATTRIBUTION_WINDOW_MS = INFLUENCER_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000;

    const WishRiteAttribution = {
        // 1. First-Party Anonymous Session Identifier
        getSessionId() {
            try {
                let sessionId = localStorage.getItem(SESSION_ID_KEY);
                if (!sessionId) {
                    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
                    localStorage.setItem(SESSION_ID_KEY, sessionId);
                }
                return sessionId;
            } catch (e) {
                return 'sess_' + Date.now();
            }
        },

        // 2. Read Active Referral Attribution (Respects 30-Day Window)
        getActiveAttribution() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return null;

                const attr = JSON.parse(raw);
                if (!attr || !attr.influencer_id) return null;

                const now = Date.now();
                if (attr.expires_at && now > Number(attr.expires_at)) {
                    // Expired attribution — silently clean up
                    this.clearAttribution();
                    return null;
                }

                return attr;
            } catch (err) {
                console.warn('[WishRite Attribution] Read error:', err);
                return null;
            }
        },

        // 3. Persist Attribution (Last-Click Model with 30-Day Lifespan)
        setAttribution(newAttr) {
            if (!newAttr || !newAttr.influencer_id) return;

            try {
                const now = Date.now();
                const existing = this.getActiveAttribution();

                const record = {
                    influencer_id: newAttr.influencer_id,
                    public_slug: newAttr.public_slug || newAttr.slug || '',
                    code: newAttr.code || newAttr.influencer_code || '',
                    name: newAttr.name || 'WishRite Creator',
                    attribution_id: newAttr.attribution_id || newAttr.id || null,
                    timestamp: now,
                    expires_at: now + ATTRIBUTION_WINDOW_MS,
                    // Preserve first-referrer audit history for last-click model
                    first_influencer_id: existing?.first_influencer_id || existing?.influencer_id || newAttr.influencer_id,
                    first_public_slug: existing?.first_public_slug || existing?.public_slug || newAttr.public_slug || '',
                    first_click_timestamp: existing?.first_click_timestamp || now
                };

                localStorage.setItem(STORAGE_KEY, JSON.stringify(record));

                // Also store minimal non-sensitive cookie for cross-domain / session resilience
                try {
                    const cookieExpires = new Date(record.expires_at).toUTCString();
                    document.cookie = `wr_attr=${encodeURIComponent(record.public_slug)}; expires=${cookieExpires}; path=/; SameSite=Lax`;
                } catch (ce) { }

                // Notify UI components
                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('wishrite:attribution-updated', { detail: record }));
                }

                console.log('[WishRite Attribution] Active creator set:', record.name, `(${record.public_slug})`);
                return record;
            } catch (err) {
                console.warn('[WishRite Attribution] Save error:', err);
            }
        },

        // 4. Clear Attribution
        clearAttribution() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                document.cookie = 'wr_attr=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('wishrite:attribution-cleared'));
                }
            } catch (e) { }
        },

        // 5. Track Click with Server
        async recordClick(slug, productCode = null) {
            if (!slug) return;
            try {
                const sessionId = this.getSessionId();
                const payload = {
                    session_id: sessionId,
                    product_code: productCode,
                    landing_url: window.location.href,
                    referrer_url: document.referrer || null,
                    device_type: window.innerWidth <= 768 ? 'mobile' : 'desktop'
                };

                const res = await fetch(`/api/public/influencers/${encodeURIComponent(slug)}/click`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data?.success && data?.data) {
                        return data.data;
                    }
                }
            } catch (err) {
                console.warn('[WishRite Attribution] Click tracking notice:', err.message);
            }
            return null;
        },

        // 6. Fetch Public Creator Storefront Profile
        async fetchPublicCreator(slug) {
            if (!slug) return null;
            try {
                const res = await fetch(`/api/public/influencers/${encodeURIComponent(slug)}`);
                if (!res.ok) return null;
                const data = await res.json();
                if (data?.success && data?.data) {
                    return data.data;
                }
            } catch (err) {
                console.warn('[WishRite Attribution] Fetch creator notice:', err.message);
            }
            return null;
        },

        // 7. Extract Referral from Current URL
        extractReferralFromUrl() {
            const pathname = window.location.pathname || '';
            const search = window.location.search || '';
            const params = new URLSearchParams(search);

            // A. Query Param: ?ref=priya.jewels or ?creator=priya.jewels
            const refParam = params.get('ref') || params.get('creator');
            if (refParam) {
                return { slug: refParam.trim(), source: 'query' };
            }

            // B. Path: /influencer/:slug or /creator/:slug
            const creatorPortalRoutes = ['login', 'dashboard', 'links', 'wallet', 'withdraw', 'points', 'rewards', 'profile'];
            
            let match = pathname.match(/^\/(?:influencer|creator)\/([^\/]+)(?:\/product\/([^\/]+))?/);
            if (match) {
                const slugCandidate = match[1].trim();
                const productCode = match[2] ? match[2].trim() : null;

                // Don't treat creator portal paths (/creator/login, /creator/dashboard, etc.) as referral slugs
                if (!creatorPortalRoutes.includes(slugCandidate.toLowerCase())) {
                    return {
                        slug: slugCandidate,
                        productCode: productCode,
                        source: 'path'
                    };
                }
            }

            return null;
        },

        // 8. Handle Customer Arrival (called on Storefront Load)
        async initializeArrival() {
            const referral = this.extractReferralFromUrl();
            if (!referral || !referral.slug) return;

            console.log('[WishRite Attribution] Detected arrival via creator referral:', referral.slug);

            // Record click asynchronously
            this.recordClick(referral.slug, referral.productCode);

            // Validate creator and persist attribution
            const creator = await this.fetchPublicCreator(referral.slug);
            if (creator && creator.status === 'active') {
                this.setAttribution({
                    influencer_id: creator.id || creator.influencer_id,
                    public_slug: creator.public_slug || referral.slug,
                    code: creator.influencer_code,
                    name: creator.name
                });
            }
        },

        // 9. Safe Minimum Attribution Payload for Checkout
        getAttributionPayload() {
            const active = this.getActiveAttribution();
            if (!active) return null;

            return {
                attribution_id: active.attribution_id || null,
                session_id: this.getSessionId(),
                influencer_id: active.influencer_id,
                public_slug: active.public_slug
            };
        },

        // 10. Social Sharing Utilities
        buildShareUrl(slug, productCode = null) {
            const base = window.location.origin;
            if (productCode) {
                return `${base}/creator/${encodeURIComponent(slug)}/product/${encodeURIComponent(productCode)}`;
            }
            return `${base}/creator/${encodeURIComponent(slug)}`;
        },

        async shareCreatorLink({ slug, name, productCode = null, title = null }) {
            const shareUrl = this.buildShareUrl(slug, productCode);
            const shareTitle = title || `${name}'s Curated Silver Jewellery Collection on WishRite`;
            const shareText = `Discover handcrafted pure 925 silver jewellery curated by ${name} on WishRite. Explore the collection here:`;

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: shareTitle,
                        text: shareText,
                        url: shareUrl
                    });
                    return { shared: true, method: 'native' };
                } catch (e) {
                    if (e.name === 'AbortError') return { shared: false, method: 'aborted' };
                }
            }

            // Fallback: Copy to clipboard
            try {
                await navigator.clipboard.writeText(shareUrl);
                if (typeof showToast === 'function') {
                    showToast('Referral link copied to clipboard!');
                } else {
                    alert('Referral link copied to clipboard!');
                }
                return { shared: true, method: 'clipboard' };
            } catch (err) {
                prompt('Copy this referral link:', shareUrl);
                return { shared: true, method: 'prompt' };
            }
        },

        shareViaWhatsApp({ slug, name, productCode = null }) {
            const shareUrl = this.buildShareUrl(slug, productCode);
            const text = `Hey! Check out ${name}'s handpicked 925 silver jewellery collection on WishRite: ${shareUrl}`;
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
            window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        }
    };

    window.WishRiteAttribution = WishRiteAttribution;

})(window);
