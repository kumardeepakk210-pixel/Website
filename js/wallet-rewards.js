/**
 * WISHRITE — WALLET, REWARD POINTS & REFERRAL SYSTEM
 * Shared between Website & Capacitor Mobile App
 * Single Source of Truth: Supabase
 *
 * Theme Colors (Moonlit Silver):
 * Midnight Aubergine: #28212C
 * Smoked Plum: #554453
 * Pearl Ivory: #F5F2EC
 */

(function (window) {
    'use strict';

    const WishRiteWalletRewards = {
        state: {
            walletBalance: 0.00,
            pointsBalance: 0.00,
            currency: 'INR',
            referralCode: '',
            settings: {
                purchase_reward_percentage: 1.00,
                referral_reward_points: 100.00,
                point_value_inr: 1.00,
                minimum_points_redemption: 0.00,
                maximum_points_per_order: null
            },
            walletTransactions: [],
            rewardTransactions: [],
            referrals: [],
            isLoading: false,
            activeTab: 'wallet' // 'wallet' | 'rewards' | 'referrals'
        },

        // Helper to format currency
        formatINR(amount) {
            const val = Number(amount) || 0;
            return '₹' + val.toLocaleString('en-IN', {
                minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
                maximumFractionDigits: 2
            });
        },

        // Helper to format points
        formatPoints(pts) {
            const val = Number(pts) || 0;
            return val.toLocaleString('en-IN', {
                minimumFractionDigits: Number.isInteger(val) ? 0 : 2,
                maximumFractionDigits: 2
            });
        },

        // Helper to get active Supabase client
        getClient() {
            return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        },

        // Helper to get current authenticated user
        getCurrentUser() {
            if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
            const client = this.getClient();
            return client?.auth?.getUser ? null : null;
        },

        // Initialize state & load settings on startup
        async init() {
            console.log('[WishRite Wallet & Rewards] Initializing system...');
            await this.loadSettings();
            
            // Listen to auth state changes
            const client = this.getClient();
            if (client?.auth) {
                const { data: authData } = await client.auth.getSession();
                if (authData?.session?.user) {
                    await this.syncUser(authData.session.user);
                }

                client.auth.onAuthStateChange(async (event, session) => {
                    if (session?.user) {
                        await this.syncUser(session.user);
                    } else {
                        this.resetState();
                    }
                });
            }
        },

        resetState() {
            this.state.walletBalance = 0.00;
            this.state.pointsBalance = 0.00;
            this.state.referralCode = '';
            this.state.walletTransactions = [];
            this.state.rewardTransactions = [];
            this.state.referrals = [];
            this.renderHeaderBalances();
            this.renderAccountSection();
        },

        // Load admin configuration settings from public.reward_settings
        async loadSettings() {
            try {
                const client = this.getClient();
                if (!client) return;

                const { data, error } = await client
                    .from('reward_settings')
                    .select('*')
                    .eq('id', 1)
                    .maybeSingle();

                if (!error && data) {
                    this.state.settings = {
                        purchase_reward_percentage: Number(data.purchase_reward_percentage) || 1.00,
                        referral_reward_points: Number(data.referral_reward_points) || 100.00,
                        point_value_inr: Number(data.point_value_inr) || 1.00,
                        minimum_points_redemption: Number(data.minimum_points_redemption) || 0.00,
                        maximum_points_per_order: data.maximum_points_per_order ? Number(data.maximum_points_per_order) : null
                    };
                    console.log('[WishRite Wallet & Rewards] Settings loaded:', this.state.settings);
                }
            } catch (err) {
                console.warn('[WishRite Wallet & Rewards] Could not load reward_settings:', err.message);
            }
        },

        // Sync authenticated customer's wallet, points and referral code
        async syncUser(user) {
            if (!user?.id) return;
            const client = this.getClient();
            if (!client) return;

            try {
                this.state.isLoading = true;

                // 1. Ensure user has wallet, points and referral code via atomic RPC
                const { data: walletData, error: rpcErr } = await client.rpc('get_or_create_customer_wallet', {
                    p_user_id: user.id
                });

                if (!rpcErr && walletData && walletData.success) {
                    this.state.walletBalance = Number(walletData.wallet_balance) || 0.00;
                    this.state.pointsBalance = Number(walletData.points_balance) || 0.00;
                    this.state.currency = walletData.currency || 'INR';
                    this.state.referralCode = walletData.referral_code || '';
                } else {
                    // Fallback: direct table queries
                    const [wRes, pRes, cRes] = await Promise.all([
                        client.from('wallets').select('balance, currency').eq('user_id', user.id).maybeSingle(),
                        client.from('customer_points').select('points_balance').eq('user_id', user.id).maybeSingle(),
                        client.from('customers').select('referral_code').eq('user_id', user.id).maybeSingle()
                    ]);

                    if (wRes.data) this.state.walletBalance = Number(wRes.data.balance) || 0.00;
                    if (pRes.data) this.state.pointsBalance = Number(pRes.data.points_balance) || 0.00;
                    if (cRes.data) this.state.referralCode = cRes.data.referral_code || '';
                }

                // 2. Fetch history ledgers in parallel
                await Promise.all([
                    this.fetchWalletTransactions(user.id),
                    this.fetchRewardTransactions(user.id),
                    this.fetchReferrals(user.id)
                ]);

            } catch (err) {
                console.error('[WishRite Wallet & Rewards] syncUser error:', err);
            } finally {
                this.state.isLoading = false;
                this.renderHeaderBalances();
                this.renderAccountSection();
            }
        },

        async fetchWalletTransactions(userId) {
            const client = this.getClient();
            if (!client || !userId) return;

            const { data, error } = await client
                .from('wallet_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && Array.isArray(data)) {
                this.state.walletTransactions = data;
            }
        },

        async fetchRewardTransactions(userId) {
            const client = this.getClient();
            if (!client || !userId) return;

            const { data, error } = await client
                .from('reward_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && Array.isArray(data)) {
                this.state.rewardTransactions = data;
            }
        },

        async fetchReferrals(userId) {
            const client = this.getClient();
            if (!client || !userId) return;

            const { data, error } = await client
                .from('referrals')
                .select('*')
                .eq('referrer_user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && Array.isArray(data)) {
                this.state.referrals = data;
            }
        },

        // Header / Navigation compact balance badges (removed from main page; kept in My Account and checkout)
        renderHeaderBalances() {
            const container = document.getElementById('wr-header-wallet-badge');
            if (container) {
                container.style.display = 'none';
                container.innerHTML = '';
            }

            const dropdown = document.getElementById('user-dropdown');
            if (dropdown) {
                const existingInfo = dropdown.querySelector('.wr-user-balances-row');
                if (existingInfo) {
                    existingInfo.remove();
                }
            }
        },

        // Render the dedicated "WISHRITE WALLET & REWARDS" section in My Account (#profile-view)
        renderAccountSection() {
            const profileContent = document.querySelector('#profile-view .profile-content');
            if (!profileContent) return;

            let section = document.getElementById('wishrite-wallet-rewards-card');
            if (!section) {
                section = document.createElement('div');
                section.id = 'wishrite-wallet-rewards-card';
                section.className = 'account-card wr-wallet-card';
                
                // Insert right above the order history card
                const ordersCard = document.getElementById('account-orders-card');
                if (ordersCard) {
                    profileContent.insertBefore(section, ordersCard);
                } else {
                    profileContent.appendChild(section);
                }
            }

            const code = this.state.referralCode || 'WR—';
            const pointsVal = (this.state.pointsBalance * this.state.settings.point_value_inr);
            const totalRefs = this.state.referrals.length;
            const successRefs = this.state.referrals.filter(r => r.status === 'REWARDED').length;
            const earnedPoints = this.state.referrals
                .filter(r => r.status === 'REWARDED')
                .reduce((acc, r) => acc + Number(r.reward_points || 0), 0);

            section.innerHTML = `
                <div class="account-card-header" style="border-bottom: 2px solid var(--wr-primary-subtle); padding-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.4rem;">✨</span>
                        <h3 style="color: var(--wr-primary); font-family: var(--font-display); font-size: 1.35rem; margin: 0;">
                            WISHRITE WALLET & REWARDS
                        </h3>
                    </div>
                    <span class="status-badge" style="background: rgba(40, 33, 44, 0.06); color: var(--wr-midnight); border: 1px solid rgba(40, 33, 44, 0.15);">
                        Premium Member
                    </span>
                </div>

                <!-- 3 Top Balance Cards -->
                <div class="wr-rewards-top-grid">
                    
                    <!-- 1. WALLET -->
                    <div class="wr-metric-box">
                        <div class="wr-metric-label">
                            <span>WALLET BALANCE</span>
                            <span class="wr-gold-badge">100% SECURE</span>
                        </div>
                        <div class="wr-metric-val" style="color: var(--wr-midnight);">
                            ${this.formatINR(this.state.walletBalance)}
                        </div>
                        <div class="wr-metric-sub">Use seamlessly at checkout or get instant refunds.</div>
                        <button type="button" class="btn btn-primary btn-sm wr-btn-topup" onclick="WishRiteWalletRewards.openTopupModal()">
                            + Add Money
                        </button>
                    </div>

                    <!-- 2. REWARD POINTS -->
                    <div class="wr-metric-box">
                        <div class="wr-metric-label">
                            <span>WISHRITE POINTS</span>
                            <span class="wr-point-badge">1 pt = ₹1</span>
                        </div>
                        <div class="wr-metric-val" style="color: var(--wr-plum);">
                            ${this.formatPoints(this.state.pointsBalance)} <span style="font-size: 1rem; font-weight: 500;">Points</span>
                        </div>
                        <div class="wr-metric-sub">
                            Value: <strong>${this.formatINR(pointsVal)}</strong> &bull; Earn 1% on every order!
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm" onclick="navigateTo('shop')">
                            Use at Checkout
                        </button>
                    </div>

                    <!-- 3. REFER & EARN -->
                    <div class="wr-metric-box wr-refer-metric-box">
                        <div class="wr-metric-label">
                            <span>REFER & EARN</span>
                            <span class="wr-free-badge">Earn 100 Points</span>
                        </div>
                        <div class="wr-code-chip-row">
                            <span class="wr-code-tag">${code}</span>
                            <button type="button" class="wr-btn-icon-copy" onclick="WishRiteWalletRewards.copyReferralCode()" title="Copy referral code">
                                📋 Copy
                            </button>
                            <button type="button" class="wr-btn-icon-share" onclick="WishRiteWalletRewards.shareReferralCode()" title="Share with friends">
                                🚀 Share
                            </button>
                        </div>
                        <div class="wr-metric-sub" style="margin-top: 8px;">
                            Share your code: You get <strong>100 points (₹100)</strong> on their 1st purchase!
                        </div>
                    </div>
                </div>

                <!-- Referral Statistics Summary -->
                <div class="wr-referral-stat-row">
                    <div class="wr-ref-stat-item">
                        <span class="wr-ref-stat-num">${totalRefs}</span>
                        <span class="wr-ref-stat-lbl">Total Referrals</span>
                    </div>
                    <div class="wr-ref-stat-item">
                        <span class="wr-ref-stat-num" style="color: var(--wr-success);">${successRefs}</span>
                        <span class="wr-ref-stat-lbl">Successful</span>
                    </div>
                    <div class="wr-ref-stat-item">
                        <span class="wr-ref-stat-num" style="color: var(--wr-plum);">+${this.formatPoints(earnedPoints)}</span>
                        <span class="wr-ref-stat-lbl">Points Earned</span>
                    </div>
                </div>

                <!-- Transaction History Tabbed View -->
                <div class="wr-history-container" style="margin-top: 24px;">
                    <div class="wr-history-tabs">
                        <button type="button" class="wr-tab-btn ${this.state.activeTab === 'wallet' ? 'active' : ''}" onclick="WishRiteWalletRewards.switchTab('wallet')">
                            Wallet History (${this.state.walletTransactions.length})
                        </button>
                        <button type="button" class="wr-tab-btn ${this.state.activeTab === 'rewards' ? 'active' : ''}" onclick="WishRiteWalletRewards.switchTab('rewards')">
                            Rewards History (${this.state.rewardTransactions.length})
                        </button>
                        <button type="button" class="wr-tab-btn ${this.state.activeTab === 'referrals' ? 'active' : ''}" onclick="WishRiteWalletRewards.switchTab('referrals')">
                            Referral History (${this.state.referrals.length})
                        </button>
                    </div>

                    <div class="wr-tab-content" id="wr-wallet-tab-content">
                        ${this.renderActiveTabContent()}
                    </div>
                </div>
            `;
        },

        switchTab(tabName) {
            this.state.activeTab = tabName;
            const container = document.getElementById('wr-wallet-tab-content');
            if (container) {
                container.innerHTML = this.renderActiveTabContent();
            }
            // Update active class on buttons
            document.querySelectorAll('.wr-history-tabs .wr-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tabName));
            });
        },

        renderActiveTabContent() {
            if (this.state.activeTab === 'wallet') {
                return this.renderWalletTransactionsHtml();
            } else if (this.state.activeTab === 'rewards') {
                return this.renderRewardTransactionsHtml();
            } else {
                return this.renderReferralsHtml();
            }
        },

        renderWalletTransactionsHtml() {
            if (!this.state.walletTransactions.length) {
                return `<div class="wr-empty-history">No wallet transactions yet. Add money to your wallet to get started.</div>`;
            }

            return `
                <div class="wr-ledger-list">
                    ${this.state.walletTransactions.map(tx => {
                        const isCredit = Number(tx.amount) > 0;
                        const dateStr = new Date(tx.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        const amountStr = (isCredit ? '+' : '') + this.formatINR(tx.amount);
                        const statusClass = (tx.status || 'SUCCESS').toLowerCase();

                        return `
                            <div class="wr-ledger-row">
                                <div class="wr-ledger-main">
                                    <div class="wr-ledger-desc">${this.escapeHtml(tx.description || tx.transaction_type)}</div>
                                    <div class="wr-ledger-meta">
                                        <span>${dateStr}</span>
                                        <span class="wr-tx-type">${tx.transaction_type}</span>
                                        <span class="wr-status-pill ${statusClass}">${tx.status || 'SUCCESS'}</span>
                                    </div>
                                </div>
                                <div class="wr-ledger-amount ${isCredit ? 'credit' : 'debit'}">
                                    ${amountStr}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        renderRewardTransactionsHtml() {
            if (!this.state.rewardTransactions.length) {
                return `<div class="wr-empty-history">No points transactions yet. Earn points on every order or by referring friends!</div>`;
            }

            return `
                <div class="wr-ledger-list">
                    ${this.state.rewardTransactions.map(tx => {
                        const isCredit = Number(tx.points) > 0;
                        const dateStr = new Date(tx.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        const ptsStr = (isCredit ? '+' : '') + this.formatPoints(tx.points) + ' pts';
                        const valStr = this.formatINR(Math.abs(tx.points) * this.state.settings.point_value_inr);
                        const statusClass = (tx.status || 'SUCCESS').toLowerCase();

                        return `
                            <div class="wr-ledger-row">
                                <div class="wr-ledger-main">
                                    <div class="wr-ledger-desc">${this.escapeHtml(tx.description || tx.transaction_type)}</div>
                                    <div class="wr-ledger-meta">
                                        <span>${dateStr}</span>
                                        <span class="wr-tx-type">${tx.transaction_type}</span>
                                        <span class="wr-status-pill ${statusClass}">${tx.status || 'SUCCESS'}</span>
                                    </div>
                                </div>
                                <div class="wr-ledger-amount ${isCredit ? 'credit' : 'debit'}">
                                    <span>${ptsStr}</span>
                                    <small style="display:block; font-size:0.75rem; color:var(--wr-text-muted); font-weight:normal;">(${valStr})</small>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        renderReferralsHtml() {
            if (!this.state.referrals.length) {
                return `<div class="wr-empty-history">You haven't referred any friends yet. Share your code <strong>${this.state.referralCode}</strong> to start earning!</div>`;
            }

            return `
                <div class="wr-ledger-list">
                    ${this.state.referrals.map((r, i) => {
                        const dateStr = new Date(r.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        });
                        const isRewarded = r.status === 'REWARDED';
                        const rewardStr = isRewarded ? `+${this.formatPoints(r.reward_points)} pts (₹${r.reward_points})` : 'Pending 1st Purchase';

                        return `
                            <div class="wr-ledger-row">
                                <div class="wr-ledger-main">
                                    <div class="wr-ledger-desc">Referred Friend #${i + 1}</div>
                                    <div class="wr-ledger-meta">
                                        <span>Joined: ${dateStr}</span>
                                        <span class="wr-status-pill ${isRewarded ? 'success' : 'pending'}">${r.status}</span>
                                    </div>
                                </div>
                                <div class="wr-ledger-amount ${isRewarded ? 'credit' : 'muted'}">
                                    ${rewardStr}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        },

        // Referral Code actions
        copyReferralCode() {
            const code = this.state.referralCode;
            if (!code) return;

            navigator.clipboard.writeText(code).then(() => {
                if (typeof showToast === 'function') {
                    showToast('Referral code copied to clipboard!', 'success');
                } else {
                    alert('Referral code ' + code + ' copied to clipboard!');
                }
            }).catch(() => {
                alert('Your referral code: ' + code);
            });
        },

        shareReferralCode() {
            const code = this.state.referralCode;
            if (!code) return;

            const shareData = {
                title: 'WishRite 925 Silver Jewellery',
                text: `Join WishRite with my referral code ${code} and get exclusive discounts and reward points on 925 Sterling Silver Jewellery!`,
                url: window.location.origin
            };

            if (navigator.share) {
                navigator.share(shareData).catch(() => {});
            } else {
                this.copyReferralCode();
            }
        },

        // ═════════════════════════════════════════════════════════════════════
        // WALLET TOP-UP FLOW (SECURE RAZORPAY INTEGRATION)
        // ═════════════════════════════════════════════════════════════════════

        openTopupModal() {
            // Remove existing modal if any
            const existing = document.getElementById('wr-wallet-topup-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'wr-wallet-topup-modal';
            modal.className = 'wr-modal-overlay';
            modal.innerHTML = `
                <div class="wr-modal-box">
                    <div class="wr-modal-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.3rem;">💳</span>
                            <h3 style="margin:0; font-family:var(--font-display); color:var(--wr-primary);">Add Money to Wallet</h3>
                        </div>
                        <button type="button" class="wr-modal-close" onclick="WishRiteWalletRewards.closeTopupModal()">&times;</button>
                    </div>

                    <div class="wr-modal-body">
                        <p style="color:var(--wr-text-muted); font-size:0.9rem; margin-bottom:16px;">
                            Select a preset amount or enter a custom amount to top up your secure WishRite Wallet:
                        </p>

                        <!-- Preset Chips -->
                        <div class="wr-topup-chips">
                            <button type="button" class="wr-chip-btn active" data-amount="500" onclick="WishRiteWalletRewards.selectTopupChip(500, this)">₹500</button>
                            <button type="button" class="wr-chip-btn" data-amount="1000" onclick="WishRiteWalletRewards.selectTopupChip(1000, this)">₹1,000</button>
                            <button type="button" class="wr-chip-btn" data-amount="2000" onclick="WishRiteWalletRewards.selectTopupChip(2000, this)">₹2,000</button>
                            <button type="button" class="wr-chip-btn" data-amount="5000" onclick="WishRiteWalletRewards.selectTopupChip(5000, this)">₹5,000</button>
                            <button type="button" class="wr-chip-btn" data-amount="10000" onclick="WishRiteWalletRewards.selectTopupChip(10000, this)">₹10,000</button>
                        </div>

                        <!-- Custom Input -->
                        <div class="form-group" style="margin-top:16px;">
                            <label style="font-size:0.82rem; font-weight:600; text-transform:uppercase; color:var(--wr-text-muted); display:block; margin-bottom:6px;">
                                Amount (₹)
                            </label>
                            <div style="position:relative;">
                                <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-weight:600; color:var(--wr-text);">₹</span>
                                <input type="number" id="wr-topup-amount-input" class="form-input" value="500" min="10" max="100000" step="1"
                                    style="padding-left:32px; font-size:1.15rem; font-weight:600; color:var(--wr-primary);"
                                    oninput="WishRiteWalletRewards.onCustomAmountInput(this.value)">
                            </div>
                        </div>

                        <div id="wr-topup-error" class="auth-message error" style="display:none; margin-top:10px;"></div>

                        <div class="wr-topup-benefits">
                            <div>✓ 100% Secure Payment via Razorpay (UPI, Cards, NetBanking)</div>
                            <div>✓ Instant Wallet Credit upon verified confirmation</div>
                            <div>✓ Fast 1-Click Checkout on future purchases</div>
                        </div>

                        <button type="button" id="wr-topup-submit-btn" class="btn btn-primary btn-full btn-lg" style="margin-top:20px;"
                            onclick="WishRiteWalletRewards.startTopupPayment()">
                            Proceed to Add ₹500
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';
        },

        closeTopupModal() {
            const modal = document.getElementById('wr-wallet-topup-modal');
            if (modal) modal.remove();
            document.body.style.overflow = '';
        },

        selectTopupChip(amount, btnEl) {
            document.querySelectorAll('.wr-topup-chips .wr-chip-btn').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');

            const input = document.getElementById('wr-topup-amount-input');
            if (input) input.value = amount;

            const submitBtn = document.getElementById('wr-topup-submit-btn');
            if (submitBtn) submitBtn.textContent = `Proceed to Add ${this.formatINR(amount)}`;
        },

        onCustomAmountInput(val) {
            const num = Number(val);
            document.querySelectorAll('.wr-topup-chips .wr-chip-btn').forEach(b => {
                b.classList.toggle('active', Number(b.getAttribute('data-amount')) === num);
            });

            const submitBtn = document.getElementById('wr-topup-submit-btn');
            if (submitBtn) {
                submitBtn.textContent = num > 0 ? `Proceed to Add ${this.formatINR(num)}` : 'Enter Valid Amount';
            }
        },

        // Initiate Razorpay payment flow for wallet top-up
        async startTopupPayment() {
            const input = document.getElementById('wr-topup-amount-input');
            const amount = Number(input?.value);
            const errEl = document.getElementById('wr-topup-error');
            const submitBtn = document.getElementById('wr-topup-submit-btn');

            if (errEl) errEl.style.display = 'none';

            if (isNaN(amount) || amount < 10) {
                if (errEl) {
                    errEl.textContent = 'Please enter a valid amount of at least ₹10.';
                    errEl.style.display = 'block';
                }
                return;
            }

            const client = this.getClient();
            if (!client) {
                alert('Database connection unavailable. Please refresh.');
                return;
            }

            const session = await client.auth.getSession();
            const user = session?.data?.session?.user;
            if (!user) {
                alert('Please sign in to add money to your wallet.');
                navigateTo('login');
                this.closeTopupModal();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Connecting to Secure Gateway…';

            try {
                // Ensure Razorpay SDK loaded
                if (typeof window.Razorpay === 'undefined') {
                    if (typeof loadRazorpaySdk === 'function') {
                        await loadRazorpaySdk();
                    } else {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                            script.onload = () => resolve();
                            script.onerror = () => reject(new Error('Failed to load payment gateway'));
                            document.head.appendChild(script);
                        });
                    }
                }

                // Step 1: Create top-up order on backend
                // Try Supabase Edge Function first, then fallback to /api/wallet-topup-order
                let orderData = null;
                try {
                    const { data, error } = await client.functions.invoke('create-razorpay-order', {
                        body: {
                            purpose: 'wallet_topup',
                            amount: amount,
                            user_id: user.id
                        }
                    });
                    if (!error && data?.success && data?.order_id) {
                        orderData = data;
                    }
                } catch (e) {
                    console.warn('[WishRite Topup] Edge function create fallback notice:', e.message);
                }

                if (!orderData) {
                    // Fallback to local / Vercel API route
                    const localRes = await fetch('/api/wallet-topup-order', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.data.session.access_token}`
                        },
                        body: JSON.stringify({
                            purpose: 'wallet_topup',
                            amount: amount,
                            user_id: user.id
                        })
                    });
                    const resJson = await localRes.json();
                    if (!resJson.success || !resJson.order_id) {
                        throw new Error(resJson.error || 'Failed to create payment order');
                    }
                    orderData = resJson;
                }

                console.log('[WishRite Topup] Payment order created:', orderData);

                // Step 2: Open Razorpay modal
                const self = this;
                const options = {
                    key: orderData.key_id,
                    amount: orderData.amount,
                    currency: orderData.currency || 'INR',
                    name: 'WishRite',
                    description: `Wallet Top-up: ${self.formatINR(amount)}`,
                    order_id: orderData.order_id,
                    prefill: {
                        name: user.user_metadata?.full_name || '',
                        email: user.email || '',
                        contact: user.phone || user.user_metadata?.phone || ''
                    },
                    theme: {
                        color: '#28212C' // WishRite Midnight Aubergine
                    },
                    modal: {
                        ondismiss: function () {
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = `Proceed to Add ${self.formatINR(amount)}`;
                            }
                        }
                    },
                    handler: async function (response) {
                        if (submitBtn) {
                            submitBtn.disabled = true;
                            submitBtn.innerHTML = 'Verifying Transaction with Bank…';
                        }

                        // Step 3: Backend Verification
                        try {
                            let verifyData = null;

                            // Try Supabase Edge Function first
                            try {
                                const { data: vData, error: vErr } = await client.functions.invoke('verify-razorpay-payment', {
                                    body: {
                                        purpose: 'wallet_topup',
                                        topup_id: orderData.topup_id,
                                        razorpay_order_id: response.razorpay_order_id,
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_signature: response.razorpay_signature
                                    }
                                });
                                if (!vErr && vData?.success && vData?.wallet_credited) {
                                    verifyData = vData;
                                }
                            } catch (e) {
                                console.warn('[WishRite Topup] Edge function verify fallback notice:', e.message);
                            }

                            if (!verifyData) {
                                // Fallback to local / Vercel API route
                                const verifyRes = await fetch('/api/verify-wallet-topup', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        Authorization: `Bearer ${session.data.session.access_token}`
                                    },
                                    body: JSON.stringify({
                                        topup_id: orderData.topup_id,
                                        razorpay_order_id: response.razorpay_order_id,
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_signature: response.razorpay_signature
                                    })
                                });
                                const vJson = await verifyRes.json();
                                if (!vJson.success || !vJson.wallet_credited) {
                                    throw new Error(vJson.error || 'Payment verification failed');
                                }
                                verifyData = vJson;
                            }

                            // Step 4: Success - update state & UI
                            self.closeTopupModal();
                            await self.syncUser(user);

                            if (typeof showToast === 'function') {
                                showToast(`${self.formatINR(amount)} has been added to your WishRite Wallet.`, 'success');
                            } else {
                                alert(`${self.formatINR(amount)} has been successfully added to your WishRite Wallet!`);
                            }

                        } catch (vErr) {
                            console.error('[WishRite Topup] Verification error:', vErr);
                            alert('Payment completed, but verification failed: ' + vErr.message);
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = `Proceed to Add ${self.formatINR(amount)}`;
                            }
                        }
                    }
                };

                const rzp = new window.Razorpay(options);
                rzp.open();

            } catch (err) {
                console.error('[WishRite Topup] Initiation error:', err);
                if (errEl) {
                    errEl.textContent = err.message || 'Unable to open payment gateway. Please try again.';
                    errEl.style.display = 'block';
                }
                submitBtn.disabled = false;
                submitBtn.innerHTML = `Proceed to Add ${this.formatINR(amount)}`;
            }
        },

        escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };

    window.WishRiteWalletRewards = WishRiteWalletRewards;

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => WishRiteWalletRewards.init());
    } else {
        WishRiteWalletRewards.init();
    }

})(window);
