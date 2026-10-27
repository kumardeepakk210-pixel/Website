// ==============================================================================
// WishRite API Route: /api/wallet-topup-order
// Purpose: Create Razorpay Order for Wallet Top-up with secure server credentials
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
        return await wallet.handleWalletCreateOrder(req, res);
    } catch (err) {
        console.error('[wallet-topup-order Error]:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
};
