/* ============================================
   WISHRITE — CART
   Cart state management + rendering
   ============================================ */

let cart = [];

function addToCart(id, event) {
    if (event) event.stopPropagation();
    const product = productsDB.find(p => p.id === id);
    if (!product) return;

    // Check if already in cart, increment qty
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    updateCartCount();
    renderCart();

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
    cart = cart.filter(item => item.id !== id);
    updateCartCount();
    renderCart();
}

function updateCartItemQty(id, delta) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
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

function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.sellingPrice * item.qty), 0);
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const summary = document.getElementById('cart-summary');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                ${ICONS.bag}
                <p>Your cart is currently empty.</p>
                <button class="btn btn-secondary" onclick="navigateTo('shop')">Continue Shopping</button>
            </div>
        `;
        if (summary) summary.style.display = 'none';
        return;
    }

    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <img class="cart-item-image" src="${item.image}" alt="${item.name}" loading="lazy" width="90" height="90">
                <div>
                    <h4 class="cart-item-name">${item.name}</h4>
                    <p class="cart-item-price">${formatPrice(item.sellingPrice)} × ${item.qty}</p>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-4)">
                <div class="qty-controls">
                    <button class="qty-btn" onclick="updateCartItemQty(${item.id}, -1)" aria-label="Decrease">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartItemQty(${item.id}, 1)" aria-label="Increase">+</button>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</button>
            </div>
        </div>
    `).join('');

    if (summary) {
        summary.style.display = 'block';
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.textContent = formatPrice(getCartTotal());
    }
}
