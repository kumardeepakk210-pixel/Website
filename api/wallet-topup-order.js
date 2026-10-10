// ==============================================================================
// WishRite API Route: /api/wallet-topup-order
// Purpose: Create Razorpay Order for Wallet Top-up with secure server credentials
// ==============================================================================

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
        const amount = Number(body.amount);
        let userId = body.user_id;

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, error: 'A valid positive amount is required.' });
        }

        // Check environment credentials
        if (!razorpayKeyId || !razorpayKeySecret) {
            return res.status(500).json({ success: false, error: 'Razorpay gateway credentials not configured on server.' });
        }

        if (!supabaseServiceRoleKey) {
            return res.status(500).json({ success: false, error: 'Database service role key not configured on server.' });
        }

        // Verify authenticated user from Authorization header if present
        const authHeader = req.headers?.authorization || req.headers?.Authorization;
        if (authHeader) {
            const token = authHeader.replace(/^Bearer /i, '').trim();
            try {
                const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                    headers: {
                        apikey: supabaseServiceRoleKey,
                        Authorization: `Bearer ${token}`
                    }
                });
                if (userRes.ok) {
                    const u = await userRes.json();
                    if (u?.id) userId = u.id;
                }
            } catch (e) {
                console.warn('Token verification error:', e.message);
            }
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User must be authenticated to add money to wallet.' });
        }

        // 1. Create wallet top-up request record in Supabase
        const topupInsertRes = await fetch(`${supabaseUrl}/rest/v1/wallet_topup_requests`, {
            method: 'POST',
            headers: {
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({
                user_id: userId,
                amount: amount,
                currency: 'INR',
                status: 'PENDING'
            })
        });

        if (!topupInsertRes.ok) {
            const errText = await topupInsertRes.text();
            console.error('Failed to create topup request:', errText);
            return res.status(500).json({ success: false, error: 'Failed to initiate wallet topup.' });
        }

        const topupRecords = await topupInsertRes.json();
        const topupRecord = Array.isArray(topupRecords) ? topupRecords[0] : topupRecords;

        // 2. Create Razorpay Order
        const rzpAuth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${rzpAuth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100),
                currency: 'INR',
                receipt: `WLT_${String(topupRecord.id).slice(0, 30)}`,
                notes: {
                    purpose: 'wallet_topup',
                    topup_id: topupRecord.id,
                    user_id: userId
                }
            })
        });

        if (!rzpRes.ok) {
            const errText = await rzpRes.text();
            console.error('Razorpay API error:', errText);
            return res.status(502).json({ success: false, error: 'Failed to create payment order with gateway.' });
        }

        const rzpOrder = await rzpRes.json();

        // 3. Update top-up record with razorpay_order_id
        await fetch(`${supabaseUrl}/rest/v1/wallet_topup_requests?id=eq.${encodeURIComponent(topupRecord.id)}`, {
            method: 'PATCH',
            headers: {
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                razorpay_order_id: rzpOrder.id,
                updated_at: new Date().toISOString()
            })
        });

        return res.status(200).json({
            success: true,
            purpose: 'wallet_topup',
            topup_id: topupRecord.id,
            key_id: razorpayKeyId,
            order_id: rzpOrder.id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency || 'INR'
        });
    } catch (err) {
        console.error('wallet-topup-order handler error:', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
};
