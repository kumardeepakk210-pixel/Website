// ==============================================================================
// WISHRITE CREATOR CLUB — SERVER API ROUTE: /api/creator/*
// Server-Authoritative Creator Authentication, Dashboard, Wallet & Rewards
// Protects all sensitive data with PBKDF2 auth and server-side authorization.
// ==============================================================================

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        req.headers = req.headers || {};
        req.body = req.body || {};
        req.query = req.query || {};
        req.params = req.params || {};

        const creator = await import('../backend/creator.js');
        const wallet = await import('../backend/creator-wallet.js');

        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0];
        const subPath = pathname.replace(/^\/api\/creator/, '').replace(/\/$/, '') || '/';
        const method = (req.method || 'GET').toUpperCase();

        req.params = req.params || {};

        // Helper to run requireCreatorAuth middleware
        const withAuth = (nextHandler) => {
            return new Promise((resolve) => {
                let resolved = false;
                const done = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                };

                const origJson = res.json.bind(res);
                res.json = (data) => {
                    const ret = origJson(data);
                    done();
                    return ret;
                };

                if (res.end) {
                    const origEnd = res.end.bind(res);
                    res.end = (...args) => {
                        const ret = origEnd(...args);
                        done();
                        return ret;
                    };
                }

                creator.requireCreatorAuth(req, res, async () => {
                    try {
                        await nextHandler(req, res);
                    } catch (e) {
                        res.status(500).json({ success: false, error: { message: e.message } });
                    }
                    done();
                });
            });
        };

        // 1. Authentication
        if (subPath === '/login' && method === 'POST') {
            return await creator.handleCreatorLogin(req, res);
        }
        if (subPath === '/logout' && method === 'POST') {
            return await creator.handleCreatorLogout(req, res);
        }

        // 2. Creator Identity & Analytics
        if (subPath === '/me' && method === 'GET') {
            return await withAuth(creator.handleGetCreatorMe);
        }
        if (subPath === '/stats' && method === 'GET') {
            return await withAuth(creator.handleGetCreatorStats);
        }
        if (subPath === '/performance' && method === 'GET') {
            return await withAuth(creator.handleGetCreatorPerformance);
        }
        if (subPath === '/orders' && method === 'GET') {
            return await withAuth(creator.handleGetCreatorOrders);
        }

        // 3. Referral Links
        if (subPath === '/links' && method === 'GET') {
            return await withAuth(creator.handleGetCreatorLinks);
        }
        if (subPath === '/links' && method === 'POST') {
            return await withAuth(creator.handleCreateCreatorProductLink);
        }

        // 4. Creator Profile
        if (subPath === '/profile') {
            if (method === 'GET') {
                return await withAuth(creator.handleGetCreatorProfile);
            }
            if (method === 'PATCH' || method === 'PUT') {
                return await withAuth(creator.handleUpdateCreatorProfile);
            }
        }

        // 5. Creator Wallet & Ledger
        if (subPath === '/wallet' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorWallet);
        }
        if (subPath === '/wallet/transactions' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorWalletTransactions);
        }
        if (subPath === '/wallet/summary' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorWalletSummary);
        }

        // 6. Payout Methods
        if (subPath === '/payout-methods') {
            if (method === 'GET') {
                return await withAuth(wallet.handleGetPayoutMethods);
            }
            if (method === 'POST') {
                return await withAuth(wallet.handleCreatePayoutMethod);
            }
        }
        const defaultPayoutMatch = subPath.match(/^\/payout-methods\/([^\/]+)\/default$/);
        if (defaultPayoutMatch && method === 'POST') {
            req.params.id = defaultPayoutMatch[1];
            return await withAuth(wallet.handleSetDefaultPayoutMethod);
        }
        const payoutIdMatch = subPath.match(/^\/payout-methods\/([^\/]+)$/);
        if (payoutIdMatch && method === 'DELETE') {
            req.params.id = payoutIdMatch[1];
            return await withAuth(wallet.handleDeletePayoutMethod);
        }

        // 7. Withdrawals
        if (subPath === '/withdrawals') {
            if (method === 'POST') {
                return await withAuth(wallet.handleCreateWithdrawal);
            }
            if (method === 'GET') {
                return await withAuth(wallet.handleGetCreatorWithdrawals);
            }
        }

        // 8. Points
        if (subPath === '/points' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorPoints);
        }
        if (subPath === '/points/transactions' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorPointsTransactions);
        }

        // 9. Rewards & Redemptions
        if (subPath === '/rewards' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorRewards);
        }
        const redeemMatch = subPath.match(/^\/rewards\/([^\/]+)\/redeem$/);
        if (redeemMatch && method === 'POST') {
            req.params.id = redeemMatch[1];
            return await withAuth(wallet.handleRedeemReward);
        }
        const rewardIdMatch = subPath.match(/^\/rewards\/([^\/]+)$/);
        if (rewardIdMatch && method === 'GET') {
            req.params.id = rewardIdMatch[1];
            return await withAuth(wallet.handleGetCreatorRewardById);
        }
        if (subPath === '/redemptions' && method === 'GET') {
            return await withAuth(wallet.handleGetCreatorRedemptions);
        }

        // 10. Integrated Customer Creator Program Routes
        if (subPath === '/profile-photo') {
            if (method === 'POST') {
                return await creator.handleCreatorPhotoUpload(req, res);
            }
            if (method === 'DELETE') {
                return await creator.handleCreatorPhotoDelete(req, res);
            }
        }
        if (subPath === '/status' && method === 'GET') {
            return await creator.handleCustomerCreatorStatus(req, res);
        }
        if ((subPath === '/onboard' || subPath === '/activate') && method === 'POST') {
            return await creator.handleCustomerCreatorOnboard(req, res);
        }
        if (subPath === '/content') {
            if (method === 'POST') {
                return await withAuth(creator.handleSubmitCreatorContent);
            }
            if (method === 'GET') {
                return await withAuth(creator.handleGetCreatorContent);
            }
        }
        if (subPath === '/admin/content' && method === 'GET') {
            return await creator.handleGetAdminCreatorContent(req, res);
        }
        if (subPath === '/admin/content/moderate' && method === 'POST') {
            return await creator.handleModerateCreatorContent(req, res);
        }
        if (subPath === '/contest' && method === 'GET') {
            return await creator.handleGetCreatorContest(req, res);
        }

        // 8. Instagram Insights & Content Sync
        if (subPath === '/instagram/status' && method === 'GET') {
            return await withAuth(creator.handleGetInstagramStatus);
        }
        if (subPath === '/instagram/connect' && (method === 'POST' || method === 'GET')) {
            return await withAuth(creator.handleConnectInstagram);
        }
        if (subPath === '/instagram/disconnect' && method === 'POST') {
            return await withAuth(creator.handleDisconnectInstagram);
        }
        if (subPath === '/instagram/sync' && method === 'POST') {
            return await withAuth(creator.handleSyncAllInstagramContent);
        }

        const syncMatch = subPath.match(/^\/content\/([^\/]+)\/sync$/);
        if (syncMatch && method === 'POST') {
            const contentId = syncMatch[1];
            return await withAuth((req, res) => creator.handleSyncCreatorContent(req, res, contentId));
        }

        // Route Not Found
        res.status(404).json({
            success: false,
            error: { message: `Creator API route '${method} ${rawUrl}' not found.` }
        });
    } catch (err) {
        console.error('[Creator API Error]:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
};
