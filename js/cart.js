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

                        <input
                            type="hidden"
                            id="checkout-customer-pin"
                            value="${pin}"
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

                                <label>
                                    PIN Code
                                </label>

                                <input
                                    type="text"
                                    value="${pin}"
                                    readonly
                                    style="background:#f7f4f1;"
                                >

                            </div>

                            <div class="wishrite-form-field">

                                <label>
                                    Country
                                </label>

                                <input
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


async function submitWishriteCustomerCheckout(event) {
    event.preventDefault();

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

        /*
         * TEMPORARY CHECKPOINT
         *
         * We are intentionally stopping after collecting
         * customer details in this first step.
         *
         * Razorpay order creation will be connected
         * after we verify this form works correctly.
         */

        window.wishritePendingCheckout = {
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
            items: cart.map(item => ({
                product_id: item.id,
                product_code: item.productCode || item.product_code || item.sku || null,
                product_name: item.name,
                quantity: Number(item.qty),
                selling_price: Number(item.sellingPrice),
                size: item.size || null
            }))
        };

        console.log(
            'WishRite checkout information collected:',
            window.wishritePendingCheckout
        );

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Continue to Secure Payment';
        }

        showCheckoutFormError(
            'Customer details captured successfully. Payment integration will continue in the next step.',
            true
        );

    } catch (error) {

        console.error(
            'WishRite checkout error:',
            error
        );

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Continue to Secure Payment';
        }

        showCheckoutFormError(
            'Something went wrong. Please try again.'
        );
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
