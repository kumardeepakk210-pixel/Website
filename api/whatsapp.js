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

    // 3. POST /api/whatsapp/send-otp — Supabase Auth Custom Send SMS Hook
    // Invoked by Supabase Auth when a customer triggers phone OTP (signInWithOtp)
    if ((subPath === '/send-otp' || subPath === '/send-sms') && method === 'POST') {
        try {
            const body = req.body || {};
            // Supabase Send SMS hook sends: { user: { id, phone }, sms: { otp } }
            // Or direct payload: { phone, otp }
            const rawPhone = body.user?.phone || body.phone;
            const otp = body.sms?.otp || body.otp;

            if (!rawPhone || !otp) {
                return res.status(400).json({
                    error: { message: 'Missing phone or OTP parameter' }
                });
            }

            // Clean & normalize phone number
            const phoneDigits = String(rawPhone).replace(/\D/g, '');
            let destinationPhone = phoneDigits;
            // For Indian numbers without country code (10 digits), prepend 91
            if (phoneDigits.length === 10) {
                destinationPhone = '91' + phoneDigits;
            }

            // Check Hook Shared Secret if configured
            const hookSecret = process.env.SUPABASE_SMS_HOOK_SECRET;
            if (hookSecret) {
                const authHeader = req.headers['authorization'] || '';
                const incomingSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
                if (incomingSecret !== hookSecret) {
                    console.warn('[WhatsApp Auth Hook] Unauthorized hook request: secret mismatch.');
                    return res.status(401).json({ error: { message: 'Unauthorized' } });
                }
            }

            // Check if mock mode is active (for automated tests or explicit local dev without Meta credentials)
            const isTestEnv = process.env.NODE_ENV === 'test';
            const isExplicitLocalMock = (process.env.LOCAL_WHATSAPP_MOCK === 'true' || process.env.LOCAL_WHATSAPP_MOCK === true);
            const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
            const templateName = process.env.WHATSAPP_AUTH_TEMPLATE_NAME || 'wishrite_auth_otp';
            const templateLang = process.env.WHATSAPP_AUTH_TEMPLATE_LANG || 'en';

            if (isTestEnv || isExplicitLocalMock) {
                console.log(`[WhatsApp Auth Hook] (MOCK/TEST) Delivered OTP to ${destinationPhone.slice(0, 4)}****${destinationPhone.slice(-2)}`);
                return res.status(200).json({
                    success: true,
                    mock: true,
                    destination: destinationPhone.slice(0, 4) + '****' + destinationPhone.slice(-2)
                });
            }

            // Production delivery requires valid Meta Cloud API credentials
            if (!whatsappToken || !phoneNumberId) {
                console.error('[WhatsApp Auth Hook] Meta WhatsApp credentials not configured on server.');
                return res.status(500).json({
                    error: { message: 'WhatsApp Cloud API credentials not configured' }
                });
            }

            const graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
            const metaEndpoint = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

            // Standard Meta WhatsApp Authentication Template Body
            const metaPayload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: destinationPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: templateLang
                    },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                {
                                    type: 'text',
                                    text: String(otp)
                                }
                            ]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [
                                {
                                    type: 'text',
                                    text: String(otp)
                                }
                            ]
                        }
                    ]
                }
            };

            const metaRes = await fetch(metaEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${whatsappToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metaPayload)
            });

            const metaData = await metaRes.json();

            if (!metaRes.ok) {
                console.error('[WhatsApp Auth Hook] Meta API Error:', metaData?.error?.message || metaRes.statusText);
                return res.status(502).json({
                    error: {
                        message: 'WhatsApp delivery failed',
                        details: metaData?.error?.message
                    }
                });
            }

            console.log(`[WhatsApp Auth Hook] Successfully delivered WhatsApp OTP to destination.`);
            return res.status(200).json({ success: true, messageId: metaData?.messages?.[0]?.id });

        } catch (err) {
            console.error('[WhatsApp Auth Hook] Internal exception:', err.message);
            return res.status(500).json({ error: { message: 'Internal server error' } });
        }
    }

    // 404 for unknown subroutes
    res.status(404).json({ success: false, error: 'Endpoint not found' });
};

