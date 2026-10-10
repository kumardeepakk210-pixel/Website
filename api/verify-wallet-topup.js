// ==============================================================================
// WishRite API Route: /api/verify-wallet-topup
// Purpose: Verify Razorpay signature and atomically credit customer wallet
// ==============================================================================

const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL || 'https://ptpuepejciqiktmcpuon.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed. Only POST is accepted.' });
    }

    try {
        const body = req.body || {};
        const {
            topup_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = body;

        if (!topup_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                verified: false,
                error: 'Missing required parameters: topup_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.'
            });
        }

        if (!razorpayKeySecret || !razorpayKeyId) {
            return res.status(500).json({ success: false, verified: false, error: 'Razorpay gateway credentials missing on server.' });
        }

        if (!supabaseServiceRoleKey) {
            return res.status(500).json({ success: false, verified: false, error: 'Database service role key missing on server.' });
        }

        // 1. Verify Razorpay HMAC signature
        const expectedSig = crypto
            .createHmac('sha256', razorpayKeySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSig.toLowerCase() !== String(razorpay_signature).trim().toLowerCase()) {
            return res.status(400).json({
                success: false,
                verified: false,
                error: 'Payment signature verification failed.'
            });
        }

        // 2. Verify payment status directly with Razorpay API
        const rzpAuth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
        const rzpPayRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
            headers: {
                Authorization: `Basic ${rzpAuth}`
            }
        });

        if (!rzpPayRes.ok) {
            return res.status(400).json({
                success: false,
                verified: false,
                error: 'Payment gateway could not verify transaction.'
            });
        }

        const payment = await rzpPayRes.json();
        if (payment.status !== 'captured') {
            return res.status(400).json({
                success: false,
                verified: false,
                error: `Payment is not in captured status (current: ${payment.status}).`
            });
        }

        // 3. Atomically credit wallet via PostgreSQL RPC
        const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/credit_wallet_from_verified_payment`, {
            method: 'POST',
            headers: {
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_topup_id: topup_id,
                p_razorpay_payment_id: razorpay_payment_id,
                p_razorpay_signature: razorpay_signature
            })
        });

        if (!rpcRes.ok) {
            const errText = await rpcRes.text();
            console.error('credit_wallet_from_verified_payment RPC error:', errText);
            return res.status(500).json({
                success: false,
                verified: true,
                error: 'Payment verified, but failed to credit customer wallet in database.'
            });
        }

        const result = await rpcRes.json();

        return res.status(200).json({
            success: true,
            verified: true,
            wallet_credited: true,
            amount_credited: result.amount_credited,
            wallet_balance: result.wallet_balance
        });

    } catch (err) {
        console.error('verify-wallet-topup handler error:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
};
