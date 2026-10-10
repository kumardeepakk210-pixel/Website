/* ==============================================================================
   WISHRITE — REAL DATABASE-DRIVEN COUPON & DISCOUNT ENGINE
   Architecture: Supabase-backed, Scope-aware, Secure Pre-Payment Discount System
   Strictly adheres to WishRite business rules:
   - Scopes: jewellery, occasion, all, category
   - Discount Types: percentage, fixed, free_shipping
   - Minimum Order Value & Maximum Discount Caps
   - Non-stackable by default (only one coupon active at a time)
   - Cart Persistence with server re-validation
   - Seamless Razorpay & Shiprocket compatibility
   ============================================================================== */

(function () {
    'use strict';

    const STORAGE_KEY = 'wishrite_applied_coupon';

    /**
     * Helper to retrieve Supabase client securely from window.
     */
    function getSupabaseClient() {
        return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    }

    /**
     * Determines whether an item in cart belongs to the Silver Jewellery catalog.
     */
    function isSilverJewelleryItem(item) {
        if (!item) return false;
        const catalogType = String(item.catalog_type || '').toLowerCase();
        const rawCat = String(item.rawCategory || item.category || '').toLowerCase();
        if (catalogType === 'saree' || catalogType === 'artificial_jewellery') return false;
        if (rawCat.includes('saree') || rawCat.includes('artificial')) return false;
        return true;
    }

    /**
     * Determines whether an item in cart belongs to the Occasion/Festive catalog.
     */
    function isOccasionItem(item, occasionSlug) {
        if (!item) return false;
        const catalogType = String(item.catalog_type || '').toLowerCase();
        const rawCat = String(item.rawCategory || item.category || '').toLowerCase();
        const itemOccasion = String(item.occasion_slug || item.occasion || '').toLowerCase();

        const isOccasionProduct = catalogType === 'saree' ||
            catalogType === 'artificial_jewellery' ||
            rawCat.includes('saree') ||
            rawCat.includes('artificial') ||
            Boolean(item.occasion_slug);

        if (!isOccasionProduct) return false;

        if (occasionSlug) {
            const targetSlug = String(occasionSlug).toLowerCase();
            return !itemOccasion || itemOccasion.includes(targetSlug) || targetSlug.includes(itemOccasion);
        }
        return true;
    }

    /**
     * Calculates the eligible subtotal of cart items based on coupon scope and restrictions.
     */
    function calculateEligibleSubtotal(cartItems, scope, occasionSlug) {
        if (!Array.isArray(cartItems) || cartItems.length === 0) return 0;

        const normalizedScope = String(scope || 'all').toLowerCase();
        let eligibleTotal = 0;

        for (const item of cartItems) {
            const price = Number(item.sellingPrice !== undefined ? item.sellingPrice : (item.price || 0));
            const qty = Number(item.qty || 1);
            const lineTotal = price * qty;

            if (normalizedScope === 'all') {
                eligibleTotal += lineTotal;
            } else if (normalizedScope === 'jewellery') {
                if (isSilverJewelleryItem(item)) {
                    eligibleTotal += lineTotal;
                }
            } else if (normalizedScope === 'occasion') {
                if (isOccasionItem(item, occasionSlug)) {
                    eligibleTotal += lineTotal;
                }
            } else {
                // Fallback for custom category or product scopes
                eligibleTotal += lineTotal;
            }
        }

        return eligibleTotal;
    }

    /**
     * Standard WishRite Promotional Coupons
     * 1st: WELCOME10 - 10% discount, no minimum value, for first time and one time use only
     * 2nd: SALE10 - 10% discount, minimum cart value 3K (₹3,000), for everyone
     * 3rd: SALE15 - 15% discount, minimum cart value 5K (₹5,000), for everyone
     */
    const SYSTEM_COUPONS = [
        {
            id: 'c1111111-1111-4111-a111-111111111111',
            code: 'WELCOME10',
            description: '10% off for first time and one time use only',
            scope: 'all',
            discount_type: 'percentage',
            discount_value: 10,
            minimum_order_value: 0,
            maximum_discount: null,
            first_order_only: true,
            per_customer_limit: 1,
            is_active: true
        },
        {
            id: 'c2222222-2222-4222-a222-222222222222',
            code: 'SALE10',
            description: '10% off on minimum cart value of ₹3,000 for everyone',
            scope: 'all',
            discount_type: 'percentage',
            discount_value: 10,
            minimum_order_value: 3000,
            maximum_discount: null,
            first_order_only: false,
            per_customer_limit: 10,
            is_active: true
        },
        {
            id: 'c3333333-3333-4333-a333-333333333333',
            code: 'SALE15',
            description: '15% off on minimum cart value of ₹5,000 for everyone',
            scope: 'all',
            discount_type: 'percentage',
            discount_value: 15,
            minimum_order_value: 5000,
            maximum_discount: null,
            first_order_only: false,
            per_customer_limit: 10,
            is_active: true
        }
    ];

    /**
     * Fetches a coupon by uppercase code from Supabase (with fallback to SYSTEM_COUPONS).
     */
    async function fetchCouponFromDB(rawCode) {
        if (!rawCode) return { data: null, error: 'Coupon code is required.' };
        const code = String(rawCode).trim().toUpperCase();
        const client = getSupabaseClient();

        if (client) {
            try {
                const { data, error } = await client
                    .from('coupons')
                    .select('*')
                    .ilike('code', code)
                    .maybeSingle();

                if (!error && data) {
                    return { data, error: null };
                }
            } catch (err) {
                console.warn('WishRite Coupons DB query warning:', err);
            }
        }

        // Check system built-in coupons
        const systemCoupon = SYSTEM_COUPONS.find(c => c.code === code);
        if (systemCoupon) {
            return { data: systemCoupon, error: null };
        }

        return { data: null, error: 'Invalid or expired coupon.' };
    }

    /**
     * Fetches all active coupons applicable to the current customer cart.
     */
    async function fetchAvailableCoupons(cartItems = [], customer = null, activeOccasionSlug = null) {
        try {
            const client = getSupabaseClient();
            let allCoupons = [];

            if (client) {
                try {
                    const { data, error } = await client
                        .from('coupons')
                        .select('*')
                        .eq('is_active', true);

                    if (!error && Array.isArray(data) && data.length > 0) {
                        allCoupons = [...data];
                    }
                } catch (err) {
                    console.warn('WishRite fetchAvailableCoupons DB query warning:', err);
                }
            }

            // Merge default system coupons if not already present
            for (const sc of SYSTEM_COUPONS) {
                if (!allCoupons.some(c => String(c.code).toUpperCase() === sc.code)) {
                    allCoupons.push(sc);
                }
            }

            const now = new Date();
            const validCoupons = [];

            for (const c of allCoupons) {
                // Status check
                if (c.is_active === false) continue;

                // Date check
                if (c.start_date && new Date(c.start_date) > now) continue;
                if (c.end_date && new Date(c.end_date) < now) continue;

                // Overall usage limit check
                if (c.usage_limit && Number(c.used_count || 0) >= Number(c.usage_limit)) continue;

                // Scope & Cart Eligibility check
                const eligibleSubtotal = calculateEligibleSubtotal(cartItems, c.scope, c.occasion_slug || activeOccasionSlug);

                // If occasion-specific and doesn't match active occasion, skip
                if (c.scope === 'occasion' && c.occasion_slug && activeOccasionSlug) {
                    if (c.occasion_slug.toLowerCase() !== String(activeOccasionSlug).toLowerCase()) {
                        continue;
                    }
                }

                const minOrder = Number(c.minimum_order_value || 0);
                const hasCartItems = Array.isArray(cartItems) && cartItems.length > 0;
                let isEligible = hasCartItems && (eligibleSubtotal >= minOrder);
                let diffAmount = (!hasCartItems || eligibleSubtotal < minOrder) ? Math.max(0, Math.round(minOrder - eligibleSubtotal)) : 0;
                let ineligibleReason = '';

                if (hasCartItems && eligibleSubtotal <= 0 && c.scope !== 'all') {
                    isEligible = false;
                    if (c.scope === 'jewellery') ineligibleReason = 'Silver Jewellery items only';
                    else if (c.scope === 'occasion') ineligibleReason = 'Festive collection items only';
                } else if (hasCartItems && diffAmount > 0) {
                    ineligibleReason = `Add ₹${diffAmount.toLocaleString('en-IN')} more to unlock`;
                } else if (!hasCartItems && minOrder > 0) {
                    ineligibleReason = `Min. cart value ₹${minOrder.toLocaleString('en-IN')}`;
                }

                // Calculate potential discount for ranking & display
                let estimatedDiscount = 0;
                const baseAmount = eligibleSubtotal > 0 ? eligibleSubtotal : (minOrder > 0 ? minOrder : 1000);
                if (c.discount_type === 'percentage') {
                    estimatedDiscount = (baseAmount * Number(c.discount_value)) / 100;
                    if (c.maximum_discount) estimatedDiscount = Math.min(estimatedDiscount, Number(c.maximum_discount));
                } else if (c.discount_type === 'fixed') {
                    estimatedDiscount = Number(c.discount_value);
                } else if (c.discount_type === 'free_shipping') {
                    estimatedDiscount = 99;
                }

                validCoupons.push({
                    ...c,
                    estimatedDiscount: Math.round(estimatedDiscount),
                    eligibleSubtotal,
                    isEligible,
                    diffAmount,
                    ineligibleReason
                });
            }

            // Sort: eligible offers first (by highest discount), then other active offers
            validCoupons.sort((a, b) => {
                if (a.isEligible && !b.isEligible) return -1;
                if (!a.isEligible && b.isEligible) return 1;
                return b.estimatedDiscount - a.estimatedDiscount;
            });

            return validCoupons;
        } catch (err) {
            console.warn('WishRite fetchAvailableCoupons exception:', err);
            return SYSTEM_COUPONS.map(sc => ({
                ...sc,
                estimatedDiscount: 0,
                eligibleSubtotal: 0,
                isEligible: false,
                diffAmount: sc.minimum_order_value || 0,
                ineligibleReason: ''
            }));
        }
    }

    /**
     * Comprehensive coupon validation function (Section 17, 44, 45).
     * Validates code against all constraints: status, dates, limits, scope, minimum order.
     */
    async function validateCoupon({ code, cartItems, customer, occasion, subtotal, shippingFee = 0 }) {
        if (!code || !String(code).trim()) {
            return { valid: false, message: 'Please enter a coupon code.' };
        }

        const normalizedCode = String(code).trim().toUpperCase();
        const activeOccasionSlug = occasion?.slug || (typeof window.getActiveOccasion === 'function' ? window.getActiveOccasion()?.slug : null) || null;

        // Fetch from Supabase
        const { data: coupon, error } = await fetchCouponFromDB(normalizedCode);
        if (error || !coupon) {
            return { valid: false, message: 'Invalid or expired coupon code.' };
        }

        // 1. Status Check
        if (!coupon.is_active) {
            return { valid: false, message: 'This coupon is no longer active.' };
        }

        // 2. Date Window Check
        const now = new Date();
        if (coupon.start_date && new Date(coupon.start_date) > now) {
            return { valid: false, message: 'This promotion has not started yet.' };
        }
        if (coupon.end_date && new Date(coupon.end_date) < now) {
            return { valid: false, message: 'This coupon has expired.' };
        }

        // 3. Usage Limit Check
        if (coupon.usage_limit && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
            return { valid: false, message: 'Coupon usage limit has been reached.' };
        }

        // 4. Per-Customer Usage Check (if customer info available)
        const client = getSupabaseClient();
        const customerPhone = customer?.phone || customer?.customer_phone || '';
        const customerEmail = customer?.email || customer?.customer_email || '';

        if (client && (customerPhone || customerEmail) && coupon.per_customer_limit) {
            try {
                let usageQuery = client
                    .from('coupon_usages')
                    .select('id', { count: 'exact', head: true })
                    .eq('coupon_id', coupon.id);

                if (customerPhone) {
                    usageQuery = usageQuery.eq('customer_phone', customerPhone);
                } else if (customerEmail) {
                    usageQuery = usageQuery.eq('customer_email', customerEmail);
                }

                const { count, error: usageErr } = await usageQuery;
                if (!usageErr && count !== null && count >= coupon.per_customer_limit) {
                    return {
                        valid: false,
                        message: `You have already redeemed this coupon the maximum allowed times (${coupon.per_customer_limit}).`
                    };
                }
            } catch (err) {
                // Non-blocking fallback
                console.warn('Coupon customer usage check non-blocking warning:', err);
            }
        }

        // 5. First Order Only Check (Section 28)
        if (coupon.first_order_only && client && (customerPhone || customerEmail)) {
            try {
                let orderQuery = client
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .neq('order_status', 'cancelled');

                if (customerPhone) {
                    orderQuery = orderQuery.eq('customer_phone', customerPhone);
                } else if (customerEmail) {
                    orderQuery = orderQuery.eq('customer_email', customerEmail);
                }

                const { count: orderCount } = await orderQuery;
                if (orderCount !== null && orderCount > 0) {
                    return { valid: false, message: 'This coupon is valid on your first order only.' };
                }
            } catch (err) {
                console.warn('Coupon first order check non-blocking warning:', err);
            }
        }

        // 6. Scope & Occasion Restriction Check (Sections 11, 12, 13)
        const eligibleSubtotal = calculateEligibleSubtotal(cartItems, coupon.scope, coupon.occasion_slug || activeOccasionSlug);

        if (eligibleSubtotal <= 0) {
            if (coupon.scope === 'jewellery') {
                return { valid: false, message: 'This coupon is applicable only on Silver Jewellery products.' };
            }
            if (coupon.scope === 'occasion') {
                return { valid: false, message: 'This coupon is applicable only on Festive Occasion products.' };
            }
            return { valid: false, message: 'No eligible items found in cart for this coupon.' };
        }

        // Check if occasion-specific coupon matches active occasion
        if (coupon.scope === 'occasion' && coupon.occasion_slug) {
            if (activeOccasionSlug && coupon.occasion_slug.toLowerCase() !== activeOccasionSlug.toLowerCase()) {
                return { valid: false, message: `This offer was exclusive to the ${coupon.occasion_slug} collection.` };
            }
        }

        // 7. Minimum Order Value Check (Section 23, 36)
        const minOrder = Number(coupon.minimum_order_value || 0);
        if (minOrder > 0 && eligibleSubtotal < minOrder) {
            return {
                valid: false,
                message: `This coupon requires a minimum eligible order of ₹${minOrder.toLocaleString('en-IN')}. (Current eligible: ₹${Math.round(eligibleSubtotal).toLocaleString('en-IN')})`
            };
        }

        // 8. Calculate Discount (Section 45)
        let calculatedDiscount = 0;
        const discountType = coupon.discount_type || 'percentage';
        const discountValue = Number(coupon.discount_value || 0);

        if (discountType === 'percentage') {
            calculatedDiscount = (eligibleSubtotal * discountValue) / 100;
            const maxCap = coupon.maximum_discount ? Number(coupon.maximum_discount) : null;
            if (maxCap && maxCap > 0) {
                calculatedDiscount = Math.min(calculatedDiscount, maxCap);
            }
        } else if (discountType === 'fixed') {
            calculatedDiscount = Math.min(discountValue, eligibleSubtotal);
        } else if (discountType === 'free_shipping') {
            calculatedDiscount = Number(shippingFee || 0);
        }

        // Discount can never exceed total subtotal or eligible subtotal
        calculatedDiscount = Math.min(calculatedDiscount, eligibleSubtotal, subtotal || eligibleSubtotal);
        calculatedDiscount = Math.max(0, Math.round(calculatedDiscount));

        if (calculatedDiscount <= 0 && discountType !== 'free_shipping') {
            return { valid: false, message: 'This coupon does not provide a discount for this order.' };
        }

        return {
            valid: true,
            couponId: coupon.id,
            code: coupon.code,
            description: coupon.description,
            scope: coupon.scope,
            occasion_slug: coupon.occasion_slug,
            discountType: coupon.discount_type,
            discountValue: coupon.discount_value,
            discount: calculatedDiscount,
            discountAmount: calculatedDiscount,
            eligibleSubtotal: eligibleSubtotal,
            stackable: Boolean(coupon.stackable),
            message: `✓ ${coupon.code} applied! You saved ₹${calculatedDiscount.toLocaleString('en-IN')}.`
        };
    }

    /**
     * Storage helpers for cart persistence (Section 39).
     */
    function getAppliedCoupon() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setAppliedCoupon(couponData) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(couponData));
        } catch (e) { }
    }

    function clearAppliedCoupon() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) { }
    }

    /**
     * Re-validates the currently applied coupon against current cart contents.
     */
    async function revalidateAppliedCoupon(cartItems, subtotal, shippingFee = 0) {
        const applied = getAppliedCoupon();
        if (!applied) return null;

        const res = await validateCoupon({
            code: applied.code,
            cartItems,
            customer: window.wishritePendingCheckout || null,
            occasion: typeof window.getActiveOccasion === 'function' ? window.getActiveOccasion() : null,
            subtotal,
            shippingFee
        });

        if (res.valid) {
            setAppliedCoupon(res);
            return res;
        } else {
            clearAppliedCoupon();
            return { valid: false, message: 'Your coupon is no longer valid for the updated cart.' };
        }
    }

    // Expose on global window object
    window.WishRiteCoupons = {
        fetchCouponFromDB,
        fetchAvailableCoupons,
        validateCoupon,
        getAppliedCoupon,
        setAppliedCoupon,
        clearAppliedCoupon,
        revalidateAppliedCoupon,
        calculateEligibleSubtotal,
        isSilverJewelleryItem,
        isOccasionItem,
        normalizeCode: (code) => String(code || '').trim().toUpperCase()
    };

})();
