// ==============================================================================
// WISHRITE WALLET — SERVER API ROUTE: /api/wallet/*
// Handles wallet top-up order creation and payment verification
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

        const wallet = await import('../backend/wallet.js');

        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        const subPath = pathname.replace(/^\/api\/wallet/, '').replace(/\/$/, '') || '/';
        const method = (req.method || 'GET').toUpperCase();

        // 1. Create Wallet Topup Order: POST /api/wallet/create-order or /api/wallet/topup-order
        if ((subPath === '/create-order' || subPath === '/topup-order' || subPath === '/create') && method === 'POST') {
            return await wallet.handleWalletCreateOrder(req, res);
        }

        // 2. Verify Wallet Topup Payment: POST /api/wallet/verify-payment or /api/wallet/verify
        if ((subPath === '/verify-payment' || subPath === '/verify') && method === 'POST') {
            return await wallet.handleWalletVerifyPayment(req, res);
        }

        // 3. Safe Configuration Diagnostic Check: GET /api/wallet/config-status or /api/wallet/status
        if ((subPath === '/config-status' || subPath === '/status') && method === 'GET') {
            return res.status(200).json({
                success: true,
                ...wallet.getWalletRazorpayStatus()
            });
        }

        res.status(404).json({
            success: false,
            error: { message: `Wallet API route '${method} ${rawUrl}' not found.` }
        });
    } catch (err) {
        console.error('[Wallet API Error]:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
};
