// ==============================================================================
// WISHRITE CREATOR CLUB — CENTRALIZED META CONFIGURATION MODULE
// Single source of truth for Meta Graph API, OAuth, App Credentials & Brand Assets
// Keeps all secrets strictly server-side. Never exposes tokens or secrets to client.
// ==============================================================================

export const META_APP_ID = process.env.META_APP_ID || '439894570032149';
export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
export const META_CONFIG_ID = process.env.META_CONFIG_ID || '1112681211580113';

// Official WishRite Meta & Instagram Brand Assets
export const WISHRITE_OFFICIAL_IG_HANDLE = 'wishrite.in';
export const WISHRITE_OFFICIAL_IG_ACCOUNT_ID = '17841445671263800';
export const WISHRITE_OFFICIAL_PAGE_ID = '591667860696059';
export const WISHRITE_OFFICIAL_PAGE_NAME = 'funnwith.ai';

// Production and Local Development Callback Endpoints
export const PRODUCTION_OAUTH_CALLBACK = 'https://www.wishrite.in/api/creator/instagram/oauth/callback';
export const LOCAL_OAUTH_CALLBACK = 'http://localhost:8085/api/creator/instagram/oauth/callback';

/**
 * Returns the active Meta configuration object
 */
export function getMetaConfig() {
    const appSecret = (process.env.META_APP_SECRET || '').trim();
    const systemUserToken = (process.env.INSTAGRAM_SYSTEM_USER_TOKEN || '').trim();
    const configuredRedirect = (process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI || '').trim();

    return {
        appId: META_APP_ID,
        appSecret,
        graphApiVersion: META_GRAPH_API_VERSION,
        configId: META_CONFIG_ID,
        systemUserToken,
        configuredRedirect,
        official: {
            handle: WISHRITE_OFFICIAL_IG_HANDLE,
            accountId: WISHRITE_OFFICIAL_IG_ACCOUNT_ID,
            pageId: WISHRITE_OFFICIAL_PAGE_ID,
            pageName: WISHRITE_OFFICIAL_PAGE_NAME
        }
    };
}

/**
 * Resolves the OAuth callback redirect URI based on request context and environment
 * Prioritizes:
 * 1. META_OAUTH_REDIRECT_URI or META_REDIRECT_URI environment variables (if explicitly set)
 * 2. Dynamic host-based callback resolution (https://www.wishrite.in vs http://localhost:8085)
 */
export function getOAuthRedirectUri(req) {
    const configured = (process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI || '').trim();
    if (configured) {
        return configured;
    }

    const host = req?.headers?.['x-forwarded-host'] || req?.headers?.['host'] || 'localhost:8085';
    const proto = req?.headers?.['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}/api/creator/instagram/oauth/callback`;
}

/**
 * Returns the secret used for signing OAuth state CSRF tokens.
 * Strictly uses server-side secrets without exposing them.
 */
export function getOAuthSigningSecret() {
    const secret = (process.env.META_APP_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CREATOR_SESSION_SECRET || '').trim();
    if (secret) return secret;
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some(a => a.includes('test'));
    if (isTest) return 'test-mock-meta-secret-32b';
    throw new Error('[Meta OAuth Security] Missing server-side secret for OAuth state HMAC verification.');
}

/**
 * Validates Meta configuration readiness at backend runtime without exposing secrets
 */
export function validateMetaConfig() {
    const cfg = getMetaConfig();
    const missing = [];

    if (!cfg.appId) missing.push('META_APP_ID');
    if (!cfg.appSecret) missing.push('META_APP_SECRET');
    if (!cfg.systemUserToken) missing.push('INSTAGRAM_SYSTEM_USER_TOKEN');

    return {
        valid: missing.length === 0,
        missing,
        status: {
            app_id: cfg.appId ? `${cfg.appId.slice(0, 4)}...${cfg.appId.slice(-4)}` : 'missing',
            app_secret_configured: Boolean(cfg.appSecret),
            system_user_token_configured: Boolean(cfg.systemUserToken),
            graph_api_version: cfg.graphApiVersion,
            configured_redirect_uri: cfg.configuredRedirect ? cfg.configuredRedirect.replace(/([^:]+:\/\/[^/]+).*/, '$1/...') : 'dynamic_resolution'
        }
    };
}

/**
 * Returns a sanitized configuration object safe for non-privileged client responses
 */
export function getPublicMetaConfig() {
    const cfg = getMetaConfig();
    return {
        meta_configured: Boolean(cfg.appId && cfg.appSecret),
        meta_app_id_configured: Boolean(cfg.appId),
        graph_api_version: cfg.graphApiVersion,
        official_handle: WISHRITE_OFFICIAL_IG_HANDLE
    };
}
