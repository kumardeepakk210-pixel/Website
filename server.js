try {
    require('dotenv').config();
} catch (_) {}

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8085;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};

async function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve({ raw: body });
            }
        });
    });
}

function adaptResponse(res) {
    res.status = function(code) {
        res.statusCode = code;
        return res;
    };
    res.json = function(data) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return res;
    };
    return res;
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Handle API Routes under /api/
    if (pathname.startsWith('/api/')) {
        const routeName = pathname.replace(/^\/api\//, '').split('?')[0].split('/')[0];
        const apiFilePath = path.join(ROOT_DIR, 'api', `${routeName}.js`);

        if (fs.existsSync(apiFilePath)) {
            try {
                // Clear module cache in development so edits take effect immediately
                delete require.cache[require.resolve(apiFilePath)];
                const handler = require(apiFilePath);
                
                req.query = parsedUrl.query || {};
                req.body = await parseBody(req);
                adaptResponse(res);

                return await handler(req, res);
            } catch (err) {
                console.error(`[API Error: ${pathname}]`, err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }
        } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, error: 'API route not found' }));
        }
    }

    // 2. Normalize file path for static files
    let relativeFilePath = pathname === '/' ? '/index.html' : pathname;
    let safeFilePath = path.normalize(path.join(ROOT_DIR, relativeFilePath));

    // Ensure path traversal is blocked
    if (!safeFilePath.startsWith(ROOT_DIR)) {
        res.statusCode = 403;
        return res.end('Access Denied');
    }

    // 3. Check if requested static file exists
    if (fs.existsSync(safeFilePath) && fs.statSync(safeFilePath).isFile()) {
        const ext = path.extname(safeFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Add headers matching vercel.json
        if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }

        // Dynamically expose E2E_LOCAL_AUTH to local browser runtime via config.js
        if (pathname === '/config.js') {
            let configJs = fs.readFileSync(safeFilePath, 'utf8');
            const isLocalE2E = process.env.E2E_LOCAL_AUTH === 'true';
            configJs += `\nwindow.E2E_LOCAL_AUTH = ${isLocalE2E};\n`;
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            return res.end(configJs);
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        return fs.createReadStream(safeFilePath).pipe(res);
    }

    // 4. SPA Rewrites & Fallbacks (matching vercel.json)
    const creatorPortalRoutes = [
        '/creator',
        '/creator/',
        '/creator/login',
        '/creator/dashboard',
        '/creator/links',
        '/creator/wallet',
        '/creator/withdraw',
        '/creator/points',
        '/creator/rewards',
        '/creator/profile'
    ];

    if (creatorPortalRoutes.includes(pathname)) {
        const creatorPath = path.join(ROOT_DIR, 'creator.html');
        if (fs.existsSync(creatorPath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return fs.createReadStream(creatorPath).pipe(res);
        }
    }

    if (pathname === '/admin' || pathname === '/admin-rewards') {
        const adminPath = path.join(ROOT_DIR, 'admin-rewards.html');
        if (fs.existsSync(adminPath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return fs.createReadStream(adminPath).pipe(res);
        }
    }

    // Default SPA Fallback (Rewrites to index.html for customer storefront routing)
    const indexPath = path.join(ROOT_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(indexPath).pipe(res);
    }

    // 5. Not Found
    res.statusCode = 404;
    res.end('Not Found');
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 WishRite Website Localhost is Active!`);
        console.log(`📡 URL: http://localhost:${PORT}`);
        console.log(`📦 Serving files from: ${ROOT_DIR}`);
        console.log(`⚡ SPA Routing & API Routes Enabled`);
        console.log(`==================================================\n`);

        // Initialize background sync timer for development server (every 20 mins)
        try {
            import('./backend/services/instagram-sync.js').then(syncService => {
                const TWENTY_MINS = 20 * 60 * 1000;
                setInterval(() => {
                    syncService.runScheduledInstagramSync().catch(err => {
                        console.error('[Server Cron] Background sync error:', err.message);
                    });
                }, TWENTY_MINS);
            }).catch(() => {});
        } catch (_) {}
    });
}

module.exports = server;
