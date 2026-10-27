// ==============================================================================
// WISHRITE CREATOR CLUB — SERVER API ROUTE: /api/influencers/*
// Influencer Management & Stats API
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        req.headers = req.headers || {};
        req.body = req.body || {};
        if (typeof req.body === 'string' && req.body.trim()) {
            try {
                req.body = JSON.parse(req.body);
            } catch (_) {}
        }
        req.query = req.query || {};
        req.params = req.params || {};

        const influencers = await import('../backend/influencers.js');

        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        const subPath = pathname.replace(/^\/api\/influencers/, '').replace(/\/$/, '') || '/';
        const method = (req.method || 'GET').toUpperCase();

        req.params = req.params || {};

        // Click Tracking: POST /api/influencers/:id/click
        const clickMatch = subPath.match(/^\/([^\/]+)\/click$/);
        if (clickMatch && method === 'POST') {
            req.params.id = clickMatch[1];
            return await influencers.handleTrackClick(req, res);
        }

        // Stats: GET /api/influencers/:id/stats
        const statsMatch = subPath.match(/^\/([^\/]+)\/stats$/);
        if (statsMatch && method === 'GET') {
            req.params.id = statsMatch[1];
            return await influencers.handleGetInfluencerStatsEndpoint(req, res);
        }

        // Links: GET/POST /api/influencers/:id/links
        const linksMatch = subPath.match(/^\/([^\/]+)\/links$/);
        if (linksMatch) {
            req.params.id = linksMatch[1];
            if (method === 'GET') return await influencers.handleGetInfluencerLinksEndpoint(req, res);
            if (method === 'POST') return await influencers.handleCreateInfluencerLinkEndpoint(req, res);
        }

        // Orders: GET /api/influencers/:id/orders
        const ordersMatch = subPath.match(/^\/([^\/]+)\/orders$/);
        if (ordersMatch && method === 'GET') {
            req.params.id = ordersMatch[1];
            return await influencers.handleGetInfluencerOrdersEndpoint(req, res);
        }

        // Earnings: GET /api/influencers/:id/earnings
        const earningsMatch = subPath.match(/^\/([^\/]+)\/earnings$/);
        if (earningsMatch && method === 'GET') {
            req.params.id = earningsMatch[1];
            return await influencers.handleGetInfluencerEarningsEndpoint(req, res);
        }

        // Regenerate Profile URL: POST /api/influencers/:id/regenerate-profile-url
        const regenMatch = subPath.match(/^\/([^\/]+)\/regenerate-profile-url$/);
        if (regenMatch && method === 'POST') {
            req.params.id = regenMatch[1];
            return await influencers.handleRegenerateProfileUrl(req, res);
        }

        // Status: PATCH /api/influencers/:id/status
        const statusMatch = subPath.match(/^\/([^\/]+)\/status$/);
        if (statusMatch && method === 'PATCH') {
            req.params.id = statusMatch[1];
            return await influencers.handleUpdateInfluencerStatus(req, res);
        }

        // Single Influencer: GET / PUT / DELETE /api/influencers/:id
        const singleMatch = subPath.match(/^\/([^\/]+)$/);
        if (singleMatch && singleMatch[1] !== '') {
            req.params.id = singleMatch[1];
            if (method === 'GET') return await influencers.handleGetInfluencerById(req, res);
            if (method === 'PUT') return await influencers.handleUpdateInfluencer(req, res);
            if (method === 'DELETE') return await influencers.handleDeleteInfluencer(req, res);
        }

        // Collection: GET / POST /api/influencers
        if (subPath === '/' || subPath === '') {
            if (method === 'GET') return await influencers.handleGetInfluencers(req, res);
            if (method === 'POST') return await influencers.handleCreateInfluencer(req, res);
        }

        res.status(404).json({
            success: false,
            error: { message: `Influencer API route '${method} ${rawUrl}' not found.` }
        });
    } catch (err) {
        console.error('[Influencers API Error]:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
};
