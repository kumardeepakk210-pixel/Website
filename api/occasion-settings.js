/* ==============================================================================
   WISHRITE WEBSITE — SAME-ORIGIN OCCASION SETTINGS PROXY
   Endpoint: GET /api/occasion-settings
   Authoritative Source: https://inventory-mu-lilac.vercel.app/api/settings/occasion
   Single Source of Truth for Festive Mode & Active Occasion.
   No server secrets exposed.
   ============================================================================== */

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

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const upstreamRes = await fetch(INVENTORY_OCCASION_API, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'WishRite-Website-Proxy/1.0'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!upstreamRes.ok) {
            throw new Error(`Upstream Inventory API returned HTTP ${upstreamRes.status}`);
        }

        const data = await upstreamRes.json();
        return response.status(200).json(data);
    } catch (err) {
        console.error('[WishRite Occasion Proxy Error]', err.message);

        // Safe fallback: Festive mode disabled
        return response.status(200).json({
            success: false,
            fallback: true,
            error: err.message,
            settings: {
                isLive: false,
                festive_mode_enabled: false,
                selectedOccasion: null,
                selected_occasion_slug: null,
                activeOccasion: null,
                active_occasion_slug: null
            },
            data: {
                isLive: false,
                festive_mode_enabled: false,
                selectedOccasion: null,
                selected_occasion_slug: null,
                activeOccasion: null,
                active_occasion_slug: null
            }
        });
    }
};
