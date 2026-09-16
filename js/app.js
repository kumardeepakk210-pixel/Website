/* ============================================
   WISHRITE — APP
   Router, state management, dynamic inventory sync, admin view
   ============================================ */

// All available views
const views = ['home', 'shop', 'about', 'login', 'register', 'profile', 'cart', 'wishlist', 'product', 'admin'];

function getCurrentView() {
    for (const v of views) {
        const el = document.getElementById(v + '-view');
        if (el && el.style.display !== 'none') return v;
    }
    return 'home';
}

function navigateTo(viewId, param) {
    // 1. Immediately reset product state and completely unmount sticky product action bar
    currentPdpProduct = null;
    unmountStickyCTA();

    // Hide all views
    views.forEach(v => {
        const el = document.getElementById(v + '-view');
        if (el) el.style.display = 'none';
    });

    // Remove active states from nav
    document.querySelectorAll('.header-nav a').forEach(a => a.classList.remove('active'));

    // Show target view
    const targetView = document.getElementById(viewId + '-view');
    if (targetView) {
        targetView.style.display = (viewId === 'login' || viewId === 'register') ? 'flex' : 'block';
    }

    // Set active nav
    const navMap = { home: 'nav-home', shop: 'nav-shop', about: 'nav-about', admin: 'nav-admin' };
    const activeNav = document.getElementById(navMap[viewId]);
    if (activeNav) activeNav.classList.add('active');

    // Handle specific view setup
    switch (viewId) {
        case 'home':
            renderHomeSections();
            setHomeSEO();
            try { history.pushState({ view: 'home' }, '', '/'); } catch(e){}
            break;
        case 'shop':
            buildSidebarFilters();
            buildMobileFilters();
            applyFiltersAndSort();
            setShopSEO(currentFilters.category);
            try { history.pushState({ view: 'shop' }, '', '/shop'); } catch(e){}
            break;
        case 'product':
            handleProductViewNavigation(param, targetView);
            break;
        case 'about':
            setAboutSEO();
            try { history.pushState({ view: 'about' }, '', '/about'); } catch(e){}
            break;
        case 'wishlist':
            renderWishlist();
            try { history.pushState({ view: 'wishlist' }, '', '/wishlist'); } catch(e){}
            break;
        case 'cart':
            renderCart();
            try { history.pushState({ view: 'cart' }, '', '/cart'); } catch(e){}
            break;
        case 'profile':
            if (typeof renderProfileAccountDetails === 'function') {
                renderProfileAccountDetails();
            }
            try { history.pushState({ view: 'profile' }, '', '/account'); } catch(e){}
            break;
        case 'login':
            try { history.pushState({ view: 'login' }, '', '/login'); } catch(e){}
            break;
        case 'register':
            resetRegistration();
            try { history.pushState({ view: 'register' }, '', '/register'); } catch(e){}
            break;
        case 'admin':
            renderAdminProductManagement();
            try { history.pushState({ view: 'admin' }, '', '/admin'); } catch(e){}
            break;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close any open panels
    closeMobileMenu();
    closeSearch();
    document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('show'));

    // Re-init scroll reveals for new content
    setTimeout(initScrollReveal, 100);
}

async function handleProductViewNavigation(param, targetView) {
    if (!param || !targetView) {
        unmountStickyCTA();
        return;
    }

    // Ensure sticky CTA is completely unmounted while resolving/loading product
    unmountStickyCTA();
    currentPdpProduct = null;

    let product = getProductBySlug(param) || getProductById(param);

    // If product not yet in memory, wait for inventory sync
    if (!product) {
        targetView.innerHTML = `
            <div class="container" style="padding:100px 0;text-align:center;">
                <div class="loading-spinner" style="margin:0 auto 20px;"></div>
                <p style="font-family:var(--wr-font-heading);font-size:1.1rem;color:var(--wr-primary);">Loading WishRite Piece...</p>
            </div>
        `;
        await loadProductsFromInventory();
        product = getProductBySlug(param) || getProductById(param);
    }

    // Guard: Ensure user is STILL on the product route after async wait
    if (getCurrentView() !== 'product') {
        unmountStickyCTA();
        return;
    }

    if (product && product.id) {
        currentPdpProduct = product;
        currentPdpImageIndex = 0;
        pdpQty = 1;
        targetView.innerHTML = renderProductDetail(product);
        setProductSEO(product);
        renderStickyCTA(product);
        setTimeout(() => {
            if (typeof initPdpSwipe === 'function') initPdpSwipe();
        }, 100);

        try {
            history.pushState({ view: 'product', param: product.slug }, '', `/product/${product.slug}`);
        } catch (e) {}
    } else {
        unmountStickyCTA();
        targetView.innerHTML = `
            <div class="container" style="padding:100px 0;text-align:center;">
                <h2 style="font-family:var(--wr-font-heading);color:var(--wr-primary);">Jewellery Piece Not Found</h2>
                <p style="color:var(--wr-text-muted);margin:12px 0 24px;">The selected jewellery item is currently unavailable or has been archived.</p>
                <button class="btn btn-primary" onclick="navigateTo('shop')">Explore Available Collection</button>
            </div>
        `;
    }
}

// Completely unmount and clear sticky product action bar
function unmountStickyCTA() {
    const cta = document.getElementById('sticky-cta');
    if (!cta) return;
    cta.innerHTML = '';
    cta.classList.remove('active');
    cta.style.display = 'none';
    cta.setAttribute('aria-hidden', 'true');
}

// Render sticky product action bar ONLY when on valid PDP with loaded product
function renderStickyCTA(product) {
    const cta = document.getElementById('sticky-cta');
    if (!cta) return;

    // Strict guard: Must be currently viewing a product page, with valid product & ID
    const isProductPage = getCurrentView() === 'product';
    if (!isProductPage || !product || !product.id || product.sellingPrice === undefined) {
        unmountStickyCTA();
        return;
    }

    const isOutOfStock = (product.stockQuantity <= 0);
    const priceFormatted = (typeof formatPrice === 'function')
        ? formatPrice(product.sellingPrice)
        : `₹${Number(product.sellingPrice).toLocaleString('en-IN')}`;

    if (!isOutOfStock) {
        cta.innerHTML = `
            <button class="btn btn-primary" onclick="addToCart('${product.id}')">ADD TO CART — ${priceFormatted}</button>
            <button class="btn btn-secondary" onclick="buyNowFromPDP('${product.id}')">BUY NOW</button>
        `;
    } else {
        cta.innerHTML = `
            <button class="btn btn-primary btn-disabled" disabled style="width:100%;">OUT OF STOCK</button>
        `;
    }

    cta.classList.add('active');
    cta.style.display = 'flex';
    cta.setAttribute('aria-hidden', 'false');
}

// Backward compatibility helper
function updateStickyCTA(product) {
    if (getCurrentView() === 'product' && product && product.id) {
        renderStickyCTA(product);
    } else {
        unmountStickyCTA();
    }
}

// Render home page sections
function renderHomeSections() {
    const inStock = productsDB.filter(p => p.stockQuantity > 0);
    const pool = inStock.length > 0 ? inStock : productsDB;

    // Bestsellers: prefer marked bestsellers or top stock
    let bestsellers = pool.filter(p => p.isBestseller);
    if (bestsellers.length < 4) bestsellers = pool.slice(0, 8);
    renderProductsToContainer(bestsellers.slice(0, 8), 'bestsellers-container');

    // New Arrivals: recent or newly added
    let newArrivals = pool.filter(p => p.isNew);
    if (newArrivals.length < 4) newArrivals = pool.slice(8, 16);
    renderProductsToContainer(newArrivals.slice(0, 8), 'new-arrivals-container');
}

/**
 * Admin Product & Image Management View
 */
function renderAdminProductManagement(filterText = '') {
    const container = document.getElementById('admin-view');
    if (!container) return;

    const term = filterText.toLowerCase();
    const filtered = productsDB.filter(p => 
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term))
    );

    container.innerHTML = `
        <div class="container" style="padding:40px 0 80px;">
            <div class="admin-view-header">
                <div>
                    <span class="admin-badge">ADMIN CONTROL</span>
                    <h1 style="font-family:var(--wr-font-heading);font-size:2rem;margin:6px 0 4px;color:var(--wr-primary);">Product & Inventory Management</h1>
                    <p style="color:var(--wr-text-muted);font-size:0.9rem;margin:0;">Source of Truth: Supabase <code>inventory</code> table (${productsDB.length} active items loaded)</p>
                </div>
                <div class="admin-view-actions">
                    <button class="btn btn-outline btn-sm" onclick="openBulkImageUploadModal()">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Bulk SKU Upload
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="refreshInventoryData()">
                        ⟳ Sync Database
                    </button>
                </div>
            </div>

            <!-- Search & Filter Bar -->
            <div class="admin-filter-bar" style="margin:24px 0 16px;display:flex;gap:12px;align-items:center;">
                <div style="flex:1;position:relative;">
                    <input 
                        type="text" 
                        class="admin-search-input" 
                        placeholder="Search products by SKU, name, or category..." 
                        value="${filterText}" 
                        oninput="renderAdminProductManagement(this.value)"
                    />
                </div>
                <span style="font-size:0.85rem;color:var(--wr-text-muted);white-space:nowrap;">Showing ${filtered.length} products</span>
            </div>

            <!-- Product Table -->
            <div class="admin-table-wrapper">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th style="width:70px;">Preview</th>
                            <th style="width:110px;">SKU / Code</th>
                            <th>Product Name</th>
                            <th>Category</th>
                            <th>Weight</th>
                            <th>Selling Price</th>
                            <th>Stock</th>
                            <th>Status</th>
                            <th style="text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(p => {
                            const isOut = p.stockQuantity <= 0;
                            const customImgs = (typeof getProductImages === 'function') ? getProductImages(p) : [];
                            const hasCustom = customImgs.length > 0 && !customImgs[0].isPlaceholder;
                            const previewUrl = customImgs[0]?.url || p.image;

                            return `
                                <tr>
                                    <td>
                                        <div class="admin-thumb-wrap" onclick="navigateTo('product', '${p.slug}')" title="View PDP">
                                            <img src="${previewUrl}" alt="${p.name}" loading="lazy">
                                        </div>
                                    </td>
                                    <td><strong style="font-family:monospace;color:var(--wr-primary);">${p.sku || p.code}</strong></td>
                                    <td>
                                        <div style="font-weight:500;">${p.name}</div>
                                        <div style="font-size:0.75rem;color:var(--wr-text-muted);">${p.slug}</div>
                                    </td>
                                    <td><span class="admin-cat-pill">${p.category}</span></td>
                                    <td>${p.weight || '—'}</td>
                                    <td><strong>${formatPrice(p.sellingPrice)}</strong></td>
                                    <td>
                                        <span class="admin-stock-val ${isOut ? 'out' : ''}">${p.stockQuantity}</span>
                                    </td>
                                    <td>
                                        ${!isOut 
                                            ? '<span class="status-pill active">In Stock</span>' 
                                            : '<span class="status-pill out">Out of Stock</span>'}
                                        ${hasCustom ? '<span class="img-status-pill custom" title="Has custom images">Custom Img</span>' : '<span class="img-status-pill placeholder" title="Using hallmark placeholder">Default</span>'}
                                    </td>
                                    <td style="text-align:right;">
                                        <div style="display:inline-flex;gap:6px;">
                                            <button class="btn btn-outline btn-xs" onclick="openImageManagerForProduct('${p.id}')">
                                                📷 Manage Images
                                            </button>
                                            <button class="btn btn-outline btn-xs" onclick="navigateTo('product', '${p.slug}')">
                                                View
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openBulkImageUploadModal() {
    if (productsDB.length > 0) {
        openImageManagerForProduct(productsDB[0]);
        setTimeout(() => switchAdminImageTab('bulk'), 50);
    }
}

async function refreshInventoryData() {
    showToast('Syncing products with Supabase inventory...', 'info');
    await loadProductsFromInventory();
    renderAdminProductManagement();
    renderHomeSections();
    showToast('Inventory synchronization complete!', 'success');
}

// ── Browser URL Navigation & History Handling ──
function handleInitialURLRoute() {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;

    // Detect Supabase Auth Callback (path /auth/callback, or token hashes / search params)
    if (path === '/auth/callback' || path.startsWith('/auth/callback') ||
        hash.includes('access_token=') || hash.includes('error=') ||
        search.includes('code=') || search.includes('error=')) {
        if (typeof handleAuthCallback === 'function') {
            handleAuthCallback();
            return;
        }
    }

    if (path.startsWith('/product/')) {
        const slug = path.replace('/product/', '').replace(/\/$/, '');
        if (slug) {
            navigateTo('product', slug);
            return;
        }
    } else if (path === '/shop') {
        navigateTo('shop');
        return;
    } else if (path === '/about') {
        navigateTo('about');
        return;
    } else if (path === '/cart') {
        navigateTo('cart');
        return;
    } else if (path === '/wishlist') {
        navigateTo('wishlist');
        return;
    } else if (path === '/account' || path === '/profile') {
        navigateTo('profile');
        return;
    } else if (path === '/login') {
        navigateTo('login');
        return;
    } else if (path === '/register') {
        navigateTo('register');
        return;
    } else if (path === '/admin') {
        navigateTo('admin');
        return;
    }

    // Default home view
    navigateTo('home');
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        navigateTo(e.state.view, e.state.param);
    } else {
        handleInitialURLRoute();
    }
});

// ── Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Ensure sticky CTA is completely unmounted initially
    unmountStickyCTA();

    // 1. Initial local render for zero perceived latency
    renderHomeSections();
    updateAuthDropdown();
    updateCartCount();
    updateWishlistCount();
    renderCart();

    // 2. UI listeners
    initHeroCarousel();
    initHeaderScroll();
    initScrollReveal();

    // 3. Route to current path
    handleInitialURLRoute();

    // 4. Asynchronously sync live inventory from Supabase database
    try {
        await loadProductsFromInventory();
        // Re-render home sections and current views with live inventory
        renderHomeSections();
        if (getCurrentView() === 'shop') {
            buildSidebarFilters();
            buildMobileFilters();
            applyFiltersAndSort();
        } else if (getCurrentView() === 'admin') {
            renderAdminProductManagement();
        }
    } catch (err) {
        console.warn('Initial inventory load completed with fallback:', err);
    }
});
