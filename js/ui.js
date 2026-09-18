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

    const isHome = (typeof getCurrentView === 'function' ? getCurrentView() === 'home' : true);
    const scrollY = window.scrollY;

    if (isHome) {
        if (scrollY > 50) {
            header.classList.remove('header-over-hero');
            header.classList.add('header-fixed');
            header.classList.add('scrolled');
        } else {
            header.classList.add('header-over-hero');
            header.classList.remove('header-fixed');
            header.classList.remove('scrolled');
        }
    } else {
        header.classList.remove('header-over-hero');
        header.classList.remove('header-fixed');
        header.classList.toggle('scrolled', scrollY > 20);
    }
}

function initHeaderScroll() {
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
}

// ── Hero Carousel & Slider Controls ──
let heroSliderTimer = null;
let currentHeroSlide = 0;
const HERO_SLIDE_DURATION = 6000; // 6 seconds per slide

function goToHeroSlide(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const navItems = document.querySelectorAll('.hero-slide-nav');
    if (!slides.length) return;

    currentHeroSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentHeroSlide);
    });

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
window.scrollPastHero = scrollPastHero;
window.updateHeaderState = updateHeaderState;

// ── Shop Filters & Sort ──
let currentFilters = {
    category: 'All',
    collection: 'All',
    priceRange: 'All',
    occasion: 'All'
};

let currentSort = 'featured';

async function applyFiltersAndSort() {
    const countEl = document.getElementById('shop-product-count');
    
    // Show loading skeleton if products are currently being fetched
    if (typeof productsService !== 'undefined' && (productsService.isLoading || productsDB.length === 0)) {
        if (countEl) countEl.textContent = 'Loading products...';
        if (typeof renderProductLoadingSkeletons === 'function') {
            renderProductLoadingSkeletons('shop-grid-container', 8);
        }
    }

    try {
        if (typeof productsService !== 'undefined') {
            await productsService.ensureLoaded();
        }
    } catch (err) {
        if (countEl) countEl.textContent = 'Unable to load products';
        if (typeof renderProductsToContainer === 'function') {
            renderProductsToContainer([], 'shop-grid-container');
        }
        return;
    }

    let filtered = [...productsDB];

    // Apply category filter (normalized matching)
    if (currentFilters.category && currentFilters.category !== 'All') {
        const targetCat = (typeof normalizeCategory === 'function' ? normalizeCategory(currentFilters.category) : currentFilters.category).toLowerCase();
        filtered = filtered.filter(p => {
            const pCat = (p.category || '').toLowerCase();
            const pRaw = (p.rawCategory || '').trim().toLowerCase();
            return pCat === targetCat || pRaw === targetCat || (typeof normalizeCategory === 'function' && normalizeCategory(p.rawCategory).toLowerCase() === targetCat);
        });
    }

    // Apply collection filter
    if (currentFilters.collection && currentFilters.collection !== 'All') {
        filtered = filtered.filter(p => p.collection === currentFilters.collection);
    }

    // Apply occasion filter
    if (currentFilters.occasion && currentFilters.occasion !== 'All') {
        filtered = filtered.filter(p => p.occasions && p.occasions.includes(currentFilters.occasion));
    }

    // Apply price range filter
    if (currentFilters.priceRange && currentFilters.priceRange !== 'All') {
        const [min, max] = currentFilters.priceRange.split('-').map(Number);
        filtered = filtered.filter(p => {
            if (max) return p.sellingPrice >= min && p.sellingPrice <= max;
            return p.sellingPrice >= min;
        });
    }

    // Apply sort: Featured, Newest, Price Low to High, Price High to Low, Name A-Z
    switch (currentSort) {
        case 'price-low':
            filtered.sort((a, b) => a.sellingPrice - b.sellingPrice);
            break;
        case 'price-high':
            filtered.sort((a, b) => b.sellingPrice - a.sellingPrice);
            break;
        case 'newest':
            filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'name-asc':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'featured':
        default:
            filtered.sort((a, b) => (b.salesCount - a.salesCount) || (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0));
            break;
    }

    if (typeof renderProductsToContainer === 'function') {
        renderProductsToContainer(filtered, 'shop-grid-container');
    }

    // Update count accurately — never show 0 while loading
    if (countEl) {
        countEl.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
    }
}

/**
 * Universal cross-page shop router with filter, sort, and title sync
 */
function navigateToShopWithFilter(filterType, filterValue, sortOption = 'featured', customTitle = null) {
    currentFilters = {
        category: 'All',
        collection: 'All',
        priceRange: 'All',
        occasion: 'All'
    };

    if (filterType === 'category') {
        currentFilters.category = filterValue || 'All';
    } else if (filterType === 'collection') {
        currentFilters.collection = filterValue || 'All';
    } else if (filterType === 'occasion') {
        currentFilters.occasion = filterValue || 'All';
    } else if (filterType === 'priceRange') {
        currentFilters.priceRange = filterValue || 'All';
    }

    currentSort = sortOption || 'featured';

    if (typeof navigateTo === 'function') {
        navigateTo('shop', null, true);
    }

    const titleEl = document.getElementById('shop-title');
    if (titleEl) {
        if (customTitle) {
            titleEl.textContent = customTitle;
        } else if (filterType === 'category' && filterValue !== 'All') {
            titleEl.textContent = filterValue;
        } else if (filterType === 'collection' && filterValue !== 'All') {
            titleEl.textContent = filterValue;
        } else if (filterType === 'occasion' && filterValue !== 'All') {
            titleEl.textContent = `${filterValue} Jewellery`;
        } else if (sortOption === 'newest') {
            titleEl.textContent = 'New Arrivals';
        } else if (sortOption === 'featured') {
            titleEl.textContent = 'Best Sellers';
        } else {
            titleEl.textContent = 'All Jewellery';
        }
    }

    const sortSelect = document.getElementById('shop-sort-select') || document.querySelector('.shop-sort select');
    if (sortSelect) {
        sortSelect.value = currentSort;
    }

    buildSidebarFilters();
    buildMobileFilters();
    applyFiltersAndSort();
}
window.navigateToShopWithFilter = navigateToShopWithFilter;

function handleCategoryFilter(category) {
    currentFilters.category = category;
    if (typeof getCurrentView === 'function' && getCurrentView() !== 'shop') {
        navigateTo('shop', null, true);
    }
    applyFiltersAndSort();
    // Update shop title
    const title = document.getElementById('shop-title');
    if (title) title.textContent = category === 'All' ? 'All Jewellery' : category;
    // Update active state on sidebar
    document.querySelectorAll('.filter-option-cat').forEach(el => {
        const isMatch = el.dataset.value === category;
        el.classList.toggle('active', isMatch);
        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = isMatch;
    });
}

function handleSort(value) {
    currentSort = value;
    const sortSelect = document.getElementById('shop-sort-select') || document.querySelector('.shop-sort select');
    if (sortSelect) sortSelect.value = value;
    applyFiltersAndSort();
}

function handleOccasionFilter(occasion) {
    currentFilters.occasion = occasion;
    if (typeof getCurrentView === 'function' && getCurrentView() !== 'shop') {
        navigateTo('shop', null, true);
    }
    applyFiltersAndSort();
    const title = document.getElementById('shop-title');
    if (title) title.textContent = occasion === 'All' ? 'All Jewellery' : `${occasion} Jewellery`;
}

function handlePriceFilter(range) {
    currentFilters.priceRange = range;
    if (typeof getCurrentView === 'function' && getCurrentView() !== 'shop') {
        navigateTo('shop', null, true);
    }
    applyFiltersAndSort();
}

function resetFilters() {
    currentFilters = { category: 'All', collection: 'All', priceRange: 'All', occasion: 'All' };
    currentSort = 'featured';
    const sortSelect = document.getElementById('shop-sort-select') || document.querySelector('.shop-sort select');
    if (sortSelect) sortSelect.value = 'featured';
    buildSidebarFilters();
    buildMobileFilters();
    applyFiltersAndSort();
    const title = document.getElementById('shop-title');
    if (title) title.textContent = 'All Jewellery';
}

// ── Mobile Filter Sheet ──
function openFilterSheet() {
    const sheet = document.getElementById('filter-sheet');
    const backdrop = document.getElementById('filter-backdrop');
    if (sheet) {
        sheet.classList.add('open');
        sheet.style.display = 'block';
        // Allow reflow for transition
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

// ── Build Sidebar Filters ──
function buildSidebarFilters() {
    const sidebar = document.getElementById('shop-sidebar');
    if (!sidebar) return;

    const rawCategories = typeof getCategories === 'function' ? getCategories() : [];
    const categories = ['All', ...rawCategories.filter(c => c !== 'All')];
    const occasions = ['All', 'Everyday', 'Office', 'Date Night', 'Festive', 'Gifting', 'Special Occasions'];
    const priceRanges = [
        { label: 'All', value: 'All' },
        { label: 'Under ₹2,000', value: '0-2000' },
        { label: '₹2,000 — ₹3,000', value: '2000-3000' },
        { label: '₹3,000 — ₹5,000', value: '3000-5000' },
        { label: 'Above ₹5,000', value: '5000-' }
    ];

    sidebar.innerHTML = `
        <h4 class="filter-group-title">Category</h4>
        ${categories.map(c => `
            <label class="filter-option filter-option-cat ${c === currentFilters.category ? 'active' : ''}" data-value="${c}">
                <input type="radio" name="category" ${c === currentFilters.category ? 'checked' : ''} onchange="handleCategoryFilter('${c}')"> ${c}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Price</h4>
        ${priceRanges.map(r => `
            <label class="filter-option ${r.value === currentFilters.priceRange ? 'active' : ''}">
                <input type="radio" name="price" ${r.value === currentFilters.priceRange ? 'checked' : ''} onchange="handlePriceFilter('${r.value}')"> ${r.label}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option ${o === currentFilters.occasion ? 'active' : ''}">
                <input type="radio" name="occasion" ${o === currentFilters.occasion ? 'checked' : ''} onchange="handleOccasionFilter('${o}')"> ${o}
            </label>
        `).join('')}
    `;
}

// ── Build Mobile Filter Sheet ──
function buildMobileFilters() {
    const sheet = document.getElementById('filter-sheet-body');
    if (!sheet) return;

    const rawCategories = typeof getCategories === 'function' ? getCategories() : [];
    const categories = ['All', ...rawCategories.filter(c => c !== 'All')];
    const occasions = ['All', 'Everyday', 'Office', 'Date Night', 'Festive', 'Gifting', 'Special Occasions'];
    const priceRanges = [
        { label: 'All', value: 'All' },
        { label: 'Under ₹2,000', value: '0-2000' },
        { label: '₹2,000 — ₹3,000', value: '2000-3000' },
        { label: '₹3,000 — ₹5,000', value: '3000-5000' },
        { label: 'Above ₹5,000', value: '5000-' }
    ];

    sheet.innerHTML = `
        <h4 class="filter-group-title">Category</h4>
        ${categories.map(c => `
            <label class="filter-option ${c === currentFilters.category ? 'active' : ''}">
                <input type="radio" name="m-category" ${c === currentFilters.category ? 'checked' : ''} onchange="currentFilters.category='${c}'"> ${c}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Price</h4>
        ${priceRanges.map(r => `
            <label class="filter-option ${r.value === currentFilters.priceRange ? 'active' : ''}">
                <input type="radio" name="m-price" ${r.value === currentFilters.priceRange ? 'checked' : ''} onchange="currentFilters.priceRange='${r.value}'"> ${r.label}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option ${o === currentFilters.occasion ? 'active' : ''}">
                <input type="radio" name="m-occasion" ${o === currentFilters.occasion ? 'checked' : ''} onchange="currentFilters.occasion='${o}'"> ${o}
            </label>
        `).join('')}
    `;
}

function applyMobileFilters() {
    applyFiltersAndSort();
    closeFilterSheet();
    const title = document.getElementById('shop-title');
    if (title) {
        title.textContent = currentFilters.category === 'All' ? 'All Jewellery' : currentFilters.category;
    }
}
