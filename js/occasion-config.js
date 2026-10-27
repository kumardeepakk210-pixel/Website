/* ==============================================================================
   WISHRITE — CENTRALIZED FESTIVE OCCASION CONFIGURATION
   Architecture: Single Active Festive Mode
   Only ONE occasion is active at any time. All festival-specific content,
   brand subtitle, trust bar, hero copy, countdown timer, live offers,
   product filtering, and SEO derive strictly from here.
   ============================================================================== */

(function () {
    'use strict';

    /**
     * Complete library of supported festive occasions.
     * Easily extendable for new festivals without altering application code.
     */
    const OCCASIONS = {
        'durga-puja': {
            name: 'Durga Puja',
            slug: 'durga-puja',
            collectionTitle: 'Durga Puja Collection',
            brandSubtitle: 'DURGA PUJA COLLECTION',
            navLabel: 'DURGA PUJA COLLECTION',
            eyebrow: 'DURGA PUJA 2026 • MAHA SHASHTHI',
            title: 'পুজো আসছে, মা আসছেন',
            englishTitle: 'Pujo Aschey, Ma Aschen',
            description: 'Celebrate the spirit of Puja with elegant sarees, statement jewellery and timeless silver pairings.',
            ctaText: 'Shop the Pujo collection →',
            homepageCtaText: 'Shop the Pujo collection →',
            homepageSubtitle: 'Sarees • Statement Jewellery • Silver Pairings',
            heroImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/durga-puja/durga-sketch.svg',
                opacity: 0.16,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#8B1E2D',       // Deep Royal Maroon
                secondary: '#D4AF37',     // Muted Antique Gold
                accent: '#C6281C',        // Festive Red
                text: '#FFFFFF',
                pageBackground: '#F8F3EC' // Warm Ivory
            },
            countdown: {
                enabled: true,
                targetDate: '2026-10-17T00:00:00+05:30',
                expiryMessage: 'THE FESTIVE CELEBRATION HAS BEGUN'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Original Bengali designs'
            },
            offers: {
                enabled: true,
                badge: 'DURGA PUJO OFFERS',
                title: 'Pujor Shopping, Ghare Boshe',
                buttonText: 'See all Pujo offers →',
                emptyMessage: 'Festive offers coming soon.',
                items: [
                    // Real live offers will be configured here.
                    // Strictly empty by default — NEVER uses sample promotional data.
                ]
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Durga Puja Collection | WishRite',
                description: 'Explore the WishRite Durga Puja Collection featuring festive sarees, artificial jewellery and 925 sterling silver jewellery.',
                keywords: ['durga puja jewellery', 'puja sarees', 'bengali festive collection', '925 silver puja', 'wishrite festive edit']
            }
        },

        'diwali': {
            name: 'Diwali',
            slug: 'diwali',
            collectionTitle: 'Diwali Festive Collection',
            brandSubtitle: 'DIWALI COLLECTION',
            navLabel: 'DIWALI COLLECTION',
            eyebrow: 'DIWALI 2026 • FESTIVAL OF LIGHTS',
            title: 'শুভ দীপাবলি',
            englishTitle: 'Luminous Brilliance, Auspicious Blessings',
            description: 'Luminous silver jewellery, statement artificial sets and celebratory sarees crafted for joyful festivities.',
            ctaText: 'Shop Diwali collection →',
            homepageCtaText: 'Shop Diwali collection →',
            homepageSubtitle: 'Festive Sarees • Statement Chokers • Auspicious Silver',
            heroImage: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/diwali/kali-sketch.svg',
                opacity: 0.16,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#5B1226',
                secondary: '#E5B842',
                accent: '#B8860B',
                text: '#FFFFFF',
                pageBackground: '#FAF7EE'
            },
            countdown: {
                enabled: true,
                targetDate: '2026-11-08T00:00:00+05:30',
                expiryMessage: 'HAPPY DIWALI — CELEBRATE WITH WISHRITE'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Auspicious festive designs'
            },
            offers: {
                enabled: true,
                badge: 'DIWALI OFFERS',
                title: 'Festive Gifting, Joyful Celebrations',
                buttonText: 'See all Diwali offers →',
                emptyMessage: 'Diwali offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Diwali Collection | WishRite',
                description: 'Explore the WishRite Diwali Collection featuring luminous 925 silver jewellery, statement sets and festive sarees.',
                keywords: ['diwali silver jewellery', 'diwali sarees', 'auspicious silver', 'festive silver gifting']
            }
        },

        'kali-puja': {
            name: 'Kali Puja',
            slug: 'kali-puja',
            collectionTitle: 'Kali Puja Festive Collection',
            brandSubtitle: 'KALI PUJA COLLECTION',
            navLabel: 'KALI PUJA COLLECTION',
            eyebrow: 'KALI PUJA 2026 • AUSPICIOUS NIGHT',
            title: 'শুভ শ্যামা পূজা ও দীপাবলি',
            englishTitle: 'Divine Strength, Sacred Brilliance',
            description: 'Celebrate the divine power and radiance of Maa Kali with auspicious 925 silver jewellery, ceremonial sarees and exquisite festive pairings.',
            ctaText: 'Shop Kali Puja collection →',
            homepageCtaText: 'Shop Kali Puja collection →',
            homepageSubtitle: 'Auspicious Silver • Ceremonial Sarees • Divine Adornments',
            heroImage: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/diwali/kali-sketch.svg',
                opacity: 0.16,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#1B1464',       // Midnight Royal Blue
                secondary: '#E5B842',     // Bright Festive Gold
                accent: '#D4145A',        // Crimson Vermilion Accent
                text: '#FFFFFF',
                pageBackground: '#FAF7F2' // Warm Off-White
            },
            countdown: {
                enabled: true,
                targetDate: '2026-11-08T00:00:00+05:30',
                expiryMessage: 'HAPPY KALI PUJA — CELEBRATE WITH WISHRITE'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Auspicious Bengali festive designs'
            },
            offers: {
                enabled: true,
                badge: 'KALI PUJA OFFERS',
                title: 'Divine Blessings, Festive Offers',
                buttonText: 'See all Kali Puja offers →',
                emptyMessage: 'Kali Puja offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Kali Puja Collection | WishRite',
                description: 'Explore the WishRite Kali Puja Collection featuring auspicious 925 silver jewellery, ceremonial sarees and festive pairings.',
                keywords: ['kali puja jewellery', 'kali puja sarees', 'auspicious silver', 'bengali festive collection']
            }
        },

        'christmas': {
            name: 'Christmas',
            slug: 'christmas',
            collectionTitle: 'Christmas & Year-End Collection',
            brandSubtitle: 'CHRISTMAS COLLECTION',
            navLabel: 'CHRISTMAS COLLECTION',
            eyebrow: 'THE HOLIDAY EDIT',
            title: 'Merry Christmas & Season’s Greetings',
            englishTitle: 'Sparkling Radiance & Holiday Keepsakes',
            description: 'Sparkling silver keepsakes, elegant party wear and memorable festive gifts crafted for the season.',
            ctaText: 'Shop Christmas collection →',
            homepageCtaText: 'Shop Christmas collection →',
            homepageSubtitle: 'Party Wear • Radiant Keepsakes • Timeless Gifting',
            heroImage: 'https://images.unsplash.com/photo-1543257580-7269da773bf5?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1543257580-7269da773bf5?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/christmas/christmas-sketch.svg',
                opacity: 0.14,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#143D28',
                secondary: '#D4AF37',
                accent: '#7B1824',
                text: '#FFFFFF',
                pageBackground: '#F5FAF6'
            },
            countdown: {
                enabled: true,
                targetDate: '2026-12-25T00:00:00+05:30',
                expiryMessage: 'MERRY CHRISTMAS FROM WISHRITE'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Holiday gift packaging'
            },
            offers: {
                enabled: true,
                badge: 'HOLIDAY OFFERS',
                title: 'Sparkling Season, Thoughtful Gifts',
                buttonText: 'See all Holiday offers →',
                emptyMessage: 'Christmas offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Christmas Collection | WishRite',
                description: 'Discover sparkling Christmas jewellery gifts, festive essentials and timeless 925 sterling silver at WishRite.',
                keywords: ['christmas silver gifts', 'holiday jewellery', 'sterling silver gifts']
            }
        },

        'valentine': {
            name: 'Valentine’s Day',
            slug: 'valentine',
            collectionTitle: 'Valentine’s Day Collection',
            brandSubtitle: 'VALENTINE’S COLLECTION',
            navLabel: 'VALENTINE COLLECTION',
            eyebrow: 'THE LOVE EDIT',
            title: 'Celebrate Eternal Love',
            englishTitle: 'Timeless Tokens of Heartfelt Affection',
            description: 'Heartfelt silver jewellery, romantic keepsakes and meaningful symbols of eternal affection.',
            ctaText: 'Shop Valentine collection →',
            homepageCtaText: 'Shop Valentine collection →',
            homepageSubtitle: 'Solitaires • Heart Motifs • Meaningful Silver',
            heroImage: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/valentine/valentine-sketch.svg',
                opacity: 0.14,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#5C1D2E',
                secondary: '#E8A598',
                accent: '#C44569',
                text: '#FFFFFF',
                pageBackground: '#FDF7F8'
            },
            countdown: {
                enabled: true,
                targetDate: '2027-02-14T00:00:00+05:30',
                expiryMessage: 'HAPPY VALENTINE’S DAY'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Special romantic packaging'
            },
            offers: {
                enabled: true,
                badge: 'VALENTINE OFFERS',
                title: 'Love Everyday, Delivered Home',
                buttonText: 'See all Valentine offers →',
                emptyMessage: 'Valentine offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Valentine’s Day Collection | WishRite',
                description: 'Shop timeless Valentine’s gifts in hallmarked 925 sterling silver. Romantic pendants, couple rings and keepsake jewellery.',
                keywords: ['valentine silver jewellery', 'romantic silver gifts', 'silver pendants']
            }
        },

        'wedding': {
            name: 'Wedding Season',
            slug: 'wedding',
            collectionTitle: 'Wedding Season Collection',
            brandSubtitle: 'WEDDING COLLECTION',
            navLabel: 'WEDDING COLLECTION',
            eyebrow: 'THE BRIDAL & CELEBRATION EDIT',
            title: 'The Royal Wedding Edit',
            englishTitle: 'Opulent Drapes, Heirloom Silver & Regal Statements',
            description: 'Heirloom-grade silver jewellery, opulent celebration sarees and regal statement pieces for unforgettable moments.',
            ctaText: 'Shop Wedding collection →',
            homepageCtaText: 'Shop Wedding collection →',
            homepageSubtitle: 'Bridal Sarees • Statement Sets • Fine Silver',
            heroImage: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/wedding/wedding-sketch.svg',
                opacity: 0.16,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#661826',
                secondary: '#D4AF37',
                accent: '#992336',
                text: '#FFFFFF',
                pageBackground: '#FAF6F2'
            },
            countdown: {
                enabled: false,
                targetDate: '',
                expiryMessage: 'WEDDING SEASON CELEBRATION'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Bridal & festive hallmark certification'
            },
            offers: {
                enabled: true,
                badge: 'WEDDING OFFERS',
                title: 'Celebration Curations, Direct to You',
                buttonText: 'See all Wedding offers →',
                emptyMessage: 'Wedding season offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Wedding Collection | WishRite',
                description: 'Exquisite silver jewellery sets, opulent bridal sarees and celebration pairings for the wedding season at WishRite.',
                keywords: ['wedding silver jewellery', 'bridal sarees', 'silver bridal sets']
            }
        },

        'valentines-day': {
            name: 'Valentine’s Day',
            slug: 'valentines-day',
            collectionTitle: 'Valentine’s Day Collection',
            brandSubtitle: 'VALENTINE’S COLLECTION',
            navLabel: 'VALENTINE COLLECTION',
            eyebrow: 'THE LOVE EDIT',
            title: 'Celebrate Eternal Love',
            englishTitle: 'Timeless Tokens of Heartfelt Affection',
            description: 'Heartfelt silver jewellery, romantic keepsakes and meaningful symbols of eternal affection.',
            ctaText: 'Shop Valentine collection →',
            homepageCtaText: 'Shop Valentine collection →',
            homepageSubtitle: 'Solitaires • Heart Motifs • Meaningful Silver',
            heroImage: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1800&q=85',
            heroMobileImage: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=800&q=85',
            backgroundImage: '',
            background: {
                artwork: 'assets/festive/valentine/valentine-sketch.svg',
                opacity: 0.14,
                position: 'right center',
                size: 'contain',
                repeat: 'no-repeat'
            },
            theme: {
                primary: '#5C1D2E',
                secondary: '#E8A598',
                accent: '#C44569',
                text: '#FFFFFF',
                pageBackground: '#FDF7F8'
            },
            countdown: {
                enabled: true,
                targetDate: '2027-02-14T00:00:00+05:30',
                expiryMessage: 'HAPPY VALENTINE’S DAY'
            },
            trust: {
                enabled: true,
                shipping: 'Free shipping ₹199+',
                cod: 'Cash on Delivery',
                design: 'Special romantic packaging'
            },
            offers: {
                enabled: true,
                badge: 'VALENTINE OFFERS',
                title: 'Love Everyday, Delivered Home',
                buttonText: 'See all Valentine offers →',
                emptyMessage: 'Valentine offers coming soon.',
                items: []
            },
            productSettings: {
                showSarees: true,
                showArtificialJewellery: true,
                showSilverJewellery: true,
                matchingEnabled: true
            },
            seo: {
                title: 'Valentine’s Day Collection | WishRite',
                description: 'Shop timeless Valentine’s gifts in hallmarked 925 sterling silver. Romantic pendants, couple rings and keepsake jewellery.',
                keywords: ['valentine silver jewellery', 'romantic silver gifts', 'silver pendants']
            }
        }
    };

    // Slug alias: ensure both 'valentine' and 'valentines-day' resolve seamlessly
    OCCASIONS['valentine'] = OCCASIONS['valentines-day'];

    /**
     * SINGLE ACTIVE OCCASION CONTROLLER (Runtime State)
     * Authoritative Source: Inventory API (https://inventory-mu-lilac.vercel.app/api/settings/occasion)
     * via same-origin proxy /api/occasion-settings.
     * Default state is OFF (enabled: false, activeOccasion: null).
     */
    const FESTIVE_MODE = {
        enabled: false,
        selectedOccasion: null,
        activeOccasion: null,
        slug: null,
        name: null,
        pageTitle: null,
        pageDescription: null,
        bannerImage: null,
        matchingEnabled: true,
        showSarees: true,
        showArtificialJewellery: true,
        showSilverJewellery: true
    };

    let occasionSettingsLoaded = false;
    let occasionSettingsPromise = null;
    let occasionRealtimeChannel = null;

    /**
     * Safe reference to Supabase client
     */
    function getSupabaseClient() {
        return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    }

    /**
     * Normalize occasion slugs (e.g. 'valentines-day' <-> 'valentine')
     */
    function normalizeOccasionSlug(slug) {
        if (!slug || typeof slug !== 'string') return null;
        const clean = slug.trim().toLowerCase();
        if (clean === 'valentine') return 'valentines-day';
        return clean;
    }

    /**
     * Reset runtime festive state to OFF while preserving selectedOccasion
     */
    function resetFestiveModeToOff(selectedOccasion = null) {
        FESTIVE_MODE.enabled = false;
        FESTIVE_MODE.activeOccasion = null;
        FESTIVE_MODE.selectedOccasion = selectedOccasion;
        FESTIVE_MODE.slug = null;
        FESTIVE_MODE.name = null;
        FESTIVE_MODE.pageTitle = null;
        FESTIVE_MODE.pageDescription = null;
        FESTIVE_MODE.bannerImage = null;
    }

    /**
     * Loads authoritative occasion settings from Inventory.
     * 1. Calls same-origin /api/occasion-settings
     * 2. Fallback to direct inventory API if proxy is unavailable
     * 3. Maps to FESTIVE_MODE:
     *    - festive_mode_enabled = false -> enabled = false, activeOccasion = null, selectedOccasion = selected_occasion_slug
     *    - festive_mode_enabled = true  -> enabled = true, activeOccasion = active_occasion_slug, selectedOccasion = selected_occasion_slug
     */
    async function loadActiveOccasionSettings(forceRefresh = false) {
        if (forceRefresh) {
            occasionSettingsLoaded = false;
            occasionSettingsPromise = null;
        }

        if (occasionSettingsLoaded && !forceRefresh) {
            return getActiveOccasion();
        }
        if (occasionSettingsPromise && !forceRefresh) {
            return occasionSettingsPromise;
        }

        occasionSettingsPromise = (async () => {
            const cacheParam = forceRefresh ? `?_t=${Date.now()}` : '';
            let rawData = null;

            const WR_SUPABASE_URL = (typeof window !== 'undefined' && window.WISHRITE_CONFIG && window.WISHRITE_CONFIG.supabaseUrl)
                || 'https://ptpuepejciqiktmcpuon.supabase.co';
            const WR_SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.WISHRITE_CONFIG && window.WISHRITE_CONFIG.supabaseAnonKey)
                || 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX';

            // 1. Primary Source: Direct query to Supabase public.occasion_settings
            try {
                const sbController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const sbTimeout = sbController ? setTimeout(() => sbController.abort(), 5000) : null;
                const sbUrl = `${WR_SUPABASE_URL}/rest/v1/occasion_settings?select=id,occasion_slug,occasion_name,page_title,page_description,banner_image,start_date,end_date,is_active,is_selected,updated_at&order=updated_at.desc${forceRefresh ? `&_t=${Date.now()}` : ''}`;
                const sbRes = await fetch(sbUrl, {
                    method: 'GET',
                    headers: {
                        'apikey': WR_SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${WR_SUPABASE_ANON_KEY}`,
                        'Accept': 'application/json'
                    },
                    signal: sbController?.signal,
                    cache: forceRefresh ? 'no-store' : 'default'
                });
                if (sbTimeout) clearTimeout(sbTimeout);
                if (sbRes.ok) {
                    const rows = await sbRes.json();
                    if (Array.isArray(rows) && rows.length > 0) {
                        const activeRow = rows.find(r => r.is_active === true) || null;
                        const selectedRow = rows.find(r => r.is_selected === true) || rows[0] || null;
                        const isLive = Boolean(activeRow);
                        rawData = {
                            success: true,
                            settings: {
                                isLive,
                                festive_mode_enabled: isLive,
                                is_active: isLive,
                                occasion_name: isLive ? (activeRow.occasion_name || activeRow.occasion_slug) : null,
                                occasion_slug: isLive ? activeRow.occasion_slug : null,
                                page_title: isLive ? (activeRow.page_title || null) : null,
                                banner_image: isLive ? (activeRow.banner_image || null) : null,
                                start_date: isLive ? (activeRow.start_date || null) : null,
                                end_date: isLive ? (activeRow.end_date || null) : null,
                                selectedOccasion: selectedRow?.occasion_slug || (isLive ? activeRow.occasion_slug : 'durga-puja'),
                                selected_occasion_slug: selectedRow?.occasion_slug || (isLive ? activeRow.occasion_slug : 'durga-puja'),
                                selected_occasion_name: selectedRow?.occasion_name || null,
                                activeOccasion: isLive ? activeRow.occasion_slug : null,
                                active_occasion_slug: isLive ? activeRow.occasion_slug : null,
                                updated_at: activeRow?.updated_at || selectedRow?.updated_at || new Date().toISOString()
                            }
                        };
                    } else {
                        console.info('[WishRite Occasion] Supabase occasion_settings table contains 0 rows; falling back to API proxy / upstream inventory settings.');
                    }
                }
            } catch (sbErr) {
                console.warn('[WishRite Occasion] Direct Supabase occasion fetch notice:', sbErr.message);
            }

            // 2. Secondary Fallback: Same-origin proxy endpoint
            if (!rawData || !rawData.success) {
                try {
                    const proxyController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const proxyTimeout = proxyController ? setTimeout(() => proxyController.abort(), 5000) : null;
                    const proxyRes = await fetch(`/api/occasion-settings${cacheParam}`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: proxyController?.signal,
                        cache: forceRefresh ? 'no-store' : 'default'
                    });
                    if (proxyTimeout) clearTimeout(proxyTimeout);
                    if (proxyRes.ok) {
                        const parsed = await proxyRes.json();
                        if (parsed && parsed.success) {
                            rawData = parsed;
                        }
                    }
                } catch (err) {
                    // Fall through to upstream direct endpoint
                }
            }

            // 3. Tertiary Fallback: Upstream Inventory endpoint
            if (!rawData || !rawData.success) {
                try {
                    const directController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const directTimeout = directController ? setTimeout(() => directController.abort(), 5000) : null;
                    const directUrl = `https://inventory-mu-lilac.vercel.app/api/settings/occasion${cacheParam}`;
                    const directRes = await fetch(directUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: directController?.signal,
                        cache: forceRefresh ? 'no-store' : 'default'
                    });
                    if (directTimeout) clearTimeout(directTimeout);
                    if (directRes.ok) {
                        const parsed = await directRes.json();
                        if (parsed && parsed.success) {
                            rawData = parsed;
                        }
                    }
                } catch (err) {
                    console.warn('[WishRite Occasion] Failed to fetch upstream occasion settings:', err.message);
                }
            }

            // Differentiate genuine OFF from network/API failure
            if (!rawData || !rawData.success) {
                console.warn('[WishRite Occasion] Occasion API error: unable to reach database or endpoints. Maintaining current state.');
                occasionSettingsLoaded = true;
                try {
                    window.dispatchEvent(new CustomEvent('wishrite:occasion-error', { detail: { message: 'Failed to fetch occasion configuration' } }));
                } catch (e) { }
                return getActiveOccasion();
            }

            const s = rawData.settings || rawData.data || rawData || {};

            // Authoritative Festive Mode state
            // Must evaluate is_active, festive_mode_enabled, or isLive
            const isFestiveOn = Boolean(
                s.is_active !== undefined
                    ? s.is_active
                    : (s.festive_mode_enabled !== undefined
                        ? s.festive_mode_enabled
                        : (s.isLive !== undefined ? s.isLive : false))
            );

            const selectedSlugRaw = s.selected_occasion_slug || s.selectedOccasion || null;
            const selectedSlug = normalizeOccasionSlug(selectedSlugRaw);

            const activeSlugRaw = isFestiveOn
                ? (s.occasion_slug || s.active_occasion_slug || s.activeOccasion || selectedSlugRaw)
                : null;
            const activeSlug = isFestiveOn ? normalizeOccasionSlug(activeSlugRaw) : null;

            // RULE: If festive_mode_enabled = false
            // enabled = false, activeOccasion = null, preserve selectedOccasion = selected_occasion_slug
            if (!isFestiveOn || !activeSlug) {
                resetFestiveModeToOff(selectedSlug);
                occasionSettingsLoaded = true;
                try {
                    window.dispatchEvent(new CustomEvent('wishrite:occasion-updated', { detail: FESTIVE_MODE }));
                } catch (e) { }
                return null;
            }

            // RULE: If festive_mode_enabled = true
            // enabled = true, activeOccasion = active_occasion_slug, selectedOccasion = selected_occasion_slug
            let staticConfig = OCCASIONS[activeSlug];
            if (!staticConfig && activeSlug === 'valentines-day') {
                staticConfig = OCCASIONS['valentine'];
            } else if (!staticConfig && activeSlug === 'valentine') {
                staticConfig = OCCASIONS['valentines-day'];
            }

            // Fallback for new festival added in Inventory that isn't yet in static registry
            if (!staticConfig) {
                const displayName = s.occasion_name || s.active_occasion_name || s.selected_occasion_name || activeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                staticConfig = {
                    name: displayName,
                    slug: activeSlug,
                    collectionTitle: `${displayName} Collection`,
                    brandSubtitle: `${displayName.toUpperCase()} COLLECTION`,
                    navLabel: `${displayName.toUpperCase()} COLLECTION`,
                    eyebrow: `${displayName.toUpperCase()} EDIT`,
                    title: displayName,
                    englishTitle: `Celebrate with ${displayName}`,
                    description: `Explore the WishRite ${displayName} collection featuring curated festive pieces and 925 sterling silver.`,
                    ctaText: `Shop ${displayName} collection →`,
                    homepageCtaText: `Shop ${displayName} collection →`,
                    homepageSubtitle: 'Sarees • Statement Jewellery • Silver Pairings',
                    heroImage: s.banner_image || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1800&q=85',
                    theme: {
                        primary: '#8B1E2D',
                        secondary: '#D4AF37',
                        accent: '#C6281C',
                        text: '#FFFFFF',
                        pageBackground: '#F8F3EC'
                    },
                    countdown: { enabled: false },
                    trust: { enabled: true, shipping: 'Free shipping ₹199+', cod: 'Cash on Delivery', design: 'Authentic festive designs' },
                    offers: { enabled: false, items: [] },
                    productSettings: { showSarees: true, showArtificialJewellery: true, showSilverJewellery: true, matchingEnabled: true },
                    seo: { title: `${displayName} Collection | WishRite`, description: `WishRite ${displayName} Collection.`, keywords: [`${activeSlug} jewellery`] }
                };
                OCCASIONS[activeSlug] = staticConfig;
            }

            FESTIVE_MODE.enabled = true;
            FESTIVE_MODE.selectedOccasion = selectedSlug;
            FESTIVE_MODE.activeOccasion = activeSlug;
            FESTIVE_MODE.slug = activeSlug;
            FESTIVE_MODE.name = s.occasion_name || s.active_occasion_name || s.selected_occasion_name || staticConfig.name || activeSlug;
            FESTIVE_MODE.pageTitle = s.page_title || staticConfig.pageTitle || staticConfig.title;
            FESTIVE_MODE.pageDescription = s.page_description || staticConfig.pageDescription || staticConfig.description;
            FESTIVE_MODE.bannerImage = s.banner_image || staticConfig.bannerImage || staticConfig.heroImage;
            FESTIVE_MODE.startDate = s.start_date || null;
            FESTIVE_MODE.endDate = s.end_date || null;

            occasionSettingsLoaded = true;
            try {
                window.dispatchEvent(new CustomEvent('wishrite:occasion-updated', { detail: FESTIVE_MODE }));
            } catch (e) { }
            return getActiveOccasion();
        })();

        try {
            return await occasionSettingsPromise;
        } finally {
            occasionSettingsPromise = null;
        }
    }

    /**
     * Dedicated Supabase Realtime subscription for public.occasion_settings.
     * Listens for INSERT, UPDATE, DELETE events.
     * Guarantees a single unique channel instance without duplicates.
     */
    function initOccasionRealtimeSync() {
        const client = getSupabaseClient();
        if (!client || typeof client.channel !== 'function') {
            return null;
        }

        // Prevent duplicate subscriptions
        if (occasionRealtimeChannel) {
            return occasionRealtimeChannel;
        }

        try {
            occasionRealtimeChannel = client
                .channel('wishrite-occasion-settings-sync')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'occasion_settings'
                    },
                    async (payload) => {
                        console.log('[WishRite Occasion] Realtime change detected in occasion_settings:', payload.eventType);

                        // 1. Invalidate cache & 2. fetch /api/occasion-settings with forceRefresh = true
                        await loadActiveOccasionSettings(true);

                        // 4. Refresh festive navigation
                        if (typeof window.initFestiveNavigation === 'function') {
                            window.initFestiveNavigation();
                        }

                        // 5. Refresh homepage festive UI
                        if (typeof window.initHeroCarousel === 'function') {
                            window.initHeroCarousel();
                        }
                        if (typeof window.updateHeaderBrandSubtitle === 'function' && typeof window.getCurrentView === 'function') {
                            window.updateHeaderBrandSubtitle(window.getCurrentView());
                        }

                        // 6. Refresh occasion page if currently open
                        if (typeof window.getCurrentView === 'function' && window.getCurrentView() === 'occasion') {
                            if (typeof window.renderOccasionPage === 'function') {
                                window.renderOccasionPage();
                            }
                        }

                        window.dispatchEvent(new CustomEvent('wishrite:occasion-updated', { detail: FESTIVE_MODE }));
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[WishRite Occasion] Subscribed to occasion_settings realtime updates.');
                    }
                });
        } catch (err) {
            console.warn('[WishRite Occasion] Realtime subscription notice:', err);
        }

        return occasionRealtimeChannel;
    }

    /**
     * OFFERS SYSTEM NOTE:
     * Promotional offers and coupons are loaded dynamically from the Supabase
     * 'coupons' database table via window.WishRiteCoupons (see js/coupons.js).
     * No hardcoded sample or promotional data is stored here.
     */
    const LIVE_OFFERS = {
        enabled: false,
        items: []
    };

    /**
     * Returns the fully resolved active occasion configuration object.
     * Merges occasion metadata with current festive settings from Inventory.
     * STRICT RULE: Returns NULL when FESTIVE_MODE.enabled is false or activeOccasion is null.
     */
    function getActiveOccasion() {
        if (!FESTIVE_MODE.enabled || !FESTIVE_MODE.activeOccasion) return null;

        const slug = FESTIVE_MODE.activeOccasion;
        const base = OCCASIONS[slug] || (slug === 'valentines-day' ? OCCASIONS['valentine'] : (slug === 'valentine' ? OCCASIONS['valentines-day'] : null));
        if (!base) return null;

        return {
            ...base,
            enabled: true,
            selectedOccasion: FESTIVE_MODE.selectedOccasion,
            activeOccasion: slug,
            slug: slug,
            name: FESTIVE_MODE.name || base.name || slug,
            pageTitle: FESTIVE_MODE.pageTitle || base.pageTitle || base.title,
            pageDescription: FESTIVE_MODE.pageDescription || base.pageDescription || base.description,
            bannerImage: FESTIVE_MODE.bannerImage || base.bannerImage || base.heroImage,
            title: FESTIVE_MODE.pageTitle || base.title,
            description: FESTIVE_MODE.pageDescription || base.description,
            heroImage: FESTIVE_MODE.bannerImage || base.heroImage,
            matchingEnabled: FESTIVE_MODE.matchingEnabled !== false,
            showSarees: FESTIVE_MODE.showSarees !== false,
            showArtificialJewellery: FESTIVE_MODE.showArtificialJewellery !== false,
            showSilverJewellery: FESTIVE_MODE.showSilverJewellery !== false
        };
    }

    // Expose on global window object
    window.OCCASIONS = OCCASIONS;
    window.FESTIVE_MODE = FESTIVE_MODE;
    window.getActiveOccasion = getActiveOccasion;
    window.loadActiveOccasionSettings = loadActiveOccasionSettings;
    window.initOccasionRealtimeSync = initOccasionRealtimeSync;
    window.normalizeOccasionSlug = normalizeOccasionSlug;
    window.LIVE_OFFERS = LIVE_OFFERS;

    // Automatic tab visibility & focus sync
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                loadActiveOccasionSettings(true);
            }
        });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', () => {
            loadActiveOccasionSettings(true);
        });
    }

})();
