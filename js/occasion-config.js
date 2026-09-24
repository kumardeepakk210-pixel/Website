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
        }
    };

    /**
     * SINGLE ACTIVE OCCASION CONTROLLER (Runtime State)
     * Populated strictly from Supabase public.occasion_settings.
     * Default state is OFF (enabled: false, activeOccasion: null).
     */
    const FESTIVE_MODE = {
        enabled: false,
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

    /**
     * Safe reference to Supabase client
     */
    function getSupabaseClient() {
        return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    }

    /**
     * Format today's date in user's local timezone as YYYY-MM-DD string
     * Avoids timezone shifting and off-by-one errors with date-only SQL types.
     */
    function getLocalDateString(d = new Date()) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Reset runtime festive state to OFF
     */
    function resetFestiveModeToOff() {
        FESTIVE_MODE.enabled = false;
        FESTIVE_MODE.activeOccasion = null;
        FESTIVE_MODE.slug = null;
        FESTIVE_MODE.name = null;
        FESTIVE_MODE.pageTitle = null;
        FESTIVE_MODE.pageDescription = null;
        FESTIVE_MODE.bannerImage = null;
    }

    /**
     * Reads public.occasion_settings from Supabase (Single Source of Truth)
     * Determines active occasion via is_active = true and start/end dates.
     * Maps database fields to runtime FESTIVE_MODE.
     */
    async function loadActiveOccasionSettings(forceRefresh = false) {
        if (occasionSettingsLoaded && !forceRefresh) {
            return getActiveOccasion();
        }
        if (occasionSettingsPromise && !forceRefresh) {
            return occasionSettingsPromise;
        }

        occasionSettingsPromise = (async () => {
            resetFestiveModeToOff();

            const client = getSupabaseClient();
            if (!client) {
                console.warn('[WishRite Occasion] Supabase client unavailable. Festive Mode = OFF.');
                occasionSettingsLoaded = true;
                return null;
            }

            try {
                const { data, error } = await client
                    .from('occasion_settings')
                    .select('id, occasion_name, occasion_slug, page_title, page_description, banner_image, is_active, start_date, end_date, created_at, updated_at')
                    .eq('is_active', true);

                if (error) {
                    console.warn('[WishRite Occasion] Failed to query occasion_settings:', error.message || error);
                    occasionSettingsLoaded = true;
                    return null;
                }

                if (!Array.isArray(data) || data.length === 0) {
                    occasionSettingsLoaded = true;
                    return null;
                }

                const todayStr = getLocalDateString();
                const validRows = data.filter(row => {
                    if (!row || !row.is_active || !row.occasion_slug) return false;

                    // Date range checks (local date comparison avoids timezone shift)
                    if (row.start_date) {
                        const startStr = String(row.start_date).slice(0, 10);
                        if (todayStr < startStr) return false;
                    }
                    if (row.end_date) {
                        const endStr = String(row.end_date).slice(0, 10);
                        if (todayStr > endStr) return false;
                    }
                    return true;
                });

                if (validRows.length === 0) {
                    occasionSettingsLoaded = true;
                    return null;
                }

                // Multiple active rows handling (deterministic tie-breaker + warning)
                let activeRow;
                if (validRows.length === 1) {
                    activeRow = validRows[0];
                } else {
                    console.warn(
                        `[WishRite Occasion] Multiple active occasions found in database (${validRows.length}):`,
                        validRows.map(r => r.occasion_slug).join(', '),
                        'Deterministically selecting the most recently updated occasion. Please ensure only ONE occasion is active in Inventory Admin.'
                    );
                    validRows.sort((a, b) => {
                        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
                        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
                        if (timeB !== timeA) return timeB - timeA;
                        return String(a.id || '').localeCompare(String(b.id || ''));
                    });
                    activeRow = validRows[0];
                }

                const slug = String(activeRow.occasion_slug).trim().toLowerCase();
                const staticConfig = OCCASIONS[slug];
                if (!staticConfig) {
                    console.warn(`[WishRite Occasion] Active occasion slug "${slug}" not found in static OCCASIONS registry. Festive Mode = OFF.`);
                    occasionSettingsLoaded = true;
                    return null;
                }

                // Populate runtime FESTIVE_MODE from database row
                FESTIVE_MODE.enabled = true;
                FESTIVE_MODE.activeOccasion = slug;
                FESTIVE_MODE.slug = slug;
                FESTIVE_MODE.name = activeRow.occasion_name || staticConfig.name || slug;
                FESTIVE_MODE.pageTitle = activeRow.page_title || null;
                FESTIVE_MODE.pageDescription = activeRow.page_description || null;
                FESTIVE_MODE.bannerImage = activeRow.banner_image || null;

                occasionSettingsLoaded = true;
                return getActiveOccasion();
            } catch (err) {
                console.warn('[WishRite Occasion] Exception loading occasion settings:', err);
                resetFestiveModeToOff();
                occasionSettingsLoaded = true;
                return null;
            } finally {
                occasionSettingsPromise = null;
            }
        })();

        return occasionSettingsPromise;
    }

    /**
     * OFFERS SYSTEM NOTE:
     * Promotional offers and coupons are loaded dynamically from the Supabase
     * 'coupons' database table via window.WishRiteCoupons (see js/coupons.js).
     * No hardcoded sample or screenshot offers are stored or rendered.
     */
    const LIVE_OFFERS = {
        enabled: false,
        items: []
    };

    /**
     * Returns the fully resolved active occasion configuration object.
     * Merges occasion metadata with current festive settings from Supabase.
     */
    function getActiveOccasion() {
        if (!FESTIVE_MODE.enabled || !FESTIVE_MODE.activeOccasion) return null;

        const slug = FESTIVE_MODE.activeOccasion;
        const base = OCCASIONS[slug];
        if (!base) return null;

        return {
            ...base,
            enabled: true,
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
    window.LIVE_OFFERS = LIVE_OFFERS;

})();
