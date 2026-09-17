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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

// ── Header Scroll Effect ──
function initHeaderScroll() {
    const header = document.querySelector('.header');
    if (!header) return;

    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        header.classList.toggle('scrolled', currentScroll > 20);
        lastScroll = currentScroll;
    }, { passive: true });
}

// ── Hero Carousel ──
function initHeroCarousel() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    if (!slides.length) return;

    let current = 0;
    const interval = setInterval(() => {
        slides[current].classList.remove('active');
        dots[current]?.classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
        dots[current]?.classList.add('active');
    }, 5000);

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            slides[current].classList.remove('active');
            dots[current]?.classList.remove('active');
            current = i;
            slides[current].classList.add('active');
            dots[current]?.classList.add('active');
        });
    });
}

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

function handleCategoryFilter(category) {
    currentFilters.category = category;
    applyFiltersAndSort();
    // Update shop title
    const title = document.getElementById('shop-title');
    if (title) title.textContent = category === 'All' ? 'All Jewellery' : category;
    // Update active state on sidebar
    document.querySelectorAll('.filter-option-cat').forEach(el => {
        el.classList.toggle('active', el.dataset.value === category);
    });
}

function handleSort(value) {
    currentSort = value;
    applyFiltersAndSort();
}

function handleOccasionFilter(occasion) {
    currentFilters.occasion = occasion;
    applyFiltersAndSort();
}

function handlePriceFilter(range) {
    currentFilters.priceRange = range;
    applyFiltersAndSort();
}

function resetFilters() {
    currentFilters = { category: 'All', collection: 'All', priceRange: 'All', occasion: 'All' };
    currentSort = 'featured';
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

    const categories = ['All', ...getCategories()];
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
            <label class="filter-option filter-option-cat" data-value="${c}">
                <input type="radio" name="category" ${c === 'All' ? 'checked' : ''} onchange="handleCategoryFilter('${c}')"> ${c}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Price</h4>
        ${priceRanges.map(r => `
            <label class="filter-option">
                <input type="radio" name="price" ${r.value === 'All' ? 'checked' : ''} onchange="handlePriceFilter('${r.value}')"> ${r.label}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option">
                <input type="radio" name="occasion" ${o === 'All' ? 'checked' : ''} onchange="handleOccasionFilter('${o}')"> ${o}
            </label>
        `).join('')}
    `;
}

// ── Build Mobile Filter Sheet ──
function buildMobileFilters() {
    const sheet = document.getElementById('filter-sheet-body');
    if (!sheet) return;

    const categories = ['All', ...getCategories()];
    const occasions = ['All', 'Everyday', 'Office', 'Date Night', 'Festive', 'Gifting'];
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
            <label class="filter-option">
                <input type="radio" name="m-category" ${c === currentFilters.category ? 'checked' : ''} onchange="currentFilters.category='${c}'"> ${c}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Price</h4>
        ${priceRanges.map(r => `
            <label class="filter-option">
                <input type="radio" name="m-price" ${r.value === currentFilters.priceRange ? 'checked' : ''} onchange="currentFilters.priceRange='${r.value}'"> ${r.label}
            </label>
        `).join('')}

        <h4 class="filter-group-title">Occasion</h4>
        ${occasions.map(o => `
            <label class="filter-option">
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
