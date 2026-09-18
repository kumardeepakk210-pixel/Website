/* ============================================
WISHRITE — CART & CHECKOUT
Cart state management, inventory stock checks,
pincode validation before order placement, dynamic shipping charges
============================================ */

let cart = [];
const FREE_SHIPPING_THRESHOLD = 1999;
const STANDARD_SHIPPING_FEE = 99;

function getShippingFee(subtotal) {
    if (subtotal <= 0) return 0;
    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

function addToCart(id, event, qtyToAdd = 1) {
    if (event) event.stopPropagation();
    const product = typeof getProductById === 'function'
        ? getProductById(id)
        : productsDB.find(p => p.id === id || String(p.id) === String(id));

    if (!product) return;

    // Out of stock guard: Requirement 19 & 28
    if (product.stockQuantity <= 0) {
        if (typeof openNotifyMeModal === 'function') {
            openNotifyMeModal(product.id);
        } else if (typeof showToast === 'function') {
            showToast(`"${product.name}" is currently unavailable.`, 'info');
        }
        return;
    }

    const requestedQty = Math.max(1, qtyToAdd);
    const existing = cart.find(item => item.id === product.id || String(item.id) === String(product.id));

    if (existing) {
        if (existing.qty + requestedQty > product.stockQuantity) {
            if (typeof showToast === 'function') {
                showToast(`Only ${product.stockQuantity} item(s) available in stock.`, 'warning');
            }
            existing.qty = product.stockQuantity;
        } else {
            existing.qty += requestedQty;
        }
    } else {
        const initialQty = Math.min(requestedQty, product.stockQuantity);
        cart.push({ ...product, qty: initialQty });
    }

    updateCartCount();
    renderCart();

    if (typeof showToast === 'function') {
        showToast(`Added "${product.name}" to your shopping bag.`, 'success');
    }

    // Button feedback
    if (event && event.target) {
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = "Added ✓";
        btn.style.background = "var(--wr-primary)";
        btn.style.color = "#FFF";
        btn.style.borderColor = "var(--wr-primary)";
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = "";
            btn.style.color = "";
            btn.style.borderColor = "";
        }, 1200);
    }
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id && String(item.id) !== String(id));
    updateCartCount();
    renderCart();
}

function clearCart() {
    cart = [];
    updateCartCount();
    renderCart();
}

function updateCartItemQty(id, delta) {
    const item = cart.find(c => c.id === id || String(c.id) === String(id));
    if (!item) return;

    const product = typeof getProductById === 'function' ? getProductById(id) : item;
    const maxStock = product?.stockQuantity || 99;

    if (delta > 0 && item.qty >= maxStock) {
        if (typeof showToast === 'function') {
            showToast(`Maximum available stock reached (${maxStock}).`, 'warning');
        }
        return;
    }

    item.qty = Math.max(1, item.qty + delta);
    updateCartCount();
    renderCart();
}

function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    const countEls = document.querySelectorAll('.cart-count-value');
    countEls.forEach(el => {
        el.textContent = totalItems;
        el.style.display = totalItems > 0 ? 'flex' : 'none';
    });
}

function getCartSubtotal() {
    return cart.reduce((sum, item) => sum + (item.sellingPrice * item.qty), 0);
}

function getCartTotal() {
    const subtotal = getCartSubtotal();
    const shipping = getShippingFee(subtotal);
    return subtotal + shipping;
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const summary = document.getElementById('cart-summary');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
                <div class="cart-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" stroke="var(--wr-primary)" fill="none" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <p style="margin-top:16px;font-size:1.1rem;color:var(--wr-text);">Your shopping bag is empty.</p>
                    <p style="color:var(--wr-text-muted);font-size:0.9rem;margin-bottom:24px;">Discover pure 925 sterling silver treasures to adorn your collection.</p>
                    <button class="btn btn-primary" onclick="navigateTo('shop')">Explore Jewellery</button>
                </div>
            `;
        if (summary) summary.style.display = 'none';
        return;
    }

    container.innerHTML = cart.map(item => {
        const imgSrc = item.images?.[0]?.url || item.image;
        return `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <img class="cart-item-image" src="${imgSrc}" alt="${item.name}" loading="lazy" width="90" height="90">
                        <div>
                            <span style="font-size:0.75rem;color:var(--wr-gold);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${item.sku || '925 SILVER'}</span>
                            <h4 class="cart-item-name" style="margin:2px 0 4px;font-size:0.95rem;">${item.name}</h4>
                            <p class="cart-item-price">${formatPrice(item.sellingPrice)}</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:var(--space-4)">
                        <div class="qty-controls">
                            <button class="qty-btn" onclick="updateCartItemQty('${item.id}', -1)" aria-label="Decrease">−</button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="updateCartItemQty('${item.id}', 1)" aria-label="Increase">+</button>
                        </div>
                        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
                    </div>
                </div>
            `;
    }).join('');

    if (summary) {
        summary.style.display = 'block';
        const subtotal = getCartSubtotal();
        const shipping = getShippingFee(subtotal);
        const total = subtotal + shipping;
        const savedPin = (typeof getSavedPincode === 'function') ? getSavedPincode() : null;

        summary.innerHTML = `
                <h3 style="font-family:var(--wr-font-heading);font-size:1.2rem;margin-bottom:16px;">Order Summary</h3>
                
                <div class="cart-summary-line">
                    <span>Subtotal</span>
                    <span>${formatPrice(subtotal)}</span>
                </div>

                <div class="cart-summary-line">
                    <span>Shipping</span>
                    <span>${shipping === 0 ? '<strong style="color:#2E7D32;">FREE</strong>' : formatPrice(shipping)}</span>
                </div>

                ${subtotal < FREE_SHIPPING_THRESHOLD ? `
                    <div class="free-shipping-progress">
                        <p style="font-size:0.8rem;color:var(--wr-text-muted);margin:0 0 6px;">Add <strong>${formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)}</strong> more for <strong>FREE Delivery</strong></p>
                        <div style="background:var(--wr-border);height:4px;border-radius:2px;overflow:hidden;">
                            <div style="background:var(--wr-primary);width:${Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100))}%;height:100%;"></div>
                        </div>
                    </div>
                ` : `
                    <div style="background:#F4EFEB;border:1px solid #E5D9D2;padding:8px 12px;border-radius:var(--radius-sm);margin:12px 0;font-size:0.8rem;color:var(--wr-primary);">
                        ✓ Congratulations! You have qualified for <strong>FREE Insured Express Delivery</strong>.
                    </div>
                `}

                <!-- Delivery Address PIN Code Verification -->
                <div class="checkout-pincode-box" style="margin:16px 0;padding:12px;background:var(--wr-bg-card);border:1px solid var(--wr-border);border-radius:var(--radius-md);">
                    <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:6px;">Delivery PIN Code <span style="color:#C62828;">*</span></label>
                    <div style="display:flex;gap:8px;">
                        <input 
                            type="text" 
                            id="checkout-pincode-input" 
                            maxlength="6" 
                            inputmode="numeric" 
                            value="${savedPin || ''}" 
                            placeholder="Enter 6-digit PIN" 
                            style="flex:1;padding:8px 12px;border:1px solid var(--wr-border);border-radius:var(--radius-sm);font-size:0.9rem;"
                            oninput="this.value=this.value.replace(/\\D/g,'')"
                        />
                        <button type="button" class="btn btn-outline btn-sm" onclick="validateCheckoutPincode()">Verify PIN</button>
                    </div>
                    <div id="checkout-pincode-msg" style="margin-top:8px;font-size:0.8rem;">
                        ${savedPin ? `<span style="color:#2E7D32;">✓ Serviceable to PIN code ${savedPin}</span>` : '<span style="color:var(--wr-text-muted);">Please verify your PIN code before checkout.</span>'}
                    </div>
                </div>

                <div class="cart-summary-line total" style="border-top:1px solid var(--wr-border);padding-top:12px;margin-top:12px;font-size:1.15rem;font-weight:600;">
                    <span>Total Amount</span>
                    <span id="cart-total" style="color:var(--wr-primary);">${formatPrice(total)}</span>
                </div>

                <button class="btn btn-primary btn-lg" style="width:100%;margin-top:16px;" onclick="proceedToCheckoutOrder()">
                    Proceed to Checkout
                </button>

                <div style="margin-top:12px;text-align:center;font-size:0.75rem;color:var(--wr-text-muted);display:flex;align-items:center;justify-content:center;gap:12px;">
                    <span>🔒 256-Bit SSL Encrypted</span>
                    <span>💎 925 Hallmark Assured</span>
                </div>
            `;
    }
}

let checkoutPincodeVerified = false;

async function validateCheckoutPincode() {
    const input = document.getElementById('checkout-pincode-input');
    const msg = document.getElementById('checkout-pincode-msg');
    if (!input || !msg) return false;

    const pin = input.value.trim();
    if (typeof isValidIndianPincode === 'function' && !isValidIndianPincode(pin)) {
        msg.innerHTML = `<span style="color:#C62828;">✕ Please enter a valid 6-digit Indian PIN code.</span>`;
        checkoutPincodeVerified = false;
        return false;
    }

    msg.innerHTML = `<span style="color:var(--wr-text-muted);">Verifying delivery serviceability...</span>`;

    try {
        const res = (typeof checkPincodeServiceability === 'function')
            ? await checkPincodeServiceability(pin)
            : { serviceable: true };

        if (res.serviceable) {
            msg.innerHTML = `<span style="color:#2E7D32;">✓ Delivery available to ${pin} (${res.estimatedDeliveryDate || '3-5 business days'}).</span>`;
            checkoutPincodeVerified = true;
            if (typeof savePincode === 'function') savePincode(pin);
            return true;
        } else {
            msg.innerHTML = `<span style="color:#C62828;">✕ Delivery is currently unavailable to PIN code ${pin}. Please provide an alternative delivery PIN.</span>`;
            checkoutPincodeVerified = false;
            return false;
        }
    } catch (e) {
        msg.innerHTML = `<span style="color:#C62828;">Unable to verify PIN code right now. Please try again.</span>`;
        checkoutPincodeVerified = false;
        return false;
    }
}

async function proceedToCheckoutOrder() {
    if (cart.length === 0) {
        showToast('Your cart is empty.', 'error');
        return;
    }

    // Ensure PIN code is valid and verified
    const input = document.getElementById('checkout-pincode-input');
    const pin = input
        ? input.value.trim()
        : (typeof getSavedPincode === 'function' ? getSavedPincode() : null);

    if (!pin || pin.length !== 6) {
        showToast('Please enter a valid 6-digit delivery PIN code.', 'error');
        if (input) input.focus();
        return;
    }

    const isValid = await validateCheckoutPincode();

    if (!isValid) {
        showToast(
            'Delivery is unavailable to the selected PIN code. Please change the delivery location.',
            'error'
        );
        return;
    }

    // Check stock again immediately before checkout
    for (const item of cart) {
        const product =
            typeof getProductById === 'function'
                ? getProductById(item.id)
                : item;

        if (product && product.stockQuantity <= 0) {
            showToast(
                `"${item.name}" is now out of stock. Please remove it from your bag to proceed.`,
                'error'
            );
            return;
        }

        if (
            product &&
            Number(item.qty) > Number(product.stockQuantity)
        ) {
            showToast(
                `Only ${product.stockQuantity} item(s) of "${item.name}" are available.`,
                'error'
            );
            return;
        }
    }

    openWishriteCheckoutModal(pin);
}

/* =========================================================
   WISHRITE CUSTOMER CHECKOUT MODAL
   Collects customer information before creating the order.
   ========================================================= */

function openWishriteCheckoutModal(pin) {
    const existingModal = document.getElementById('wishrite-checkout-modal');

    if (existingModal) {
        existingModal.remove();
    }

    const subtotal = getCartSubtotal();
    const shipping = getShippingFee(subtotal);
    const total = subtotal + shipping;

    const modal = document.createElement('div');

    modal.id = 'wishrite-checkout-modal';

    modal.innerHTML = `
        <div
            class="wishrite-checkout-overlay"
            onclick="closeWishriteCheckoutModal(event)"
        >
            <div
                class="wishrite-checkout-modal"
                onclick="event.stopPropagation()"
            >

                <div class="wishrite-checkout-header">
                    <div>
                        <span class="wishrite-checkout-eyebrow">
                            WISHRITE
                        </span>

                        <h2>
                            Complete Your Order
                        </h2>

                        <p>
                            Enter your delivery details to continue securely.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="wishrite-checkout-close"
                        onclick="closeWishriteCheckoutModal()"
                        aria-label="Close checkout"
                    >
                        ×
                    </button>
                </div>

                <div class="wishrite-checkout-body">

                    <div class="wishrite-checkout-order-summary">

                        <div>
                            <span>Subtotal</span>
                            <strong>${formatPrice(subtotal)}</strong>
                        </div>

                        <div>
                            <span>Shipping</span>
                            <strong>
                                ${shipping === 0
            ? 'FREE'
            : formatPrice(shipping)
        }
                            </strong>
                        </div>

                        <div class="wishrite-checkout-total">
                            <span>Total</span>
                            <strong>${formatPrice(total)}</strong>
                        </div>

                    </div>

                    <form
                        id="wishrite-customer-checkout-form"
                        onsubmit="submitWishriteCustomerCheckout(event)"
                    >

                        <div class="wishrite-form-section-title">
                            Contact Information
                        </div>

                        <div class="wishrite-form-grid">

                            <div class="wishrite-form-field">
                                <label for="checkout-customer-name">
                                    Full Name
                                    <span>*</span>
                                </label>

                                <input
                                    id="checkout-customer-name"
                                    type="text"
                                    autocomplete="name"
                                    placeholder="Enter your full name"
                                    required
                                    maxlength="100"
                                >
                            </div>

                            <div class="wishrite-form-field">
                                <label for="checkout-customer-phone">
                                    Mobile Number
                                    <span>*</span>
                                </label>

                                <input
                                    id="checkout-customer-phone"
                                    type="tel"
                                    autocomplete="tel"
                                    inputmode="numeric"
                                    placeholder="10-digit mobile number"
                                    maxlength="10"
                                    required
                                    oninput="this.value=this.value.replace(/\\D/g,'').slice(0,10)"
                                >
                            </div>

                        </div>

                        <div class="wishrite-form-field">
                            <label for="checkout-customer-email">
                                Email Address
                                <span>*</span>
                            </label>

                            <input
                                id="checkout-customer-email"
                                type="email"
                                autocomplete="email"
                                placeholder="you@example.com"
                                maxlength="150"
                                required
                            >
                        </div>

                        <div class="wishrite-form-section-title">
                            Delivery Address
                        </div>

                        <div class="wishrite-form-field">
                            <label for="checkout-customer-address">
                                Complete Address
                                <span>*</span>
                            </label>

                            <textarea
                                id="checkout-customer-address"
                                autocomplete="street-address"
                                placeholder="House / Flat / Building, Street, Area"
                                rows="3"
                                maxlength="500"
                                required
                            ></textarea>
                        </div>

                        <div class="wishrite-form-grid">

                            <div class="wishrite-form-field">
                                <label for="checkout-customer-city">
                                    City
                                    <span>*</span>
                                </label>

                                <input
                                    id="checkout-customer-city"
                                    type="text"
                                    autocomplete="address-level2"
                                    placeholder="City"
                                    maxlength="100"
                                    required
                                >
                            </div>

                            <div class="wishrite-form-field">
                                <label for="checkout-customer-state">
                                    State
                                    <span>*</span>
                                </label>

                                <input
                                    id="checkout-customer-state"
                                    type="text"
                                    autocomplete="address-level1"
                                    placeholder="State"
                                    maxlength="100"
                                    required
                                >
                            </div>

                        </div>

                        <div class="wishrite-form-grid">

                            <div class="wishrite-form-field">

                                <label for="checkout-customer-pin">
                                    PIN Code
                                    <span>*</span>
                                </label>

                                <input
                                    id="checkout-customer-pin"
                                    type="text"
                                    inputmode="numeric"
                                    autocomplete="postal-code"
                                    placeholder="6-digit PIN"
                                    value="${pin || ''}"
                                    maxlength="6"
                                    required
                                >

                                <div id="checkout-pin-status" class="wishrite-pin-status" aria-live="polite"></div>

                            </div>

                            <div class="wishrite-form-field">

                                <label for="checkout-customer-country">
                                    Country
                                </label>

                                <input
                                    id="checkout-customer-country"
                                    type="text"
                                    value="India"
                                    readonly
                                    style="background:#f7f4f1;"
                                >

                            </div>

                        </div>

                        <div
                            id="wishrite-checkout-form-error"
                            class="wishrite-checkout-form-error"
                            style="display:none;"
                        ></div>

                        <button
                            id="wishrite-create-order-button"
                            type="submit"
                            class="btn btn-primary btn-lg wishrite-create-order-btn"
                        >
                            Continue to Secure Payment
                        </button>

                        <div class="wishrite-checkout-security">
                            <span>🔒 Secure Checkout</span>
                            <span>•</span>
                            <span>Razorpay</span>
                            <span>•</span>
                            <span>925 Silver</span>
                        </div>

                    </form>

                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.body.style.overflow = 'hidden';

    // Initialize auto City & State lookup on PIN entry
    initCheckoutPinLookup(pin);

    setTimeout(() => {
        const nameInput = document.getElementById(
            'checkout-customer-name'
        );

        if (nameInput) {
            nameInput.focus();
        }
    }, 100);
}


function closeWishriteCheckoutModal(event) {
    if (
        event &&
        event.target &&
        !event.target.classList.contains('wishrite-checkout-overlay')
    ) {
        return;
    }

    const modal = document.getElementById('wishrite-checkout-modal');

    if (modal) {
        modal.remove();
    }

    document.body.style.overflow = '';
}

/**
 * Handles automatic City & State population when customer enters a 6-digit PIN code.
 * Preserves manual edits, protects against race conditions, and caches results per session.
 */
function initCheckoutPinLookup(initialPin) {
    const pinInput = document.getElementById('checkout-customer-pin');
    const cityInput = document.getElementById('checkout-customer-city');
    const stateInput = document.getElementById('checkout-customer-state');
    const statusEl = document.getElementById('checkout-pin-status');

    if (!pinInput || !cityInput || !stateInput) return;

    let pinLookupRequestId = 0;
    let lastLookupPin = '';
    let cityAutoFilled = false;
    let stateAutoFilled = false;
    let debounceTimer = null;

    // Track customer manual inputs on City and State
    cityInput.addEventListener('input', () => {
        cityAutoFilled = false;
    });

    stateInput.addEventListener('input', () => {
        stateAutoFilled = false;
    });

    const setStatus = (type, message) => {
        if (!statusEl) return;
        statusEl.className = 'wishrite-pin-status' + (type ? ` ${type}` : '');
        if (type === 'loading') {
            statusEl.innerHTML = '<span class="wishrite-pin-spinner"></span> <span>Checking PIN code...</span>';
        } else if (message) {
            statusEl.textContent = message;
        } else {
            statusEl.textContent = '';
        }
    };

    const performLookup = async (rawPin) => {
        const cleaned = String(rawPin || '').replace(/\D/g, '').slice(0, 6);
        if (cleaned.length !== 6) return;

        lastLookupPin = cleaned;
        const currentRequestId = ++pinLookupRequestId;
        setStatus('loading');

        try {
            const lookupFn = (typeof lookupPincodeLocation === 'function')
                ? lookupPincodeLocation
                : (typeof window !== 'undefined' && typeof window.lookupPincodeLocation === 'function' ? window.lookupPincodeLocation : null);

            let res;
            if (lookupFn) {
                res = await lookupFn(cleaned);
            } else {
                const resp = await fetch(`https://api.postalpincode.in/pincode/${cleaned}`);
                const data = await resp.json();
                if (data?.[0]?.Status === 'Success' && Array.isArray(data[0].PostOffice) && data[0].PostOffice[0]) {
                    const po = data[0].PostOffice[0];
                    res = {
                        success: true,
                        valid: true,
                        city: (po.District || po.Division || po.Block || '').trim(),
                        state: (po.State || '').trim()
                    };
                } else {
                    res = { success: false, invalid: true, error: 'Please enter a valid PIN code.' };
                }
            }

            // Stale lookup response protection against race conditions
            if (currentRequestId !== pinLookupRequestId) return;

            if (res && res.valid && res.success) {
                const summaryParts = [];

                if (res.city) {
                    cityInput.value = res.city;
                    cityAutoFilled = true;
                    cityInput.classList.remove('wishrite-field-autopopulated');
                    void cityInput.offsetWidth;
                    cityInput.classList.add('wishrite-field-autopopulated');
                    summaryParts.push(res.city);
                }

                if (res.state) {
                    stateInput.value = res.state;
                    stateAutoFilled = true;
                    stateInput.classList.remove('wishrite-field-autopopulated');
                    void stateInput.offsetWidth;
                    stateInput.classList.add('wishrite-field-autopopulated');
                    summaryParts.push(res.state);
                }

                const summary = summaryParts.join(', ') || [res.city, res.state].filter(Boolean).join(', ');
                setStatus('success', `✓ ${summary || 'PIN code verified'}`);

                if (typeof savePincode === 'function') {
                    savePincode(cleaned);
                }
            } else if (res && res.invalid) {
                setStatus('error', 'Please enter a valid PIN code.');
            } else {
                // Non-blocking fallback: lookup service unreachable
                setStatus('warning', "We couldn't verify this PIN code. Please check your City and State.");
            }
        } catch (err) {
            if (currentRequestId !== pinLookupRequestId) return;
            setStatus('warning', "We couldn't verify this PIN code. Please check your City and State.");
        }
    };

    pinInput.addEventListener('input', (e) => {
        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
        e.target.value = cleaned;

        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }

        if (cleaned.length < 6) {
            // When customer changes/deletes the PIN, clear previously auto-filled City/State
            if (cityAutoFilled) {
                cityInput.value = '';
                cityAutoFilled = false;
            }
            if (stateAutoFilled) {
                stateInput.value = '';
                stateAutoFilled = false;
            }
            lastLookupPin = '';
            setStatus('', '');
            return;
        }

        if (cleaned === lastLookupPin) {
            return;
        }

        debounceTimer = setTimeout(() => {
            performLookup(cleaned);
        }, 300);
    });

    // Run lookup immediately on modal open if a 6-digit PIN is already provided
    const initialCleaned = String(initialPin || pinInput.value || '').replace(/\D/g, '').slice(0, 6);
    if (initialCleaned.length === 6) {
        performLookup(initialCleaned);
    }
}



function generateOrderNumber() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const ms = pad(now.getMilliseconds(), 3);
    return `WR-${yyyy}${mm}${dd}${hh}${min}${ss}${ms}`;
}

let isCreatingRazorpayOrder = false;

function loadRazorpaySdk() {
    return new Promise((resolve, reject) => {
        if (typeof window.Razorpay === 'function') {
            resolve(window.Razorpay);
            return;
        }

        const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.Razorpay));
            existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout SDK.')));
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve(window.Razorpay);
        script.onerror = () => reject(new Error('Failed to load Razorpay Checkout SDK. Please check your connection.'));
        document.head.appendChild(script);
    });
}

async function proceedToRazorpayPayment(internalOrderId) {
    if (isCreatingRazorpayOrder) return;

    if (window.wishritePendingCheckout?.is_completed) {
        showCheckoutFormError('This order has already been verified and confirmed.', true);
        return;
    }

    if (!internalOrderId) {
        internalOrderId = window.wishritePendingCheckout?.internal_order_id;
    }

    if (!internalOrderId) {
        showCheckoutFormError('Order information is missing. Please check your details and try again.');
        return;
    }

    const submitButton = document.getElementById('wishrite-create-order-button');
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);

    if (!client) {
        showCheckoutFormError('Supabase client is not available. Please refresh the page and try again.');
        return;
    }

    isCreatingRazorpayOrder = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = 'Connecting to Secure Payment…';
    }

    try {
        await loadRazorpaySdk();

        const { data: efData, error: efError } = await client.functions.invoke('create-razorpay-order', {
            body: {
                order_id: internalOrderId
            }
        });

        if (efError) {
            console.error('create-razorpay-order invocation error:', efError.message || efError);
            throw new Error(efError.message || 'Unable to initiate payment with payment gateway.');
        }

        if (!efData || !efData.success || !efData.order_id || !efData.key_id) {
            console.error('create-razorpay-order invalid response:', efData?.error || 'Missing required payment data.');
            throw new Error(efData?.error || 'Invalid payment response received from server.');
        }

        const pending = window.wishritePendingCheckout || {};

        const razorpayOptions = {
            key: efData.key_id,
            amount: efData.amount,
            currency: efData.currency || 'INR',
            name: 'WishRite',
            description: 'Premium 925 Silver Jewellery',
            order_id: efData.order_id,
            prefill: {
                name: pending.customer_name || '',
                email: pending.customer_email || '',
                contact: pending.customer_phone || ''
            },
            theme: {
                color: '#5E3435'
            },
            modal: {
                ondismiss: function () {
                    isCreatingRazorpayOrder = false;
                    if (window.wishritePendingCheckout?.is_completed) {
                        return;
                    }
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.innerHTML = 'Continue to Secure Payment';
                    }
                    showCheckoutFormError(
                        'Payment was not completed. You can try again whenever you are ready.',
                        false
                    );
                }
            },
            handler: async function (response) {
                // Prevent duplicate clicks while verification is underway
                isCreatingRazorpayOrder = true;

                const pending = window.wishritePendingCheckout || {};
                const orderIdToVerify = pending.internal_order_id || internalOrderId;
                const orderNumber = pending.order_number || '';

                // Prevent accidental double execution of the success flow
                if (window.wishritePendingCheckout?.is_completed) {
                    return;
                }

                // Safe diagnostic logging (no personal data, secrets, or signatures)
                console.log('Razorpay payment response received:', {
                    internal_order_id: orderIdToVerify,
                    razorpay_order_id: response?.razorpay_order_id
                });

                // Preserve internal order ID and record payment response identifiers
                if (window.wishritePendingCheckout) {
                    window.wishritePendingCheckout.razorpay_payment_id = response.razorpay_payment_id;
                    window.wishritePendingCheckout.razorpay_order_id = response.razorpay_order_id;
                    window.wishritePendingCheckout.razorpay_signature = response.razorpay_signature;
                }

                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.innerHTML = 'Verifying Payment…';
                }

                showCheckoutFormError(
                    'Payment received. Verifying transaction with secure server…',
                    true
                );

                try {
                    const { data: verifyData, error: verifyError } = await client.functions.invoke(
                        'verify-razorpay-payment',
                        {
                            body: {
                                internal_order_id: orderIdToVerify,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature
                            }
                        }
                    );

                    if (verifyError) {
                        console.error('verify-razorpay-payment invocation failed:', {
                            internal_order_id: orderIdToVerify,
                            razorpay_order_id: response?.razorpay_order_id,
                            error: verifyError.message || verifyError
                        });
                        throw new Error(verifyError.message || 'Payment verification failed on the server.');
                    }

                    // Require: verifyData.success === true AND verifyData.verified === true
                    if (!verifyData || verifyData.success !== true || verifyData.verified !== true) {
                        console.error('verify-razorpay-payment rejected payment:', {
                            internal_order_id: orderIdToVerify,
                            razorpay_order_id: response?.razorpay_order_id,
                            error: verifyData?.error || 'Unverified payment response.'
                        });
                        throw new Error(verifyData?.error || 'Payment signature verification failed.');
                    }

                    // Guard against accidental double execution
                    if (window.wishritePendingCheckout?.is_completed) {
                        return;
                    }

                    // Success: payment verified by server and recorded in public.orders
                    console.log('Payment verified successfully:', {
                        internal_order_id: orderIdToVerify,
                        razorpay_order_id: verifyData.razorpay_order_id || response.razorpay_order_id,
                        payment_status: verifyData.payment_status || 'paid',
                        order_status: verifyData.order_status || 'processing'
                    });

                    // Preserve pending checkout info and mark completed
                    if (window.wishritePendingCheckout) {
                        window.wishritePendingCheckout.is_completed = true;
                        window.wishritePendingCheckout.payment_status = verifyData.payment_status || 'paid';
                        window.wishritePendingCheckout.order_status = verifyData.order_status || 'processing';
                    }

                    // Clear the shopping cart using existing project cart-clear mechanism
                    clearCart();

                    // Render luxury WishRite Order Confirmation UI immediately after cart is cleared
                    renderWishriteOrderConfirmation(window.wishritePendingCheckout, verifyData);

                    isCreatingRazorpayOrder = false;

                } catch (verifyErr) {
                    isCreatingRazorpayOrder = false;
                    console.error('Payment verification failed:', {
                        internal_order_id: orderIdToVerify,
                        error: verifyErr.message || verifyErr
                    });

                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.innerHTML = 'Continue to Secure Payment';
                    }

                    showCheckoutFormError(
                        verifyErr.message || 'Payment verification failed. Please try again or contact support.',
                        false
                    );
                }
            }
        };

        const rzp = new window.Razorpay(razorpayOptions);

        rzp.on('payment.failed', function (failureResponse) {
            isCreatingRazorpayOrder = false;
            console.error('Razorpay payment failed:', {
                code: failureResponse.error?.code,
                description: failureResponse.error?.description,
                reason: failureResponse.error?.reason
            });

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = 'Continue to Secure Payment';
            }

            showCheckoutFormError(
                failureResponse.error?.description || 'Payment was unsuccessful. Please try again or use another payment method.'
            );
        });

        rzp.open();

    } catch (err) {
        isCreatingRazorpayOrder = false;
        console.error('Razorpay checkout error:', err.message || err);

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Continue to Secure Payment';
        }

        showCheckoutFormError(err.message || 'Unable to open secure checkout. Please try again.');
    }
}

async function submitWishriteCustomerCheckout(event) {
    if (event) event.preventDefault();

    // Prevent duplicate clicks if order creation or Razorpay invocation is in progress
    if (isCreatingRazorpayOrder) return;

    if (window.wishritePendingCheckout?.is_completed) {
        showCheckoutFormError('This order has already been verified and confirmed.', true);
        return;
    }

    // If order was already created in this checkout session, proceed directly to Razorpay
    if (window.wishritePendingCheckout?.internal_order_id) {
        await proceedToRazorpayPayment(window.wishritePendingCheckout.internal_order_id);
        return;
    }

    const errorEl = document.getElementById(
        'wishrite-checkout-form-error'
    );

    const submitButton = document.getElementById(
        'wishrite-create-order-button'
    );

    const name = document
        .getElementById('checkout-customer-name')
        ?.value
        .trim();

    const phone = document
        .getElementById('checkout-customer-phone')
        ?.value
        .trim();

    const email = document
        .getElementById('checkout-customer-email')
        ?.value
        .trim();

    const address = document
        .getElementById('checkout-customer-address')
        ?.value
        .trim();

    const city = document
        .getElementById('checkout-customer-city')
        ?.value
        .trim();

    const state = document
        .getElementById('checkout-customer-state')
        ?.value
        .trim();

    const pin = document
        .getElementById('checkout-customer-pin')
        ?.value
        .trim();

    if (!name || name.length < 2) {
        showCheckoutFormError('Please enter your full name.');
        return;
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
        showCheckoutFormError(
            'Please enter a valid 10-digit Indian mobile number.'
        );
        return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showCheckoutFormError(
            'Please enter a valid email address.'
        );
        return;
    }

    if (!address || address.length < 5) {
        showCheckoutFormError(
            'Please enter your complete delivery address.'
        );
        return;
    }

    if (!city) {
        showCheckoutFormError('Please enter your city.');
        return;
    }

    if (!state) {
        showCheckoutFormError('Please enter your state.');
        return;
    }

    if (!/^\d{6}$/.test(pin)) {
        showCheckoutFormError(
            'Please enter a valid 6-digit PIN code.'
        );
        return;
    }

    const subtotal = getCartSubtotal();
    const shipping = getShippingFee(subtotal);
    const total = subtotal + shipping;

    if (!Number.isFinite(total) || total <= 0) {
        showCheckoutFormError(
            'Unable to calculate the order total. Please try again.'
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = 'Creating Secure Order…';
    }

    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }

    try {
        const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
        if (!client) {
            throw new Error('Supabase client is not available. Please refresh the page and try again.');
        }

        const internalOrderId = crypto.randomUUID();
        const orderNumber = generateOrderNumber();

        const orderPayload = {
            id: internalOrderId,
            order_number: orderNumber,
            customer_name: name,
            customer_phone: phone,
            customer_email: email,
            customer_address: address,
            customer_city: city,
            customer_state: state,
            customer_country: 'India',
            customer_pin: pin,
            subtotal: Number(subtotal),
            discount: 0,
            shipping_charge: Number(shipping),
            tax: 0,
            grand_total: Number(total),
            currency: 'INR',
            payment_method: 'razorpay',
            payment_status: 'pending',
            order_status: 'pending'
        };

        // 1. Insert order record into public.orders without SELECT/RETURNING
        const { error: orderError } = await client
            .from('orders')
            .insert([orderPayload]);

        if (orderError) {
            console.error('WishRite orders insert error:', orderError.message || orderError);
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = 'Continue to Secure Payment';
            }
            showCheckoutFormError(orderError.message || 'Unable to create your order. Please try again.');
            return;
        }

        // 2. Prepare and insert order_items for every item in cart
        const orderItemsPayload = cart.map(item => {
            const product = (typeof getProductById === 'function') ? getProductById(item.id) : null;
            const inventoryId = item.inventory_id || item.inventoryId || product?.id || item.id;
            const quantity = Number(item.qty) || 1;
            const unitPrice = Number(item.sellingPrice !== undefined ? item.sellingPrice : (item.price || 0));
            const lineTotal = quantity * unitPrice;
            const productCode = item.productCode || item.product_code || item.sku || product?.productCode || '';
            const productName = item.name || product?.name || 'WishRite Jewellery';
            const size = item.size || product?.size || null;

            return {
                order_id: internalOrderId,
                inventory_id: inventoryId,
                product_code: productCode,
                product_name: productName,
                quantity: quantity,
                unit_price: unitPrice,
                line_total: lineTotal,
                size: size
            };
        });

        const { error: itemsError } = await client
            .from('order_items')
            .insert(orderItemsPayload);

        if (itemsError) {
            console.error('WishRite order_items insert error:', itemsError.message || itemsError);
            // Attempt to clean up newly created pending order header so no orphan record remains
            try {
                await client.from('orders').delete().eq('id', internalOrderId);
            } catch (cleanupErr) {
                console.error('Failed to clean up pending order header:', cleanupErr.message || cleanupErr);
            }

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = 'Continue to Secure Payment';
            }
            showCheckoutFormError(itemsError.message || 'Unable to save items for your order. Please try again.');
            return;
        }

        // 3. Store pending checkout details in window.wishritePendingCheckout
        const orderItemsWithImages = orderItemsPayload.map((oi, idx) => {
            const cartItem = cart[idx];
            const product = (typeof getProductById === 'function') ? getProductById(oi.inventory_id) : null;
            const img = cartItem?.images?.[0]?.url || cartItem?.image || product?.images?.[0]?.url || product?.image || '';
            return {
                ...oi,
                image: img
            };
        });

        window.wishritePendingCheckout = {
            internal_order_id: internalOrderId,
            order_number: orderNumber,
            customer_name: name,
            customer_phone: phone,
            customer_email: email,
            customer_address: address,
            customer_city: city,
            customer_state: state,
            customer_country: 'India',
            customer_pin: pin,
            subtotal: Number(subtotal),
            shipping_charge: Number(shipping),
            grand_total: Number(total),
            currency: 'INR',
            items: orderItemsWithImages
        };

        // 4. Directly proceed to Razorpay Checkout
        await proceedToRazorpayPayment(internalOrderId);

    } catch (error) {
        console.error('WishRite checkout error:', error.message || error);

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Continue to Secure Payment';
        }

        showCheckoutFormError(error.message || 'Something went wrong. Please try again.');
    }
}


function showCheckoutFormError(message, success = false) {
    const errorEl = document.getElementById(
        'wishrite-checkout-form-error'
    );

    if (!errorEl) {
        showToast(
            message,
            success ? 'success' : 'error'
        );
        return;
    }

    errorEl.textContent = message;
    errorEl.style.display = 'block';

    errorEl.style.color = success
        ? '#2E7D32'
        : '#C62828';

    errorEl.style.background = success
        ? '#F1F8F3'
        : '#FFF5F5';

    errorEl.style.borderColor = success
        ? '#B7DDBF'
        : '#E5B8B8';
}


/**
 * Helper to escape HTML characters securely
 */
function escapeWishriteHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Ensures the luxury Order Confirmation CSS is injected in document.head
 * regardless of external stylesheet caching or latency.
 */
function ensureWishriteConfirmationStyles() {
    if (document.getElementById('wishrite-confirmation-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'wishrite-confirmation-styles';
    styleEl.textContent = `
        .wishrite-checkout-overlay.wishrite-confirm-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 36px 16px 60px;
            background: rgba(18, 12, 12, 0.78);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        .wishrite-confirmation-modal {
            width: 100%;
            max-width: 1120px;
            background: #FFFFFF;
            border-radius: 16px;
            border: 1px solid rgba(184, 149, 106, 0.32);
            box-shadow: 0 25px 70px rgba(0, 0, 0, 0.22), 0 10px 25px rgba(94, 52, 53, 0.12);
            margin: 0 auto;
            padding: 36px 42px 48px;
            position: relative;
            box-sizing: border-box;
            animation: wrConfirmAppear 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #333333;
        }

        @keyframes wrConfirmAppear {
            from {
                opacity: 0;
                transform: translateY(18px) scale(0.99);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .wishrite-confirm-header-bar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: -16px;
        }

        .wishrite-confirm-close-btn {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: 1px solid #E5DFD9;
            background: #FAF8F5;
            color: #5E3435;
            font-size: 1.3rem;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .wishrite-confirm-close-btn:hover {
            background: #5E3435;
            color: #FFFFFF;
            border-color: #5E3435;
        }

        .wishrite-confirm-close-btn:focus-visible {
            outline: 2px solid #5E3435;
            outline-offset: 2px;
        }

        /* Hero Section */
        .wishrite-confirm-hero {
            text-align: center;
            padding: 4px 16px 28px;
        }

        .wishrite-confirm-badge-wrap {
            width: 72px;
            height: 72px;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            box-shadow: 0 8px 24px rgba(94, 52, 53, 0.14);
        }

        .wishrite-confirm-badge-svg {
            width: 72px;
            height: 72px;
            display: block;
        }

        .wishrite-confirm-badge-bg {
            fill: #FAF6F2;
            stroke: rgba(184, 149, 106, 0.35);
            stroke-width: 1.2;
        }

        .wishrite-confirm-badge-ring {
            fill: none;
            stroke: #5E3435;
            stroke-width: 2.4;
            stroke-dasharray: 202;
            stroke-dashoffset: 202;
            transform-origin: center;
            transform: rotate(-90deg);
            animation: wrRingDraw 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        .wishrite-confirm-badge-check {
            fill: none;
            stroke: #B8956A;
            stroke-width: 3.2;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: 45;
            stroke-dashoffset: 45;
            animation: wrCheckDraw 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) 0.32s forwards;
        }

        @keyframes wrRingDraw {
            to { stroke-dashoffset: 0; }
        }

        @keyframes wrCheckDraw {
            to { stroke-dashoffset: 0; }
        }

        .wishrite-confirm-eyebrow {
            display: block;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 4px;
            color: #9A7778;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .wishrite-confirm-title {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 2.3rem;
            font-weight: 500;
            color: #5E3435;
            margin: 0 0 8px;
            letter-spacing: -0.01em;
        }

        .wishrite-confirm-thankyou {
            font-size: 1.12rem;
            font-weight: 600;
            color: #1A1A1A;
            margin: 0 0 6px;
        }

        .wishrite-confirm-subtitle {
            font-size: 0.95rem;
            color: #6B6B6B;
            max-width: 540px;
            margin: 0 auto;
            line-height: 1.55;
        }

        /* Horizontal Status Card */
        .wishrite-confirm-status-card {
            display: grid;
            grid-template-columns: 1.3fr 1fr 1fr 0.8fr;
            background: #FAF8F5;
            border: 1px solid #ECE4DC;
            border-radius: 12px;
            padding: 18px 24px;
            margin-bottom: 30px;
            align-items: center;
            box-shadow: 0 2px 8px rgba(94, 52, 53, 0.03);
            box-sizing: border-box;
        }

        .wishrite-status-col {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 0 14px;
            border-right: 1px solid #EAE1D9;
        }

        .wishrite-status-col:first-child {
            padding-left: 0;
        }

        .wishrite-status-col:last-child {
            padding-right: 0;
            border-right: none;
        }

        .wishrite-status-label {
            font-size: 0.72rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #8C7C75;
        }

        .wishrite-status-value {
            font-size: 0.95rem;
            font-weight: 600;
            color: #1A1A1A;
        }

        .wishrite-order-number-val {
            font-family: 'SF Mono', Monaco, Consolas, monospace;
            font-size: 0.86rem;
            letter-spacing: 0.2px;
            color: #5E3435;
            word-break: break-all;
        }

        /* Subtle Status Pills */
        .wishrite-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            width: fit-content;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        .wishrite-pill-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
        }

        .wishrite-pill-paid {
            background: #EAF5EE;
            color: #167946;
            border: 1px solid #C4E6D0;
        }

        .wishrite-pill-paid .wishrite-pill-dot {
            background: #167946;
        }

        .wishrite-pill-processing {
            background: #FDF7EB;
            color: #9B6C1A;
            border: 1px solid #F5E1B5;
        }

        .wishrite-pill-processing .wishrite-pill-dot {
            background: #B8956A;
        }

        /* Two Column Grid */
        .wishrite-confirm-grid {
            display: grid;
            grid-template-columns: 1.55fr 1fr;
            gap: 28px;
            align-items: start;
        }

        .wishrite-confirm-main-col {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .wishrite-confirm-side-col {
            position: sticky;
            top: 24px;
        }

        /* Cards */
        .wishrite-card {
            background: #FAF8F5;
            border: 1px solid #ECE4DC;
            border-radius: 14px;
            padding: 24px 28px;
            box-shadow: 0 2px 10px rgba(94, 52, 53, 0.03);
            box-sizing: border-box;
        }

        .wishrite-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 14px;
            margin-bottom: 18px;
            border-bottom: 1px solid #EAE1D9;
        }

        .wishrite-card-title-group {
            display: flex;
            align-items: baseline;
            gap: 10px;
        }

        .wishrite-card-title {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 1.22rem;
            font-weight: 600;
            color: #5E3435;
            margin: 0;
        }

        .wishrite-card-subtitle {
            font-size: 0.78rem;
            color: #8C7C75;
            font-weight: 500;
        }

        /* Product Card List */
        .wishrite-products-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .wishrite-product-row {
            display: flex;
            align-items: center;
            gap: 18px;
            padding-bottom: 16px;
            border-bottom: 1px solid #EDE5DE;
        }

        .wishrite-product-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .wishrite-product-img-wrap {
            flex: 0 0 84px;
            width: 84px;
            height: 84px;
            border-radius: 10px;
            overflow: hidden;
            background: #FFFFFF;
            border: 1px solid #E5DFD9;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wishrite-product-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .wishrite-product-img-fallback {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            background: #F4EFEB;
            color: #7A4E4F;
        }

        .wishrite-product-info {
            flex: 1;
            min-width: 0;
        }

        .wishrite-product-name {
            font-size: 1rem;
            font-weight: 600;
            color: #1A1A1A;
            line-height: 1.35;
            margin: 0 0 6px;
        }

        .wishrite-product-meta-tags {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            font-size: 0.78rem;
        }

        .wishrite-sku-tag {
            font-family: 'SF Mono', Monaco, Consolas, monospace;
            font-size: 0.75rem;
            background: #F0ECE7;
            color: #6B6B6B;
            padding: 2px 8px;
            border-radius: 4px;
        }

        .wishrite-size-tag {
            background: rgba(94, 52, 53, 0.08);
            color: #5E3435;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 500;
        }

        .wishrite-qty-tag {
            color: #6B6B6B;
            font-weight: 500;
        }

        .wishrite-product-pricing {
            text-align: right;
            flex: 0 0 auto;
            padding-left: 12px;
        }

        .wishrite-product-line-total {
            display: block;
            font-size: 1.05rem;
            font-weight: 600;
            color: #5E3435;
        }

        .wishrite-product-unit-price {
            display: block;
            font-size: 0.76rem;
            color: #8C7C75;
            margin-top: 2px;
        }

        /* Delivery Grid */
        .wishrite-delivery-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }

        .wishrite-delivery-col {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .wishrite-delivery-subhead {
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #8C7C75;
            margin-bottom: 4px;
        }

        .wishrite-delivery-name {
            font-size: 1.02rem;
            font-weight: 600;
            color: #1A1A1A;
            margin: 0;
        }

        .wishrite-delivery-contact-line {
            font-size: 0.88rem;
            color: #4A3E3E;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .wishrite-delivery-address-line {
            font-size: 0.9rem;
            color: #3D3535;
            line-height: 1.45;
            margin: 0;
        }

        /* Price Card */
        .wishrite-price-card {
            background: #FAF8F5;
        }

        .wishrite-price-rows {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .wishrite-price-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.92rem;
            color: #6B6B6B;
        }

        .wishrite-price-val {
            font-weight: 600;
            color: #1A1A1A;
        }

        .wishrite-shipping-val {
            color: #167946;
        }

        .wishrite-price-divider {
            height: 1px;
            background: #E5DFD9;
            margin: 4px 0;
        }

        .wishrite-grand-total-row {
            margin-top: 4px;
            padding: 16px 18px;
            background: #F4EFEB;
            border: 1px solid rgba(184, 149, 106, 0.35);
            border-radius: 10px;
        }

        .wishrite-grand-total-labels {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .wishrite-grand-label {
            font-size: 1rem;
            font-weight: 600;
            color: #5E3435;
        }

        .wishrite-grand-currency {
            font-size: 0.72rem;
            color: #8C7C75;
        }

        .wishrite-grand-val-wrap {
            text-align: right;
        }

        .wishrite-grand-total-val {
            font-size: 1.45rem;
            font-weight: 700;
            color: #5E3435;
            display: block;
            line-height: 1.1;
        }

        .wishrite-grand-total-code {
            font-size: 0.75rem;
            font-weight: 600;
            color: #8C7C75;
        }

        .wishrite-confirm-actions-wrap {
            margin-top: 24px;
        }

        .wishrite-confirm-continue-btn {
            width: 100%;
            height: 52px;
            background: #5E3435;
            color: #FFFFFF;
            border: 1px solid #5E3435;
            border-radius: 10px;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 6px 18px rgba(94, 52, 53, 0.22);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .wishrite-confirm-continue-btn:hover {
            background: #4A2829;
            border-color: #4A2829;
            transform: translateY(-1px);
            box-shadow: 0 8px 24px rgba(94, 52, 53, 0.3);
        }

        .wishrite-confirm-continue-btn:focus-visible {
            outline: 2px solid #5E3435;
            outline-offset: 2px;
        }

        .wishrite-guarantee-note {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 18px;
            font-size: 0.76rem;
            color: #8C7C75;
            letter-spacing: 0.2px;
        }

        /* Responsive Styles */
        @media (max-width: 900px) {
            .wishrite-confirm-grid {
                grid-template-columns: 1fr;
                gap: 24px;
            }

            .wishrite-confirm-side-col {
                position: static;
            }

            .wishrite-confirm-status-card {
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                padding: 16px 18px;
            }

            .wishrite-status-col {
                border-right: none;
                padding: 0;
            }
        }

        @media (max-width: 600px) {
            .wishrite-checkout-overlay.wishrite-confirm-overlay {
                padding: 12px 8px 30px;
            }

            .wishrite-confirmation-modal {
                padding: 22px 18px 32px;
                border-radius: 12px;
            }

            .wishrite-confirm-title {
                font-size: 1.65rem;
            }

            .wishrite-confirm-thankyou {
                font-size: 1rem;
            }

            .wishrite-confirm-status-card {
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                padding: 14px;
            }

            .wishrite-product-row {
                gap: 12px;
                align-items: flex-start;
            }

            .wishrite-product-img-wrap {
                flex: 0 0 64px;
                width: 64px;
                height: 64px;
            }

            .wishrite-product-name {
                font-size: 0.92rem;
            }

            .wishrite-delivery-grid {
                grid-template-columns: 1fr;
                gap: 16px;
            }

            .wishrite-card {
                padding: 18px 16px;
                border-radius: 10px;
            }
        }
    `;
    document.head.appendChild(styleEl);
}

/**
 * Handles the "Continue Shopping" button action after an order is confirmed
 */
function handleWishriteContinueShopping() {
    closeWishriteCheckoutModal();
    if (typeof navigateTo === 'function') {
        navigateTo('shop');
    } else {
        window.location.hash = '#shop';
    }
}
window.handleWishriteContinueShopping = handleWishriteContinueShopping;

/**
 * Renders the premium WishRite Order Confirmation UI inside the checkout modal
 */
function renderWishriteOrderConfirmation(pendingCheckout, verifyData) {
    // 1. Ensure luxury styling is immediately injected and active
    ensureWishriteConfirmationStyles();

    // 2. Ensure container exists
    let modalContainer = document.getElementById('wishrite-checkout-modal');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'wishrite-checkout-modal';
        document.body.appendChild(modalContainer);
    }

    const pending = pendingCheckout || window.wishritePendingCheckout || {};
    const orderNumber = verifyData?.order_number || pending.order_number || 'Confirmed';
    const paymentStatusRaw = verifyData?.payment_status || pending.payment_status || 'paid';
    const paymentStatusDisplay = paymentStatusRaw.charAt(0).toUpperCase() + paymentStatusRaw.slice(1);
    const orderStatusRaw = verifyData?.order_status || pending.order_status || 'processing';
    const orderStatusDisplay = orderStatusRaw.charAt(0).toUpperCase() + orderStatusRaw.slice(1);

    const currency = verifyData?.currency || pending.currency || 'INR';
    const grandTotal = verifyData?.grand_total !== undefined ? verifyData.grand_total : (pending.grand_total || 0);
    const subtotal = pending.subtotal !== undefined ? pending.subtotal : grandTotal;
    const shipping = pending.shipping_charge !== undefined ? pending.shipping_charge : 0;
    const items = Array.isArray(pending.items) ? pending.items : [];

    const customerName = pending.customer_name || 'Valued Customer';
    const customerPhone = pending.customer_phone || '';
    const customerEmail = pending.customer_email || '';
    const customerAddress = pending.customer_address || '';
    const customerCity = pending.customer_city || '';
    const customerState = pending.customer_state || '';
    const customerPin = pending.customer_pin || '';
    const customerCountry = pending.customer_country || 'India';

    const itemsHtml = items.map(item => {
        const product = (typeof getProductById === 'function') ? getProductById(item.inventory_id) : null;
        const itemImage = item.image || product?.images?.[0]?.url || product?.image || '';
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price) || 0;
        const lineTotal = item.line_total !== undefined ? Number(item.line_total) : (quantity * unitPrice);

        return `
            <div class="wishrite-product-row">
                <div class="wishrite-product-img-wrap">
                    ${itemImage ? `
                        <img src="${escapeWishriteHtml(itemImage)}" alt="${escapeWishriteHtml(item.product_name || 'Jewellery')}" class="wishrite-product-img" loading="lazy">
                    ` : `
                        <div class="wishrite-product-img-fallback" aria-hidden="true">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5E3435" stroke-width="1.5">
                                <polygon points="12 2 2 8.5 12 15 22 8.5 12 2"></polygon>
                                <polygon points="2 8.5 12 22 22 8.5"></polygon>
                            </svg>
                        </div>
                    `}
                </div>
                <div class="wishrite-product-info">
                    <h3 class="wishrite-product-name">${escapeWishriteHtml(item.product_name || 'WishRite Jewellery')}</h3>
                    <div class="wishrite-product-meta-tags">
                        ${item.product_code ? `<span class="wishrite-sku-tag">SKU: ${escapeWishriteHtml(item.product_code)}</span>` : ''}
                        ${item.size ? `<span class="wishrite-size-tag">Size: ${escapeWishriteHtml(item.size)}</span>` : ''}
                        <span class="wishrite-qty-tag">Qty: ${quantity}</span>
                    </div>
                </div>
                <div class="wishrite-product-pricing">
                    <span class="wishrite-product-line-total">${formatPrice(lineTotal)}</span>
                    ${quantity > 1 ? `<span class="wishrite-product-unit-price">${formatPrice(unitPrice)} each</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    modalContainer.innerHTML = `
        <div class="wishrite-checkout-overlay wishrite-confirm-overlay" onclick="closeWishriteCheckoutModal(event)">
            <div class="wishrite-confirmation-modal" onclick="event.stopPropagation()">
                <!-- Header Close Action -->
                <div class="wishrite-confirm-header-bar">
                    <button
                        type="button"
                        class="wishrite-confirm-close-btn"
                        onclick="handleWishriteContinueShopping()"
                        aria-label="Close order confirmation"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Refined Luxury Hero & Short Elegant Animation -->
                <div class="wishrite-confirm-hero">
                    <div class="wishrite-confirm-badge-wrap" aria-hidden="true">
                        <svg class="wishrite-confirm-badge-svg" viewBox="0 0 68 68">
                            <circle class="wishrite-confirm-badge-bg" cx="34" cy="34" r="31" />
                            <circle class="wishrite-confirm-badge-ring" cx="34" cy="34" r="31" />
                            <path class="wishrite-confirm-badge-check" d="M22 34.5L30.5 43L46 25" />
                        </svg>
                    </div>
                    <span class="wishrite-confirm-eyebrow">WISHRITE</span>
                    <h1 class="wishrite-confirm-title">Order Confirmed</h1>
                    <p class="wishrite-confirm-thankyou">Thank you for your order.</p>
                    <p class="wishrite-confirm-subtitle">
                        Your payment has been verified and your order is now being prepared.
                    </p>
                </div>

                <!-- Horizontal Compact Status Card -->
                <div class="wishrite-confirm-status-card">
                    <div class="wishrite-status-col">
                        <span class="wishrite-status-label">Order Number</span>
                        <span class="wishrite-status-value wishrite-order-number-val">${escapeWishriteHtml(orderNumber)}</span>
                    </div>
                    <div class="wishrite-status-col">
                        <span class="wishrite-status-label">Payment Status</span>
                        <span class="wishrite-pill wishrite-pill-paid">
                            <span class="wishrite-pill-dot"></span> Paid
                        </span>
                    </div>
                    <div class="wishrite-status-col">
                        <span class="wishrite-status-label">Order Status</span>
                        <span class="wishrite-pill wishrite-pill-processing">
                            <span class="wishrite-pill-dot"></span> Processing
                        </span>
                    </div>
                    <div class="wishrite-status-col">
                        <span class="wishrite-status-label">Currency</span>
                        <span class="wishrite-status-value">${escapeWishriteHtml(currency)}</span>
                    </div>
                </div>

                <!-- Two-Column Main Content Layout -->
                <div class="wishrite-confirm-grid">
                    <!-- Left Column: Products + Delivery Info -->
                    <div class="wishrite-confirm-main-col">
                        <!-- Order Summary Card -->
                        <div class="wishrite-card">
                            <div class="wishrite-card-header">
                                <div class="wishrite-card-title-group">
                                    <h2 class="wishrite-card-title">Order Summary</h2>
                                    <span class="wishrite-card-subtitle">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
                                </div>
                            </div>
                            <div class="wishrite-products-list">
                                ${itemsHtml || '<p style="color:#6B6B6B;font-size:0.9rem;">Order items recorded.</p>'}
                            </div>
                        </div>

                        <!-- Delivery Information Card (Two-Column on Desktop) -->
                        <div class="wishrite-card">
                            <div class="wishrite-card-header">
                                <h2 class="wishrite-card-title">Delivery Information</h2>
                            </div>
                            <div class="wishrite-delivery-grid">
                                <div class="wishrite-delivery-col">
                                    <span class="wishrite-delivery-subhead">Customer Details</span>
                                    <p class="wishrite-delivery-name">${escapeWishriteHtml(customerName)}</p>
                                    <p class="wishrite-delivery-contact-line">
                                        <span>📞</span> <span>${escapeWishriteHtml(customerPhone)}</span>
                                    </p>
                                    ${customerEmail ? `
                                        <p class="wishrite-delivery-contact-line">
                                            <span>✉️</span> <span>${escapeWishriteHtml(customerEmail)}</span>
                                        </p>
                                    ` : ''}
                                </div>
                                <div class="wishrite-delivery-col">
                                    <span class="wishrite-delivery-subhead">Shipping Destination</span>
                                    <p class="wishrite-delivery-address-line">${escapeWishriteHtml(customerAddress)}</p>
                                    <p class="wishrite-delivery-address-line">
                                        ${escapeWishriteHtml(customerCity)}, ${escapeWishriteHtml(customerState)} – <strong>${escapeWishriteHtml(customerPin)}</strong>
                                    </p>
                                    <p class="wishrite-delivery-address-line">${escapeWishriteHtml(customerCountry)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Price Summary + Actions -->
                    <div class="wishrite-confirm-side-col">
                        <div class="wishrite-card wishrite-price-card">
                            <div class="wishrite-card-header">
                                <h2 class="wishrite-card-title">Price Summary</h2>
                            </div>
                            <div class="wishrite-price-rows">
                                <div class="wishrite-price-row">
                                    <span class="wishrite-price-label">Subtotal</span>
                                    <span class="wishrite-price-val">${formatPrice(subtotal)}</span>
                                </div>
                                <div class="wishrite-price-row">
                                    <span class="wishrite-price-label">Shipping</span>
                                    <span class="wishrite-price-val wishrite-shipping-val">
                                        ${shipping === 0 ? 'FREE' : formatPrice(shipping)}
                                    </span>
                                </div>
                                <div class="wishrite-price-divider"></div>
                                <div class="wishrite-price-row wishrite-grand-total-row">
                                    <div class="wishrite-grand-total-labels">
                                        <span class="wishrite-grand-label">Grand Total</span>
                                        <span class="wishrite-grand-currency">Inclusive of all taxes</span>
                                    </div>
                                    <div class="wishrite-grand-val-wrap">
                                        <span class="wishrite-grand-total-val">${formatPrice(grandTotal)}</span>
                                        <span class="wishrite-grand-total-code">${escapeWishriteHtml(currency)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="wishrite-confirm-actions-wrap">
                                <button
                                    type="button"
                                    class="wishrite-confirm-continue-btn"
                                    onclick="handleWishriteContinueShopping()"
                                >
                                    Continue Shopping
                                </button>
                            </div>

                            <div class="wishrite-guarantee-note">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B8956A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                </svg>
                                <span>Hallmarked 925 Silver • Insured Delivery</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.style.overflow = 'hidden';
    const overlay = modalContainer.querySelector('.wishrite-confirm-overlay');
    if (overlay) overlay.scrollTop = 0;
}
window.renderWishriteOrderConfirmation = renderWishriteOrderConfirmation;


