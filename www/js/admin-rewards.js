/**
 * WISHRITE ADMIN & INVENTORY — WALLET & REWARDS CONTROLLER
 * Handles admin configuration, customer balance management, audited adjustments, and ledger monitoring.
 */

let adminClient = null;
let allCustomersData = [];
let allWalletsMap = {};
let allPointsMap = {};

function initAdminSupabase() {
    if (adminClient) return adminClient;
    const url = window.SUPABASE_URL || window.WR_SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY || window.WR_SUPABASE_ANON_KEY;
    if (url && key && window.supabase) {
        adminClient = window.supabase.createClient(url, key);
    }
    return adminClient;
}

function showAdminAlert(elementId, message, isSuccess = true) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = `admin-alert ${isSuccess ? 'admin-alert-success' : 'admin-alert-error'}`;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
    }, 6000);
}

function formatAdminCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatAdminDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function switchAdminTab(tabId) {
    const tabs = ['customers', 'wallet-tx', 'reward-tx', 'referrals', 'audit-logs'];
    tabs.forEach(t => {
        const pane = document.getElementById(`tab-${t}`);
        if (pane) pane.style.display = (t === tabId) ? 'block' : 'none';
    });

    const buttons = document.querySelectorAll('.admin-tab-btn');
    buttons.forEach((btn, index) => {
        if (tabs[index] === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

async function loadSettings() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('reward_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('Error loading reward settings:', error);
            return;
        }

        if (data) {
            const pct = document.getElementById('cfg-purchase-pct');
            const refPts = document.getElementById('cfg-referral-pts');
            const ptVal = document.getElementById('cfg-point-val');
            const minPts = document.getElementById('cfg-min-pts');
            const maxPts = document.getElementById('cfg-max-pts');

            if (pct) pct.value = data.purchase_reward_percentage || 1.00;
            if (refPts) refPts.value = data.referral_reward_points || 100;
            if (ptVal) ptVal.value = data.point_value_inr || 1.00;
            if (minPts) minPts.value = data.minimum_points_redemption || 0;
            if (maxPts) maxPts.value = data.maximum_points_per_order || '';

            const policySumm = document.getElementById('stat-policy-summary');
            if (policySumm) {
                policySumm.textContent = `${data.purchase_reward_percentage}% / ${data.referral_reward_points} Pts`;
            }
        }
    } catch (err) {
        console.error('Exception loading settings:', err);
    }
}

async function handleSaveRewardSettings(event) {
    if (event) event.preventDefault();
    const client = initAdminSupabase();
    if (!client) {
        showAdminAlert('settings-alert', 'Supabase client not initialized.', false);
        return;
    }

    const btn = document.getElementById('btn-save-settings');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving Settings…';
    }

    const pct = Number(document.getElementById('cfg-purchase-pct')?.value || 1.00);
    const refPts = Number(document.getElementById('cfg-referral-pts')?.value || 100);
    const ptVal = Number(document.getElementById('cfg-point-val')?.value || 1.00);
    const minPts = Number(document.getElementById('cfg-min-pts')?.value || 0);
    const maxPtsRaw = document.getElementById('cfg-max-pts')?.value;
    const maxPts = maxPtsRaw ? Number(maxPtsRaw) : null;

    try {
        const { data, error } = await client.rpc('admin_update_reward_settings', {
            p_purchase_reward_percentage: pct,
            p_referral_reward_points: refPts,
            p_point_value_inr: ptVal,
            p_minimum_points_redemption: minPts,
            p_maximum_points_per_order: maxPts
        });

        if (error) {
            console.error('Error saving settings:', error);
            showAdminAlert('settings-alert', error.message || 'Failed to update settings.', false);
        } else {
            showAdminAlert('settings-alert', '✓ Reward settings updated successfully!', true);
            await loadSettings();
        }
    } catch (err) {
        console.error('Exception saving settings:', err);
        showAdminAlert('settings-alert', err.message || 'Failed to update settings.', false);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Configuration';
        }
    }
}

async function loadCustomersAndBalances() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const [custRes, walletRes, pointsRes] = await Promise.all([
            client.from('customers').select('id, user_id, customer_name, customer_email, customer_phone, referral_code, created_at').order('created_at', { ascending: false }).limit(200),
            client.from('wallets').select('id, user_id, balance, currency'),
            client.from('customer_points').select('id, user_id, points_balance')
        ]);

        allWalletsMap = {};
        if (walletRes.data) {
            walletRes.data.forEach(w => {
                if (w.user_id) allWalletsMap[w.user_id] = w;
            });
        }

        allPointsMap = {};
        if (pointsRes.data) {
            pointsRes.data.forEach(p => {
                if (p.user_id) allPointsMap[p.user_id] = p;
            });
        }

        allCustomersData = custRes.data || [];

        // Update Overview Cards
        let totalWalletCirculation = 0;
        Object.values(allWalletsMap).forEach(w => {
            totalWalletCirculation += Number(w.balance || 0);
        });
        const statWallet = document.getElementById('stat-total-wallet');
        if (statWallet) statWallet.textContent = formatAdminCurrency(totalWalletCirculation);

        let totalPointsCirculation = 0;
        Object.values(allPointsMap).forEach(p => {
            totalPointsCirculation += Number(p.points_balance || 0);
        });
        const statPoints = document.getElementById('stat-total-points');
        if (statPoints) statPoints.textContent = `${totalPointsCirculation.toLocaleString('en-IN')} pts`;
        const statPointsInr = document.getElementById('stat-points-inr');
        if (statPointsInr) statPointsInr.textContent = `${formatAdminCurrency(totalPointsCirculation)} equivalent value`;

        // Populate dropdown in adjustment form
        const selectEl = document.getElementById('adj-target-user');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Choose Customer --</option>' +
                allCustomersData.map(c => {
                    const uId = c.user_id || c.id;
                    const wBal = allWalletsMap[uId]?.balance || 0;
                    const pBal = allPointsMap[uId]?.points_balance || 0;
                    const name = c.customer_name || 'Customer';
                    const phone = c.customer_phone || c.customer_email || 'No contact';
                    return `<option value="${uId}">${name} (${phone}) — Wallet: ₹${wBal} | Pts: ${pBal}</option>`;
                }).join('');
        }

        renderCustomersTable(allCustomersData);

    } catch (err) {
        console.error('Error loading customers and balances:', err);
    }
}

function renderCustomersTable(customers) {
    const tbody = document.getElementById('tbl-customers-body');
    const countLabel = document.getElementById('customer-count-label');
    if (countLabel) countLabel.textContent = `Showing ${customers.length} customer(s)`;
    if (!tbody) return;

    if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#7A7A7A;">No customer records found.</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(c => {
        const uId = c.user_id || c.id;
        const wBal = allWalletsMap[uId]?.balance || 0;
        const pBal = allPointsMap[uId]?.points_balance || 0;

        return `
            <tr>
                <td><strong>${escapeAdminHtml(c.customer_name || 'Customer')}</strong></td>
                <td>
                    <div>${escapeAdminHtml(c.customer_phone || '—')}</div>
                    <small style="color:#7A7A7A;">${escapeAdminHtml(c.customer_email || '')}</small>
                </td>
                <td><code style="background:#F5F2EC;padding:2px 6px;border-radius:4px;font-weight:600;color:#28212C;">${escapeAdminHtml(c.referral_code || '—')}</code></td>
                <td><strong style="color:#28212C;">${formatAdminCurrency(wBal)}</strong></td>
                <td><strong style="color:#8C6D3F;">${Number(pBal).toLocaleString('en-IN')} pts</strong></td>
                <td><small style="color:#888;">${String(uId).slice(0, 8)}…</small></td>
                <td>
                    <button class="admin-btn admin-btn-gold" style="padding:6px 12px;font-size:0.75rem;" onclick="selectCustomerForAdjustment('${uId}')">
                        Adjust
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterCustomerTable() {
    const query = (document.getElementById('customer-search-input')?.value || '').toLowerCase().trim();
    if (!query) {
        renderCustomersTable(allCustomersData);
        return;
    }

    const filtered = allCustomersData.filter(c => {
        return (c.customer_name || '').toLowerCase().includes(query) ||
               (c.customer_phone || '').toLowerCase().includes(query) ||
               (c.customer_email || '').toLowerCase().includes(query) ||
               (c.referral_code || '').toLowerCase().includes(query) ||
               (c.user_id || '').toLowerCase().includes(query);
    });

    renderCustomersTable(filtered);
}

function selectCustomerForAdjustment(userId) {
    const selectEl = document.getElementById('adj-target-user');
    if (selectEl) {
        selectEl.value = userId;
        selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function handleManualAdjustment(event) {
    if (event) event.preventDefault();
    const client = initAdminSupabase();
    if (!client) {
        showAdminAlert('adj-alert', 'Supabase client not initialized.', false);
        return;
    }

    const targetUserId = document.getElementById('adj-target-user')?.value;
    const type = document.getElementById('adj-type')?.value;
    const amount = Number(document.getElementById('adj-amount')?.value);
    const reason = document.getElementById('adj-reason')?.value?.trim();
    const adminEmail = document.getElementById('adj-admin-email')?.value?.trim() || 'admin@wishrite.com';

    if (!targetUserId) {
        showAdminAlert('adj-alert', 'Please select a customer.', false);
        return;
    }

    if (!amount || amount <= 0) {
        showAdminAlert('adj-alert', 'Please enter a valid positive amount/points.', false);
        return;
    }

    if (!reason || reason.length < 3) {
        showAdminAlert('adj-alert', 'A mandatory reason is required for the audit trail.', false);
        return;
    }

    const btn = document.getElementById('btn-submit-adj');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing Adjustment…';
    }

    try {
        const { data, error } = await client.rpc('admin_adjust_customer_balance', {
            p_target_user_id: targetUserId,
            p_type: type,
            p_amount: amount,
            p_reason: reason,
            p_admin_email: adminEmail
        });

        if (error) {
            console.error('Error applying adjustment:', error);
            showAdminAlert('adj-alert', error.message || 'Failed to apply adjustment.', false);
        } else if (data && !data.success) {
            showAdminAlert('adj-alert', data.error || 'Adjustment failed.', false);
        } else {
            showAdminAlert('adj-alert', `✓ Successfully recorded ${type} of ${amount}. New balance: ${data.new_balance}`, true);
            document.getElementById('adj-amount').value = '';
            document.getElementById('adj-reason').value = '';
            // Refresh customer balances and ledgers
            await Promise.all([
                loadCustomersAndBalances(),
                loadWalletLedger(),
                loadRewardLedger(),
                loadAuditLogs()
            ]);
        }
    } catch (err) {
        console.error('Exception applying adjustment:', err);
        showAdminAlert('adj-alert', err.message || 'Failed to apply adjustment.', false);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Apply & Record in Ledger';
        }
    }
}

async function loadWalletLedger() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('wallet_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        const tbody = document.getElementById('tbl-wallet-tx-body');
        if (!tbody) return;

        if (error || !data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#7A7A7A;">No wallet transactions recorded.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(tx => {
            const isCredit = Number(tx.amount) > 0;
            return `
                <tr>
                    <td><small>${formatAdminDate(tx.created_at)}</small></td>
                    <td><small>${String(tx.user_id).slice(0, 8)}…</small></td>
                    <td><span class="${isCredit ? 'badge-credit' : 'badge-debit'}">${escapeAdminHtml(tx.transaction_type)}</span></td>
                    <td><strong style="color:${isCredit ? '#2E7D32' : '#C62828'};">${isCredit ? '+' : ''}${formatAdminCurrency(tx.amount)}</strong></td>
                    <td>${formatAdminCurrency(tx.balance_after)}</td>
                    <td><small>${escapeAdminHtml(tx.reference_type || '—')}</small></td>
                    <td>${escapeAdminHtml(tx.description || '—')}</td>
                    <td><span class="badge-status">${escapeAdminHtml(tx.status || 'SUCCESS')}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading wallet ledger:', err);
    }
}

async function loadRewardLedger() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('reward_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        const tbody = document.getElementById('tbl-reward-tx-body');
        if (!tbody) return;

        if (error || !data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#7A7A7A;">No reward transactions recorded.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(tx => {
            const isCredit = Number(tx.points) > 0;
            return `
                <tr>
                    <td><small>${formatAdminDate(tx.created_at)}</small></td>
                    <td><small>${String(tx.user_id).slice(0, 8)}…</small></td>
                    <td><span class="${isCredit ? 'badge-credit' : 'badge-debit'}">${escapeAdminHtml(tx.transaction_type)}</span></td>
                    <td><strong style="color:${isCredit ? '#8C6D3F' : '#C62828'};">${isCredit ? '+' : ''}${Number(tx.points).toLocaleString('en-IN')} pts</strong></td>
                    <td>${Number(tx.points_balance_after || 0).toLocaleString('en-IN')} pts</td>
                    <td><small>${escapeAdminHtml(tx.reference_type || '—')}</small></td>
                    <td>${escapeAdminHtml(tx.description || '—')}</td>
                    <td><span class="badge-status">${escapeAdminHtml(tx.status || 'SUCCESS')}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading reward ledger:', err);
    }
}

async function loadReferrals() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('referrals')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        const tbody = document.getElementById('tbl-referrals-body');
        if (!tbody) return;

        const statTotal = document.getElementById('stat-total-referrals');
        const statRewarded = document.getElementById('stat-rewarded-referrals');

        if (data) {
            if (statTotal) statTotal.textContent = data.length.toString();
            const rewardedCount = data.filter(r => r.status === 'REWARDED').length;
            if (statRewarded) statRewarded.textContent = `${rewardedCount} rewarded after purchase`;
        }

        if (error || !data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#7A7A7A;">No referral relationships found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(ref => {
            const isRewarded = ref.status === 'REWARDED';
            return `
                <tr>
                    <td><small>${formatAdminDate(ref.created_at)}</small></td>
                    <td><small>${String(ref.referrer_user_id).slice(0, 8)}…</small></td>
                    <td><small>${String(ref.referred_user_id).slice(0, 8)}…</small></td>
                    <td><code>${escapeAdminHtml(ref.referral_code)}</code></td>
                    <td><span class="${isRewarded ? 'badge-credit' : 'badge-status'}">${escapeAdminHtml(ref.status)}</span></td>
                    <td><strong>${ref.reward_points ? `${ref.reward_points} pts` : '—'}</strong></td>
                    <td><small>${ref.first_order_id ? String(ref.first_order_id).slice(0, 8) + '…' : 'None yet'}</small></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading referrals:', err);
    }
}

async function loadAuditLogs() {
    const client = initAdminSupabase();
    if (!client) return;

    try {
        const { data, error } = await client
            .from('reward_admin_audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        const tbody = document.getElementById('tbl-audit-logs-body');
        if (!tbody) return;

        if (error || !data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#7A7A7A;">No manual adjustments logged.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(log => {
            return `
                <tr>
                    <td><small>${formatAdminDate(log.created_at)}</small></td>
                    <td><strong>${escapeAdminHtml(log.admin_email || 'admin')}</strong></td>
                    <td><small>${String(log.target_user_id).slice(0, 8)}…</small></td>
                    <td><span class="badge-status">${escapeAdminHtml(log.adjustment_type)}</span></td>
                    <td><strong>${Number(log.amount_or_points).toLocaleString('en-IN')}</strong></td>
                    <td>${escapeAdminHtml(log.reason || '—')}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading audit logs:', err);
    }
}

function escapeAdminHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadAllAdminData() {
    initAdminSupabase();
    await Promise.all([
        loadSettings(),
        loadCustomersAndBalances(),
        loadWalletLedger(),
        loadRewardLedger(),
        loadReferrals(),
        loadAuditLogs()
    ]);
}

document.addEventListener('DOMContentLoaded', () => {
    loadAllAdminData();
});
