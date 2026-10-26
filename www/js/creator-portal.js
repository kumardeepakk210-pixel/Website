/**
 * ==============================================================================
 * WISHRITE CREATOR CLUB — AMBASSADOR PORTAL CLIENT
 * Single-Page Responsive Portal for Creators
 * Server-Authoritative Balances, Dual-Entry Ledger, Points & Payouts
 * ==============================================================================
 */

(function (window) {
    'use strict';

    const TOKEN_KEY = 'wishrite_creator_token';

    const WishRiteCreatorPortal = {
        state: {
            token: localStorage.getItem(TOKEN_KEY) || null,
            creator: null,
            activeView: 'dashboard',
            stats: null,
            orders: [],
            links: [],
            wallet: null,
            transactions: [],
            payoutMethods: [],
            withdrawals: [],
            points: null,
            rewards: [],
            pointsTransactions: [],
            isSubmittingWithdrawal: false,
            isRedeemingReward: false
        },

        // Helper to format currency
        formatINR(amount) {
            const val = Number(amount) || 0;
            return '₹' + val.toLocaleString('en-IN', {
                minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
                maximumFractionDigits: 2
            });
        },

        // Helper to format date
        formatDate(isoString) {
            if (!isoString) return '—';
            try {
                const d = new Date(isoString);
                return d.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            } catch (e) {
                return isoString;
            }
        },

        // Helper for authorized API calls
        async apiFetch(endpoint, options = {}) {
            const headers = options.headers || {};
            if (this.state.token) {
                headers['Authorization'] = `Bearer ${this.state.token}`;
            }
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';

            const res = await fetch(endpoint, {
                ...options,
                headers
            });

            if (res.status === 401) {
                console.warn('[Creator Portal] Session expired or unauthorized');
                this.handleLogout(false);
                throw new Error('Your session has expired. Please log in again.');
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
            }
            return data;
        },

        // Navigation
        navigateTo(viewId, pushHistory = true) {
            if (!this.state.token && viewId !== 'login') {
                viewId = 'login';
            }

            this.state.activeView = viewId;

            // Update Views
            document.querySelectorAll('.creator-view').forEach(v => v.classList.remove('active'));
            const targetView = document.getElementById(`view-${viewId}`);
            if (targetView) targetView.classList.add('active');

            // Update Desktop Nav
            document.querySelectorAll('.creator-nav-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.view === viewId);
            });

            // Update Mobile Bottom Nav
            document.querySelectorAll('.creator-mobile-nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.view === viewId);
            });

            // Push History / Hash
            if (pushHistory) {
                try {
                    window.location.hash = viewId;
                } catch (e) { }
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Trigger data loader for view
            if (this.state.token) {
                switch (viewId) {
                    case 'dashboard': this.loadDashboard(); break;
                    case 'links': this.loadLinks(); break;
                    case 'wallet': this.loadWallet(); break;
                    case 'withdraw': this.loadWithdraw(); break;
                    case 'points': this.loadPointsAndRewards(); break;
                    case 'profile': this.loadProfile(); break;
                }
            }
        },

        // 1. Initial Authentication Check
        async checkAuth() {
            if (!this.state.token) {
                this.renderLoggedOutHeader();
                this.navigateTo('login', false);
                return;
            }

            try {
                const res = await this.apiFetch('/api/creator/me');
                if (res.success && res.data) {
                    this.state.creator = res.data.influencer || res.data;
                    this.renderLoggedInHeader();

                    // Resolve target view from URL or hash
                    const path = window.location.pathname;
                    const hash = (window.location.hash || '').replace('#', '');
                    let target = 'dashboard';

                    if (hash) {
                        target = hash;
                    } else if (path.includes('/creator/')) {
                        const segment = path.replace('/creator/', '').split('/')[0];
                        if (['links', 'wallet', 'withdraw', 'points', 'rewards', 'profile'].includes(segment)) {
                            target = segment === 'rewards' ? 'points' : segment;
                        }
                    }

                    this.navigateTo(target, false);
                } else {
                    this.handleLogout(false);
                }
            } catch (err) {
                this.handleLogout(false);
            }
        },

        // Render Header for Logged-In User
        renderLoggedInHeader() {
            const area = document.getElementById('top-user-area');
            if (!area) return;

            const c = this.state.creator || {};
            const availBal = this.state.wallet?.available_balance || 0;
            const initialChar = (c.name || 'C').charAt(0).toUpperCase();
            const avatarHtml = c.profile_image
                ? `<img src="${c.profile_image}" alt="${c.name || 'Creator'}" class="creator-mini-avatar">`
                : `<div class="creator-mini-avatar" style="display:inline-flex;align-items:center;justify-content:center;background:#B8956A;color:#fff;font-weight:600;font-size:12px;border-radius:50%;">${initialChar}</div>`;

            area.innerHTML = `
                <div class="creator-balance-pill" title="Available for Withdrawal">
                    <span>Bal:</span>
                    <span class="creator-balance-val" id="top-bar-bal">${this.formatINR(availBal)}</span>
                </div>
                <div class="creator-profile-snippet" onclick="window.WishRiteCreatorPortal.navigateTo('profile');" title="View Profile">
                    ${avatarHtml}
                    <span class="creator-top-name">${c.name || 'Ambassador'}</span>
                </div>
                <button class="creator-logout-btn" onclick="window.WishRiteCreatorPortal.handleLogout();" title="Sign Out">
                    Logout
                </button>
            `;
        },

        renderLoggedOutHeader() {
            const area = document.getElementById('top-user-area');
            if (!area) return;
            area.innerHTML = `
                <a href="/" class="creator-logout-btn" style="text-decoration: none;">
                    &larr; Storefront
                </a>
            `;
        },

        // 2. Login Submit Handler
        async handleLoginSubmit(event) {
            event.preventDefault();
            const emailInput = document.getElementById('login-email');
            const passInput = document.getElementById('login-password');
            const btn = document.getElementById('login-submit-btn');
            const alertBox = document.getElementById('login-alert');

            alertBox.style.display = 'none';
            btn.disabled = true;
            btn.textContent = 'Signing in…';

            try {
                const res = await fetch('/api/creator/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: emailInput.value.trim(),
                        password: passInput.value
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data?.error?.message || 'Login failed. Please verify credentials.');
                }

                // Save session token
                this.state.token = data.data.token;
                localStorage.setItem(TOKEN_KEY, data.data.token);
                this.state.creator = data.data.creator;

                this.renderLoggedInHeader();
                this.navigateTo('dashboard');
            } catch (err) {
                alertBox.textContent = err.message;
                alertBox.style.background = 'var(--wr-c-red-bg)';
                alertBox.style.color = 'var(--wr-c-red)';
                alertBox.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In to Creator Club';
            }
        },

        // 3. Logout Handler
        async handleLogout(callServer = true) {
            if (callServer && this.state.token) {
                try {
                    await fetch('/api/creator/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.state.token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                } catch (e) { }
            }

            this.state.token = null;
            this.state.creator = null;
            localStorage.removeItem(TOKEN_KEY);
            this.renderLoggedOutHeader();
            this.navigateTo('login');
        },

        // 4. Load Dashboard Metrics & Orders
        async loadDashboard() {
            try {
                const [statsRes, ordersRes, walletRes] = await Promise.all([
                    this.apiFetch('/api/creator/stats').catch(() => null),
                    this.apiFetch('/api/creator/orders').catch(() => null),
                    this.apiFetch('/api/creator/wallet').catch(() => null)
                ]);

                if (statsRes?.data) {
                    const s = statsRes.data;
                    this.state.stats = s;
                    document.getElementById('metric-sales').textContent = this.formatINR(s.total_sales);
                    document.getElementById('metric-orders').textContent = s.total_orders || 0;
                    document.getElementById('metric-clicks').textContent = s.total_clicks || 0;
                    document.getElementById('metric-cvr').textContent = (s.conversion_rate || 0).toFixed(1) + '%';
                    document.getElementById('metric-total-comm').textContent = this.formatINR(s.total_earnings || s.total_commission);
                    document.getElementById('metric-pending-comm').textContent = this.formatINR(s.pending_earnings || s.pending_commission);
                }

                if (walletRes?.data) {
                    const w = walletRes.data;
                    this.state.wallet = w;
                    document.getElementById('metric-available-bal').textContent = this.formatINR(w.available_balance);
                    document.getElementById('metric-lifetime').textContent = this.formatINR(w.lifetime_earnings);
                    const topBal = document.getElementById('top-bar-bal');
                    if (topBal) topBal.textContent = this.formatINR(w.available_balance);
                }

                if (ordersRes?.data) {
                    const orders = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data.orders || []);
                    this.renderAttributedOrdersTable(orders);
                }

                const c = this.state.creator;
                if (c) {
                    document.getElementById('dash-greeting').textContent = `Welcome, ${c.name}`;
                    document.getElementById('dash-sub').textContent = `Tier: ${(c.tier || 'STARTER').toUpperCase()} • Commission Rate: ${c.commission_rate || 10}%`;
                }
            } catch (err) {
                console.warn('[Creator Portal] Dashboard load notice:', err.message);
            }
        },

        renderAttributedOrdersTable(orders) {
            const tbody = document.getElementById('dash-orders-tbody');
            if (!tbody) return;

            if (!orders || orders.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--wr-c-muted); padding: 32px;">No attributed orders recorded yet. Share your creator link to start earning!</td></tr>`;
                return;
            }

            tbody.innerHTML = orders.map(o => {
                const statusBadge = o.status === 'approved' ? '<span class="creator-badge badge-green">Approved</span>'
                    : (o.status === 'cancelled' ? '<span class="creator-badge badge-red">Cancelled</span>'
                        : '<span class="creator-badge badge-orange">Pending</span>');

                return `
                    <tr>
                        <td><strong>${o.order_reference || o.order_number || '—'}</strong></td>
                        <td>${this.formatDate(o.created_at)}</td>
                        <td>${o.items_count || 1} piece</td>
                        <td><strong>${this.formatINR(o.sales_amount || o.order_amount)}</strong></td>
                        <td>${o.commission_rate || 10}%</td>
                        <td style="color: var(--wr-c-green); font-weight: 700;">+${this.formatINR(o.commission_amount)}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        },

        // 5. Load Referral Links
        async loadLinks() {
            try {
                const res = await this.apiFetch('/api/creator/links');
                const links = Array.isArray(res.data) ? res.data : (res.data?.links || []);
                this.state.links = links;

                const tbody = document.getElementById('links-tbody');
                if (!tbody) return;

                if (links.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--wr-c-muted); padding: 32px;">No custom links generated yet. Generate your first product deep link above.</td></tr>`;
                    return;
                }

                tbody.innerHTML = links.map(l => {
                    const fullUrl = l.full_url || `${window.location.origin}/creator/${this.state.creator?.public_slug}${l.product_code ? '/product/' + l.product_code : ''}`;
                    return `
                        <tr>
                            <td><strong>${l.title || l.campaign_name || (l.product_code ? 'Product ' + l.product_code : 'Storefront')}</strong></td>
                            <td><code style="font-size: 0.78rem; background: #FAF7F5; padding: 2px 6px; border-radius: 4px;">${fullUrl}</code></td>
                            <td>${l.clicks_count || l.clicks || 0}</td>
                            <td>${l.orders_count || l.orders || 0}</td>
                            <td>${this.formatINR(l.sales_amount || 0)}</td>
                            <td style="color: var(--wr-c-green); font-weight: 600;">${this.formatINR(l.commission_amount || 0)}</td>
                            <td><span class="creator-badge badge-green">Active</span></td>
                            <td>
                                <button class="creator-btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="navigator.clipboard.writeText('${fullUrl}'); alert('Copied!');">
                                    Copy
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (err) {
                console.warn('[Creator Portal] Load links notice:', err.message);
            }
        },

        async handleCreateLink(event) {
            event.preventDefault();
            const skuInput = document.getElementById('new-link-product-code');
            const titleInput = document.getElementById('new-link-title');

            const sku = skuInput.value.trim();
            const title = titleInput.value.trim();
            if (!sku) return;

            try {
                const res = await this.apiFetch('/api/creator/links', {
                    method: 'POST',
                    body: JSON.stringify({ product_code: sku, title })
                });

                if (res.success) {
                    skuInput.value = '';
                    titleInput.value = '';
                    alert('Referral link created successfully!');
                    this.loadLinks();
                }
            } catch (err) {
                alert(err.message || 'Unable to create referral link.');
            }
        },

        copyStorefrontLink() {
            const slug = this.state.creator?.public_slug;
            if (!slug) return;
            const url = `${window.location.origin}/creator/${slug}`;
            navigator.clipboard.writeText(url).then(() => {
                alert('Storefront link copied to clipboard:\n' + url);
            }).catch(() => {
                prompt('Copy your storefront link:', url);
            });
        },

        // 6. Load Wallet & Ledger
        async loadWallet() {
            try {
                const [walletRes, txRes] = await Promise.all([
                    this.apiFetch('/api/creator/wallet'),
                    this.apiFetch('/api/creator/wallet/transactions')
                ]);

                if (walletRes?.data) {
                    const w = walletRes.data;
                    this.state.wallet = w;
                    document.getElementById('wallet-avail-bal').textContent = this.formatINR(w.available_balance);
                    document.getElementById('wallet-pending-bal').textContent = this.formatINR(w.pending_balance);
                    document.getElementById('wallet-lifetime-bal').textContent = this.formatINR(w.lifetime_earnings);
                }

                if (txRes?.data) {
                    const txs = Array.isArray(txRes.data) ? txRes.data : (txRes.data.transactions || []);
                    this.renderWalletTransactionsTable(txs);
                }
            } catch (err) {
                console.warn('[Creator Portal] Wallet load notice:', err.message);
            }
        },

        renderWalletTransactionsTable(txs) {
            const tbody = document.getElementById('wallet-tx-tbody');
            if (!tbody) return;

            if (!txs || txs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--wr-c-muted); padding: 32px;">No wallet transactions recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = txs.map(t => {
                const isCredit = t.type?.includes('credit') || t.amount > 0;
                const amtFormatted = (isCredit ? '+' : '') + this.formatINR(t.amount);
                const amtColor = isCredit ? 'var(--wr-c-green)' : 'var(--wr-c-red)';

                return `
                    <tr>
                        <td>${this.formatDate(t.created_at)}</td>
                        <td><strong>${t.description || 'Commission Transaction'}</strong></td>
                        <td><span style="font-size: 0.78rem; text-transform: uppercase; color: var(--wr-c-muted);">${t.type}</span></td>
                        <td style="color: ${amtColor}; font-weight: 700;">${amtFormatted}</td>
                        <td><code style="font-size: 0.75rem;">${t.reference || '—'}</code></td>
                        <td><span class="creator-badge badge-green">${t.status || 'Settled'}</span></td>
                    </tr>
                `;
            }).join('');
        },

        // 7. Load Withdrawals & Payout Methods
        async loadWithdraw() {
            try {
                const [walletRes, methodsRes, withRes] = await Promise.all([
                    this.apiFetch('/api/creator/wallet'),
                    this.apiFetch('/api/creator/payout-methods'),
                    this.apiFetch('/api/creator/withdrawals')
                ]);

                if (walletRes?.data) {
                    this.state.wallet = walletRes.data;
                    document.getElementById('withdraw-available-display').textContent = this.formatINR(walletRes.data.available_balance);
                    const amtInput = document.getElementById('withdraw-amount');
                    if (amtInput) amtInput.max = Math.min(100000, walletRes.data.available_balance);
                }

                if (methodsRes?.data) {
                    const methods = Array.isArray(methodsRes.data) ? methodsRes.data : (methodsRes.data.payout_methods || []);
                    this.state.payoutMethods = methods;
                    this.renderPayoutMethodsSelect(methods);
                }

                if (withRes?.data) {
                    const withdrawals = Array.isArray(withRes.data) ? withRes.data : (withRes.data.withdrawals || []);
                    this.renderWithdrawalHistory(withdrawals);
                }
            } catch (err) {
                console.warn('[Creator Portal] Withdraw load notice:', err.message);
            }
        },

        renderPayoutMethodsSelect(methods) {
            const select = document.getElementById('withdraw-method-select');
            if (!select) return;

            if (!methods || methods.length === 0) {
                select.innerHTML = `<option value="">No payout method saved. Please add one below.</option>`;
                return;
            }

            select.innerHTML = `<option value="">Select destination...</option>` + methods.map(m => {
                const label = m.type === 'upi' ? `UPI: ${m.masked_upi || m.upi_id}` : `Bank: ${m.bank_name || 'Account'} (${m.masked_account_number || m.account_number})`;
                const isDef = m.is_default ? ' (Default)' : '';
                return `<option value="${m.id}">${label}${isDef}</option>`;
            }).join('');
        },

        renderWithdrawalHistory(withdrawals) {
            const tbody = document.getElementById('withdraw-history-tbody');
            if (!tbody) return;

            if (!withdrawals || withdrawals.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--wr-c-muted); padding: 32px;">No withdrawal requests submitted yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = withdrawals.map(w => {
                const status = (w.status || 'requested').toLowerCase();
                let badge = '<span class="creator-badge badge-orange">Requested</span>';
                if (status === 'processing') badge = '<span class="creator-badge badge-orange">Processing</span>';
                if (status === 'paid') badge = '<span class="creator-badge badge-green">Paid</span>';
                if (status === 'failed') badge = '<span class="creator-badge badge-red">Failed</span>';

                return `
                    <tr>
                        <td>${this.formatDate(w.created_at)}</td>
                        <td><strong>${this.formatINR(w.amount)}</strong></td>
                        <td>${w.payout_method_type?.toUpperCase() || 'PAYOUT'}</td>
                        <td><code style="font-size: 0.75rem;">${w.reference || '—'}</code></td>
                        <td>${badge}</td>
                    </tr>
                `;
            }).join('');
        },

        togglePayoutFields(type) {
            document.getElementById('payout-upi-group').style.display = type === 'upi' ? 'block' : 'none';
            document.getElementById('payout-bank-group').style.display = type === 'bank_account' ? 'block' : 'none';
        },

        async handleAddPayoutMethod(event) {
            event.preventDefault();
            const type = document.getElementById('new-payout-type').value;
            let payload = { type };

            if (type === 'upi') {
                const upi = document.getElementById('new-payout-upi').value.trim();
                if (!upi) return alert('Please enter a valid UPI VPA.');
                payload.upi_id = upi;
            } else {
                const acc = document.getElementById('new-payout-account').value.trim();
                const ifsc = document.getElementById('new-payout-ifsc').value.trim();
                const name = document.getElementById('new-payout-name').value.trim();
                if (!acc || !ifsc || !name) return alert('All bank details are required.');
                payload.account_number = acc;
                payload.ifsc_code = ifsc;
                payload.beneficiary_name = name;
            }

            try {
                const res = await this.apiFetch('/api/creator/payout-methods', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (res.success) {
                    alert('Payout method added successfully!');
                    event.target.reset();
                    this.loadWithdraw();
                }
            } catch (err) {
                alert(err.message || 'Unable to save payout method.');
            }
        },

        async handleWithdrawSubmit(event) {
            event.preventDefault();
            if (this.state.isSubmittingWithdrawal) return;

            const methodId = document.getElementById('withdraw-method-select').value;
            const amtInput = document.getElementById('withdraw-amount');
            const amount = Number(amtInput.value);
            const avail = this.state.wallet?.available_balance || 0;

            if (!methodId) {
                return alert('Please select a payout method.');
            }
            if (isNaN(amount) || amount < 500) {
                return alert('Minimum withdrawal amount is ₹500.');
            }
            if (amount > avail) {
                return alert(`Withdrawal amount cannot exceed available balance (${this.formatINR(avail)}).`);
            }

            if (!confirm(`Confirm withdrawal request of ${this.formatINR(amount)}?\n\nNote: Request will be queued for processing.`)) {
                return;
            }

            this.state.isSubmittingWithdrawal = true;
            const btn = document.getElementById('withdraw-submit-btn');
            btn.disabled = true;
            btn.textContent = 'Submitting Request…';

            try {
                const res = await this.apiFetch('/api/creator/withdrawals', {
                    method: 'POST',
                    body: JSON.stringify({
                        payout_method_id: methodId,
                        amount: amount
                    })
                });

                if (res.success) {
                    alert(`Withdrawal request for ${this.formatINR(amount)} submitted successfully! Current status: Requested / Processing.`);
                    amtInput.value = '';
                    this.loadWithdraw();
                }
            } catch (err) {
                alert(err.message || 'Withdrawal request failed.');
            } finally {
                this.state.isSubmittingWithdrawal = false;
                btn.disabled = false;
                btn.textContent = 'Submit Withdrawal Request';
            }
        },

        // 8. Points & Rewards Catalogue
        async loadPointsAndRewards() {
            try {
                const [pointsRes, rewardsRes, txRes] = await Promise.all([
                    this.apiFetch('/api/creator/points'),
                    this.apiFetch('/api/creator/rewards'),
                    this.apiFetch('/api/creator/points/transactions')
                ]);

                if (pointsRes?.data) {
                    const p = pointsRes.data;
                    this.state.points = p;
                    document.getElementById('points-avail').textContent = p.current_points || 0;
                    document.getElementById('points-lifetime').textContent = p.lifetime_earned || 0;
                    document.getElementById('points-redeemed').textContent = p.points_used || 0;
                }

                if (rewardsRes?.data) {
                    const rewards = Array.isArray(rewardsRes.data) ? rewardsRes.data : (rewardsRes.data.rewards || []);
                    this.state.rewards = rewards;
                    this.renderRewardsCatalogue(rewards);
                }

                if (txRes?.data) {
                    const txs = Array.isArray(txRes.data) ? txRes.data : (txRes.data.transactions || []);
                    this.renderPointsTransactionsTable(txs);
                }
            } catch (err) {
                console.warn('[Creator Portal] Points load notice:', err.message);
            }
        },

        renderRewardsCatalogue(rewards) {
            const grid = document.getElementById('rewards-catalogue-grid');
            if (!grid) return;

            if (!rewards || rewards.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--wr-c-muted); padding: 32px;">No rewards available currently. Check back soon!</div>`;
                return;
            }

            const currentPts = this.state.points?.current_points || 0;

            grid.innerHTML = rewards.map(r => {
                const canAfford = currentPts >= r.points_required;
                const isAvail = r.is_active !== false && (r.stock_quantity === undefined || r.stock_quantity > 0);

                return `
                    <div class="creator-reward-card">
                        <div>
                            <div class="creator-reward-cost">🪙 ${r.points_required} Points</div>
                            <h4 style="font-family: 'Cinzel', serif; font-size: 1.1rem; color: var(--wr-c-primary); margin-bottom: 8px;">${r.name}</h4>
                            <p style="font-size: 0.85rem; color: var(--wr-c-muted); line-height: 1.5; margin-bottom: 16px;">${r.description || 'Exclusive luxury reward for verified WishRite Creators.'}</p>
                        </div>
                        <button class="creator-btn-action" style="width: 100%; justify-content: center;" 
                            ${(!canAfford || !isAvail) ? 'disabled' : ''} 
                            onclick="window.WishRiteCreatorPortal.handleRedeemReward('${r.id}', ${r.points_required}, '${r.name}');">
                            ${!isAvail ? 'Sold Out' : (canAfford ? 'Redeem Reward' : 'Insufficient Points')}
                        </button>
                    </div>
                `;
            }).join('');
        },

        renderPointsTransactionsTable(txs) {
            const tbody = document.getElementById('points-tx-tbody');
            if (!tbody) return;

            if (!txs || txs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--wr-c-muted); padding: 24px;">No points activity recorded yet.</td></tr>`;
                return;
            }

            tbody.innerHTML = txs.map(t => {
                const isEarn = t.type?.includes('earn') || t.points > 0;
                const ptsText = (isEarn ? '+' : '') + t.points;
                const color = isEarn ? 'var(--wr-c-green)' : 'var(--wr-c-red)';

                return `
                    <tr>
                        <td>${this.formatDate(t.created_at)}</td>
                        <td>${t.description || 'Points Transaction'}</td>
                        <td><span style="font-size: 0.76rem; text-transform: uppercase; color: var(--wr-c-muted);">${t.type}</span></td>
                        <td style="color: ${color}; font-weight: 700;">${ptsText}</td>
                    </tr>
                `;
            }).join('');
        },

        async handleRedeemReward(rewardId, pointsCost, rewardName) {
            if (this.state.isRedeemingReward) return;
            if (!confirm(`Are you sure you want to redeem "${rewardName}" for ${pointsCost} points?`)) return;

            this.state.isRedeemingReward = true;
            try {
                const res = await this.apiFetch(`/api/creator/rewards/${rewardId}/redeem`, {
                    method: 'POST'
                });

                if (res.success) {
                    alert(`Congratulations! You have successfully redeemed "${rewardName}". Our Creator Concierge will contact you shortly.`);
                    this.loadPointsAndRewards();
                }
            } catch (err) {
                alert(err.message || 'Unable to redeem reward.');
            } finally {
                this.state.isRedeemingReward = false;
            }
        },

        // 9. Profile & Governance
        async loadProfile() {
            try {
                const res = await this.apiFetch('/api/creator/profile');
                if (res.data) {
                    const p = res.data;
                    document.getElementById('prof-name').value = p.name || '';
                    document.getElementById('prof-bio').value = p.bio || '';
                    document.getElementById('prof-instagram').value = p.instagram_id || p.instagram_handle || '';
                    document.getElementById('prof-youtube').value = p.youtube_id || p.youtube_handle || '';

                    document.getElementById('gov-code').textContent = p.influencer_code || '—';
                    document.getElementById('gov-rate').textContent = `${p.commission_rate || 10}%`;
                    document.getElementById('gov-tier').textContent = (p.tier || 'STARTER').toUpperCase();
                    document.getElementById('gov-slug').textContent = p.public_slug || '—';
                    document.getElementById('gov-status').textContent = (p.status || 'ACTIVE').toUpperCase();
                }
            } catch (err) {
                console.warn('[Creator Portal] Profile load notice:', err.message);
            }
        },

        async handleProfileUpdate(event) {
            event.preventDefault();
            const btn = document.getElementById('profile-save-btn');
            btn.disabled = true;
            btn.textContent = 'Saving…';

            const payload = {
                name: document.getElementById('prof-name').value.trim(),
                bio: document.getElementById('prof-bio').value.trim(),
                instagram_id: document.getElementById('prof-instagram').value.trim(),
                youtube_id: document.getElementById('prof-youtube').value.trim()
            };

            try {
                const res = await this.apiFetch('/api/creator/profile', {
                    method: 'PATCH',
                    body: JSON.stringify(payload)
                });

                if (res.success) {
                    alert('Profile updated successfully!');
                    if (this.state.creator) {
                        this.state.creator.name = payload.name;
                    }
                    this.renderLoggedInHeader();
                }
            } catch (err) {
                alert(err.message || 'Failed to update profile.');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Profile Changes';
            }
        }
    };

    window.WishRiteCreatorPortal = WishRiteCreatorPortal;

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', () => {
        // Desktop nav clicks
        document.querySelectorAll('.creator-nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                if (view) WishRiteCreatorPortal.navigateTo(view);
            });
        });

        // Mobile bottom nav clicks
        document.querySelectorAll('.creator-mobile-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                if (view) WishRiteCreatorPortal.navigateTo(view);
            });
        });

        // Verify authentication & route
        WishRiteCreatorPortal.checkAuth();
    });

})(window);
