/* ============================================
   WISHRITE — WISHLIST
   Wishlist state management + rendering
   ============================================ */

let wishlist = new Set();

function toggleWishlist(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    if (wishlist.has(id)) {
        wishlist.delete(id);
    } else {
        wishlist.add(id);
    }

    updateWishlistCount();
    refreshProductCards();

    // Update PDP wishlist button if on product page
    const pdpBtn = document.querySelector('.pdp-wishlist-btn');
    if (pdpBtn && currentPdpProduct && currentPdpProduct.id === id) {
        pdpBtn.classList.toggle('active', wishlist.has(id));
    }
}

function updateWishlistCount() {
    const countEls = document.querySelectorAll('.wishlist-count-value');
    countEls.forEach(el => {
        el.textContent = wishlist.size;
        el.style.display = wishlist.size > 0 ? 'flex' : 'none';
    });
}

function renderWishlist() {
    const container = document.getElementById('wishlist-grid-container');
    if (!container) return;

    const wishlistProducts = productsDB.filter(p => wishlist.has(p.id));
    if (wishlistProducts.length === 0) {
        container.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;">
                ${ICONS.heart}
                <p>Your wishlist is empty.</p>
                <button class="btn btn-secondary" onclick="navigateTo('shop')">Explore Jewellery</button>
            </div>
        `;
        return;
    }
    renderProductsToContainer(wishlistProducts, 'wishlist-grid-container');
}

function refreshProductCards() {
    // Re-render all visible product cards to reflect wishlist state
    const currentView = getCurrentView();
    if (currentView === 'home') {
        renderProductsToContainer(productsDB.filter(p => p.isBestseller), 'bestsellers-container');
        renderProductsToContainer(productsDB.filter(p => p.isNew), 'new-arrivals-container');
    } else if (currentView === 'shop') {
        applyFiltersAndSort();
    } else if (currentView === 'wishlist') {
        renderWishlist();
    }
}
