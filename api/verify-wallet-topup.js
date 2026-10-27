// ==============================================================================
// WishRite API Route: /api/verify-wallet-topup
// Purpose: Verify Razorpay signature and atomically credit customer wallet
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const wallet = await import('../backend/wallet.js');
        return await wallet.handleWalletVerifyPayment(req, res);
    } catch (err) {
        console.error('[verify-wallet-topup Error]:', err);
        return res.status(500).json({ success: false, verified: false, error: err.message || 'Internal server error.' });
    }
};
