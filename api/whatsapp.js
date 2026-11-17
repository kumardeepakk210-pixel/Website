// ==============================================================================
// WISHRITE META WHATSAPP CLOUD API — SERVER API ROUTE: /api/whatsapp/*
// Handles Meta webhook verification handshake (GET) and webhook notifications (POST).
// Server-side only: never expose secrets or personal customer data.
// ==============================================================================

const crypto = require('crypto');

// Standard Webhooks / Supabase Auth Hook Verification Helper.
// Supabase sends secrets as "v1,whsec_<base64>" and supports rotation with "|" separators.
function parseHookSecrets(value) {
    return String(value || '')
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const normalized = entry.startsWith('v1,') ? entry.slice(3) : entry;
            if (normalized.startsWith('whsec_')) {
                const encoded = normalized.slice('whsec_'.length);
                if (!encoded) return null;
                const decoded = Buffer.from(encoded, 'base64');
                return decoded.length ? decoded : null;
            }
            // Backward compatibility for deployments that stored the decoded
            // signing secret directly. Prefer the official v1,whsec_ format.
            return Buffer.from(normalized, 'utf8');
        })
        .filter(Boolean);
}

function getHeader(headers, name) {
    const target = name.toLowerCase();
    if (!headers) return undefined;
    if (typeof headers.get === 'function') return headers.get(target) || undefined;
    const key = Object.keys(headers).find((item) => item.toLowerCase() === target);
    return key ? headers[key] : undefined;
}

function verifyStandardWebhook(rawBody, headers, secrets) {
    if (typeof rawBody !== 'string') {
        return { valid: false, reason: 'missing_raw_body' };
    }

    const msgId = getHeader(headers, 'webhook-id');
    const timestamp = getHeader(headers, 'webhook-timestamp');
    const signature = getHeader(headers, 'webhook-signature');

    if (!msgId || !timestamp || !signature) {
        return { valid: false, reason: 'missing_webhook_headers' };
    }

    const ts = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(ts) || Math.abs(now - ts) > 300) {
        return { valid: false, reason: 'timestamp_out_of_tolerance' };
    }

    // The handler passes already-decoded Buffers; direct callers/tests may pass
    // the original Supabase secret string.
    const secretBytesList = Array.isArray(secrets)
        ? secrets.filter((secret) => Buffer.isBuffer(secret))
        : parseHookSecrets(secrets);

    if (secretBytesList.length === 0) {
        return { valid: false, reason: 'no_secrets_configured' };
    }

    const signedContent = Buffer.from(`${msgId}.${timestamp}.${rawBody}`, 'utf8');
    const signatures = String(signature).trim().split(/\\s+/);

    for (const secretBytes of secretBytesList) {
        const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest();
        for (const item of signatures) {
            const match = /^v1,([A-Za-z0-9+/]+={0,2})$/.exec(item);
            if (!match) continue;
            const received = Buffer.from(match[1], 'base64');
            if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
                return { valid: true };
            }
        }
    }

    return { valid: false, reason: 'invalid_signature' };
}

// Vercel's default JSON parser changes the body representation. Disable it so
// the exact bytes Supabase signed can be verified before parsing JSON.
async function readRawRequestBody(req, allowParsedFallback = false) {
    if (typeof req.rawBody === 'string') return req.rawBody;
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
    if (typeof req.body === 'string') return req.body;

    if (req && typeof req[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString('utf8');
    }

    // Unit tests and explicit local mocks may supply an already-parsed body.
    if (allowParsedFallback && req.body && typeof req.body === 'object') {
        return JSON.stringify(req.body);
    }
    return null;
}

function parseJsonBody(rawBody) {
    if (typeof rawBody !== 'string' || !rawBody.length) return null;
    try {
        return JSON.parse(rawBody);
    } catch (_) {
        return null;
    }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature');

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
            const rawBody = await readRawRequestBody(req, process.env.NODE_ENV === 'test');
            const body = parseJsonBody(rawBody) || {};

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
            const isTestEnv = process.env.NODE_ENV === 'test';
            const isExplicitLocalMock = (process.env.LOCAL_WHATSAPP_MOCK === 'true' || process.env.LOCAL_WHATSAPP_MOCK === true);

            // Supabase format: "v1,whsec_<base64>".
            // Multiple active secrets for rotation are separated with "|", not commas.
            const configuredSecretsRaw = process.env.SEND_SMS_HOOK_SECRETS || process.env.SUPABASE_SMS_HOOK_SECRET || '';
            const configuredSecrets = parseHookSecrets(configuredSecretsRaw);

            // In production, reject if no secret is configured (fail-closed)
            if (!isTestEnv && !isExplicitLocalMock && configuredSecrets.length === 0) {
                console.error('[WhatsApp Auth Hook] Security configuration error: Send SMS Hook signing secret not configured.');
                return res.status(500).json({ error: { message: 'Server security configuration error' } });
            }

            // Preserve and verify the exact raw payload before parsing it.
            const rawBody = await readRawRequestBody(req, isTestEnv || isExplicitLocalMock);
            const hasWebhookHeaders = !!getHeader(req.headers, 'webhook-id');

            if (!rawBody) {
                console.warn('[WhatsApp Auth Hook] Request body unavailable for signature verification.');
                return res.status(400).json({ error: { message: 'Missing raw webhook body' } });
            }

            if (configuredSecrets.length > 0) {
                const verification = verifyStandardWebhook(rawBody, req.headers, configuredSecrets);
                if (!verification.valid) {
                    // Check fallback for local testing mock only if in test env
                    if (isTestEnv || isExplicitLocalMock) {
                        const authHeader = req.headers['authorization'] || '';
                        const incomingBearer = authHeader.replace(/^Bearer\s+/i, '').trim();
                        const isBearerMatched = incomingBearer && configuredSecrets.includes(incomingBearer);
                        if (!isBearerMatched && hasWebhookHeaders) {
                            console.warn('[WhatsApp Auth Hook] Rejected request with invalid Standard Webhook signature:', verification.reason);
                            return res.status(401).json({ error: { message: 'Invalid webhook signature', code: verification.reason } });
                        }
                    } else {
                        console.warn('[WhatsApp Auth Hook] Rejected unauthenticated hook request:', verification.reason);
                        return res.status(401).json({ error: { message: 'Unauthorized: Invalid webhook signature', code: verification.reason } });
                    }
                }
            } else if (!isTestEnv && !isExplicitLocalMock) {
                // Reject arbitrary client payloads without verified webhook in production
                return res.status(401).json({ error: { message: 'Unauthorized' } });
            }

            const body = parseJsonBody(rawBody) || (isTestEnv || isExplicitLocalMock ? (req.body || {}) : {});
            // Supabase Send SMS hook sends: { user: { id, phone }, sms: { otp } }
            // Direct mock payload: { phone, otp }
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

            // Mock delivery check (only in test environment or explicit local mock)
            if (isTestEnv || isExplicitLocalMock) {
                const maskedDest = `${destinationPhone.slice(0, 4)}****${destinationPhone.slice(-2)}`;
                console.log(`[WhatsApp Auth Hook] (MOCK/TEST) Delivered OTP to destination: ${maskedDest}`);
                return res.status(200).json({
                    success: true,
                    mock: true,
                    destination: maskedDest
                });
            }

            // Production delivery requires valid Meta Cloud API credentials
            const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
            const templateName = process.env.WHATSAPP_AUTH_TEMPLATE_NAME || process.env.WHATSAPP_AUTH_TEMPLATE || 'wishrite_auth_otp';
            const templateLang = process.env.WHATSAPP_AUTH_TEMPLATE_LANG || process.env.WHATSAPP_AUTH_LANGUAGE || 'en';
            const buttonType = (process.env.WHATSAPP_AUTH_BUTTON_TYPE || 'copy_code').toLowerCase();

            if (!whatsappToken || !phoneNumberId) {
                console.error('[WhatsApp Auth Hook] Meta WhatsApp credentials not configured on server.');
                return res.status(500).json({
                    error: { message: 'WhatsApp Cloud API credentials not configured' }
                });
            }

            const graphApiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';
            const metaEndpoint = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

            // Build components according to Meta Authentication template guidelines:
            // Body parameter: { type: 'text', text: otp }
            // Button parameter: for copy_code -> sub_type: 'copy_code', parameter: { type: 'text', text: otp }
            // For url/one-tap -> sub_type: 'url'
            const buttonComponent = {
                type: 'button',
                sub_type: buttonType === 'copy_code' ? 'copy_code' : (buttonType === 'one_tap' ? 'url' : 'copy_code'),
                index: '0',
                parameters: [
                    {
                        type: 'text',
                        text: String(otp)
                    }
                ]
            };

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
                        buttonComponent
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

            const messageId = metaData?.messages?.[0]?.id;
            console.log(`[WhatsApp Auth Hook] Successfully delivered WhatsApp OTP. Meta messageId: ${messageId || 'unknown'}`);
            return res.status(200).json({ success: true, messageId: messageId });

        } catch (err) {
            console.error('[WhatsApp Auth Hook] Internal exception:', err.message);
            return res.status(500).json({ error: { message: 'Internal server error' } });
        }
    }

    // 404 for unknown subroutes
    res.status(404).json({ success: false, error: 'Endpoint not found' });
};

module.exports.verifyStandardWebhook = verifyStandardWebhook;

// Vercel: disable automatic parsing so webhook signatures use the original body bytes.
module.exports.config = { api: { bodyParser: false } };
