// WISHRITE CREATOR CLUB — PRODUCTION INSTAGRAM SYNCHRONIZATION SERVICE
// Phase 2: Instagram Media Discovery, Meta Graph API Insights Sync, Metrics Upsert

import crypto from 'crypto';
import { dbQuery, dbInsert, dbUpdate, hasServerAdminCredential } from '../supabase-client.js';

// Server-side configurable Meta Graph API Version (defaults to v26.0)
const META_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const ENCRYPTION_ALGO = 'aes-256-gcm';

// In-memory mutex to prevent double-syncing for the same creator
const activeSyncJobs = new Set();

/**
 * Derives a 32-byte key from server secret for token encryption
 */
function getEncryptionKey() {
    const secret = process.env.META_APP_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'wishrite-meta-sec-fallback-key-32b';
    return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts an access token before storage
 */
export function encryptToken(token) {
    if (!token) return null;
    if (token.startsWith('enc:')) return token; // already encrypted
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
        let enc = cipher.update(token, 'utf8', 'hex');
        enc += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return `enc:${iv.toString('hex')}:${tag}:${enc}`;
    } catch (err) {
        console.warn('[Instagram Sync] Token encryption fallback');
        return token;
    }
}

/**
 * Decrypts an access token immediately before making Meta API calls
 */
export function decryptToken(encrypted) {
    if (!encrypted) return null;
    if (!encrypted.startsWith('enc:')) return encrypted; // plain token
    try {
        const parts = encrypted.split(':');
        if (parts.length !== 4) return encrypted;
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encText = parts[3];
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getEncryptionKey(), iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update(encText, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch (err) {
        console.warn('[Instagram Sync] Token decryption error');
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

    if (!conn) return null;

    const rawToken = conn.access_token ? decryptToken(conn.access_token) : null;
    return {
        ...conn,
        decrypted_token: rawToken
    };
}

/**
 * Fetches media from Instagram Account with cursor-based pagination
 */
export async function fetchInstagramAccountMedia(accountId, accessToken, maxMedia = 25) {
    if (!accountId || !accessToken) return [];

    const mediaItems = [];
    let nextUrl = `https://graph.facebook.com/${META_API_VERSION}/${accountId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=15&access_token=${encodeURIComponent(accessToken)}`;

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
        const existing = await dbQuery('creator_content', `instagram_media_id=eq.${encodeURIComponent(mediaId)}&limit=1`, queryOpts);

        if (Array.isArray(existing) && existing.length > 0) {
            const existingId = existing[0].id;
            // Preserve existing metrics if new insights failed
            if (error) {
                if (payload.views_count === null && existing[0].views_count !== null) payload.views_count = existing[0].views_count;
                if (payload.reach_count === null && existing[0].reach_count !== null) payload.reach_count = existing[0].reach_count;
                if (payload.likes_count === null && existing[0].likes_count !== null) payload.likes_count = existing[0].likes_count;
                if (payload.comments_count === null && existing[0].comments_count !== null) payload.comments_count = existing[0].comments_count;
                if (payload.shares_count === null && existing[0].shares_count !== null) payload.shares_count = existing[0].shares_count;
                if (payload.saves_count === null && existing[0].saves_count !== null) payload.saves_count = existing[0].saves_count;
            }
            await dbUpdate('creator_content', 'id', existingId, payload, queryOpts);
            return { action: 'updated', id: existingId, ...payload };
        } else {
            payload.status = 'Approved'; // Directly discovered from connected account
            payload.clicks = 0;
            payload.orders = 0;
            payload.commission_amount = 0.00;
            const insertRes = await dbInsert('creator_content', payload, queryOpts);
            const newId = insertRes?.data?.[0]?.id || mediaId;
            return { action: 'inserted', id: newId, ...payload };
        }
    } catch (err) {
        console.warn('[Instagram Sync] Supabase upsert notice:', err.message);
        return { action: 'fallback', id: mediaId, ...payload };
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
                    await dbUpdate('influencers', 'influencer_id', creatorId, {
                        instagram_connection: {
                            ...conn,
                            account_id: accountId
                        }
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
        const syncedItems = [];

        for (const media of mediaList) {
            media.account_id = accountId;
            const insightsRes = await fetchMediaInsights(media.id, media.media_type, media.media_product_type, accessToken);
            const upsertResult = await upsertCreatorContentItem(creator, media, insightsRes);

            if (upsertResult.insights_status === 'synced' || upsertResult.insights_status === 'partial') {
                syncedCount++;
            } else {
                failedCount++;
            }
            syncedItems.push(upsertResult);
        }

        const now = new Date().toISOString();
        // Update connection last_synced_at
        conn.last_synced_at = now;
        conn.insights_status = 'connected';
        await dbUpdate('influencers', 'influencer_id', creatorId, {
            instagram_connection: {
                ...conn,
                last_synced_at: now
            }
        }, { useAdmin: true }).catch(() => {});

        console.log(`[Instagram Sync] Creator: ${creatorId.slice(0, 8)}... | Discovered: ${mediaList.length} | Synced: ${syncedCount} | Failed: ${failedCount}`);

        return {
            success: true,
            message: `Synchronized ${syncedCount} of ${mediaList.length} Instagram items.`,
            discovered_count: mediaList.length,
            synced_count: syncedCount,
            failed_count: failedCount,
            last_synced_at: now,
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
                    results.errors++;
                    results.details.push({
                        creator_id: inf.influencer_id || inf.id,
                        status: 'failed',
                        reason: syncRes.message
                    });
                }
            } catch (syncErr) {
                results.errors++;
                console.error(`[Instagram Scheduled Sync] Error for creator ${inf.influencer_id || inf.id}:`, syncErr.message);
            }
        }
    } catch (err) {
        console.error('[Instagram Scheduled Sync] Global error:', err);
    }

    console.log(`[Instagram Scheduled Sync] Completed: ${results.synced_creators} synced, ${results.skipped_creators} skipped, ${results.errors} errors.`);
    return results;
}


