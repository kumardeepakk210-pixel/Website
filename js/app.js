/* ============================================
   WISHRITE — APP
   Customer Storefront Router, State Management,
   Dynamic Supabase Inventory Sync & Realtime Subscription
   Strictly customer-facing: no admin routes or controls.
   ============================================ */

// All customer-facing storefront views
const views = ['home', 'shop', 'collections', 'about', 'login', 'register', 'profile', 'cart', 'wishlist', 'product'];

function getCurrentView() {
    for (const v of views) {
        const el = document.getElementById(v + '-view');
        if (el && el.style.display !== 'none') return v;
    }
    return 'home';
}

function navigateTo(viewId, param, pushHistory = true) {
    // 1. Immediately reset product state and completely unmount sticky product action bar
    currentPdpProduct = null;
    unmountStickyCTA();

    if (viewId === 'product') {
        document.body.classList.add('view-product');
    } else {
        document.body.classList.remove('view-product');
    }

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
    const navMap = { home: 'nav-home', shop: 'nav-shop', collections: 'nav-collections', about: 'nav-about' };
    const activeNav = document.getElementById(navMap[viewId]);
    if (activeNav) activeNav.classList.add('active');

    // Handle specific view setup
    switch (viewId) {
        case 'home':
            renderHomeSections();
            setHomeSEO();
            if (pushHistory) { try { history.pushState({ view: 'home' }, '', '/'); } catch(e){} }
            break;
        case 'shop':
            buildSidebarFilters();
            buildMobileFilters();
            applyFiltersAndSort();
            setShopSEO(currentFilters.category);
            if (pushHistory) { try { history.pushState({ view: 'shop' }, '', '/shop'); } catch(e){} }
            break;
        case 'collections':
            renderCollectionsPage();
            if (typeof setCollectionsSEO === 'function') setCollectionsSEO();
            if (pushHistory) { try { history.pushState({ view: 'collections' }, '', '/collections'); } catch(e){} }
            break;
        case 'product':
            handleProductViewNavigation(param, targetView, pushHistory);
            break;
        case 'about':
            setAboutSEO();
            if (pushHistory) { try { history.pushState({ view: 'about' }, '', '/about'); } catch(e){} }
            break;
        case 'wishlist':
            renderWishlist();
            if (pushHistory) { try { history.pushState({ view: 'wishlist' }, '', '/wishlist'); } catch(e){} }
            break;
        case 'cart':
            renderCart();
            if (pushHistory) { try { history.pushState({ view: 'cart' }, '', '/cart'); } catch(e){} }
            break;
        case 'profile':
            if (typeof renderProfileAccountDetails === 'function') {
                renderProfileAccountDetails();
            }
            if (pushHistory) { try { history.pushState({ view: 'profile' }, '', '/account'); } catch(e){} }
            break;
        case 'login':
            if (pushHistory) { try { history.pushState({ view: 'login' }, '', '/login'); } catch(e){} }
            break;
        case 'register':
            resetRegistration();
            if (pushHistory) { try { history.pushState({ view: 'register' }, '', '/register'); } catch(e){} }
            break;
        default:
            renderHomeSections();
            setHomeSEO();
            if (pushHistory) { try { history.pushState({ view: 'home' }, '', '/'); } catch(e){} }
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

async function handleProductViewNavigation(param, targetView, pushHistory = true) {
    if (!param || !targetView) {
        unmountStickyCTA();
        document.body.classList.remove('view-product');
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
        document.body.classList.remove('view-product');
        return;
    }

    if (product && product.id) {
        document.body.classList.add('view-product');
        currentPdpProduct = product;
        currentPdpImageIndex = 0;
        pdpQty = 1;
        targetView.innerHTML = renderProductDetail(product);
        setProductSEO(product);
        renderStickyCTA(product);
        setTimeout(() => {
            if (typeof initPdpSwipe === 'function') initPdpSwipe();
        }, 100);

        if (pushHistory) {
            try {
                history.pushState({ view: 'product', param: product.slug }, '', `/product/${product.slug}`);
            } catch (e) {}
        }
    } else {
        unmountStickyCTA();
        document.body.classList.remove('view-product');
        targetView.innerHTML = `
            <div class="container" style="padding:100px 0;text-align:center;">
                <h2 style="font-family:var(--wr-font-heading);color:var(--wr-primary);">Jewellery Piece Not Found</h2>
                <p style="color:var(--wr-text-muted);margin:12px 0 24px;">The selected jewellery item is currently unavailable or has been archived.</p>
                <button class="btn btn-primary" onclick="navigateTo('shop')">Explore Available Collection</button>
            </div>
        `;
    }
}

// Completely unmount and clear sticky product action bar across DOM
function unmountStickyCTA() {
    const ctas = document.querySelectorAll('.sticky-cta, #sticky-cta');
    ctas.forEach(cta => {
        cta.innerHTML = '';
        cta.classList.remove('active');
        cta.style.display = 'none';
        cta.setAttribute('aria-hidden', 'true');
    });
}

// Render sticky product action bar ONLY when on valid PDP with loaded product
function renderStickyCTA(product) {
    const ctas = document.querySelectorAll('.sticky-cta, #sticky-cta');
    if (!ctas.length) return;

    // Strict guard: Must be currently viewing a product page, with valid product & ID
    const isProductPage = getCurrentView() === 'product' && document.body.classList.contains('view-product');
    if (!isProductPage || !product || !product.id || product.sellingPrice === undefined) {
        unmountStickyCTA();
        return;
    }

    const isOutOfStock = (product.stockQuantity <= 0 || product.status === 'Out of Stock');
    const priceFormatted = (typeof formatPrice === 'function')
        ? formatPrice(product.sellingPrice)
        : `₹${Number(product.sellingPrice).toLocaleString('en-IN')}`;

    const innerContent = !isOutOfStock ? `
        <button class="btn btn-primary" onclick="addToCart('${product.id}', event)">ADD TO CART — ${priceFormatted}</button>
        <button class="btn btn-secondary" onclick="buyNowFromPDP('${product.id}')">BUY NOW</button>
    ` : `
        <button class="btn btn-primary btn-disabled" disabled style="width:100%;">OUT OF STOCK</button>
    `;

    ctas.forEach(cta => {
        cta.innerHTML = innerContent;
        cta.classList.add('active');
        cta.style.display = 'flex';
        cta.setAttribute('aria-hidden', 'false');
    });
}

// Backward compatibility helper
function updateStickyCTA(product) {
    if (getCurrentView() === 'product' && document.body.classList.contains('view-product') && product && product.id) {
        renderStickyCTA(product);
    } else {
        unmountStickyCTA();
    }
}

// Render home page sections with live Supabase products or skeletons
async function renderHomeSections() {
    const bsEl = document.getElementById('bestsellers-container');
    const naEl = document.getElementById('new-arrivals-container');

    const hasProducts = productsDB && productsDB.length > 0;

    if (!hasProducts) {
        if (typeof renderProductLoadingSkeletons === 'function') {
            if (bsEl) renderProductLoadingSkeletons('bestsellers-container', 4);
            if (naEl) renderProductLoadingSkeletons('new-arrivals-container', 4);
        }
        try {
            if (typeof productsService !== 'undefined') {
                await productsService.ensureLoaded();
            }
        } catch (e) {
            return;
        }
    }

    const bestsellers = (typeof productsService !== 'undefined') 
        ? productsService.getBestSellers(8) 
        : (window.productsDB || productsDB).slice(0, 8);
    const newArrivals = (typeof productsService !== 'undefined') 
        ? productsService.getNewArrivals(8) 
        : (window.productsDB || productsDB).slice(0, 8);

    if (typeof renderProductsToContainer === 'function') {
        if (bsEl) renderProductsToContainer(bestsellers, 'bestsellers-container');
        if (naEl) renderProductsToContainer(newArrivals, 'new-arrivals-container');
    }
}

// Listen for async inventory sync and automatically update active views
window.addEventListener('wishrite:productsLoaded', () => {
    const current = getCurrentView();
    if (current === 'home') {
        renderHomeSections();
    } else if (current === 'shop') {
        applyFiltersAndSort();
    } else if (current === 'collections') {
        renderCollectionsPage();
    }
});

/**
 * Render dedicated Collections Page connected to real product data
 */
function renderCollectionsPage() {
    const container = document.getElementById('collections-view');
    if (!container) return;

    const collections = [
        {
            name: '925 Silver Signature Collection',
            tagline: 'Timeless Hallmarked Essentials',
            description: 'The foundation of true silver luxury. Classic chains, rope designs, minimalist balis, and timeless bracelets crafted in pure 925 sterling silver.',
            image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80',
            queryCol: '925 Silver Signature Collection'
        },
        {
            name: 'Daily Elegance',
            tagline: 'Workday Minimalism & Daily Grace',
            description: 'Understated brilliance designed for everyday wear. Lightweight toe rings, sleek silver bands, refined studs, and delicate nose pins for effortless daily style.',
            image: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80',
            queryCol: 'Daily Elegance'
        },
        {
            name: 'The Occasion & Evening Edit',
            tagline: 'Luminous Statements for Celebrated Moments',
            description: 'Crafted to captivate. Intricate jewellery sets, sparkling drop earrings, and statement chokers designed to elevate festive celebrations and special occasions.',
            image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80',
            queryCol: 'The Occasion & Evening Edit'
        },
        {
            name: 'Modern Solitaires & Keepsakes',
            tagline: 'Auspicious Silver & Meaningful Gifting',
            description: 'Timeless tokens of love, auspicious pure silver rakhis, radiant solitaire motifs, and keepsake pendants designed to celebrate life’s most cherished moments.',
            image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=80',
            queryCol: 'Modern Solitaires & Keepsakes'
        }
    ];

    const cardsHTML = collections.map(col => {
        const count = typeof productsService !== 'undefined' 
            ? productsService.getProductsByCollection(col.queryCol).length 
            : 0;
        return `
            <div class="collection-feature-card" style="background:#fff;border:1px solid var(--wr-border);border-radius:6px;overflow:hidden;transition:transform 0.3s ease, box-shadow 0.3s ease;display:flex;flex-direction:column;">
                <div class="collection-feature-image" style="position:relative;aspect-ratio:16/10;overflow:hidden;">
                    <img src="${col.image}" alt="${col.name}" loading="lazy" width="600" height="400" style="width:100%;height:100%;object-fit:cover;">
                    <span class="collection-badge" style="position:absolute;bottom:12px;right:12px;background:rgba(94,52,53,0.92);color:#fff;font-size:0.75rem;padding:4px 10px;border-radius:2px;letter-spacing:0.5px;font-weight:500;">
                        ${count} Pieces Available
                    </span>
                </div>
                <div class="collection-feature-body" style="padding:24px;display:flex;flex-direction:column;flex:1;">
                    <span class="sub-label" style="font-size:0.75rem;letter-spacing:2px;color:var(--wr-primary);text-transform:uppercase;font-weight:600;margin-bottom:6px;">${col.tagline}</span>
                    <h3 class="collection-feature-title" style="font-family:var(--wr-font-heading);font-size:1.4rem;color:var(--wr-primary);margin-bottom:10px;">${col.name}</h3>
                    <p class="collection-feature-desc" style="font-size:0.9rem;color:var(--wr-text-muted);line-height:1.6;margin-bottom:20px;flex:1;">${col.description}</p>
                    <button class="btn btn-primary" onclick="navigateToShopWithFilter('collection', '${col.queryCol}', 'featured', '${col.name}')">
                        Explore Collection
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="page-header" style="text-align:center;padding:60px 20px 40px;background:var(--wr-cream);">
            <div class="container">
                <span class="sub-label">WishRite Curations</span>
                <h1 style="font-family:var(--wr-font-heading);font-size:2.4rem;color:var(--wr-primary);margin-top:8px;">Curated Collections</h1>
                <p style="color:var(--wr-text-muted);max-width:600px;margin:12px auto 0;font-size:1.05rem;">
                    Every collection embodies thoughtful design, hallmarked 925 purity, and effortless silver luxury.
                </p>
            </div>
        </div>
        <div class="container" style="padding:40px 20px 80px;">
            <div class="collections-grid-layout" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:32px;">
                ${cardsHTML}
            </div>
        </div>
    `;
}

// ── Browser URL Navigation & History Handling ──
function handleInitialURLRoute(pushHistory = false) {
    const path = window.location.pathname;
    const hash = window.location.hash || '';
    const search = window.location.search || '';

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
            navigateTo('product', slug, pushHistory);
            return;
        }
    } else if (path === '/shop') {
        navigateTo('shop', null, pushHistory);
        return;
    } else if (path === '/collections') {
        navigateTo('collections', null, pushHistory);
        return;
    } else if (path === '/about') {
        navigateTo('about', null, pushHistory);
        return;
    } else if (path === '/cart') {
        navigateTo('cart', null, pushHistory);
        return;
    } else if (path === '/wishlist') {
        navigateTo('wishlist', null, pushHistory);
        return;
    } else if (path === '/account' || path === '/profile') {
        navigateTo('profile', null, pushHistory);
        return;
    } else if (path === '/login') {
        navigateTo('login', null, pushHistory);
        return;
    } else if (path === '/register') {
        navigateTo('register', null, pushHistory);
        return;
    } else if (path === '/admin') {
        // Direct administrative users to the separate Inventory Application
        navigateTo('home', null, false);
        if (window.history.replaceState) {
            window.history.replaceState({}, '', '/');
        }
        return;
    }

    // Default home view
    navigateTo('home', null, pushHistory);
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        navigateTo(e.state.view, e.state.param, false);
    } else {
        handleInitialURLRoute(false);
    }
});

// ── Storefront Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Ensure sticky CTA is completely unmounted initially
    unmountStickyCTA();

    // 1. Initial local render (with shimmer skeletons if data pending)
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

        // 5. Initialize Supabase Realtime channel for instant price/stock synchronization
        initRealtimeInventorySync();

        // Re-render home sections and active views with live Supabase inventory
        renderHomeSections();
        if (getCurrentView() === 'shop') {
            buildSidebarFilters();
            buildMobileFilters();
            applyFiltersAndSort();
        }
    } catch (err) {
        console.warn('Initial inventory load notice:', err);
    }
});
