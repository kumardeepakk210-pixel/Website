// ==============================================================================
// WISHRITE COMMERCE & CREATOR CLUB — SERVER API ROUTE: /api/orders/*
// Server-Authoritative Checkout, Line Items, Razorpay Order Creation & Verification
// The browser NEVER calculates final order amounts, item prices, or commissions.
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
        const checkout = await import('../backend/checkout.js');

        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        const subPath = pathname.replace(/^\/api\/orders/, '').replace(/\/$/, '') || '/';
        const method = (req.method || 'GET').toUpperCase();

        req.params = req.params || {};

        // 1. Secure Server-Authoritative Checkout: POST /api/orders/checkout or /api/orders/create
        if ((subPath === '/checkout' || subPath === '/create') && method === 'POST') {
            return await checkout.handleCheckoutCreateOrder(req, res);
        }

        // 2. Server-Authoritative Payment Verification: POST /api/orders/verify-payment or /api/orders/verify
        if ((subPath === '/verify-payment' || subPath === '/verify') && method === 'POST') {
            return await checkout.handleCheckoutVerifyPayment(req, res);
        }

        // 3. Attribute order directly: POST /api/orders/attribute
        if ((subPath === '/attribute' || subPath === '/attribution') && method === 'POST') {
            const body = req.body || {};
            const orderRef = body.order_reference || body.order_number || body.order_id;
            if (!orderRef) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'order_reference or order_id is required for attribution.' }
                });
            }
            const result = await influencers.attributeOrderToInfluencer({
                order_id: body.order_id || null,
                order_reference: orderRef,
                sales_amount: Number(body.sales_amount) || Number(body.order_amount) || Number(body.grand_total) || 0,
                attribution_id: body.attribution_id || body.referral_attribution?.attribution_id || null,
                session_id: body.session_id || body.referral_attribution?.session_id || null,
                influencer_id: body.influencer_id || body.referral_attribution?.influencer_id || null,
                referral_attribution: body.referral_attribution || null
            });

            return res.status(200).json({
                success: true,
                attributed: Boolean(result?.attributed),
                data: result
            });
        }

        // 4. Order Status Update: PATCH /api/orders/:id/status
        const statusMatch = subPath.match(/^\/([^\/]+)\/status$/);
        if (statusMatch && method === 'PATCH') {
            req.params.id = statusMatch[1];
            return await influencers.handleUpdateOrderStatus(req, res);
        }

        // 5. Create Order: POST /api/orders
        // If request includes items or customer, route to full checkout engine
        if ((subPath === '/' || subPath === '') && method === 'POST') {
            if (req.body?.items || req.body?.customer) {
                return await checkout.handleCheckoutCreateOrder(req, res);
            }
            return await influencers.handleCreateOrder(req, res);
        }

        res.status(404).json({
            success: false,
            error: { message: `Orders API route '${method} ${rawUrl}' not found.` }
        });
    } catch (err) {
        console.error('[Orders API Error]:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
};
