/* ============================================
   WISHRITE — APP
   Customer Storefront Router, State Management,
   Dynamic Supabase Inventory Sync & Realtime Subscription
   Strictly customer-facing: no admin routes or controls.
   ============================================ */

// All customer-facing storefront views
const views = ['home', 'shop', 'collections', 'collection-detail', 'new-arrivals', 'best-sellers', 'about', 'login', 'register', 'profile', 'cart', 'wishlist', 'product', 'occasion'];

const COLLECTIONS_CONFIG = [
    {
        slug: '925-silver-signature',
        name: '925 Silver Signature Collection',
        tagline: 'Timeless Hallmarked Essentials',
        description: 'The foundation of true silver luxury. Classic chains, rope designs, minimalist balis, and timeless bracelets crafted in pure 925 sterling silver.',
        image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=800&q=80',
        queryCol: '925 Silver Signature Collection'
    },
    {
        slug: 'daily-elegance',
        name: 'Daily Elegance',
        tagline: 'Workday Minimalism & Daily Grace',
        description: 'Understated brilliance designed for everyday wear. Lightweight toe rings, sleek silver bands, refined studs, and delicate nose pins for effortless daily style.',
        image: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=800&q=80',
        queryCol: 'Daily Elegance'
    },
    {
        slug: 'occasion-evening-edit',
        name: 'The Occasion & Evening Edit',
        tagline: 'Luminous Statements for Celebrated Moments',
        description: 'Crafted to captivate. Intricate jewellery sets, sparkling drop earrings, and statement chokers designed to elevate festive celebrations and special occasions.',
        image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=800&q=80',
        queryCol: 'The Occasion & Evening Edit'
    },
    {
        slug: 'modern-solitaires-keepsakes',
        name: 'Modern Solitaires & Keepsakes',
        tagline: 'Auspicious Silver & Meaningful Gifting',
        description: 'Timeless tokens of love, auspicious pure silver rakhis, radiant solitaire motifs, and keepsake pendants designed to celebrate life’s most cherished moments.',
        image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=80',
        queryCol: 'Modern Solitaires & Keepsakes'
    }
];
window.COLLECTIONS_CONFIG = COLLECTIONS_CONFIG;
let currentCollectionSlug = null;

function getCurrentView() {
    for (const v of views) {
        const el = document.getElementById(v + '-view');
        if (el && el.style.display !== 'none') return v;
    }
    return 'home';
}

/**
 * Dynamically update WishRite brand subtitle in header (Requirement 6)
 * /occasion -> activeOccasionConfig.brandSubtitle (e.g. DURGA PUJA COLLECTION)
 * All other views -> SILVER JEWELLERY
 */
function updateHeaderBrandSubtitle(viewId) {
    const subEl = document.getElementById('header-logo-sub') || document.querySelector('.header-logo-sub');
    if (!subEl) return;

    if (viewId === 'occasion') {
        const occ = (typeof getActiveOccasion === 'function') ? getActiveOccasion() : null;
        if (occ && occ.enabled) {
            subEl.textContent = occ.brandSubtitle || occ.navLabel || (occ.name ? `${occ.name.toUpperCase()} COLLECTION` : 'DURGA PUJA COLLECTION');
            return;
        }
    }
    // Normal Silver Jewellery Storefront
    subEl.textContent = 'SILVER JEWELLERY';
}
window.updateHeaderBrandSubtitle = updateHeaderBrandSubtitle;

function navigateTo(viewId, param, pushHistory = true) {
    // 0. Update dynamic brand subtitle based on active view
    updateHeaderBrandSubtitle(viewId);

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
    const navMap = {
        home: 'nav-home',
        shop: 'nav-shop',
        collections: 'nav-collections',
        'collection-detail': 'nav-collections',
        'new-arrivals': 'nav-new-arrivals',
        'best-sellers': 'nav-bestsellers',
        about: 'nav-about',
        occasion: 'nav-occasion'
    };
    const activeNav = document.getElementById(navMap[viewId]);
    if (activeNav) activeNav.classList.add('active');

    // Handle specific view setup
    switch (viewId) {
        case 'home':
            renderHomeSections();
            setHomeSEO();
            if (pushHistory) { try { history.pushState({ view: 'home' }, '', '/'); } catch(e){} }
            break;
        case 'occasion':
            if (typeof renderOccasionPage === 'function') renderOccasionPage();
            if (typeof setOccasionSEO === 'function') setOccasionSEO();
            if (pushHistory) { try { history.pushState({ view: 'occasion' }, '', '/occasion'); } catch(e){} }
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
        case 'collection-detail':
            renderCollectionDetailPage(param);
            if (pushHistory) { try { history.pushState({ view: 'collection-detail', param: param }, '', `/collections/${param}`); } catch(e){} }
            break;
        case 'new-arrivals':
            renderNewArrivalsPage();
            if (typeof setNewArrivalsSEO === 'function') setNewArrivalsSEO();
            if (pushHistory) { try { history.pushState({ view: 'new-arrivals' }, '', '/new-arrivals'); } catch(e){} }
            break;
        case 'best-sellers':
            renderBestSellersPage();
            if (typeof setBestSellersSEO === 'function') setBestSellersSEO();
            if (pushHistory) { try { history.pushState({ view: 'best-sellers' }, '', '/best-sellers'); } catch(e){} }
            break;
        case 'product':
            handleProductViewNavigation(param, targetView, pushHistory);
            break;
        case 'about':
            setAboutSEO();
            if (pushHistory) {
                const targetUrl = param ? `/about#${param}` : '/about';
                try { history.pushState({ view: 'about', param: param }, '', targetUrl); } catch(e){}
            }
            if (param) {
                setTimeout(() => scrollToAboutSection(param), 80);
            }
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

    // Scroll handling: if navigating to about with specific section param, scrollToAboutSection handles it
    if (viewId === 'about' && param) {
        // Will be scrolled by scrollToAboutSection
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Stop countdown timer if navigating away from occasion (Section 13: Prevent memory leaks)
    if (viewId !== 'occasion' && typeof stopCountdownTimer === 'function') {
        stopCountdownTimer();
    }

    // Update header appearance (transparent over hero on homepage vs sticky solid on other views)
    if (typeof updateHeaderState === 'function') {
        updateHeaderState();
    }

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
    } else if (current === 'collection-detail') {
        if (currentCollectionSlug) renderCollectionDetailPage(currentCollectionSlug);
    } else if (current === 'new-arrivals') {
        renderNewArrivalsPage();
    } else if (current === 'best-sellers') {
        renderBestSellersPage();
    }
});

/**
 * Render dedicated Collections Overview Page connected to real product data
 */
function renderCollectionsPage() {
    const container = document.getElementById('collections-view');
    if (!container) return;

    const cardsHTML = COLLECTIONS_CONFIG.map(col => {
        const count = typeof productsService !== 'undefined' 
            ? productsService.getProductsByCollection(col.queryCol).length 
            : 0;
        return `
            <div class="collection-feature-card" onclick="navigateTo('collection-detail', '${col.slug}')" role="link" tabindex="0" onkeydown="if(event.key==='Enter') navigateTo('collection-detail', '${col.slug}')" aria-label="Explore ${col.name}">
                <div class="collection-feature-image">
                    <img src="${col.image}" alt="${col.name}" loading="lazy" width="600" height="400">
                    <span class="collection-badge" style="position:absolute;bottom:12px;right:12px;background:rgba(94,52,53,0.92);color:#fff;font-size:0.75rem;padding:4px 10px;border-radius:2px;letter-spacing:0.5px;font-weight:500;">
                        ${count} Pieces Available
                    </span>
                </div>
                <div class="collection-feature-body" style="padding:24px;display:flex;flex-direction:column;flex:1;">
                    <span class="sub-label" style="font-size:0.75rem;letter-spacing:2px;color:var(--wr-primary);text-transform:uppercase;font-weight:600;margin-bottom:6px;">${col.tagline}</span>
                    <h3 class="collection-feature-title" style="font-family:var(--wr-font-heading);font-size:1.4rem;color:var(--wr-primary);margin-bottom:10px;">${col.name}</h3>
                    <p class="collection-feature-desc" style="font-size:0.9rem;color:var(--wr-text-muted);line-height:1.6;margin-bottom:20px;flex:1;">${col.description}</p>
                    <button class="btn btn-primary" onclick="event.stopPropagation(); navigateTo('collection-detail', '${col.slug}')">
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

/**
 * Render dedicated Collection Detail Page with real product grid & counts
 */
async function renderCollectionDetailPage(slug) {
    currentCollectionSlug = slug;
    const heroEl = document.getElementById('collection-detail-hero');
    const countEl = document.getElementById('collection-detail-count');
    const gridEl = document.getElementById('collection-detail-grid');
    if (!heroEl || !gridEl) return;

    const col = COLLECTIONS_CONFIG.find(c => c.slug === slug || c.queryCol.toLowerCase() === (slug || '').toLowerCase() || c.name.toLowerCase() === (slug || '').toLowerCase()) || COLLECTIONS_CONFIG[0];

    if (typeof setCollectionDetailSEO === 'function') {
        setCollectionDetailSEO(col);
    }

    heroEl.innerHTML = `
        <div class="container" style="max-width:800px;margin:0 auto;text-align:center;">
            <div class="breadcrumbs" style="margin-bottom:12px;font-size:0.85rem;color:var(--wr-text-muted);">
                <a onclick="navigateTo('home')" style="cursor:pointer;color:inherit;">Home</a>
                <span style="margin:0 8px;">/</span>
                <a onclick="navigateTo('collections')" style="cursor:pointer;color:inherit;">Collections</a>
                <span style="margin:0 8px;">/</span>
                <span style="color:var(--wr-primary);font-weight:500;">${col.name}</span>
            </div>
            <span class="sub-label" style="font-size:0.8rem;letter-spacing:2px;color:var(--wr-primary);text-transform:uppercase;font-weight:600;">${col.tagline}</span>
            <h1 style="margin-top:8px;">${col.name}</h1>
            <p style="max-width:650px;margin:12px auto 0;">${col.description}</p>
        </div>
    `;

    const isLoaded = productsDB && productsDB.length > 0;
    if (!isLoaded) {
        if (countEl) countEl.textContent = 'Loading products...';
        if (typeof renderProductLoadingSkeletons === 'function') {
            renderProductLoadingSkeletons('collection-detail-grid', 8);
        }
        if (typeof productsService !== 'undefined') {
            try {
                await productsService.ensureLoaded();
            } catch (e) {}
        }
    }

    const products = typeof productsService !== 'undefined'
        ? productsService.getProductsByCollection(col.queryCol)
        : [];

    if (countEl) {
        countEl.textContent = products.length > 0 ? `${products.length} Pieces Available` : '';
    }

    if (products.length === 0) {
        gridEl.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;text-align:center;">
                <p style="font-size:1.1rem;color:var(--wr-primary);font-family:var(--wr-font-heading);margin-bottom:8px;">No products found in this collection.</p>
                <p style="color:var(--wr-text-muted);font-size:0.9rem;margin-bottom:20px;">Explore our other curated silver collections or view all jewellery.</p>
                <button class="btn btn-primary btn-sm" onclick="navigateTo('collections')">View All Collections</button>
            </div>
        `;
    } else {
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer(products, 'collection-detail-grid');
        }
    }
}

/**
 * Render dedicated New Arrivals Page sorted newest first by created_at descending
 */
async function renderNewArrivalsPage() {
    const countEl = document.getElementById('new-arrivals-count');
    const gridEl = document.getElementById('new-arrivals-grid');
    if (!gridEl) return;

    const isLoaded = productsDB && productsDB.length > 0;
    if (!isLoaded) {
        if (countEl) countEl.textContent = 'Loading products...';
        if (typeof renderProductLoadingSkeletons === 'function') {
            renderProductLoadingSkeletons('new-arrivals-grid', 8);
        }
        if (typeof productsService !== 'undefined') {
            try {
                await productsService.ensureLoaded();
            } catch (e) {}
        }
    }

    const products = typeof productsService !== 'undefined'
        ? productsService.getNewArrivals(0)
        : [];

    if (countEl) {
        countEl.textContent = products.length > 0 ? `Showing ${products.length} Pieces` : '';
    }

    if (products.length === 0) {
        gridEl.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;text-align:center;">
                <p style="font-size:1.1rem;color:var(--wr-primary);font-family:var(--wr-font-heading);margin-bottom:8px;">No products found.</p>
                <button class="btn btn-primary btn-sm" onclick="navigateTo('shop')">Explore All Jewellery</button>
            </div>
        `;
    } else {
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer(products, 'new-arrivals-grid');
        }
    }
}

/**
 * Render dedicated Best Sellers Page ranked by real sales data and availability
 */
async function renderBestSellersPage() {
    const countEl = document.getElementById('best-sellers-count');
    const gridEl = document.getElementById('best-sellers-grid');
    if (!gridEl) return;

    const isLoaded = productsDB && productsDB.length > 0;
    if (!isLoaded) {
        if (countEl) countEl.textContent = 'Loading products...';
        if (typeof renderProductLoadingSkeletons === 'function') {
            renderProductLoadingSkeletons('best-sellers-grid', 8);
        }
        if (typeof productsService !== 'undefined') {
            try {
                await productsService.ensureLoaded();
            } catch (e) {}
        }
    }

    const products = typeof productsService !== 'undefined'
        ? productsService.getBestSellers(0)
        : [];

    if (countEl) {
        countEl.textContent = products.length > 0 ? `Showing ${products.length} Pieces` : '';
    }

    if (products.length === 0) {
        gridEl.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;text-align:center;">
                <p style="font-size:1.1rem;color:var(--wr-primary);font-family:var(--wr-font-heading);margin-bottom:8px;">No products found.</p>
                <button class="btn btn-primary btn-sm" onclick="navigateTo('shop')">Explore All Jewellery</button>
            </div>
        `;
    } else {
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer(products, 'best-sellers-grid');
        }
    }
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

    const urlParams = new URLSearchParams(search);
    const viewParam = urlParams.get('view');
    if (viewParam && views.includes(viewParam)) {
        navigateTo(viewParam, urlParams.get('param') || null, pushHistory);
        return;
    }

    // Occasion Route (path /occasion or hash #occasion)
    if (path === '/occasion' || path.startsWith('/occasion') || hash === '#occasion' || hash.startsWith('#occasion')) {
        navigateTo('occasion', null, pushHistory);
        return;
    }

    // About Route and About Policy Section Deep-Links (Sections 29–36)
    // Supports: /about, /about#shipping, /about#returns, /about#care, /about#faqs, /about#privacy, /about#contact
    const policySections = ['shipping', 'returns', 'care', 'faqs', 'privacy', 'contact'];
    if (path === '/about' || path.startsWith('/about') || hash.startsWith('#about') || policySections.some(s => hash === `#${s}`)) {
        let section = null;
        if (hash) {
            const rawHash = hash.replace(/^#about[#/]?/, '').replace(/^#/, '');
            if (policySections.includes(rawHash)) {
                section = rawHash;
            }
        }
        navigateTo('about', section, pushHistory);
        return;
    }

    if (path.startsWith('/product/')) {
        const slug = path.replace('/product/', '').replace(/\/$/, '');
        if (slug) {
            navigateTo('product', slug, pushHistory);
            return;
        }
    } else if (path.startsWith('/collections/')) {
        const slug = path.replace('/collections/', '').replace(/\/$/, '');
        if (slug) {
            navigateTo('collection-detail', slug, pushHistory);
            return;
        }
    } else if (path === '/collections' || hash === '#collections') {
        navigateTo('collections', null, pushHistory);
        return;
    } else if (path === '/new-arrivals' || hash === '#new-arrivals') {
        navigateTo('new-arrivals', null, pushHistory);
        return;
    } else if (path === '/best-sellers' || hash === '#best-sellers') {
        navigateTo('best-sellers', null, pushHistory);
        return;
    } else if (path === '/shop' || hash === '#shop') {
        navigateTo('shop', null, pushHistory);
        return;
    } else if (path === '/cart' || hash === '#cart') {
        navigateTo('cart', null, pushHistory);
        return;
    } else if (path === '/wishlist' || hash === '#wishlist') {
        navigateTo('wishlist', null, pushHistory);
        return;
    } else if (path === '/account' || path === '/profile' || hash === '#account') {
        navigateTo('profile', null, pushHistory);
        return;
    } else if (path === '/login' || hash === '#login') {
        navigateTo('login', null, pushHistory);
        return;
    } else if (path === '/register' || hash === '#register') {
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

/**
 * Smoothly scroll to a specific policy section in the About view (Section 36)
 * Accounts for sticky navigation header height.
 */
function scrollToAboutSection(sectionId) {
    if (!sectionId) return;
    const cleanId = String(sectionId).replace(/^#/, '');
    const el = document.getElementById(cleanId);
    if (!el) return;

    const header = document.querySelector('.header');
    const headerOffset = header ? header.offsetHeight + 24 : 90;
    const elementPosition = el.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth'
    });
}
window.scrollToAboutSection = scrollToAboutSection;

function navigateToAboutSection(sectionId, pushHistory = true) {
    navigateTo('about', sectionId, pushHistory);
}
window.navigateToAboutSection = navigateToAboutSection;

/**
 * Interactive FAQ accordion toggle (Section 33)
 */
function toggleWishriteFaq(itemEl) {
    if (!itemEl) return;
    const wasOpen = itemEl.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) {
        itemEl.classList.add('open');
    }
}
window.toggleWishriteFaq = toggleWishriteFaq;

/**
 * Interactive Contact Us Form submission handler (Section 35)
 */
function handleWishriteContactSubmit(e) {
    if (e) e.preventDefault();
    const statusEl = document.getElementById('contact-form-status');
    const form = document.getElementById('wishrite-contact-form');
    if (statusEl) {
        statusEl.innerHTML = '<span style="color:#2E7D32;font-weight:600;">✓ Thank you! Your message has been received. Our concierge team will reach out within 24 hours.</span>';
        statusEl.style.display = 'block';
    }
    if (form) form.reset();
}
window.handleWishriteContactSubmit = handleWishriteContactSubmit;

window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '';
    const path = window.location.pathname;
    const policySections = ['shipping', 'returns', 'care', 'faqs', 'privacy', 'contact'];
    
    if (path === '/about' || hash.includes('about') || policySections.some(s => hash === `#${s}`)) {
        const rawHash = hash.replace(/^#about[#/]?/, '').replace(/^#/, '');
        if (policySections.includes(rawHash)) {
            if (getCurrentView() !== 'about') {
                navigateTo('about', rawHash, false);
            } else {
                scrollToAboutSection(rawHash);
            }
        }
    } else if (hash === '#occasion') {
        navigateTo('occasion', null, false);
    }
});

function initFestiveNavigation() {
    if (typeof getActiveOccasion !== 'function') return;
    const occasion = getActiveOccasion();
    const desktopNav = document.getElementById('nav-occasion');
    const mobileNav = document.getElementById('mobile-nav-occasion');

    if (occasion && occasion.enabled) {
        const label = occasion.navLabel || occasion.name || 'FESTIVE EDIT';
        if (desktopNav) {
            desktopNav.textContent = label.toUpperCase();
            desktopNav.style.display = 'inline-flex';
        }
        if (mobileNav) {
            mobileNav.textContent = label;
            mobileNav.style.display = 'block';
        }
    } else {
        if (desktopNav) desktopNav.style.display = 'none';
        if (mobileNav) mobileNav.style.display = 'none';
    }
}
window.initFestiveNavigation = initFestiveNavigation;

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

    // 1. Baseline UI components
    updateAuthDropdown();
    updateCartCount();
    updateWishlistCount();
    renderCart();
    initHeaderScroll();
    initScrollReveal();

    // 2. Concurrently load products and active occasion settings from Supabase
    try {
        await Promise.allSettled([
            loadProductsFromInventory(),
            (typeof loadActiveOccasionSettings === 'function' ? loadActiveOccasionSettings() : Promise.resolve(null))
        ]);

        // 3. Initialize Supabase Realtime channel for instant price/stock synchronization
        if (typeof initRealtimeInventorySync === 'function') {
            initRealtimeInventorySync();
        }
    } catch (err) {
        console.warn('[WishRite] Initial data load notice:', err);
    }

    // 4. Render home sections with synchronized products
    renderHomeSections();

    // 5. Initialize festive navigation links (derived strictly from Supabase)
    initFestiveNavigation();

    // 6. Initialize hero carousel (festive slide if enabled, standard silver if off)
    initHeroCarousel();

    // 7. Route to current path
    handleInitialURLRoute();

    // 8. View-specific updates
    if (getCurrentView() === 'shop') {
        buildSidebarFilters();
        buildMobileFilters();
        applyFiltersAndSort();
    } else if (getCurrentView() === 'occasion' && typeof renderOccasionPage === 'function') {
        renderOccasionPage();
    }
});
