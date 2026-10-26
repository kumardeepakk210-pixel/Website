/* ============================================
   WISHRITE — APP
   Customer Storefront Router, State Management,
   Dynamic Supabase Inventory Sync & Realtime Subscription
   Strictly customer-facing: no admin routes or controls.
   ============================================ */

// All customer-facing storefront views
const views = ['home', 'shop', 'collections', 'collection-detail', 'new-arrivals', 'best-sellers', 'kids', 'men', 'about', 'login', 'register', 'profile', 'cart', 'wishlist', 'product', 'occasion', 'creator-storefront'];

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
            subEl.textContent = occ.brandSubtitle || occ.navLabel || (occ.name ? `${occ.name.toUpperCase()} COLLECTION` : 'FESTIVE COLLECTION');
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

    // Sync occasion mode conditional content visibility
    if (typeof updateOccasionContentVisibility === 'function') {
        updateOccasionContentVisibility();
    }

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
        kids: 'nav-kids',
        men: 'nav-men',
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
            if (pushHistory) { try { history.pushState({ view: 'home' }, '', '/'); } catch (e) { } }
            break;
        case 'occasion':
            if (typeof renderOccasionPage === 'function') renderOccasionPage();
            if (typeof setOccasionSEO === 'function') setOccasionSEO();
            if (pushHistory) { try { history.pushState({ view: 'occasion' }, '', '/occasion'); } catch (e) { } }
            break;
        case 'shop':
            if (typeof renderActivePageProducts === 'function') renderActivePageProducts('shop');
            setShopSEO(currentFilters.category);
            if (typeof updateActiveCategoryNav === 'function') updateActiveCategoryNav(currentFilters.category || 'All');
            if (pushHistory) { try { history.pushState({ view: 'shop' }, '', '/shop'); } catch (e) { } }
            break;
        case 'collections':
            renderCollectionsPage();
            if (typeof setCollectionsSEO === 'function') setCollectionsSEO();
            if (pushHistory) { try { history.pushState({ view: 'collections' }, '', '/collections'); } catch (e) { } }
            break;
        case 'collection-detail':
            renderCollectionDetailPage(param);
            if (pushHistory) { try { history.pushState({ view: 'collection-detail', param: param }, '', `/collections/${param}`); } catch (e) { } }
            break;
        case 'new-arrivals':
            renderNewArrivalsPage();
            if (typeof setNewArrivalsSEO === 'function') setNewArrivalsSEO();
            if (typeof updateActiveCategoryNav === 'function') updateActiveCategoryNav('All');
            if (pushHistory) { try { history.pushState({ view: 'new-arrivals' }, '', '/new-arrivals'); } catch (e) { } }
            break;
        case 'best-sellers':
            renderBestSellersPage();
            if (typeof setBestSellersSEO === 'function') setBestSellersSEO();
            if (typeof updateActiveCategoryNav === 'function') updateActiveCategoryNav('All');
            if (pushHistory) { try { history.pushState({ view: 'best-sellers' }, '', '/best-sellers'); } catch (e) { } }
            break;
        case 'kids':
            renderKidsPage();
            if (typeof setKidsSEO === 'function') setKidsSEO();
            if (typeof updateActiveCategoryNav === 'function') updateActiveCategoryNav('All');
            if (pushHistory) { try { history.pushState({ view: 'kids' }, '', '/kids'); } catch (e) { } }
            break;
        case 'men':
            renderMenPage();
            if (typeof setMenSEO === 'function') setMenSEO();
            if (typeof updateActiveCategoryNav === 'function') updateActiveCategoryNav('All');
            if (pushHistory) { try { history.pushState({ view: 'men' }, '', '/men'); } catch (e) { } }
            break;
        case 'product':
            handleProductViewNavigation(param, targetView, pushHistory);
            break;
        case 'about':
            setAboutSEO();
            if (pushHistory) {
                const targetUrl = param ? `/about#${param}` : '/about';
                try { history.pushState({ view: 'about', param: param }, '', targetUrl); } catch (e) { }
            }
            if (param) {
                setTimeout(() => scrollToAboutSection(param), 80);
            }
            break;
        case 'wishlist':
            renderWishlist();
            if (pushHistory) { try { history.pushState({ view: 'wishlist' }, '', '/wishlist'); } catch (e) { } }
            break;
        case 'cart':
            renderCart();
            if (pushHistory) { try { history.pushState({ view: 'cart' }, '', '/cart'); } catch (e) { } }
            break;
        case 'profile':
            if (typeof renderProfileAccountDetails === 'function') {
                renderProfileAccountDetails();
            }
            if (param === 'creator' && typeof switchProfileTab === 'function') {
                switchProfileTab('creator');
            } else if (typeof switchProfileTab === 'function') {
                switchProfileTab('account');
            }
            if (pushHistory) {
                const targetUrl = param === 'creator' ? '/account?tab=creator' : '/account';
                try { history.pushState({ view: 'profile', param }, '', targetUrl); } catch (e) { }
            }
            break;
        case 'login':
            if (pushHistory) { try { history.pushState({ view: 'login' }, '', '/login'); } catch (e) { } }
            break;
        case 'register':
            resetRegistration();
            if (pushHistory) { try { history.pushState({ view: 'register' }, '', '/register'); } catch (e) { } }
            break;
        case 'creator-storefront':
            if (typeof renderCreatorStorefront === 'function') {
                renderCreatorStorefront(param);
            }
            if (pushHistory) {
                try {
                    history.pushState({ view: 'creator-storefront', param }, '', `/creator/${param}`);
                } catch (e) { }
            }
            break;
        default:
            renderHomeSections();
            setHomeSEO();
            if (typeof initHeroCarousel === 'function') {
                initHeroCarousel();
            }
            if (pushHistory) { try { history.pushState({ view: 'home' }, '', '/'); } catch (e) { } }
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
            } catch (e) { }
        }
    } else {
        console.error(
            `[WishRite] Product loading failed\n` +
            `[WishRite] Slug: ${param}\n` +
            `[WishRite] HTTP status: 404`
        );
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
    if (typeof window !== 'undefined' && window.pdpStickyCTAObserver) {
        try { window.pdpStickyCTAObserver.disconnect(); } catch (e) {}
        window.pdpStickyCTAObserver = null;
    }
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

    const isOutOfStock = Number(product.stockQuantity || 0) <= 0;
    const priceFormatted = (typeof formatPrice === 'function')
        ? formatPrice(product.sellingPrice)
        : `₹${Number(product.sellingPrice).toLocaleString('en-IN')}`;

    const innerContent = !isOutOfStock ? `
        <button class="btn btn-primary" onclick="addToCart('${product.id}', event)">ADD TO CART — ${priceFormatted}</button>
        <button class="btn btn-secondary" onclick="buyNowFromPDP('${product.id}')">BUY NOW</button>
    ` : `
        <button class="btn btn-primary" onclick="openNotifyMeModal('${product.id}')" style="width:100%;">NOTIFY ME WHEN AVAILABLE</button>
    `;

    ctas.forEach(cta => {
        cta.innerHTML = innerContent;
    });

    // Phase 5 UX (P2-2): Initialize IntersectionObserver to control mobile sticky CTA visibility
    // Sticky CTA remains hidden while inline PDP action buttons are visible in viewport
    if (typeof initPdpStickyCTAObserver === 'function') {
        initPdpStickyCTAObserver();
    }
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
    const naEl = document.getElementById('season-arrivals-container') || document.getElementById('new-arrivals-live-container');

    const hasProducts = productsDB && productsDB.length > 0;

    if (!hasProducts) {
        if (typeof renderProductLoadingSkeletons === 'function') {
            if (bsEl) renderProductLoadingSkeletons('bestsellers-container', 10);
            if (naEl) renderProductLoadingSkeletons(naEl.id, 6);
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
        ? productsService.getBestSellers(10)
        : (window.productsDB || productsDB).slice(0, 10);
    const newArrivals = (typeof productsService !== 'undefined')
        ? productsService.getNewArrivals(6)
        : (window.productsDB || productsDB).slice(0, 6);

    if (typeof renderProductsToContainer === 'function') {
        if (bsEl) renderProductsToContainer(bestsellers, 'bestsellers-container');
        if (naEl) renderProductsToContainer(newArrivals, naEl.id);
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
    } else if (current === 'kids') {
        renderKidsPage();
    }
});

/**
 * Render dedicated Collections Overview Page connected to real product data
 */
async function renderCollectionsPage() {
    currentFilters.category = 'All';
    currentFilters.availability = 'All';
    currentFilters.priceRange = 'All';
    currentFilters.occasion = 'All';
    if (typeof renderActivePageProducts === 'function') {
        await renderActivePageProducts('collections');
    }
}
window.renderCollectionsPage = renderCollectionsPage;

/**
 * Render Public Creator Storefront with Creator Hero & Recommended Products
 */
async function renderCreatorStorefront(slug) {
    const viewEl = document.getElementById('creator-storefront-view');
    if (!viewEl) return;

    viewEl.innerHTML = `
        <div class="container" style="max-width:1240px;margin:0 auto;text-align:center;padding:60px 20px;">
            <div style="font-size:32px;color:var(--wr-primary);margin-bottom:12px;">✨</div>
            <p style="color:var(--wr-text-muted);font-size:0.95rem;">Loading curated creator boutique…</p>
        </div>
    `;

    try {
        let creator = null;
        if (typeof WishRiteAttribution !== 'undefined') {
            creator = await WishRiteAttribution.fetchPublicCreator(slug);
        } else {
            const res = await fetch(`/api/public/influencers/${encodeURIComponent(slug)}`);
            if (res.ok) {
                const data = await res.json();
                creator = data?.data || null;
            }
        }

        if (!creator || creator.status !== 'active') {
            viewEl.innerHTML = `
                <div class="container">
                    <div class="creator-empty-state">
                        <div class="creator-empty-icon">💎</div>
                        <h2 class="creator-empty-title">Creator Boutique Not Found</h2>
                        <p class="creator-empty-desc">
                            The creator storefront you are looking for may be inactive or does not exist. Explore our full collection of hallmarked 925 sterling silver jewellery.
                        </p>
                        <button class="btn btn-primary" onclick="navigateTo('shop');" style="margin-top:12px;">
                            Explore WishRite Collections &rarr;
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        // Set active attribution for the customer
        if (typeof WishRiteAttribution !== 'undefined') {
            WishRiteAttribution.setAttribution({
                influencer_id: creator.id || creator.influencer_id,
                public_slug: creator.public_slug || slug,
                code: creator.influencer_code,
                name: creator.name
            });
        }

        // Dynamic SEO Update (Section 23)
        document.title = `${creator.name}'s Curated Silver Collection | WishRite`;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.setAttribute('content', `Explore handcrafted 925 sterling silver jewellery handpicked by ${creator.name} exclusively on WishRite.`);
        }

        // Fetch recommended products or fallback to store catalog
        let recommendedProducts = [];
        try {
            const prodRes = await fetch(`/api/public/influencers/${encodeURIComponent(slug)}/products`);
            if (prodRes.ok) {
                const pData = await prodRes.json();
                recommendedProducts = Array.isArray(pData?.data) ? pData.data : (pData?.data?.products || []);
            }
        } catch (pe) { }

        // If specific recommended products are not defined, showcase top live products from allProducts
        if (recommendedProducts.length === 0 && Array.isArray(allProducts) && allProducts.length > 0) {
            recommendedProducts = allProducts.filter(p => p && Number(p.stockQuantity || 0) > 0).slice(0, 12);
        }

        const initialChar = (creator.name || 'C').charAt(0).toUpperCase();
        const avatarHtml = creator.profile_image
            ? `<img src="${escapeWishriteHtml(creator.profile_image)}" alt="${escapeWishriteHtml(creator.name)}" class="creator-avatar">`
            : `<div class="creator-avatar" style="display:flex;align-items:center;justify-content:center;background:#5E3435;color:#fff;font-size:32px;font-weight:600;border-radius:50%;">${initialChar}</div>`;
        const instagramLink = creator.instagram_id
            ? `<a href="https://instagram.com/${creator.instagram_id.replace(/^@/, '')}" target="_blank" rel="noopener" class="creator-social">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                @${creator.instagram_id.replace(/^@/, '')}
               </a>`
            : '';

        const bioText = creator.bio || 'Curated hallmarked 925 sterling silver pieces designed for timeless elegance and everyday wear.';

        let productsHTML = '';
        if (recommendedProducts.length > 0) {
            productsHTML = recommendedProducts.map(p => {
                if (typeof createProductCardHTML === 'function') {
                    const safeName = (p.name || 'Jewellery').replace(/'/g, "\\'");
                    const safeCreatorName = (creator.name || 'Creator').replace(/'/g, "\\'");
                    return `
                        <div style="position: relative;">
                            <span class="creator-curated-badge">✨ Curated</span>
                            <button class="creator-card-share-btn" title="Share this piece" onclick="event.stopPropagation(); if (typeof WishRiteAttribution !== 'undefined') WishRiteAttribution.shareCreatorLink({ slug: '${creator.public_slug || slug}', name: '${safeCreatorName}', productCode: '${p.productCode || p.sku || p.id}', title: '${safeName}' });">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            </button>
                            ${createProductCardHTML(p)}
                        </div>
                    `;
                }
                return '';
            }).join('');
        } else {
            productsHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; color: var(--wr-text-muted);">
                    <p>Curated recommendations are being refreshed. Explore all pieces below.</p>
                </div>
            `;
        }

        viewEl.innerHTML = `
            <div class="container">
                <!-- Creator Hero Banner -->
                <div class="creator-hero">
                    <div class="creator-hero-content">
                        <div class="creator-avatar-wrap">
                            ${avatarHtml}
                            <span class="creator-verified-badge" title="Verified WishRite Ambassador">✓</span>
                        </div>
                        <div class="creator-info">
                            <div class="creator-eyebrow">
                                <span>WishRite Creator Club</span>
                                <span>•</span>
                                <span>Curated Boutique</span>
                            </div>
                            <h1 class="creator-name">${escapeWishriteHtml(creator.name)}</h1>
                            ${instagramLink}
                            <p class="creator-bio">${escapeWishriteHtml(bioText)}</p>
                            <div class="creator-actions">
                                <button class="creator-btn creator-btn-primary" onclick="if (typeof WishRiteAttribution !== 'undefined') WishRiteAttribution.shareCreatorLink({ slug: '${creator.public_slug || slug}', name: '${escapeWishriteHtml(creator.name)}' });">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                                    Share Collection
                                </button>
                                <button class="creator-btn creator-btn-ghost" onclick="if (typeof WishRiteAttribution !== 'undefined') WishRiteAttribution.shareViaWhatsApp({ slug: '${creator.public_slug || slug}', name: '${escapeWishriteHtml(creator.name)}' });">
                                    Share on WhatsApp
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Products Section -->
                <div class="creator-section-header">
                    <div class="creator-section-sub">Handpicked by ${escapeWishriteHtml(creator.name)}</div>
                    <h2 class="creator-section-title">Recommended Silver Jewellery</h2>
                </div>

                <div class="creator-products-grid">
                    ${productsHTML}
                </div>
            </div>
        `;

        if (typeof initScrollReveal === 'function') {
            initScrollReveal();
        }
    } catch (err) {
        console.error('[WishRite Storefront] Render error:', err);
        viewEl.innerHTML = `
            <div class="container" style="text-align:center;padding:60px 20px;">
                <p style="color:var(--wr-text-muted);">Unable to load creator storefront. Please try again.</p>
                <button class="btn btn-primary" onclick="navigateTo('home');" style="margin-top:16px;">Back to Home</button>
            </div>
        `;
    }
}
window.renderCreatorStorefront = renderCreatorStorefront;

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
            } catch (e) { }
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
 * Render dedicated New Arrivals Page
 */
async function renderNewArrivalsPage() {
    currentFilters.category = 'All';
    currentFilters.availability = 'All';
    currentFilters.priceRange = 'All';
    currentFilters.occasion = 'All';
    if (typeof renderActivePageProducts === 'function') {
        await renderActivePageProducts('new-arrivals');
    }
}
window.renderNewArrivalsPage = renderNewArrivalsPage;

/**
 * Render dedicated Best Sellers Page
 */
async function renderBestSellersPage() {
    currentFilters.category = 'All';
    currentFilters.availability = 'All';
    currentFilters.priceRange = 'All';
    currentFilters.occasion = 'All';
    if (typeof renderActivePageProducts === 'function') {
        await renderActivePageProducts('best-sellers');
    }
}
window.renderBestSellersPage = renderBestSellersPage;

/**
 * Render dedicated Men's Page
 */
async function renderMenPage() {
    currentFilters.category = 'All';
    currentFilters.availability = 'All';
    currentFilters.priceRange = 'All';
    currentFilters.occasion = 'All';
    if (typeof renderActivePageProducts === 'function') {
        await renderActivePageProducts('men');
    }
}
window.renderMenPage = renderMenPage;

// ── Centralized configuration for Kids collection & gender mapping (Requirement 7) ──
const KIDS_PRODUCT_CONFIG = {
    // Product codes or IDs specifically designated for Little Boys
    boys: [],
    // Product codes or IDs specifically designated for Little Girls
    girls: [],
    // Category or tag keywords that designate Kids items
    kidsKeywords: ['kid', 'kids', 'child', 'children', 'baby', 'toddler', 'nazariya', 'little'],
    // Product codes explicitly assigned to Kids collection (can be populated as inventory expands)
    productCodes: []
};
window.KIDS_PRODUCT_CONFIG = KIDS_PRODUCT_CONFIG;

let currentKidsFilter = 'all';

/**
 * Filter products for Kids collection with dedicated gender mapping (Parts 15, 16, 17)
 * Uses database audience ('Kids-Girl', 'Kids-Boy') as PRIMARY source of truth.
 * Does NOT filter out products with stock_quantity = 0.
 */
function getFilteredKidsProducts(filter = 'all') {
    const db = (typeof window !== 'undefined' && Array.isArray(window.productsDB) && window.productsDB.length > 0)
        ? window.productsDB
        : (typeof productsDB !== 'undefined' && Array.isArray(productsDB) ? productsDB : []);

    if (!db || !db.length) return [];

    const kidsKeywords = (typeof KIDS_PRODUCT_CONFIG !== 'undefined' && Array.isArray(KIDS_PRODUCT_CONFIG.kidsKeywords))
        ? KIDS_PRODUCT_CONFIG.kidsKeywords
        : ['kid', 'kids', 'child', 'children', 'baby', 'toddler', 'nazariya', 'little'];

    const normalizeGender = value =>
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[_-]/g, ' ')
            .replace(/\s+/g, ' ');

    const BOY_GENDERS = new Set(['boy', 'boys', 'male', 'little boy', 'little boys']);
    const GIRL_GENDERS = new Set(['girl', 'girls', 'female', 'little girl', 'little girls']);

    // Filter products belonging to Kids (all active products)
    const allKids = db.filter(p => {
        if (!p) return false;
        if (typeof isSilverJewelleryProduct === 'function' && !isSilverJewelleryProduct(p)) return false;

        // Explicit config mappings
        const pCode = (p.productCode || p.code || p.id || '').trim();
        if (typeof KIDS_PRODUCT_CONFIG !== 'undefined') {
            if (Array.isArray(KIDS_PRODUCT_CONFIG.productCodes) && KIDS_PRODUCT_CONFIG.productCodes.includes(pCode)) return true;
            if (Array.isArray(KIDS_PRODUCT_CONFIG.boys) && KIDS_PRODUCT_CONFIG.boys.includes(pCode)) return true;
            if (Array.isArray(KIDS_PRODUCT_CONFIG.girls) && KIDS_PRODUCT_CONFIG.girls.includes(pCode)) return true;
        }

        // Primary source of truth: database audience (supporting canonical 'Boys', 'Girls' & legacy)
        const aud = (p.audience || '').trim().toLowerCase();
        if (aud === 'boys' || aud === 'girls' || aud === 'kids-boy' || aud === 'kids-girl' || aud.includes('kid')) return true;

        // Category contains: kids, kid, children, child, baby, toddler, little
        const cat = String(p.category || '').toLowerCase();
        const rawCat = String(p.rawCategory || '').toLowerCase();
        const isKidsCategory = ['kids', 'kid', 'children', 'child', 'baby', 'toddler', 'little'].some(k =>
            cat.includes(k) || rawCat.includes(k)
        );
        if (isKidsCategory) return true;

        // age_group / target_audience contains Kids/Children/Baby
        const ageGroup = String(p.age_group || p.target_audience || '').toLowerCase();
        const targetAudience = String(p.target_audience || p.age_group || '').toLowerCase();
        if (['kids', 'children', 'baby', 'child', 'toddler'].some(k => ageGroup.includes(k) || targetAudience.includes(k))) return true;

        // gender contains Boys/Girls when product is clearly part of Kids inventory
        const gender = normalizeGender(p.gender || p.target_gender || '');
        const targetGender = normalizeGender(p.target_gender || p.gender || '');
        const hasGenderTag = BOY_GENDERS.has(gender) || BOY_GENDERS.has(targetGender) || GIRL_GENDERS.has(gender) || GIRL_GENDERS.has(targetGender);

        const name = (p.name || p.product_name || '').toLowerCase();
        const desc = (p.description || p.product_description || '').toLowerCase();
        const hasKidsKeyword = kidsKeywords.some(kw => name.includes(kw) || desc.includes(kw));

        if (hasGenderTag && hasKidsKeyword) return true;
        if (hasKidsKeyword) return true;

        return false;
    });

    if (filter === 'boys') {
        return allKids.filter(p => {
            const pCode = (p.productCode || p.code || p.id || '').trim();
            if (typeof KIDS_PRODUCT_CONFIG !== 'undefined' && Array.isArray(KIDS_PRODUCT_CONFIG.boys) && KIDS_PRODUCT_CONFIG.boys.includes(pCode)) {
                return true;
            }
            const aud = (p.audience || '').trim().toLowerCase();
            if (aud === 'boys' || aud === 'kids-boy') return true;

            const gender = normalizeGender(p.gender || p.target_gender || '');
            const targetGender = normalizeGender(p.target_gender || '');
            return BOY_GENDERS.has(gender) || BOY_GENDERS.has(targetGender);
        });
    }

    if (filter === 'girls') {
        return allKids.filter(p => {
            const pCode = (p.productCode || p.code || p.id || '').trim();
            if (typeof KIDS_PRODUCT_CONFIG !== 'undefined' && Array.isArray(KIDS_PRODUCT_CONFIG.girls) && KIDS_PRODUCT_CONFIG.girls.includes(pCode)) {
                return true;
            }
            const aud = (p.audience || '').trim().toLowerCase();
            if (aud === 'girls' || aud === 'kids-girl') return true;

            const gender = normalizeGender(p.gender || p.target_gender || '');
            const targetGender = normalizeGender(p.target_gender || '');
            return GIRL_GENDERS.has(gender) || GIRL_GENDERS.has(targetGender);
        });
    }

    return allKids;
}
window.getFilteredKidsProducts = getFilteredKidsProducts;

/**
 * Update Kids category filter without reloading page
 */
function setKidsFilter(filter) {
    currentKidsFilter = filter || 'all';

    // Update active state and aria-pressed on kids gender panels
    document.querySelectorAll('.kids-gender-panel').forEach(btn => {
        const btnFilter = btn.getAttribute('data-kids-filter');
        const isActive = (btnFilter === currentKidsFilter);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (typeof renderActivePageProducts === 'function') {
        renderActivePageProducts('kids');
    } else {
        renderKidsProductsList();
    }

    // Smoothly scroll to product section with header offset
    if (filter === 'boys' || filter === 'girls') {
        const targetEl = document.getElementById('kids-grid');
        if (targetEl) {
            const headerHeight = document.querySelector('.header')?.offsetHeight || 75;
            const elementPosition = targetEl.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 16;
            window.scrollTo({
                top: Math.max(0, offsetPosition),
                behavior: 'smooth'
            });
        }
    }
}
window.setKidsFilter = setKidsFilter;

/**
 * Render Kids products to container and update dynamic counts
 */
function renderKidsProductsList() {
    const countEl = document.getElementById('kids-count');
    const gridEl = document.getElementById('kids-grid');
    if (!gridEl) return;

    const products = getFilteredKidsProducts(currentKidsFilter);

    // Update count display dynamically
    if (countEl) {
        if (currentKidsFilter === 'boys') {
            countEl.textContent = `Showing ${products.length} Boys Pieces`;
        } else if (currentKidsFilter === 'girls') {
            countEl.textContent = `Showing ${products.length} Girls Pieces`;
        } else {
            countEl.textContent = `Showing ${products.length} Kids Pieces`;
        }
    }

    if (products.length === 0) {
        let emptyTitle = "No pieces available yet.";
        let emptyDesc = "Adorable jewellery for little ones is coming soon to WishRite.";
        if (currentKidsFilter === 'boys') {
            emptyTitle = "Boys Jewellery Coming Soon";
            emptyDesc = "Thoughtfully crafted silver treasures for boys will be arriving soon.";
        } else if (currentKidsFilter === 'girls') {
            emptyTitle = "Girls Jewellery Coming Soon";
            emptyDesc = "Delicate silver pieces crafted for girls will be arriving soon.";
        }

        gridEl.innerHTML = `
            <div class="kids-empty-state" style="grid-column:1/-1;padding:60px 20px;text-align:center;">
                <div style="width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:rgba(83, 55, 79,0.06);display:flex;align-items:center;justify-content:center;color:var(--wr-primary);">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>
                    </svg>
                </div>
                <h3 style="font-family:var(--wr-font-heading);font-size:1.3rem;color:var(--wr-primary);margin-bottom:8px;">${emptyTitle}</h3>
                <p style="color:var(--wr-text-muted);font-size:0.95rem;max-width:480px;margin:0 auto 20px;">${emptyDesc}</p>
                <button class="btn btn-primary btn-sm" onclick="navigateTo('shop')">Explore All Jewellery</button>
            </div>
        `;
    } else {
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer(products, 'kids-grid');
        }
    }
}

/**
 * Render dedicated Kids storefront view
 */
async function renderKidsPage() {
    // Reset to default ALL KIDS on entry (neither panel active)
    currentKidsFilter = 'all';

    document.querySelectorAll('.kids-gender-panel').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    });

    currentFilters.category = 'All';
    currentFilters.availability = 'All';
    currentFilters.priceRange = 'All';
    currentFilters.occasion = 'All';

    if (typeof renderActivePageProducts === 'function') {
        await renderActivePageProducts('kids');
    } else {
        renderKidsProductsList();
    }
}
window.renderKidsPage = renderKidsPage;

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

    // Detect Creator / Influencer Public Storefront (/influencer/:slug or /creator/:slug)
    const creatorPortalRoutes = ['login', 'dashboard', 'links', 'wallet', 'withdraw', 'points', 'rewards', 'profile'];
    const creatorMatch = path.match(/^\/(?:influencer|creator)\/([^\/]+)(?:\/product\/([^\/]+))?/);
    if (creatorMatch) {
        const slug = creatorMatch[1].trim();
        const productCode = creatorMatch[2] ? creatorMatch[2].trim() : null;

        if (!creatorPortalRoutes.includes(slug.toLowerCase())) {
            if (typeof WishRiteAttribution !== 'undefined') {
                WishRiteAttribution.initializeArrival();
            }

            if (productCode) {
                navigateTo('product', productCode, pushHistory);
            } else {
                navigateTo('creator-storefront', slug, pushHistory);
            }
            return;
        }
    } else if (typeof WishRiteAttribution !== 'undefined') {
        WishRiteAttribution.initializeArrival();
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
    } else if (path === '/kids' || hash === '#kids') {
        navigateTo('kids', null, pushHistory);
        return;
    } else if (path === '/men' || hash === '#men') {
        navigateTo('men', null, pushHistory);
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
    } else if (path === '/account' || path === '/profile' || hash === '#account' || hash === '#creator' || path === '/creator') {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab') || (hash === '#creator' ? 'creator' : (path === '/creator' ? 'creator' : 'account'));
        navigateTo('profile', tabParam, pushHistory);
        return;
    } else if (path === '/login' || hash === '#login') {
        navigateTo('login', null, pushHistory);
        return;
    } else if (path === '/register' || hash === '#register') {
        navigateTo('register', null, pushHistory);
        return;
    } else if (path === '/admin' || path === '/admin-rewards' || hash === '#admin-rewards') {
        window.location.href = '/admin-rewards.html';
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

    // Update active state in about-section-nav
    const navPills = document.querySelectorAll('#about-section-nav .collections-cat-btn');
    if (navPills.length > 0) {
        navPills.forEach(btn => {
            const href = btn.getAttribute('href') || '';
            if (href === '#' + cleanId) {
                btn.classList.add('active');
                try {
                    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } catch (e) {}
            } else {
                btn.classList.remove('active');
            }
        });
    }

    const header = document.querySelector('.header');
    const aboutNav = document.querySelector('.about-nav-bar');
    const headerHeight = header ? header.offsetHeight : 99;
    const navHeight = aboutNav ? aboutNav.offsetHeight : 64;
    const totalOffset = headerHeight + navHeight + 14;
    const elementPosition = el.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - totalOffset;

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
 * ScrollSpy for About sections: keeps active pill synchronized as the user scrolls
 */
function initAboutScrollSpy() {
    const sectionIds = ['story', 'philosophy', 'promise', 'shipping', 'returns', 'care', 'faqs', 'privacy', 'contact'];
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            if (typeof getCurrentView === 'function' && getCurrentView() !== 'about') return;

            const header = document.querySelector('.header');
            const aboutNav = document.querySelector('.about-nav-bar');
            const topOffset = (header ? header.offsetHeight : 99) + (aboutNav ? aboutNav.offsetHeight : 64) + 60;

            let currentSection = sectionIds[0];
            for (const id of sectionIds) {
                const el = document.getElementById(id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top <= topOffset) {
                        currentSection = id;
                    }
                }
            }

            const navPills = document.querySelectorAll('#about-section-nav .collections-cat-btn');
            navPills.forEach(btn => {
                const href = btn.getAttribute('href') || '';
                if (href === '#' + currentSection) {
                    if (!btn.classList.contains('active')) {
                        btn.classList.add('active');
                        try {
                            btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                        } catch (e) {}
                    }
                } else {
                    btn.classList.remove('active');
                }
            });
        });
    }, { passive: true });
}
window.initAboutScrollSpy = initAboutScrollSpy;

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

/**
 * Enforces strict separation between Silver Jewellery Mode and Occasion Mode.
 * When Occasion Mode is OFF:
 * All occasion-specific shipping, care instructions, badges, and mentions
 * are completely hidden from normal Silver Jewellery pages.
 * When Occasion Mode is ON:
 * Occasion content becomes available only on relevant occasion experiences.
 */
function updateOccasionContentVisibility() {
    const activeOccasion = (typeof getActiveOccasion === 'function') ? getActiveOccasion() : null;
    const isOccasionOn = Boolean(activeOccasion && activeOccasion.enabled);

    if (isOccasionOn) {
        document.body.classList.add('occasion-mode-active');
    } else {
        document.body.classList.remove('occasion-mode-active');
    }

    // 1. Toggle all occasion-only elements
    document.querySelectorAll('.occasion-content-only').forEach(el => {
        el.style.display = isOccasionOn ? '' : 'none';
    });

    // 2. Adjust Care guide header, subtitle, and layout
    const careTitle = document.getElementById('care-header-title');
    const careDesc = document.getElementById('care-header-desc');
    const careGrid = document.querySelector('.care-grid');

    if (careTitle) {
        careTitle.innerHTML = isOccasionOn
            ? 'Jewellery &amp; Fabric Care Guide'
            : 'Jewellery Care Guide';
    }
    if (careDesc) {
        careDesc.textContent = isOccasionOn
            ? 'Simple daily habits ensure your precious silver keeps its radiant shine and your ethnic wear remains pristine for generations.'
            : 'Simple daily habits ensure your precious silver keeps its radiant shine for generations.';
    }
    if (careGrid) {
        if (!isOccasionOn) {
            careGrid.classList.add('single-mode');
        } else {
            careGrid.classList.remove('single-mode');
        }
    }

    // 3. Navigation links
    initFestiveNavigation();
}
window.updateOccasionContentVisibility = updateOccasionContentVisibility;

window.addEventListener('wishrite:occasion-updated', () => {
    updateOccasionContentVisibility();
    if (typeof initFestiveNavigation === 'function') {
        initFestiveNavigation();
    }
    if (typeof initHeroCarousel === 'function') {
        initHeroCarousel();
    }
    if (typeof updateHeaderBrandSubtitle === 'function' && typeof getCurrentView === 'function') {
        updateHeaderBrandSubtitle(getCurrentView());
    }
    if (typeof getCurrentView === 'function' && getCurrentView() === 'occasion' && typeof renderOccasionPage === 'function') {
        renderOccasionPage();
    }
});

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
    initAboutScrollSpy();

    // Initial route handling (instant view rendering without waiting for async network inventory)
    handleInitialURLRoute(false);

    // Initial occasion visibility check
    updateOccasionContentVisibility();

    // 2. Concurrently load products and active occasion settings from Supabase
    try {
        await Promise.allSettled([
            loadProductsFromInventory(),
            (typeof loadActiveOccasionSettings === 'function' ? loadActiveOccasionSettings() : Promise.resolve(null))
        ]);

        // 3. Initialize Supabase Realtime channel for instant occasion settings and inventory sync
        if (typeof initOccasionRealtimeSync === 'function') {
            initOccasionRealtimeSync();
        }
        if (typeof initRealtimeInventorySync === 'function') {
            initRealtimeInventorySync();
        }
    } catch (err) {
        console.warn('[WishRite] Initial data load notice:', err);
    }

    // Re-verify occasion visibility after settings load
    updateOccasionContentVisibility();

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
