// ==============================================================================
// WISHRITE CREATOR CLUB — SERVER API ROUTE: /api/public/*
// Public Storefront Data, Creator Recommended Products & Click Attribution
// Zero PII / Private financial data exposure.
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        req.headers = req.headers || {};
        req.body = req.body || {};
        req.query = req.query || {};
        req.params = req.params || {};

        const influencers = await import('../backend/influencers.js');
        const { dbQuery } = await import('../backend/supabase-client.js');

        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        const subPath = pathname.replace(/^\/api\/public/, '').replace(/\/$/, '') || '/';
        const method = (req.method || 'GET').toUpperCase();

        req.params = req.params || {};

        // 1. All Active Products: GET /api/public/products
        if ((subPath === '/products' || subPath === '/inventory') && method === 'GET') {
            let activeInventory = [];
            try {
                const rows = await dbQuery('inventory', 'status=eq.Active&order=created_at.desc&limit=50');
                if (Array.isArray(rows) && rows.length > 0) activeInventory = rows;
            } catch (e) {
                console.warn('[Public API] Could not query inventory:', e.message);
            }

            return res.status(200).json({
                success: true,
                products: activeInventory
            });
        }

        // 2. Click Tracking: POST /api/public/influencers/:slug/click or /api/public/click
        if (subPath === '/click' && method === 'POST') {
            return await influencers.handleTrackClick(req, res);
        }

        const clickMatch = subPath.match(/^\/influencers\/([^\/]+)\/click$/);
        if (clickMatch && method === 'POST') {
            req.params.slug = clickMatch[1];
            return await influencers.handleTrackClick(req, res);
        }

        // 2. Recommended Products: GET /api/public/influencers/:slug/products
        const productsMatch = subPath.match(/^\/influencers\/([^\/]+)\/products$/);
        if (productsMatch && method === 'GET') {
            req.params.slug = productsMatch[1];
            return await influencers.handleGetPublicInfluencerProducts(req, res);
        }

        // 3. Public Creator Profile: GET /api/public/influencers/:slug
        const profileMatch = subPath.match(/^\/influencers\/([^\/]+)$/);
        if (profileMatch && method === 'GET') {
            req.params.slug = profileMatch[1];
            return await influencers.handleGetPublicInfluencer(req, res);
        }

        // Route Not Found
        res.status(404).json({
            success: false,
            error: { message: `Public API route '${method} ${rawUrl}' not found.` }
        });
    } catch (err) {
        console.error('[Public API Error]:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
};
