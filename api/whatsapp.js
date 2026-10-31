// ==============================================================================
// WISHRITE META WHATSAPP CLOUD API — SERVER API ROUTE: /api/whatsapp/*
// Handles Meta webhook verification handshake (GET) and webhook notifications (POST).
// Server-side only: never expose secrets or personal customer data.
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0];
    const subPath = pathname.replace(/^\/api\/whatsapp/, '').replace(/\/$/, '') || '/';
    const method = (req.method || 'GET').toUpperCase();

    // 1. GET /api/whatsapp/webhook — Meta Webhook Verification Handshake
    if (subPath === '/webhook' && method === 'GET') {
        const query = req.query || {};
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];

        const expectedVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

        if (mode === 'subscribe' && expectedVerifyToken && token === expectedVerifyToken) {
            console.log('[WhatsApp Webhook] Handshake verified successfully.');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(challenge || '');
        }

        console.warn('[WhatsApp Webhook] Verification failed: mode or token mismatch.');
        return res.status(403).send('Forbidden');
    }

    // 2. POST /api/whatsapp/webhook — Meta WhatsApp Event Notification
    if (subPath === '/webhook' && method === 'POST') {
        try {
            const body = req.body || {};

            // Meta WhatsApp webhook payloads always contain { object: 'whatsapp_business_account', entry: [...] }
            if (body.object === 'whatsapp_business_account' || Array.isArray(body.entry)) {
                const entryCount = Array.isArray(body.entry) ? body.entry.length : 0;
                console.log(`[WhatsApp Webhook] Received webhook event (entries: ${entryCount}).`);
                
                // Return 200 OK immediately so Meta does not repeatedly retry
                return res.status(200).json({ success: true });
            }

            // Tolerate non-standard or ping requests safely
            console.log('[WhatsApp Webhook] Received unhandled event object.');
            return res.status(200).json({ success: true, received: true });
        } catch (err) {
            console.error('[WhatsApp Webhook] Error processing incoming event:', err.message);
            // Always acknowledge to Meta with 200 to prevent retry storms
            return res.status(200).json({ success: false, error: 'Internal handling error' });
        }
    }

    // 404 for unknown subroutes
    res.status(404).json({ success: false, error: 'Endpoint not found' });
};

