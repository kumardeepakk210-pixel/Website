/* ============================================
   WISHRITE — WISHLIST
   Wishlist state management, rendering & localStorage persistence
   ============================================ */

const WISHLIST_STORAGE_KEY = 'wishrite_wishlist_items';

function loadSavedWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return new Set(arr);
            }
        }
    } catch (e) {}
    return new Set();
}

function saveWishlist() {
    try {
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(Array.from(wishlist)));
    } catch (e) {}
}

let wishlist = loadSavedWishlist();

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

    saveWishlist();
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
    const currentView = typeof getCurrentView === 'function' ? getCurrentView() : 'home';
    if (currentView === 'home') {
        if (typeof renderHomeSections === 'function') renderHomeSections();
    } else if (currentView === 'shop') {
        if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    } else if (currentView === 'wishlist') {
        renderWishlist();
    }
}

// Initial badge update
document.addEventListener('DOMContentLoaded', () => {
    updateWishlistCount();
});
