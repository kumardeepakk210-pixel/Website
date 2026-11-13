// WISHRITE CREATOR CLUB — PRODUCTION INSTAGRAM SYNCHRONIZATION SERVICE
// Phase 2: Instagram Media Discovery, Meta Graph API Insights Sync, Metrics Upsert

import crypto from 'crypto';
import { dbQuery, dbInsert, dbUpdate, hasServerAdminCredential } from '../supabase-client.js';

// Internal database hooks to facilitate isolation and unit testing
export const _syncDbHooks = {
    dbUpdate: (...args) => dbUpdate(...args),
    dbQuery: (...args) => dbQuery(...args)
};

import {
    META_GRAPH_API_VERSION as META_API_VERSION,
    WISHRITE_OFFICIAL_IG_HANDLE,
    WISHRITE_OFFICIAL_IG_ACCOUNT_ID
} from '../meta-config.js';

export {
    META_API_VERSION,
    WISHRITE_OFFICIAL_IG_HANDLE,
    WISHRITE_OFFICIAL_IG_ACCOUNT_ID
};

export const ALLOWED_CREATOR_NICHES = [
    'Fashion & Lifestyle',
    'Beauty & Skincare',
    'Jewellery & Accessories',
    'Parenting & Kids',
    'Travel',
    'Food',
    'Fitness & Health',
    'Technology',
    'Home & Decor',
    'Entertainment',
    'Other'
];

const ENCRYPTION_ALGO = 'aes-256-gcm';

// In-memory cache for validated Meta System User Token status (5-minute TTL)
let systemUserValidationCache = null;

/**
 * Validates the configured server-side Meta System User Token against Meta Graph API.
 * Ensures the token is active, unrevoked, and has access to the official WishRite Instagram account.
 * Caches positive/negative validation results for 5 minutes to avoid redundant outbound requests.
 */
export async function validateSystemUserToken() {
    const sysToken = (process.env.INSTAGRAM_SYSTEM_USER_TOKEN || '').trim();
    if (!sysToken) return { valid: false, error: 'Token not configured' };

    const now = Date.now();
    if (systemUserValidationCache && systemUserValidationCache.token === sysToken && (now - systemUserValidationCache.timestamp < 300000)) {
        return { valid: systemUserValidationCache.valid, error: systemUserValidationCache.error };
    }

    try {
        const verifyRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${WISHRITE_OFFICIAL_IG_ACCOUNT_ID}?fields=id,username&access_token=${encodeURIComponent(sysToken)}`
        );
        const verifyData = await verifyRes.json();

        if (verifyData && verifyData.id === WISHRITE_OFFICIAL_IG_ACCOUNT_ID) {
            systemUserValidationCache = { token: sysToken, valid: true, error: null, timestamp: now };
            return { valid: true, error: null };
        }

        const errMsg = verifyData?.error?.message || 'Meta System User token validation failed';
        systemUserValidationCache = { token: sysToken, valid: false, error: errMsg, timestamp: now };
        return { valid: false, error: errMsg };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

// In-memory mutex to prevent double-syncing for the same creator
const activeSyncJobs = new Set();

/**
 * Derives a 32-byte key from server secret for token encryption.
 * Strictly requires a server-side encryption key. Throws if missing or invalid.
 */
function getEncryptionKey() {
    const secret = (process.env.META_APP_SECRET ||
                    process.env.META_OAUTH_SIGNING_SECRET ||
                    process.env.SUPABASE_SECRET_KEY ||
                    process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!secret) {
        const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
        if (isTestEnv && process.env.ALLOW_TEST_ENCRYPTION_FALLBACK === 'true') {
            return crypto.createHash('sha256').update('test-mock-secret-key-32b-length!!').digest();
        }
        throw new Error('[Token Encryption Error] Missing required server-side encryption secret (META_APP_SECRET, META_OAUTH_SIGNING_SECRET, or SUPABASE_SECRET_KEY). Refusing unencrypted token operation.');
    }

    return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts an access token before storage using AES-256-GCM.
 * Never stores or returns plaintext tokens. Throws on missing key or cipher failure.
 */
export function encryptToken(token) {
    if (!token) return null;
    if (typeof token !== 'string') {
        throw new Error('[Token Encryption Error] Token to encrypt must be a non-empty string.');
    }
    if (token.startsWith('enc:')) return token; // already encrypted

    const key = getEncryptionKey();
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
        let enc = cipher.update(token, 'utf8', 'hex');
        enc += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return `enc:${iv.toString('hex')}:${tag}:${enc}`;
    } catch (err) {
        throw new Error(`[Token Encryption Error] Failed to encrypt access token: ${err.message}`);
    }
}

/**
 * Decrypts an access token immediately before making Meta API calls.
 * Returns null if decryption of an encrypted payload fails.
 * Preserves compatibility by returning legacy unencrypted tokens while logging a migration notice.
 */
export function decryptToken(encrypted) {
    if (!encrypted) return null;
    if (typeof encrypted !== 'string') return null;

    // Legacy unencrypted token support: return plaintext for backward compatibility
    if (!encrypted.startsWith('enc:')) {
        console.warn('[Instagram Sync] Legacy unencrypted token detected during decryption. Please re-authenticate to upgrade to AES-256-GCM.');
        return encrypted;
    }

    try {
        const parts = encrypted.split(':');
        if (parts.length !== 4) {
            console.error('[Instagram Sync] Malformed encrypted token structure');
            return null;
        }
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encText = parts[3];
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(encText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (err) {
        console.error('[Instagram Sync] Token decryption error:', err.message);
        return null;
    }
}

/**
 * Resolves the connected Instagram credentials for a creator from Supabase/record
 */
export async function getCreatorInstagramConnection(creator) {
    const creatorId = creator.id || creator.influencer_id;
    let conn = creator.instagram_connection || null;

    if (!conn && creatorId) {
        try {
            const queryOpts = { useAdmin: hasServerAdminCredential() };
            const rows = await dbQuery('influencers', `influencer_id=eq.${encodeURIComponent(creatorId)}&limit=1`, queryOpts);
            if (Array.isArray(rows) && rows.length > 0 && rows[0].instagram_connection) {
                conn = rows[0].instagram_connection;
            }
        } catch (_) {}
    }

    const rawHandle = (conn?.username || creator.instagram_id || '').toLowerCase().trim().replace(/^@/, '');
    const isWishriteBrandAccount = (rawHandle === WISHRITE_OFFICIAL_IG_HANDLE);
    const systemUserToken = (process.env.INSTAGRAM_SYSTEM_USER_TOKEN || '').trim();

    // Official brand account (@wishrite.in) uses server-side System User Token exclusively
    if (isWishriteBrandAccount && systemUserToken) {
        const validation = await validateSystemUserToken();
        if (validation.valid) {
            return {
                ...(conn || {}),
                username: conn?.username || WISHRITE_OFFICIAL_IG_HANDLE,
                connected: true,
                account_id: WISHRITE_OFFICIAL_IG_ACCOUNT_ID,
                account_type: conn?.account_type || 'professional',
                insights_status: 'connected',
                decrypted_token: systemUserToken,
                is_system_user: true
            };
        }
    }

    if (!conn) return null;

    // Detect legacy plaintext token and migrate it to AES-256-GCM in storage
    if (conn.access_token && typeof conn.access_token === 'string' && !conn.access_token.startsWith('enc:')) {
        const legacyPlaintext = conn.access_token;
        let newlyEncrypted = null;
        try {
            newlyEncrypted = encryptToken(legacyPlaintext);
        } catch (encErr) {
            console.error('[Instagram Sync] Legacy token encryption failed:', encErr.message);
            const err = new Error(`[Legacy Token Migration] Failed to encrypt legacy token: ${encErr.message}`);
            err.code = 'LEGACY_TOKEN_ENCRYPTION_FAILED';
            throw err;
        }

        if (creatorId) {
            try {
                const queryOpts = {
                    useAdmin: hasServerAdminCredential(),
                    returnRepresentation: true
                };
                const safeConn = { ...conn, access_token: newlyEncrypted };
                delete safeConn.decrypted_token;
                const updateRes = await _syncDbHooks.dbUpdate('influencers', 'influencer_id', creatorId, {
                    instagram_connection: safeConn
                }, queryOpts);

                // Verify that the record was actually found and updated
                if (!updateRes || !updateRes.data) {
                    console.error('[Instagram Sync] Automatic legacy token migration update affected zero rows for creatorId:', creatorId);
                    const err = new Error(`[Legacy Token Migration] No influencer record was updated for influencer_id: ${creatorId}`);
                    err.code = 'LEGACY_TOKEN_MIGRATION_PERSISTENCE_FAILED';
                    throw err;
                }

                // Verify the stored token in the returned record matches newlyEncrypted
                const persistedConn = updateRes.data.instagram_connection;
                if (!persistedConn || persistedConn.access_token !== newlyEncrypted) {
                    console.error('[Instagram Sync] Automatic legacy token migration verification mismatch for creatorId:', creatorId);
                    const err = new Error(`[Legacy Token Migration] Verification mismatch: persisted token does not match encrypted token for influencer_id: ${creatorId}`);
                    err.code = 'LEGACY_TOKEN_MIGRATION_PERSISTENCE_FAILED';
                    throw err;
                }

                conn.access_token = newlyEncrypted;
            } catch (upErr) {
                console.error('[Instagram Sync] Automatic legacy token migration update failed:', upErr.message);
                const err = new Error(`[Legacy Token Migration] Database persistence failed for encrypted token: ${upErr.message}`);
                err.code = 'LEGACY_TOKEN_MIGRATION_PERSISTENCE_FAILED';
                throw err;
            }
        } else {
            conn.access_token = newlyEncrypted;
        }
    }

    const rawToken = conn.access_token ? decryptToken(conn.access_token) : null;
    return {
        ...conn,
        decrypted_token: rawToken
    };
}

/**
 * Validates granted permissions on the Meta access token.
 * Ensures instagram_basic and instagram_manage_insights are active.
 */
export async function verifyMetaTokenPermissions(accessToken) {
    if (!accessToken) return { valid: false, missing: ['access_token'], granted: [] };
    try {
        const url = `https://graph.facebook.com/${META_API_VERSION}/me/permissions?access_token=${encodeURIComponent(accessToken)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
            return { valid: false, error: data.error.message, missing: [], granted: [] };
        }
        const granted = new Set(
            (data.data || [])
                .filter(p => p.status === 'granted')
                .map(p => p.permission)
        );
        const required = ['instagram_basic', 'instagram_manage_insights'];
        const missing = required.filter(r => !granted.has(r));
        return {
            valid: missing.length === 0,
            granted: Array.from(granted),
            missing
        };
    } catch (err) {
        return { valid: false, error: err.message, missing: [], granted: [] };
    }
}

/**
 * Fetches Instagram influencer profile information from official Meta Graph API v26.0.
 * Retrieves account ID, username, name, biography, website, profile picture,
 * followers count, following count (follows_count), media count, and page category.
 * Never requests unsupported fields (e.g. account_type or category on the IG node).
 */
export async function fetchInstagramProfileDetails(accountId, accessToken, pageId = null) {
    if (!accountId || !accessToken) return null;

    // 1. Fetch IG User node fields
    const igFields = 'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count';
    const igUrl = `https://graph.facebook.com/${META_API_VERSION}/${accountId}?fields=${igFields}&access_token=${encodeURIComponent(accessToken)}`;

    let igData = null;
    try {
        const res = await fetch(igUrl);
        const json = await res.json();
        if (json && json.id) {
            igData = json;
        } else if (json.error) {
            console.warn('[Instagram Profile Fetch] IG Node error:', json.error.message);
            return { error: json.error };
        }
    } catch (err) {
        console.warn('[Instagram Profile Fetch] Network error:', err.message);
        return { error: { message: err.message } };
    }

    if (!igData) return null;

    // 2. Fetch Facebook Page category if pageId is available
    let instagramCategory = null;
    if (pageId) {
        try {
            const pageUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=id,name,category,category_list&access_token=${encodeURIComponent(accessToken)}`;
            const pageRes = await fetch(pageUrl);
            const pageData = await pageRes.json();
            if (pageData && (pageData.category || (pageData.category_list && pageData.category_list[0]?.name))) {
                instagramCategory = pageData.category || pageData.category_list[0]?.name || null;
            }
        } catch (pageErr) {
            console.warn('[Instagram Profile Fetch] Page category query error (ignored):', pageErr.message);
        }
    }

    return {
        account_id: igData.id,
        username: igData.username,
        name: igData.name || null,
        biography: igData.biography || null,
        website: igData.website || null,
        profile_picture_url: igData.profile_picture_url || null,
        followers_count: typeof igData.followers_count === 'number' ? igData.followers_count : 0,
        following_count: typeof igData.follows_count === 'number' ? igData.follows_count : 0,
        media_count: typeof igData.media_count === 'number' ? igData.media_count : 0,
        instagram_category: instagramCategory,
        account_type: 'professional',
        validation_status: 'verified',
        profile_synced_at: new Date().toISOString()
    };
}

/**
 * Fetches media from Instagram Account with cursor-based pagination
 */
export async function fetchInstagramAccountMedia(accountId, accessToken, maxMedia = 150) {
    if (!accountId || !accessToken) return [];

    const mediaItems = [];
    let nextUrl = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(accessToken)}`;

    try {
        while (nextUrl && mediaItems.length < maxMedia) {
            const res = await fetch(nextUrl);
            const data = await res.json();

            if (data.error) {
                console.warn('[Instagram Sync] Media fetch error:', data.error.message);
                break;
            }

            if (data.data && Array.isArray(data.data)) {
                for (const item of data.data) {
                    mediaItems.push(item);
                    if (mediaItems.length >= maxMedia) break;
                }
            }

            nextUrl = data.paging?.next || null;
        }
    } catch (err) {
        console.warn('[Instagram Sync] Media pagination warning:', err.message);
    }

    return mediaItems;
}

/**
 * Queries official Meta Graph API insights for a specific media item
 * Metrics supported: views, reach, likes, comments, saved, shares, total_interactions
 */
export async function fetchMediaInsights(mediaId, mediaType, mediaProductType, accessToken) {
    if (!mediaId || !accessToken) return null;

    const isReel = (mediaProductType === 'REELS' || mediaType === 'VIDEO');
    const metricList = isReel
        ? 'views,reach,likes,comments,shares,saved,total_interactions'
        : 'reach,likes,comments,shares,saved,total_interactions';

    const url = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}/insights?metric=${encodeURIComponent(metricList)}&access_token=${encodeURIComponent(accessToken)}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            return {
                error: data.error,
                metrics: null
            };
        }

        const metrics = {
            views: null,
            reach: null,
            likes: null,
            comments: null,
            saved: null,
            shares: null,
            total_interactions: null
        };

        if (data.data && Array.isArray(data.data)) {
            for (const m of data.data) {
                const name = m.name;
                const val = (m.values && m.values[0] && m.values[0].value !== undefined)
                    ? m.values[0].value
                    : (m.value !== undefined ? m.value : null);

                if (val !== null && typeof val === 'number') {
                    if (name === 'views' || name === 'plays') metrics.views = val;
                    else if (name === 'reach') metrics.reach = val;
                    else if (name === 'likes') metrics.likes = val;
                    else if (name === 'comments') metrics.comments = val;
                    else if (name === 'saved') metrics.saved = val;
                    else if (name === 'shares') metrics.shares = val;
                    else if (name === 'total_interactions') metrics.total_interactions = val;
                }
            }
        }

        return {
            error: null,
            metrics
        };
    } catch (err) {
        return {
            error: { message: err.message },
            metrics: null
        };
    }
}

function extractShortcode(url) {
    if (!url) return null;
    const match = String(url).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
}

/**
 * Upserts an Instagram media item and its insights into creator_content
 */
export async function upsertCreatorContentItem(creator, media, insightsResult) {
    const creatorId = creator.id || creator.influencer_id;
    const mediaId = String(media.id);
    const permalink = media.permalink || `https://instagram.com/p/${mediaId}`;
    const mediaProductType = media.media_product_type || (media.media_type === 'VIDEO' ? 'REELS' : 'FEED');
    const isReel = mediaProductType === 'REELS';
    const contentType = isReel ? 'reel' : 'post';

    const metrics = insightsResult?.metrics || {};
    const error = insightsResult?.error || null;

    let insightsStatus = 'synced';
    let insightsError = null;

    if (error) {
        const code = error.code;
        if (code === 190) {
            insightsStatus = 'auth_expired';
            insightsError = 'Instagram access token expired or revoked. Please reconnect.';
        } else if (code === 10 || code === 200) {
            insightsStatus = 'api_permission_required';
            insightsError = 'Instagram insights permission required. Please reconnect with professional account.';
        } else {
            insightsStatus = 'partial';
            insightsError = error.message || 'Partial metrics retrieved.';
        }
    }

    const payload = {
        influencer_id: creatorId,
        creator_name: creator.name || creator.influencer_name || 'WishRite Creator',
        creator_email: creator.email || creator.email_id || '',
        platform: 'instagram',
        content_type: contentType,
        url: permalink,
        caption: media.caption || '',
        thumbnail_url: media.thumbnail_url || media.media_url || null,
        instagram_media_id: mediaId,
        instagram_media_type: media.media_type || 'VIDEO',
        instagram_account_id: media.account_id || null,
        instagram_permalink: permalink,
        views_count: metrics.views !== undefined ? metrics.views : null,
        reach_count: metrics.reach !== undefined ? metrics.reach : null,
        likes_count: metrics.likes !== undefined ? metrics.likes : (typeof media.like_count === 'number' ? media.like_count : null),
        comments_count: metrics.comments !== undefined ? metrics.comments : (typeof media.comments_count === 'number' ? media.comments_count : null),
        shares_count: metrics.shares !== undefined ? metrics.shares : null,
        saves_count: metrics.saved !== undefined ? metrics.saved : null,
        total_interactions_count: metrics.total_interactions !== undefined ? metrics.total_interactions : null,
        views: metrics.views !== undefined && metrics.views !== null ? metrics.views : 0,
        insights_status: insightsStatus,
        insights_error: insightsError,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Check if record exists in Supabase
    try {
        const queryOpts = { useAdmin: hasServerAdminCredential() };
        let existing = await dbQuery('creator_content', `influencer_id=eq.${encodeURIComponent(creatorId)}&instagram_media_id=eq.${encodeURIComponent(mediaId)}`, queryOpts);

        // Match by permalink or shortcode if not matched by media ID
        const mediaShortcode = extractShortcode(permalink);
        if (!Array.isArray(existing) || existing.length === 0) {
            const creatorItems = await dbQuery('creator_content', `influencer_id=eq.${encodeURIComponent(creatorId)}`, queryOpts);
            if (Array.isArray(creatorItems) && creatorItems.length > 0) {
                const matches = creatorItems.filter(item => {
                    if (item.instagram_media_id && item.instagram_media_id === mediaId) return true;
                    if (item.url && permalink && item.url.toLowerCase().replace(/\/$/, '') === permalink.toLowerCase().replace(/\/$/, '')) return true;
                    if (item.instagram_permalink && permalink && item.instagram_permalink.toLowerCase().replace(/\/$/, '') === permalink.toLowerCase().replace(/\/$/, '')) return true;
                    if (mediaShortcode && (item.url?.includes(mediaShortcode) || item.instagram_permalink?.includes(mediaShortcode))) return true;
                    return false;
                });
                if (matches.length > 0) {
                    existing = matches;
                }
            }
        }

        if (Array.isArray(existing) && existing.length > 0) {
            const results = [];
            for (const rec of existing) {
                const updatePayload = {
                    ...payload,
                    status: rec.status, // PRESERVE existing submission status ('Approved', 'Submitted', etc.)
                    product_code: rec.product_code || null,
                    product_name: rec.product_name || null,
                    product_image: rec.product_image || payload.thumbnail_url,
                    thumbnail_url: rec.thumbnail_url || payload.thumbnail_url,
                    rejection_reason: rec.rejection_reason || null,
                    clicks: rec.clicks || 0,
                    orders: rec.orders || 0,
                    commission_amount: rec.commission_amount || 0,
                    created_at: rec.created_at,
                    updated_at: new Date().toISOString()
                };

                // Preserve existing metrics if new insights failed
                if (error) {
                    if (updatePayload.views_count === null && rec.views_count !== null) updatePayload.views_count = rec.views_count;
                    if (updatePayload.reach_count === null && rec.reach_count !== null) updatePayload.reach_count = rec.reach_count;
                    if (updatePayload.likes_count === null && rec.likes_count !== null) updatePayload.likes_count = rec.likes_count;
                    if (updatePayload.comments_count === null && rec.comments_count !== null) updatePayload.comments_count = rec.comments_count;
                    if (updatePayload.shares_count === null && rec.shares_count !== null) updatePayload.shares_count = rec.shares_count;
                    if (updatePayload.saves_count === null && rec.saves_count !== null) updatePayload.saves_count = rec.saves_count;
                    if (updatePayload.total_interactions_count === null && rec.total_interactions_count !== null) updatePayload.total_interactions_count = rec.total_interactions_count;
                    updatePayload.views = updatePayload.views_count || rec.views || 0;
                }

                await dbUpdate('creator_content', 'id', rec.id, updatePayload, queryOpts);
                results.push({ action: 'updated', persisted: true, id: rec.id, ...updatePayload });
            }
            return results[0];
        } else {
            // Do NOT auto-insert discovered Instagram media into creator_content or contests.
            // Account sync and explicit creator content submissions are strictly separate data flows.
            return {
                action: 'discovered_only',
                persisted: false,
                id: mediaId,
                ...payload
            };
        }
    } catch (err) {
        console.warn('[Instagram Sync] Supabase upsert notice:', err.message);
        return { action: 'discovered_only', persisted: false, id: mediaId, ...payload };
    }
}

/**
 * Synchronizes Instagram media and insights for a canonical Creator
 */
export async function syncCreatorInstagram(creator) {
    const creatorId = creator.id || creator.influencer_id;
    if (!creatorId) {
        return { success: false, message: 'Invalid creator identity.' };
    }

    // Guard against simultaneous syncs for the same creator
    if (activeSyncJobs.has(creatorId)) {
        return { success: false, message: 'Instagram sync is already in progress.', code: 'SYNC_IN_PROGRESS' };
    }

    activeSyncJobs.add(creatorId);

    try {
        const conn = await getCreatorInstagramConnection(creator);
        if (!conn || !conn.connected || !conn.decrypted_token) {
            return {
                success: false,
                message: 'Instagram insights require an eligible Instagram professional account connected to WishRite.'
            };
        }

        const accessToken = conn.decrypted_token;
        let accountId = conn.account_id;

        // If account_id is not saved, resolve it via /me
        if (!accountId) {
            try {
                const meRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
                const meData = await meRes.json();
                if (meData?.id) {
                    accountId = meData.id;
                    conn.account_id = accountId;
                    const safeConn = { ...conn, account_id: accountId };
                    delete safeConn.decrypted_token;
                    if (conn.is_system_user) safeConn.access_token = null;
                    await dbUpdate('influencers', 'influencer_id', creatorId, {
                        instagram_connection: safeConn
                    }, { useAdmin: true }).catch(() => {});
                }
            } catch (_) {}
        }

        if (!accountId) {
            return {
                success: false,
                message: 'Unable to resolve Instagram professional account ID. Please reconnect Instagram.'
            };
        }

        // Fetch media with limit (e.g., 20 items per sync)
        const mediaList = await fetchInstagramAccountMedia(accountId, accessToken, 20);

        let syncedCount = 0;
        let failedCount = 0;
        let matchedSubmissionsCount = 0;
        const syncedItems = [];

        for (const media of mediaList) {
            media.account_id = accountId;
            const insightsRes = await fetchMediaInsights(media.id, media.media_type, media.media_product_type, accessToken);
            const upsertResult = await upsertCreatorContentItem(creator, media, insightsRes);

            if (upsertResult.action === 'updated') {
                matchedSubmissionsCount++;
            }
            if (upsertResult.insights_status === 'synced' || upsertResult.insights_status === 'partial') {
                syncedCount++;
            } else {
                failedCount++;
            }
            syncedItems.push(upsertResult);
        }

        const now = new Date().toISOString();
        // Update connection last_synced_at and ensure account_id is populated
        conn.last_synced_at = now;
        conn.insights_status = 'connected';
        if (!conn.account_id && accountId) {
            conn.account_id = accountId;
        }

        // Fetch refreshed influencer profile information
        let profileDetails = null;
        try {
            profileDetails = await fetchInstagramProfileDetails(accountId, accessToken, conn.facebook_page_id || null);
        } catch (_) {}

        // Security: NEVER persist decrypted_token or system user tokens into database records
        const safeConnToPersist = {
            username: conn.username,
            connected: true,
            account_id: accountId || conn.account_id || null,
            account_type: conn.account_type || 'professional',
            access_token: conn.is_system_user ? null : (conn.access_token || null),
            facebook_page_id: conn.facebook_page_id || null,
            insights_status: 'connected',
            last_synced_at: now,
            updated_at: now
        };

        if (profileDetails && !profileDetails.error) {
            safeConnToPersist.followers_count = profileDetails.followers_count;
            safeConnToPersist.following_count = profileDetails.following_count;
            safeConnToPersist.media_count = profileDetails.media_count;
            safeConnToPersist.profile_picture_url = profileDetails.profile_picture_url;
            if (profileDetails.instagram_category) safeConnToPersist.instagram_category = profileDetails.instagram_category;
            safeConnToPersist.validation_status = 'verified';
            safeConnToPersist.profile_synced_at = now;
        } else {
            // Retain valid previous data upon transient failure
            if (conn.followers_count !== undefined) safeConnToPersist.followers_count = conn.followers_count;
            if (conn.following_count !== undefined) safeConnToPersist.following_count = conn.following_count;
            if (conn.media_count !== undefined) safeConnToPersist.media_count = conn.media_count;
            if (conn.profile_picture_url !== undefined) safeConnToPersist.profile_picture_url = conn.profile_picture_url;
            if (conn.instagram_category !== undefined) safeConnToPersist.instagram_category = conn.instagram_category;
            safeConnToPersist.validation_status = conn.validation_status || 'verified';
            safeConnToPersist.profile_synced_at = conn.profile_synced_at || now;
        }

        // Persist to Supabase influencers table with backwards-compatible column fallback
        const fullUpdate = {
            instagram_connection: safeConnToPersist,
            instagram_followers_count: safeConnToPersist.followers_count ?? null,
            instagram_following_count: safeConnToPersist.following_count ?? null,
            instagram_media_count: safeConnToPersist.media_count ?? null,
            instagram_profile_picture: safeConnToPersist.profile_picture_url ?? null,
            instagram_category: safeConnToPersist.instagram_category ?? null,
            instagram_profile_synced_at: safeConnToPersist.profile_synced_at ?? null,
            instagram_validation_status: safeConnToPersist.validation_status ?? 'verified',
            followers: safeConnToPersist.followers_count ?? undefined,
            no_of_posts: safeConnToPersist.media_count ?? undefined
        };
        Object.keys(fullUpdate).forEach(k => fullUpdate[k] === undefined && delete fullUpdate[k]);

        try {
            await dbUpdate('influencers', 'influencer_id', creatorId, fullUpdate, { useAdmin: true });
        } catch (_) {
            await dbUpdate('influencers', 'influencer_id', creatorId, {
                instagram_connection: safeConnToPersist
            }, { useAdmin: true }).catch(() => {});
        }

        console.log(`[Instagram Sync] Creator: ${creatorId.slice(0, 8)}... | Discovered: ${mediaList.length} | Synced: ${syncedCount} | Failed: ${failedCount}`);

        return {
            success: true,
            message: `Synchronized ${syncedCount} of ${mediaList.length} Instagram items (${matchedSubmissionsCount} submitted item(s) updated).`,
            discovered_count: mediaList.length,
            synced_count: syncedCount,
            matched_submissions_count: matchedSubmissionsCount,
            failed_count: failedCount,
            last_synced_at: now,
            profile: {
                username: safeConnToPersist.username,
                account_id: safeConnToPersist.account_id,
                followers_count: safeConnToPersist.followers_count || 0,
                following_count: safeConnToPersist.following_count || 0,
                media_count: safeConnToPersist.media_count || 0,
                profile_picture_url: safeConnToPersist.profile_picture_url || null,
                instagram_category: safeConnToPersist.instagram_category || null,
                validation_status: safeConnToPersist.validation_status || 'verified',
                profile_synced_at: safeConnToPersist.profile_synced_at || now
            },
            items: syncedItems
        };
    } catch (err) {
        console.error('[Instagram Sync] Execution error:', err);
        return {
            success: false,
            message: 'Instagram synchronization encountered a temporary error. Please try again shortly.'
        };
    } finally {
        activeSyncJobs.delete(creatorId);
    }
}

/**
 * Runs a periodic/scheduled batch synchronization across all active connected creators
 * Suitable for Vercel Cron or periodic server execution (15-30 min intervals)
 */
export async function runScheduledInstagramSync() {
    console.log('[Instagram Scheduled Sync] Starting periodic check...');
    const results = {
        total_eligible: 0,
        synced_creators: 0,
        skipped_creators: 0,
        errors: 0,
        details: []
    };

    try {
        const queryOpts = { useAdmin: hasServerAdminCredential() };
        // Query active influencers
        const influencers = await dbQuery('influencers', 'status=eq.active&limit=100', queryOpts).catch(() => []);
        
        const now = Date.now();
        const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes minimum interval

        for (const inf of influencers) {
            const conn = inf.instagram_connection;
            if (!conn || !conn.access_token || !conn.username) {
                continue; // Not connected
            }

            results.total_eligible++;

            // Check if recently synced
            const lastSync = conn.last_synced_at ? new Date(conn.last_synced_at).getTime() : 0;
            if (now - lastSync < MIN_SYNC_INTERVAL_MS) {
                results.skipped_creators++;
                continue;
            }

            try {
                const syncRes = await syncCreatorInstagram(inf);
                if (syncRes.success) {
                    results.synced_creators++;
                    results.details.push({
                        creator_id: inf.influencer_id || inf.id,
                        status: 'synced',
                        discovered: syncRes.discovered_count,
                        synced: syncRes.synced_count
                    });
                } else {
                    results.failed_creators++;
                    results.details.push({
                        creator_id: inf.influencer_id || inf.id,
                        status: 'failed',
                        reason: syncRes.message
                    });
                }
            } catch (err) {
                results.failed_creators++;
                results.details.push({
                    creator_id: inf.influencer_id || inf.id,
                    status: 'error',
                    reason: err.message
                });
            }
        }
    } catch (err) {
        console.error('[Instagram Sync] Scheduled sync runner error:', err.message);
    } finally {
        isSyncRunning = false;
    }

    return results;
}

/**
 * Scans all creator records in Supabase across all pages and migrates any legacy plaintext
 * access tokens to AES-256-GCM. Uses cursor pagination so no records are missed.
 * Never logs token contents. Returns migration statistics.
 */
export async function migrateLegacyPlaintextTokens() {
    const stats = {
        total_creators_scanned: 0,
        connections_inspected: 0,
        already_encrypted: 0,
        migrated_to_encrypted: 0,
        failed_migrations: 0
    };

    try {
        const queryOpts = { useAdmin: hasServerAdminCredential() };
        const pageSize = 100;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const rows = await _syncDbHooks.dbQuery(
                'influencers',
                `select=influencer_id,instagram_connection&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
                queryOpts
            );

            if (!Array.isArray(rows) || rows.length === 0) {
                break;
            }

            stats.total_creators_scanned += rows.length;

            for (const row of rows) {
                const creatorId = row.influencer_id;
                const conn = row.instagram_connection;
                if (!conn || !conn.access_token || typeof conn.access_token !== 'string') {
                    continue;
                }

                stats.connections_inspected++;

                if (conn.access_token.startsWith('enc:')) {
                    stats.already_encrypted++;
                    continue;
                }

                // Legacy plaintext token encountered: migrate
                try {
                    const encrypted = encryptToken(conn.access_token);
                    const updatedConn = { ...conn, access_token: encrypted };
                    const updateRes = await _syncDbHooks.dbUpdate('influencers', 'influencer_id', creatorId, {
                        instagram_connection: updatedConn
                    }, { ...queryOpts, returnRepresentation: true });

                    if (!updateRes || !updateRes.data) {
                        stats.failed_migrations++;
                        console.error(`[Token Security Migration] Zero records updated during batch migration for influencer_id: ${creatorId}`);
                        continue;
                    }

                    stats.migrated_to_encrypted++;
                    console.log(`[Token Security Migration] Successfully upgraded creator token to AES-256-GCM for influencer_id: ${creatorId}`);
                } catch (err) {
                    stats.failed_migrations++;
                    console.error(`[Token Security Migration] Failed to encrypt or persist legacy token for influencer_id: ${creatorId}:`, err.message);
                }
            }

            if (rows.length < pageSize) {
                hasMore = false;
            } else {
                offset += pageSize;
            }
        }
    } catch (err) {
        console.error('[Token Security Migration] Scanner error:', err.message);
    }

    return stats;
}


