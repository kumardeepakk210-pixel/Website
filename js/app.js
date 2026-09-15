/* ============================================
   WISHRITE — APP
   Router, state management, initialization
   ============================================ */

// All available views
const views = ['home', 'shop', 'about', 'login', 'register', 'profile', 'cart', 'wishlist', 'product'];

function getCurrentView() {
    for (const v of views) {
        const el = document.getElementById(v + '-view');
        if (el && el.style.display !== 'none') return v;
    }
    return 'home';
}

function navigateTo(viewId, param) {
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
    const navMap = { home: 'nav-home', shop: 'nav-shop', about: 'nav-about' };
    const activeNav = document.getElementById(navMap[viewId]);
    if (activeNav) activeNav.classList.add('active');

    // Handle specific view setup
    switch (viewId) {
        case 'home':
            renderHomeSections();
            setHomeSEO();
            break;
        case 'shop':
            buildSidebarFilters();
            buildMobileFilters();
            applyFiltersAndSort();
            setShopSEO(currentFilters.category);
            break;
        case 'product':
            if (param) {
                const product = getProductBySlug(param);
                if (product) {
                    currentPdpProduct = product;
                    currentPdpImageIndex = 0;
                    pdpQty = 1;
                    targetView.innerHTML = renderProductDetail(product);
                    setProductSEO(product);
                    // Show sticky CTA on mobile
                    updateStickyCTA(product);
                    // Init swipe after render
                    setTimeout(() => initPdpSwipe(), 100);
                }
            }
            break;
        case 'about':
            setAboutSEO();
            break;
        case 'wishlist':
            renderWishlist();
            break;
        case 'cart':
            renderCart();
            break;
        case 'register':
            resetRegistration();
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

// Update mobile sticky CTA for PDP
function updateStickyCTA(product) {
    const cta = document.getElementById('sticky-cta');
    if (!cta) return;
    if (product && getCurrentView() === 'product') {
        cta.innerHTML = `
            <button class="btn btn-primary" onclick="addToCart(${product.id})">Add to Cart — ${formatPrice(product.sellingPrice)}</button>
            <button class="btn btn-secondary" onclick="addToCart(${product.id}); navigateTo('cart');">Buy Now</button>
        `;
        cta.style.display = 'flex';
    } else {
        cta.style.display = '';
    }
}

// Render home page sections
function renderHomeSections() {
    // Bestsellers
    renderProductsToContainer(productsDB.filter(p => p.isBestseller), 'bestsellers-container');

    // New Arrivals
    renderProductsToContainer(productsDB.filter(p => p.isNew), 'new-arrivals-container');
}

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    // Render initial content
    renderHomeSections();
    updateAuthDropdown();
    updateCartCount();
    updateWishlistCount();
    renderCart();

    // Init UI components
    initHeroCarousel();
    initHeaderScroll();
    initScrollReveal();

    // Set initial SEO
    setHomeSEO();
});
