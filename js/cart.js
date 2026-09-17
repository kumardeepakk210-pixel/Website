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
    const pin = input ? input.value.trim() : (typeof getSavedPincode === 'function' ? getSavedPincode() : null);

    if (!pin || pin.length !== 6) {
        showToast('Please enter a valid 6-digit delivery PIN code.', 'error');
        if (input) input.focus();
        return;
    }

    const isValid = await validateCheckoutPincode();
    if (!isValid) {
        showToast('Delivery is unavailable to the selected PIN code. Please change the delivery location.', 'error');
        return;
    }

    // Check for any out-of-stock items in cart
    for (const item of cart) {
        const product = typeof getProductById === 'function' ? getProductById(item.id) : item;
        if (product && product.stockQuantity <= 0) {
            showToast(`"${item.name}" is now out of stock. Please remove it from your bag to proceed.`, 'error');
            return;
        }
    }

    // Checkout order modal / confirmation
    const total = getCartTotal();
    alert(`Thank you for shopping with WishRite!\n\nOrder Value: ${formatPrice(total)}\nDelivery to PIN: ${pin}\nEstimated Dispatch: Within 24-48 Hours with 925 Hallmark Certificate.`);
    
    // Clear cart on successful order confirmation
    cart = [];
    updateCartCount();
    renderCart();
    navigateTo('home');
}
