// Production Security Test: Verify No Token or Secret Leakages
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('Security Gate: Zero Decrypted Token or Secret Exposure in Frontend & Responses', async () => {
    const rootDir = process.cwd();

    // 1. Scan Frontend files (HTML, JS in js/ and www/js/)
    const frontendDirs = ['js', 'www/js'];
    const htmlFiles = ['index.html', 'creator.html', 'admin-rewards.html'];

    const forbiddenPatterns = [
        /META_APP_SECRET\s*[:=]/i,
        /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/i,
        /SUPABASE_SECRET_KEY\s*[:=]/i,
        /EAA[a-zA-Z0-9]{50,}/, // Typical Facebook/Meta raw access token format
        /enc:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/i // Encrypted token payload should not be hardcoded in frontend
    ];

    for (const dir of frontendDirs) {
        const fullDir = path.join(rootDir, dir);
        if (!fs.existsSync(fullDir)) continue;
        const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const content = fs.readFileSync(path.join(fullDir, file), 'utf8');
            for (const pattern of forbiddenPatterns) {
                assert.equal(
                    pattern.test(content),
                    false,
                    `Forbidden pattern ${pattern} matched in frontend file: ${dir}/${file}`
                );
            }
        }
    }

    for (const htmlFile of htmlFiles) {
        const fullPath = path.join(rootDir, htmlFile);
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of forbiddenPatterns) {
            assert.equal(
                pattern.test(content),
                false,
                `Forbidden pattern ${pattern} matched in HTML file: ${htmlFile}`
            );
        }
    }

    // 2. Scan API response handlers in backend/creator.js to ensure handleGetInstagramStatus never returns access_token
    const creatorCode = fs.readFileSync(path.join(rootDir, 'backend/creator.js'), 'utf8');
    const statusHandler = creatorCode.substring(
        creatorCode.indexOf('handleGetInstagramStatus'),
        creatorCode.indexOf('handleConnectInstagram')
    );
    assert.equal(
        statusHandler.includes('access_token:'),
        false,
        'handleGetInstagramStatus must NEVER return access_token in its JSON response'
    );
    assert.equal(
        statusHandler.includes('token:'),
        false,
        'handleGetInstagramStatus must NEVER return token in its JSON response'
    );

    // 3. Scan logging statements in backend/services/instagram-sync.js
    const syncCode = fs.readFileSync(path.join(rootDir, 'backend/services/instagram-sync.js'), 'utf8');
    const logMatches = syncCode.match(/console\.(log|info|warn|error)\([^)]+\)/g) || [];
    for (const logStmt of logMatches) {
        assert.equal(
            logStmt.includes('accessToken') || logStmt.includes('access_token'),
            false,
            `Potential token logging detected in: ${logStmt}`
        );
    }
});

