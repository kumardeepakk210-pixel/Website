/* ============================================
   WISHRITE — UI
   Mobile menu, gallery, animations, filters
   ============================================ */

// ── Mobile Menu ──
function openMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) {
        menu.classList.add('open');
        document.body.classList.add('menu-open');
    }
}

function closeMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) {
        menu.classList.remove('open');
        document.body.classList.remove('menu-open');
    }
}

// ── Scroll Reveal ──
function initScrollReveal() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Header Scroll & Hero Transition Effect ──
function updateHeaderState() {
    const header = document.querySelector('.header');
    if (!header) return;

    const h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) {
        document.documentElement.style.setProperty('--header-height', h + 'px');
    }

    const isHome = (typeof getCurrentView === 'function' ? getCurrentView() === 'home' : true);
    const scrollY = window.scrollY;

    header.classList.remove('header-over-hero');
    header.classList.toggle('scrolled', scrollY > 20);
}

function initHeaderScroll() {
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
    window.addEventListener('resize', updateHeaderState, { passive: true });
}

// ── Hero Carousel & Slider Controls ──
let heroSliderTimer = null;
let currentHeroSlide = 0;
const HERO_SLIDE_DURATION = 6000; // 6 seconds per slide

// ── 3 Completely Different Editorial Hero Slides ──
const HERO_SLIDES_DATA = [
    {
        eyebrow: "TIMELESS · VERSATILE · YOURS",
        title: "Timeless Silver.<br><span class=\"hero-title-italic\">Modern Elegance.</span>",
        description: "Thoughtfully crafted 925 sterling silver jewellery for everyday moments, meaningful occasions, and unforgettable gifts.",
        primaryCta: {
            text: "SHOP JEWELLERY",
            onclick: "navigateToShopWithFilter('category', 'All', 'featured', 'All Jewellery')"
        },
        secondaryCta: {
            text: "EXPLORE COLLECTIONS",
            onclick: "navigateTo('collections')"
        },
        editorial: [
            "JEWELLERY",
            "FOR LIFE'S",
            "BEAUTIFUL",
            "BEGINNINGS"
        ]
    },
    {
        eyebrow: "FOR EVERY STORY · A SILVER MOMENT",
        title: "Everyday Brilliance.<br><span class=\"hero-title-italic\">Forever Yours.</span>",
        description: "Minimal. Meaningful. Made in 925 sterling silver — designed to complement your unique story.",
        primaryCta: {
            text: "SHOP NEW ARRIVALS",
            onclick: "navigateTo('new-arrivals')"
        },
        secondaryCta: {
            text: "DISCOVER MORE",
            onclick: "navigateToShopWithFilter('category', 'All', 'featured', 'All Jewellery')"
        },
        editorial: [
            "SIMPLE",
            "PIECES",
            "EXTRAORDINARY",
            "STORIES"
        ]
    },
    {
        eyebrow: "MORE THAN A GIFT · A LASTING EMOTION",
        title: "Meaningful Gifts.<br><span class=\"hero-title-italic\">Moments That Stay.</span>",
        description: "Celebrate love, milestones, and little joys with exquisitely crafted 925 sterling silver jewellery.",
        primaryCta: {
            text: "SHOP GIFTS",
            onclick: "navigateToShopWithFilter('occasion', 'Gifting', 'featured', 'Gifts')"
        },
        secondaryCta: {
            text: "BROWSE COLLECTIONS",
            onclick: "navigateTo('collections')"
        },
        editorial: [
            "GIFTS",
            "THAT TURN",
            "MOMENTS",
            "INTO",
            "MEMORIES"
        ]
    }
];

function updateHeroContentForSlide(slideIndex) {
    const heroContent = document.querySelector('.hero-content');
    const heroSideEditorial = document.querySelector('.hero-side-editorial');
    if (!heroContent) return;

    const activeOccasion = typeof window.getActiveOccasion === 'function' ? window.getActiveOccasion() : null;

    if (activeOccasion && activeOccasion.enabled && slideIndex === 0) {
        // Festive Edit Slide override
        heroContent.innerHTML = `
            <div class="hero-festive-badge">
                <span>✦</span>
                <span>${activeOccasion.eyebrow || 'THE FESTIVE EDIT'}</span>
                <span>✦</span>
            </div>
            <h1 class="hero-title festive-bengali-title">${activeOccasion.title}</h1>
            ${activeOccasion.englishTitle ? `<p class="hero-english-title" style="font-family:var(--wr-font-heading);font-style:italic;font-size:1.2rem;color:var(--festive-secondary,#D4AF37);margin:-4px 0 12px;letter-spacing:0.02em;">${activeOccasion.englishTitle}</p>` : ''}
            <p class="hero-description">${activeOccasion.description || activeOccasion.homepageSubtitle || 'Sarees • Statement Jewellery • Silver Pairings'}</p>
            <div class="hero-buttons">
                <a class="btn btn-hero-primary" onclick="navigateTo('occasion')">
                    <span>${activeOccasion.ctaText || activeOccasion.homepageCtaText || 'Shop festive collection'}</span>
                    <svg class="hero-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </a>
                <a class="btn btn-hero-secondary" onclick="navigateToShopWithFilter('category', 'All', 'featured', 'All Jewellery')">
                    Explore Silver Jewellery
                </a>
            </div>
        `;
        if (heroSideEditorial) {
            heroSideEditorial.innerHTML = `
                <span>FESTIVE</span>
                <span>COLLECTION</span>
                <span>925</span>
                <span>SILVER</span>
            `;
        }
    } else {
        const slideData = HERO_SLIDES_DATA[slideIndex % HERO_SLIDES_DATA.length] || HERO_SLIDES_DATA[0];
        heroContent.classList.remove('hero-content-enter');
        void heroContent.offsetWidth; // trigger reflow for smooth re-animation

        heroContent.innerHTML = `
            <p class="hero-subtitle">${slideData.eyebrow}</p>
            <h1 class="hero-title">${slideData.title}</h1>
            <p class="hero-description">${slideData.description}</p>
            <div class="hero-buttons">
                <a class="btn btn-hero-primary" onclick="${slideData.primaryCta.onclick}">
                    <span>${slideData.primaryCta.text}</span>
                    <svg class="hero-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </a>
                <a class="btn btn-hero-secondary" onclick="${slideData.secondaryCta.onclick}">
                    ${slideData.secondaryCta.text}
                </a>
            </div>
        `;
        heroContent.classList.add('hero-content-enter');

        if (heroSideEditorial) {
            heroSideEditorial.classList.remove('hero-content-enter');
            void heroSideEditorial.offsetWidth;
            const editorialList = Array.isArray(slideData.editorial) ? slideData.editorial : [];
            heroSideEditorial.innerHTML = editorialList.map(item => `<span>${item}</span>`).join('');
            heroSideEditorial.classList.add('hero-content-enter');
        }
    }
}

function goToHeroSlide(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const navItems = document.querySelectorAll('.hero-slide-nav');
    if (!slides.length) return;

    currentHeroSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentHeroSlide);
    });

    updateHeroContentForSlide(currentHeroSlide);

    navItems.forEach((nav, idx) => {
        nav.classList.toggle('active', idx === currentHeroSlide);
        const progressBar = nav.querySelector('.hero-progress-bar');
        if (progressBar) {
            progressBar.style.animation = 'none';
            void progressBar.offsetWidth; // trigger reflow
            if (idx === currentHeroSlide) {
                progressBar.style.animation = 'heroProgressFill 6s linear forwards';
            }
        }
    });

    resetHeroSliderTimer();
}

function nextHeroSlide() {
    goToHeroSlide(currentHeroSlide + 1);
}

function prevHeroSlide() {
    goToHeroSlide(currentHeroSlide - 1);
}

function resetHeroSliderTimer() {
    if (heroSliderTimer) clearInterval(heroSliderTimer);
    heroSliderTimer = setInterval(() => {
        const slides = document.querySelectorAll('.hero-slide');
        if (slides.length > 1) {
            nextHeroSlide();
        }
    }, HERO_SLIDE_DURATION);
}

function initHeroCarousel() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;

    const activeOccasion = typeof window.getActiveOccasion === 'function' ? window.getActiveOccasion() : null;
    const firstSlideImg = slides[0]?.querySelector('img');
    if (firstSlideImg) {
        if (activeOccasion && activeOccasion.enabled && activeOccasion.heroImage) {
            firstSlideImg.src = activeOccasion.heroImage;
        } else {
            firstSlideImg.src = 'assets/hero/model-hero.jpg';
        }
    }

    // Touch swipe support for mobile
    const heroEl = document.querySelector('.hero');
    if (heroEl && !heroEl._sliderEventsBound) {
        heroEl._sliderEventsBound = true;
        let startX = 0, startY = 0;
        heroEl.addEventListener('touchstart', (e) => {
            if (e.changedTouches && e.changedTouches[0]) {
                startX = e.changedTouches[0].screenX;
                startY = e.changedTouches[0].screenY;
            }
        }, { passive: true });
        heroEl.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches[0]) {
                const diffX = startX - e.changedTouches[0].screenX;
                const diffY = startY - e.changedTouches[0].screenY;
                if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) {
                        nextHeroSlide();
                    } else {
                        prevHeroSlide();
                    }
                }
            }
        }, { passive: true });

        // Pause timer on hover
        heroEl.addEventListener('mouseenter', () => {
            if (heroSliderTimer) clearInterval(heroSliderTimer);
        });
        heroEl.addEventListener('mouseleave', () => {
            resetHeroSliderTimer();
        });
    }

    goToHeroSlide(0);
}

function scrollPastHero() {
    const hero = document.querySelector('.hero');
    if (hero) {
        const rect = hero.getBoundingClientRect();
        const targetScroll = window.scrollY + rect.height;
        window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    } else {
        window.scrollTo({
            top: window.innerHeight,
            behavior: 'smooth'
        });
    }
}

// Global exposure for inline events
window.goToHeroSlide = goToHeroSlide;
window.nextHeroSlide = nextHeroSlide;
window.prevHeroSlide = prevHeroSlide;
window.initHeroCarousel = initHeroCarousel;
window.scrollPastHero = scrollPastHero;
window.updateHeaderState = updateHeaderState;

// ── Shop & In-Page Filters & Sort ──
let currentFilters = {
    category: 'All',
    collection: 'All',
    priceRange: 'All',
    occasion: 'All',
    audience: 'All',
    availability: 'All'
};

let currentSort = 'featured';

function getActiveScope() {
    if (typeof getCurrentView === 'function') {
        const v = getCurrentView();
        if (['collections', 'new-arrivals', 'best-sellers', 'kids', 'men', 'shop'].includes(v)) {
            return v;
        }
    }
    return 'shop';
}
window.getActiveScope = getActiveScope;

function getScopeBaseProducts(scope) {
    const rawDb = (window.productsDB || productsDB || []);
    const db = rawDb.filter(p => p && (typeof isSilverJewelleryProduct === 'function' ? isSilverJewelleryProduct(p) : true));

    switch (scope) {
        case 'men':
            return db.filter(p => {
                const aud = ((p.audience || p.target_audience || p.gender || '') + '').trim().toLowerCase();
                // Strictly exclude female / women / kids audience
                if (aud === 'female' || aud === 'women' || aud === 'girls' || aud === 'kids-girl' || aud === 'boys' || aud === 'kids-boy' || aud.startsWith('kid')) return false;
                if (aud === 'men' || aud === 'male') return true;

                // Word boundary check for "men" or "mens" or "men's" in title, avoiding "women"
                const name = (p.name || '').toLowerCase();
                return /\b(men|mens|men's)\b/.test(name) && !/\b(women|womens|women's)\b/.test(name);
            });

        case 'kids': {
            let kids = db.filter(p => {
                const aud = ((p.audience || p.target_audience || p.gender || '') + '').trim().toLowerCase();
                // Strictly exclude female, women, men, male
                if (aud === 'female' || aud === 'women' || aud === 'men' || aud === 'male') return false;

                const cat = (p.category || '').toLowerCase();
                const name = (p.name || '').toLowerCase();
                const isKidsAud = aud === 'boys' || aud === 'girls' || aud === 'kids-boy' || aud === 'kids-girl' || aud.includes('kid') || aud.includes('child');
                const isKidsName = /\b(kid|kids|child|children|baby|toddler|nazariya)\b/.test(name);
                return isKidsAud || cat === 'kids' || isKidsName;
            });
            if (typeof currentKidsFilter !== 'undefined' && currentKidsFilter && currentKidsFilter !== 'all') {
                if (currentKidsFilter === 'boys') {
                    kids = kids.filter(p => {
                        const aud = ((p.audience || p.target_audience || p.gender || '') + '').trim().toLowerCase();
                        return aud === 'boys' || aud === 'kids-boy' || /\b(boy|boys)\b/.test((p.name || '').toLowerCase());
                    });
                } else if (currentKidsFilter === 'girls') {
                    kids = kids.filter(p => {
                        const aud = ((p.audience || p.target_audience || p.gender || '') + '').trim().toLowerCase();
                        return aud === 'girls' || aud === 'kids-girl' || /\b(girl|girls)\b/.test((p.name || '').toLowerCase());
                    });
                }
            }
            return kids;
        }

        case 'new-arrivals':
            if (typeof productsService !== 'undefined' && typeof productsService.getNewArrivals === 'function') {
                const na = productsService.getNewArrivals(0);
                if (na && na.length) return na;
            }
            return [...db].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        case 'best-sellers':
            if (typeof productsService !== 'undefined' && typeof productsService.getBestSellers === 'function') {
                const bs = productsService.getBestSellers(0);
                if (bs && bs.length) return bs;
            }
            return [...db].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0) || (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0));

        case 'collections':
        case 'shop':
        default:
            return db;
    }
}
window.getScopeBaseProducts = getScopeBaseProducts;

function buildPageSidebar(scope, baseProducts) {
    const sidebar = document.getElementById(`${scope}-sidebar`);
    if (!sidebar) return;

    const items = (baseProducts || getScopeBaseProducts(scope)).filter(Boolean);

    // Distinct categories for this page
    const catMap = new Map();
    items.forEach(p => {
        let c = p.category || (typeof normalizeCategory === 'function' && p.rawCategory ? normalizeCategory(p.rawCategory) : null);
        if (c && c !== 'All') {
            catMap.set(c, (catMap.get(c) || 0) + 1);
        }
    });

    if (scope === 'men') {
        const defaultMenCats = ['Earrings', 'Rings', 'Chains', 'Bracelets', 'Pendants'];
        defaultMenCats.forEach(c => {
            if (!catMap.has(c)) catMap.set(c, 0);
        });
    } else if (scope === 'kids') {
        const defaultKidsCats = ['Bracelets', 'Kadas', 'Earrings', 'Anklets', 'Pendants'];
        defaultKidsCats.forEach(c => {
            if (!catMap.has(c)) catMap.set(c, 0);
        });
    } else if (catMap.size === 0) {
        ['Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Bangles'].forEach(c => catMap.set(c, 0));
    }

    const priceRanges = [
        { label: 'All Prices', value: 'All' },
        { label: 'Under ₹2,000', value: '0-2000' },
        { label: '₹2,000 — ₹3,000', value: '2000-3000' },
        { label: '₹3,000 — ₹5,000', value: '3000-5000' },
        { label: 'Above ₹5,000', value: '5000-' }
    ];

    const occasions = ['All', 'Everyday', 'Office', 'Festive', 'Party', 'Gifting'];

    sidebar.innerHTML = `
        <div class="sidebar-title-row">
            <h3>Filters</h3>
            <button class="btn-clear-filters" onclick="resetPageFilters()">Clear all</button>
        </div>

        <h4 class="filter-group-title">Price Range</h4>
        ${priceRanges.map(r => `
            <label class="filter-option ${r.value === currentFilters.priceRange ? 'active' : ''}">
                <input type="radio" name="${scope}-price" value="${r.value}" ${r.value === currentFilters.priceRange ? 'checked' : ''} onchange="handlePriceFilter('${r.value}')">
                <span>${r.label}</span>
            </label>
        `).join('')}

        <h4 class="filter-group-title">Category</h4>
        <label class="filter-option ${currentFilters.category === 'All' ? 'active' : ''}">
            <input type="radio" name="${scope}-cat" value="All" ${currentFilters.category === 'All' ? 'checked' : ''} onchange="handlePageCategoryFilter('All')">
            <span>All Categories</span>
            <span class="filter-count">(${items.length})</span>
        </label>
        ${Array.from(catMap.entries()).map(([c, count]) => `
            <label class="filter-option ${currentFilters.category.toLowerCase() === c.toLowerCase() ? 'active' : ''}">
                <input type="radio" name="${scope}-cat" value="${c}" ${currentFilters.category.toLowerCase() === c.toLowerCase() ? 'checked' : ''} onchange="handlePageCategoryFilter('${c}')">
                <span>${c}</span>
                <span class="filter-count">(${count})</span>
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option ${o === currentFilters.occasion ? 'active' : ''}">
                <input type="radio" name="${scope}-occ" value="${o}" ${o === currentFilters.occasion ? 'checked' : ''} onchange="handleOccasionFilter('${o}')">
                <span>${o === 'All' ? 'All Occasions' : o}</span>
            </label>
        `).join('')}
    `;
}
window.buildPageSidebar = buildPageSidebar;

async function renderActivePageProducts(explicitScope) {
    const scope = explicitScope || getActiveScope();
    const countEl = document.getElementById(`${scope}-count`) || document.getElementById('shop-toolbar-count') || document.getElementById('shop-product-count');

    const gridMap = {
        'shop': 'shop-grid-container',
        'collections': 'collections-grid',
        'new-arrivals': 'new-arrivals-grid',
        'best-sellers': 'best-sellers-grid',
        'kids': 'kids-grid',
        'men': 'men-grid'
    };
    const containerId = gridMap[scope] || 'shop-grid-container';

    if (typeof productsService !== 'undefined' && (productsService.isLoading || productsDB.length === 0)) {
        if (countEl) countEl.textContent = 'Loading products...';
        if (typeof renderProductLoadingSkeletons === 'function') {
            renderProductLoadingSkeletons(containerId, 8);
        }
    }

    try {
        if (typeof productsService !== 'undefined') {
            await productsService.ensureLoaded();
        }
    } catch (err) {
        if (countEl) countEl.textContent = 'Unable to load products';
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer([], containerId);
        }
        return;
    }

    const baseProducts = getScopeBaseProducts(scope);
    // Display active products (including elegant sold-out discovery states)
    let filtered = baseProducts.filter(Boolean);

    // Category filter
    if (currentFilters.category && currentFilters.category !== 'All') {
        const targetCat = (typeof normalizeCategory === 'function' ? normalizeCategory(currentFilters.category) : currentFilters.category).toLowerCase();
        filtered = filtered.filter(p => {
            const pCat = (p.category || '').toLowerCase();
            const pRaw = (p.rawCategory || '').trim().toLowerCase();
            const norm = (typeof normalizeCategory === 'function' && p.rawCategory) ? (normalizeCategory(p.rawCategory) || '').toLowerCase() : '';
            return pCat === targetCat || pRaw === targetCat || norm === targetCat;
        });
    }

    // Occasion filter
    if (currentFilters.occasion && currentFilters.occasion !== 'All') {
        filtered = filtered.filter(p => p.occasions && p.occasions.includes(currentFilters.occasion));
    }

    // Price range filter
    if (currentFilters.priceRange && currentFilters.priceRange !== 'All') {
        const [min, max] = currentFilters.priceRange.split('-').map(Number);
        filtered = filtered.filter(p => {
            if (max) return p.sellingPrice >= min && p.sellingPrice <= max;
            return p.sellingPrice >= min;
        });
    }

    // Sort
    switch (currentSort) {
        case 'price-low':
            filtered.sort((a, b) => a.sellingPrice - b.sellingPrice);
            break;
        case 'price-high':
            filtered.sort((a, b) => b.sellingPrice - a.sellingPrice);
            break;
        case 'newest':
            filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            break;
        case 'name-asc':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'featured':
        default:
            filtered.sort((a, b) => (b.salesCount - a.salesCount) || (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0));
            break;
    }

    // Render products to grid
    if (typeof renderProductsToContainer === 'function') {
        renderProductsToContainer(filtered, containerId);
    }

    // Update count and heading
    if (countEl) {
        let label = '';
        if (currentFilters.category && currentFilters.category !== 'All') {
            if (scope === 'men') label = `Men's ${currentFilters.category} (${filtered.length} products)`;
            else if (scope === 'kids') label = `Kids ${currentFilters.category} (${filtered.length} products)`;
            else label = `${currentFilters.category} (${filtered.length} products)`;
        } else {
            if (scope === 'men') label = `Men's Collection (${filtered.length} products)`;
            else if (scope === 'kids') label = `Kids Collection (${filtered.length} products)`;
            else if (scope === 'collections') label = `Collections (${filtered.length} products)`;
            else if (scope === 'new-arrivals') label = `New Arrivals (${filtered.length} products)`;
            else if (scope === 'best-sellers') label = `Best Sellers (${filtered.length} products)`;
            else label = `All Jewellery (${filtered.length} products)`;
        }
        countEl.textContent = label;
    }

    // Update active state on horizontal category bar
    updateActiveCategoryNav(currentFilters.category || 'All');

    // Build sidebar
    buildPageSidebar(scope, baseProducts);

    // Sync sort select
    const sortSelect = document.getElementById(`${scope}-sort-select`) || document.getElementById('shop-sort-select');
    if (sortSelect) sortSelect.value = currentSort;
}
window.renderActivePageProducts = renderActivePageProducts;

function applyFiltersAndSort() {
    renderActivePageProducts();
}
window.applyFiltersAndSort = applyFiltersAndSort;

/**
 * Universal cross-page shop router with filter, sort, and title sync
 */
function navigateToShopWithFilter(filterType, filterValue, sortOption = 'featured', customTitle = null) {
    currentFilters = {
        category: 'All',
        collection: 'All',
        priceRange: 'All',
        occasion: 'All',
        audience: 'All',
        availability: 'All'
    };

    if (filterType === 'category') {
        currentFilters.category = filterValue || 'All';
    } else if (filterType === 'collection') {
        currentFilters.collection = filterValue || 'All';
    } else if (filterType === 'occasion') {
        currentFilters.occasion = filterValue || 'All';
    } else if (filterType === 'priceRange') {
        currentFilters.priceRange = filterValue || 'All';
    } else if (filterType === 'audience') {
        currentFilters.audience = filterValue || 'All';
    }

    currentSort = sortOption || 'featured';

    if (typeof navigateTo === 'function') {
        navigateTo('shop', null, true);
    }

    renderActivePageProducts('shop');
}
window.navigateToShopWithFilter = navigateToShopWithFilter;

function updateActiveCategoryNav(category) {
    const target = (category || 'All').toLowerCase();
    document.querySelectorAll('.collections-category-bar').forEach(bar => {
        bar.querySelectorAll('.collections-cat-btn').forEach(btn => {
            const cat = (btn.getAttribute('data-cat') || '').toLowerCase();
            const isActive = (cat === target);
            btn.classList.toggle('active', isActive);
            if (isActive) {
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.removeAttribute('aria-current');
            }
        });
    });
}
window.updateActiveCategoryNav = updateActiveCategoryNav;

function handlePageCategoryFilter(category) {
    currentFilters.category = category;
    renderActivePageProducts();
}
window.handlePageCategoryFilter = handlePageCategoryFilter;

function handleCategoryFilter(category) {
    currentFilters.category = category;
    renderActivePageProducts();
}
window.handleCategoryFilter = handleCategoryFilter;

function handleAvailabilityFilter(availability) {
    currentFilters.availability = availability;
    renderActivePageProducts();
}
window.handleAvailabilityFilter = handleAvailabilityFilter;

function handleSort(value) {
    currentSort = value;
    const scope = getActiveScope();
    const sortSelect = document.getElementById(`${scope}-sort-select`) || document.getElementById('shop-sort-select') || document.querySelector('.shop-sort select');
    if (sortSelect) sortSelect.value = value;
    renderActivePageProducts();
}
window.handleSort = handleSort;

function handleOccasionFilter(occasion) {
    currentFilters.occasion = occasion;
    renderActivePageProducts();
}
window.handleOccasionFilter = handleOccasionFilter;

function handleAudienceFilter(audience) {
    currentFilters.audience = audience;
    renderActivePageProducts();
}
window.handleAudienceFilter = handleAudienceFilter;

function handlePriceFilter(range) {
    currentFilters.priceRange = range;
    renderActivePageProducts();
}
window.handlePriceFilter = handlePriceFilter;

function resetPageFilters() {
    currentFilters = {
        category: 'All',
        collection: 'All',
        priceRange: 'All',
        occasion: 'All',
        audience: 'All',
        availability: 'All'
    };
    currentSort = 'featured';
    renderActivePageProducts();
}
window.resetPageFilters = resetPageFilters;
window.resetFilters = resetPageFilters;
// ── Mobile Filter Sheet ──
function openFilterSheet() {
    buildMobileFilters();
    const sheet = document.getElementById('filter-sheet');
    const backdrop = document.getElementById('filter-backdrop');
    if (sheet) {
        sheet.classList.add('open');
        sheet.style.display = 'block';
        requestAnimationFrame(() => sheet.classList.add('open'));
    }
    if (backdrop) {
        backdrop.classList.add('show');
    }
    document.body.style.overflow = 'hidden';
}

function closeFilterSheet() {
    const sheet = document.getElementById('filter-sheet');
    const backdrop = document.getElementById('filter-backdrop');
    if (sheet) sheet.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => {
        if (sheet) sheet.style.display = '';
    }, 350);
}

// ── Mobile PDP swipe ──
let touchStartX = 0;
let touchEndX = 0;

function initPdpSwipe() {
    const gallery = document.getElementById('pdp-gallery');
    if (!gallery || !currentPdpProduct) return;

    const mainImage = gallery.querySelector('.pdp-main-image');
    if (!mainImage) return;

    mainImage.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    mainImage.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
            const totalImages = currentPdpProduct.images.length;
            if (diff > 0) {
                // Swipe left → next
                switchPdpImage((currentPdpImageIndex + 1) % totalImages);
            } else {
                // Swipe right → prev
                switchPdpImage((currentPdpImageIndex - 1 + totalImages) % totalImages);
            }
        }
    }, { passive: true });
}

// ── Build Sidebar Filters (Proxy to Active Scope) ──
function buildSidebarFilters() {
    buildPageSidebar(getActiveScope());
}
window.buildSidebarFilters = buildSidebarFilters;

// ── Build Mobile Filter Sheet ──
function buildMobileFilters() {
    const sheet = document.getElementById('filter-sheet-body');
    if (!sheet) return;

    const scope = getActiveScope();
    const baseProducts = (getScopeBaseProducts(scope) || []).filter(Boolean);

    const catMap = new Map();
    baseProducts.forEach(p => {
        let c = p.category || (typeof normalizeCategory === 'function' ? normalizeCategory(p.rawCategory) : null);
        if (c && c !== 'All') {
            catMap.set(c, (catMap.get(c) || 0) + 1);
        }
    });

    if (scope === 'men') {
        const defaultMenCats = ['Earrings', 'Rings', 'Chains', 'Bracelets', 'Pendants'];
        defaultMenCats.forEach(c => {
            if (!catMap.has(c)) catMap.set(c, 0);
        });
    } else if (scope === 'kids') {
        const defaultKidsCats = ['Bracelets', 'Kadas', 'Earrings', 'Anklets', 'Pendants'];
        defaultKidsCats.forEach(c => {
            if (!catMap.has(c)) catMap.set(c, 0);
        });
    } else if (catMap.size === 0) {
        ['Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Bangles'].forEach(c => catMap.set(c, 0));
    }

    const priceRanges = [
        { label: 'All Prices', value: 'All' },
        { label: 'Under ₹2,000', value: '0-2000' },
        { label: '₹2,000 — ₹3,000', value: '2000-3000' },
        { label: '₹3,000 — ₹5,000', value: '3000-5000' },
        { label: 'Above ₹5,000', value: '5000-' }
    ];

    const occasions = ['All', 'Everyday', 'Office', 'Festive', 'Party', 'Gifting'];

    sheet.innerHTML = `
        <h4 class="filter-group-title">Price Range</h4>
        ${priceRanges.map(r => `
            <label class="filter-option ${r.value === currentFilters.priceRange ? 'active' : ''}">
                <input type="radio" name="m-price" value="${r.value}" ${r.value === currentFilters.priceRange ? 'checked' : ''} onchange="currentFilters.priceRange='${r.value}'"> ${r.label}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Category</h4>
        <label class="filter-option ${currentFilters.category === 'All' ? 'active' : ''}">
            <input type="radio" name="m-cat" value="All" ${currentFilters.category === 'All' ? 'checked' : ''} onchange="currentFilters.category='All'"> All Categories (${baseProducts.length})
        </label>
        ${Array.from(catMap.entries()).map(([c, count]) => `
            <label class="filter-option ${currentFilters.category.toLowerCase() === c.toLowerCase() ? 'active' : ''}">
                <input type="radio" name="m-cat" value="${c}" ${currentFilters.category.toLowerCase() === c.toLowerCase() ? 'checked' : ''} onchange="currentFilters.category='${c}'"> ${c} (${count})
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option ${o === currentFilters.occasion ? 'active' : ''}">
                <input type="radio" name="m-occasion" value="${o}" ${o === currentFilters.occasion ? 'checked' : ''} onchange="currentFilters.occasion='${o}'"> ${o === 'All' ? 'All Occasions' : o}
            </label>
        `).join('')}
    `;
}
window.buildMobileFilters = buildMobileFilters;

function applyMobileFilters() {
    renderActivePageProducts();
    closeFilterSheet();
}
window.applyMobileFilters = applyMobileFilters;
