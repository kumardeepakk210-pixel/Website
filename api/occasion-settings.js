/* ==============================================================================
   WISHRITE WEBSITE — CANONICAL OCCASION SETTINGS ENDPOINT
   Endpoint: GET /api/occasion-settings
   Authoritative Source: public.occasion_settings in Supabase
   Fallback: Upstream Inventory API
   Single Source of Truth for Festive Mode & Active Occasion.
   No server secrets exposed.
   ============================================================================== */

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ptpuepejciqiktmcpuon.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX').trim();
const INVENTORY_OCCASION_API = 'https://inventory-mu-lilac.vercel.app/api/settings/occasion';

module.exports = async function handler(request, response) {
    // Only allow GET and HEAD methods
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        return response.status(405).json({ success: false, error: 'Method not allowed.' });
    }

    // CORS & Cache headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=10');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // 1. Primary Source: Query public.occasion_settings in Supabase directly
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const queryUrl = `${SUPABASE_URL}/rest/v1/occasion_settings?select=id,occasion_slug,occasion_name,page_title,page_description,banner_image,start_date,end_date,is_active,is_selected,updated_at&order=updated_at.desc`;
        const dbRes = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (dbRes.ok) {
            const rows = await dbRes.json();
            if (Array.isArray(rows) && rows.length > 0) {
                const activeRow = rows.find(r => r.is_active === true) || null;
                const selectedRow = rows.find(r => r.is_selected === true) || rows[0] || null;
                const isLive = Boolean(activeRow);

                const settings = {
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
                };

                return response.status(200).json({
                    success: true,
                    settings,
                    data: settings
                });
            } else {
                console.info('[WishRite Occasion API] Supabase occasion_settings table contains 0 rows; falling back to Upstream Inventory API.');
            }
        }
    } catch (dbErr) {
        console.warn('[WishRite Occasion API] Supabase query failed, attempting upstream fallback:', dbErr.message);
    }

    // 2. Secondary Fallback: Query Upstream Inventory API
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const upstreamRes = await fetch(INVENTORY_OCCASION_API, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'WishRite-Website-Proxy/1.0'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (upstreamRes.ok) {
            const data = await upstreamRes.json();
            if (data && (data.settings || data.data)) {
                const s = data.settings || data.data || {};
                const isLive = Boolean(
                    s.is_active !== undefined
                        ? s.is_active
                        : (s.festive_mode_enabled !== undefined
                            ? s.festive_mode_enabled
                            : (s.isLive !== undefined ? s.isLive : false))
                );
                const activeSlug = isLive ? (s.occasion_slug || s.active_occasion_slug || s.activeOccasion || s.selected_occasion_slug || s.selectedOccasion) : null;
                const activeName = isLive ? (s.occasion_name || s.active_occasion_name || s.selected_occasion_name) : null;

                const normalizedSettings = {
                    isLive,
                    festive_mode_enabled: isLive,
                    is_active: isLive,
                    occasion_name: isLive ? activeName : null,
                    occasion_slug: isLive ? activeSlug : null,
                    page_title: isLive ? (s.page_title || null) : null,
                    banner_image: isLive ? (s.banner_image || null) : null,
                    start_date: isLive ? (s.start_date || null) : null,
                    end_date: isLive ? (s.end_date || null) : null,
                    selectedOccasion: s.selectedOccasion || s.selected_occasion_slug || 'durga-puja',
                    selected_occasion_slug: s.selected_occasion_slug || s.selectedOccasion || 'durga-puja',
                    activeOccasion: activeSlug,
                    active_occasion_slug: activeSlug,
                    updated_at: s.updated_at || new Date().toISOString()
                };

                return response.status(200).json({
                    success: true,
                    settings: normalizedSettings,
                    data: normalizedSettings
                });
            }
        }
    } catch (upstreamErr) {
        console.error('[WishRite Occasion API] Upstream Inventory API failed:', upstreamErr.message);
    }

    // 3. True Error State: Do NOT masquerade as festive_mode_enabled = false
    return response.status(503).json({
        success: false,
        error: true,
        fallback: false,
        message: 'Occasion service is currently unavailable. Database and upstream endpoints did not respond.'
    });
};
