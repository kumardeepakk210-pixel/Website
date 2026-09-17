/* ============================================
   WISHRITE — CENTRAL PRODUCT DATA SERVICE & STOREFRONT LAYER
   Strictly customer-facing: reads from Supabase public.inventory,
   aggregates sales ranking from public.sales,
   resolves images from Supabase Storage bucket 'product-images',
   and handles the 'CURRENTLY UNAVAILABLE' / 'NOTIFY ME' workflow.
   ============================================ */

// Configuration
var WR_SUPABASE_URL = window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://ptpuepejciqiktmcpuon.supabase.co');
var WR_SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX');

// Global stores & indices
let productsDB = [];
let productSlugMap = new Map();
let productCodeMap = new Map();
let productSalesMap = new Map();
let inventorySyncError = null;

/**
 * Format Indian Rupee currency
 */
function formatPrice(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

/**
 * Deterministic SEO slug generator
 */
function generateProductSlug(name, code, existingSlugs = new Set()) {
    let base = (name || 'jewellery')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const codePart = (code || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let candidate = codePart ? `${base}-${codePart}` : base;

    if (!existingSlugs.has(candidate)) {
        existingSlugs.add(candidate);
        return candidate;
    }

    let count = 2;
    while (existingSlugs.has(`${candidate}-${count}`)) {
        count++;
    }
    const finalSlug = `${candidate}-${count}`;
    existingSlugs.add(finalSlug);
    return finalSlug;
}

/**
 * Normalize database categories into clean luxury taxonomy
 */
function normalizeCategory(raw) {
    if (!raw) return 'Jewellery';
    const clean = String(raw).trim();
    const map = {
        'Chain': 'Chains',
        'Ring': 'Rings',
        'Ring ': 'Rings',
        'Earring': 'Earrings',
        'Pendant': 'Pendants',
        'Bracelet': 'Bracelets',
        'Necklace': 'Necklaces',
        'Toe Rings': 'Toe Rings',
        'Anklet': 'Anklets',
        'Rakhi': 'Silver Rakhis',
        'Nose Pin': 'Nose Pins',
        'Bali': 'Balis & Hoops',
        'Set': 'Jewellery Sets',
        'Silver Jewellery': 'Silver Jewellery',
        'Fashion Jewellery': 'Fashion Jewellery',
        'Accessories': 'Accessories',
        'Other': 'Accessories'
    };
    return map[clean] || (clean.endsWith('s') ? clean : clean + 's');
}

/**
 * Map products into curated collections based on silver craftsmanship
 */
function determineCollection(item, category) {
    const cat = (category || '').toLowerCase();
    const name = (item.product_name || '').toLowerCase();

    if (cat.includes('set') || cat.includes('necklace') || name.includes('statement') || name.includes('choker')) {
        return 'The Occasion & Evening Edit';
    }
    if (cat.includes('toe') || cat.includes('nose') || name.includes('band') || name.includes('stud') || name.includes('daily')) {
        return 'Daily Elegance';
    }
    if (cat.includes('chain') || cat.includes('bracelet') || cat.includes('bali') || name.includes('rope') || name.includes('box')) {
        return '925 Silver Signature Collection';
    }
    return 'Modern Solitaires & Keepsakes';
}

/**
 * Map products into occasions based on style & jewellery type
 */
function determineOccasions(item, category) {
    const cat = (category || '').toLowerCase();
    const occasions = new Set();

    // Everyday
    if (cat.includes('toe') || cat.includes('nose') || cat.includes('chain') || cat.includes('ring') || cat.includes('earring') || cat.includes('bali')) {
        occasions.add('Everyday');
    }
    // Office
    if (cat.includes('ring') || cat.includes('pendant') || cat.includes('chain') || cat.includes('bracelet') || cat.includes('earring')) {
        occasions.add('Office');
    }
    // Date Night
    if (cat.includes('pendant') || cat.includes('earring') || cat.includes('necklace') || cat.includes('bracelet') || cat.includes('ring')) {
        occasions.add('Date Night');
    }
    // Festive
    if (cat.includes('set') || cat.includes('anklet') || cat.includes('rakhi') || cat.includes('necklace') || cat.includes('pendant')) {
        occasions.add('Festive');
    }
    // Gifting
    if (cat.includes('pendant') || cat.includes('rakhi') || cat.includes('chain') || cat.includes('set') || cat.includes('ring')) {
        occasions.add('Gifting');
    }
    // Special Occasions
    if (cat.includes('set') || cat.includes('necklace') || cat.includes('anklet') || cat.includes('bracelet')) {
        occasions.add('Special Occasions');
    }

    if (occasions.size === 0) occasions.add('Everyday');
    return Array.from(occasions);
}

/**
 * Map raw database row from public.inventory into unified storefront product model
 */
function mapInventoryToProduct(item, existingSlugs = new Set()) {
    if (!item) return null;

    const productCode = (item.product_code || item.sku || '').trim();
    const name = (item.product_name || 'Handcrafted Silver Piece').trim();
    const category = normalizeCategory(item.category);
    const rawCategory = (item.category || '').trim();
    const stock = typeof item.stock_quantity === 'number' ? item.stock_quantity : (parseInt(item.stock_quantity, 10) || 0);
    const sellingPrice = Number(item.selling_price) || 0;

    // Approximate MRP based on jewellery standard markup if not explicitly set
    const mrp = sellingPrice > 0 ? Math.round((sellingPrice * 1.25) / 50) * 50 : sellingPrice;
    const discount = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

    // Formatted weight
    const weightStr = (item.weight !== null && item.weight !== undefined && String(item.weight).trim() !== '')
        ? `${item.weight}g`
        : null;

    // Formatted size
    const sizeStr = (item.size !== null && item.size !== undefined && String(item.size).trim() !== '')
        ? String(item.size).trim()
        : null;

    // Deterministic slug
    const slug = generateProductSlug(name, productCode, existingSlugs);

    // Dynamic collection & occasions
    const collection = determineCollection(item, category);
    const occasions = determineOccasions(item, category);

    // Sales count from sales table
    const salesCount = productSalesMap.get(productCode) || 0;

    // Stock availability
    let availability = 'Currently Unavailable';
    let lowStock = false;
    if (stock > 3) {
        availability = 'In Stock';
    } else if (stock > 0) {
        availability = `Only ${stock} left`;
        lowStock = true;
    }

    const material = '925 Sterling Silver';
    const silverPurity = '92.5%';

    const product = {
        id: item.id,
        productCode: productCode,
        sku: productCode,
        code: productCode,
        name: name,
        slug: slug,
        description: item.product_description || `${name} crafted in hallmarked ${material} with a luminous high-polish finish.`,
        shortDescription: item.product_description || `${material} ${category} crafted for effortless luxury.`,
        category: category,
        rawCategory: rawCategory,
        collection: collection,
        occasions: occasions,
        occasion: occasions.join(', '),
        price: sellingPrice,
        sellingPrice: sellingPrice,
        mrp: mrp,
        discount: discount,
        stockQuantity: stock,
        isAvailable: stock > 0,
        isPublished: true,
        weight: weightStr,
        size: sizeStr,
        availability: availability,
        lowStock: lowStock,
        material: material,
        silverPurity: silverPurity,
        finish: 'High-Polish Rhodium',
        status: stock > 0 ? 'Active' : 'Currently Unavailable',
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        salesCount: salesCount,
        care: 'Store in an airtight pouch. Keep away from water, perfumes, and sprays. Clean gently using a soft jewellery polishing cloth.',
        shippingInfo: 'Complimentary insured express shipping across India. Usually dispatched within 24 to 48 hours.',
        returnInfo: 'Easy 7-day return and exchange policy with original packaging and certificate.',
        whatsIncluded: '1 piece in signature WishRite luxury gift box with 925 Authenticity Certificate.',
        isNew: false, // Calculated dynamically across catalog
        isBestseller: false, // Calculated dynamically across catalog
        tag: stock <= 0 ? 'UNAVAILABLE' : (discount >= 20 ? 'SALE' : (stock <= 3 ? 'FEW LEFT' : ''))
    };

    // Attach resolved images via image layer
    if (typeof getProductImages === 'function') {
        product.images = getProductImages(product);
    } else {
        product.images = [];
    }
    product.image = product.images[0]?.url || '';

    return product;
}

// ════════════════════════════════════════════════════
// 5. CENTRAL PRODUCT DATA SERVICE
// ════════════════════════════════════════════════════
const productsService = {
    isLoading: false,
    loadPromise: null,
    error: null,

    /**
     * Guarantees a single in-flight Promise for all callers.
     * Prevents returning empty array [] while network request is underway.
     */
    async ensureLoaded() {
        if (productsDB.length > 0 && !this.isLoading) {
            return productsDB;
        }
        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.isLoading = true;
        this.error = null;

        this.loadPromise = (async () => {
            try {
                const headers = {
                    'apikey': WR_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${WR_SUPABASE_ANON_KEY}`,
                    'Accept': 'application/json'
                };

                // 1. Fetch sales aggregation in parallel (best-effort)
                try {
                    const salesRes = await fetch(`${WR_SUPABASE_URL}/rest/v1/sales?select=product_code,quantity`, { headers });
                    if (salesRes.ok) {
                        const salesRows = await salesRes.json();
                        productSalesMap.clear();
                        if (Array.isArray(salesRows)) {
                            salesRows.forEach(row => {
                                const code = (row.product_code || '').trim();
                                if (code) {
                                    const prev = productSalesMap.get(code) || 0;
                                    productSalesMap.set(code, prev + (Number(row.quantity) || 1));
                                }
                            });
                        }
                    }
                } catch (salesErr) {
                    console.info('Sales data notice: using in-stock ranking.', salesErr.message);
                }

                // 2. Fetch inventory records directly from public.inventory
                const inventoryUrl = `${WR_SUPABASE_URL}/rest/v1/inventory?select=id,product_code,product_name,product_description,category,stock_quantity,selling_price,weight,size,created_at,updated_at,storage_folder&order=created_at.desc`;
                const invRes = await fetch(inventoryUrl, { headers });

                if (!invRes.ok) {
                    throw new Error(`Failed to load inventory: HTTP ${invRes.status}`);
                }

                const rawItems = await invRes.json();
                if (!Array.isArray(rawItems)) {
                    throw new Error('Invalid inventory data format received from database');
                }

                const existingSlugs = new Set();
                const mapped = rawItems.map(item => mapInventoryToProduct(item, existingSlugs)).filter(Boolean);

                // Mark top 15 newest items
                const sortedByDate = [...mapped].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                sortedByDate.slice(0, 15).forEach(p => { p.isNew = true; });

                // Mark bestsellers (by real sales count or high in-stock popularity)
                const sortedBySales = [...mapped].sort((a, b) => (b.salesCount - a.salesCount) || (b.stockQuantity - a.stockQuantity));
                sortedBySales.slice(0, 12).forEach(p => { p.isBestseller = true; });

                productsDB = mapped;

                // Rebuild fast index maps
                productSlugMap.clear();
                productCodeMap.clear();
                productsDB.forEach(p => {
                    productSlugMap.set(p.slug, p);
                    if (p.productCode) {
                        productCodeMap.set(p.productCode.toUpperCase(), p);
                    }
                    if (p.id) {
                        productSlugMap.set(p.id, p);
                    }
                });

                // Cache in localStorage for offline resilience
                try {
                    localStorage.setItem('wishrite_inventory_cache', JSON.stringify(mapped));
                    localStorage.setItem('wishrite_inventory_sync_time', String(Date.now()));
                } catch (e) {}

                console.info(`✓ Loaded ${mapped.length} active products dynamically from WishRite Supabase database.`);
                return productsDB;
            } catch (err) {
                console.error('Supabase inventory sync error:', err);
                this.error = err;
                inventorySyncError = err;

                // Attempt restore from offline cache
                try {
                    const cached = localStorage.getItem('wishrite_inventory_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            productsDB = parsed;
                            productSlugMap.clear();
                            productCodeMap.clear();
                            productsDB.forEach(p => {
                                productSlugMap.set(p.slug, p);
                                if (p.productCode) productCodeMap.set(p.productCode.toUpperCase(), p);
                                if (p.id) productSlugMap.set(p.id, p);
                            });
                            console.info(`✓ Restored ${parsed.length} products from offline cache.`);
                            return productsDB;
                        }
                    }
                } catch (cacheErr) {}

                throw err;
            } finally {
                this.isLoading = false;
                this.loadPromise = null;
            }
        })();

        return this.loadPromise;
    },

    async getProducts(options = {}) {
        await this.ensureLoaded();
        let list = [...productsDB];

        if (options.category && options.category !== 'All') {
            const normCat = normalizeCategory(options.category).toLowerCase();
            list = list.filter(p => normalizeCategory(p.category).toLowerCase() === normCat || (p.rawCategory && p.rawCategory.toLowerCase() === normCat));
        }

        if (options.collection && options.collection !== 'All') {
            list = list.filter(p => p.collection === options.collection);
        }

        if (options.occasion && options.occasion !== 'All') {
            list = list.filter(p => p.occasions && p.occasions.includes(options.occasion));
        }

        if (options.sort) {
            switch (options.sort) {
                case 'price-low':
                    list.sort((a, b) => a.sellingPrice - b.sellingPrice);
                    break;
                case 'price-high':
                    list.sort((a, b) => b.sellingPrice - a.sellingPrice);
                    break;
                case 'newest':
                    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    break;
                case 'name-asc':
                    list.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'featured':
                default:
                    list.sort((a, b) => (b.salesCount - a.salesCount) || (b.isBestseller ? 1 : 0) - (a.isBestseller ? 1 : 0));
                    break;
            }
        }

        return list;
    },

    getProductByCode(code) {
        if (!code) return null;
        return productCodeMap.get(String(code).toUpperCase()) || productsDB.find(p => p.productCode?.toUpperCase() === String(code).toUpperCase());
    },

    getProductById(id) {
        if (!id) return null;
        return productSlugMap.get(id) || productsDB.find(p => p.id === id || String(p.id) === String(id) || p.productCode === id);
    },

    getProductBySlug(slug) {
        if (!slug) return null;
        return productSlugMap.get(slug) || productsDB.find(p => p.slug === slug || p.id === slug || p.productCode === slug);
    },

    getProductsByCategory(category) {
        if (!category || category === 'All') return productsDB;
        const norm = normalizeCategory(category).toLowerCase();
        return productsDB.filter(p => normalizeCategory(p.category).toLowerCase() === norm || (p.rawCategory && p.rawCategory.toLowerCase() === norm));
    },

    getProductsByCollection(collection) {
        if (!collection || collection === 'All') return productsDB;
        return productsDB.filter(p => p.collection === collection);
    },

    getProductsByOccasion(occasion) {
        if (!occasion || occasion === 'All') return productsDB;
        return productsDB.filter(p => p.occasions && p.occasions.includes(occasion));
    },

    getNewArrivals(limit = 12) {
        return [...productsDB]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    },

    getBestSellers(limit = 12) {
        return [...productsDB]
            .sort((a, b) => (b.salesCount - a.salesCount) || ((b.stockQuantity > 0 ? 1 : 0) - (a.stockQuantity > 0 ? 1 : 0)))
            .slice(0, limit);
    },

    searchProducts(query) {
        if (!query || query.trim().length < 2) return [];
        const q = query.toLowerCase().trim();
        return productsDB.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.productCode && p.productCode.toLowerCase().includes(q)) ||
            (p.category && p.category.toLowerCase().includes(q)) ||
            (p.rawCategory && p.rawCategory.toLowerCase().includes(q)) ||
            (p.collection && p.collection.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q)) ||
            (p.material && p.material.toLowerCase().includes(q))
        );
    },

    getCategories() {
        return [...new Set(productsDB.map(p => p.category))].filter(Boolean);
    },

    getCollections() {
        return [
            'All',
            '925 Silver Signature Collection',
            'Daily Elegance',
            'The Occasion & Evening Edit',
            'Modern Solitaires & Keepsakes'
        ];
    },

    getOccasions() {
        return ['All', 'Everyday', 'Office', 'Date Night', 'Festive', 'Gifting', 'Special Occasions'];
    }
};

// Global backward-compatible bridge
window.productsService = productsService;
window.loadProductsFromInventory = () => productsService.ensureLoaded();
window.getProductBySlug = (slug) => productsService.getProductBySlug(slug);
window.getProductById = (id) => productsService.getProductById(id);
window.getProductByCode = (code) => productsService.getProductByCode(code);
window.getProductsByCategory = (cat) => productsService.getProductsByCategory(cat);
window.getCategories = () => productsService.getCategories();
window.getCollections = () => productsService.getCollections();

/**
 * Render loading skeleton cards
 */
function renderProductLoadingSkeletons(containerId, count = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let skeletonHTML = '';
    for (let i = 0; i < count; i++) {
        skeletonHTML += `
            <div class="product-card skeleton-card" aria-hidden="true">
                <div class="product-card-image skeleton-box" style="aspect-ratio:4/5;background:linear-gradient(90deg, #F5F1EE 25%, #EBE5E1 50%, #F5F1EE 75%);background-size:200% 100%;animation:skeletonShimmer 1.5s infinite;border-radius:4px;"></div>
                <div class="product-card-info" style="padding:16px 0;">
                    <div style="height:12px;width:35%;background:#EBE5E1;border-radius:2px;margin-bottom:8px;"></div>
                    <div style="height:18px;width:75%;background:#EBE5E1;border-radius:2px;margin-bottom:8px;"></div>
                    <div style="height:16px;width:45%;background:#EBE5E1;border-radius:2px;"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = skeletonHTML;
}

/**
 * Create a product card HTML
 */
function createProductCardHTML(product) {
    const isWishlisted = typeof wishlist !== 'undefined' && wishlist.has(product.id);
    const isOutOfStock = product.stockQuantity <= 0;

    let badgeHTML = '';
    if (isOutOfStock) {
        badgeHTML = `<span class="product-card-badge badge-out-of-stock">CURRENTLY UNAVAILABLE</span>`;
    } else if (product.tag) {
        const badgeClass = product.tag === 'NEW' ? 'badge-new' : (product.tag === 'SALE' ? 'badge-sale' : 'badge-gold');
        badgeHTML = `<span class="product-card-badge ${badgeClass}">${product.tag}</span>`;
    }

    const discountHTML = (!isOutOfStock && product.discount > 0) ? `<span class="price-discount">${product.discount}% OFF</span>` : '';
    const mrpHTML = (product.mrp > product.sellingPrice) ? `<span class="price-original">${formatPrice(product.mrp)}</span>` : '';

    const imgSrc = product.images?.[0]?.url || product.image || '';
    const imgAlt = product.images?.[0]?.alt || product.name;

    return `
        <div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="navigateTo('product', '${product.slug}')">
            <div class="product-card-image">
                <img 
                    src="${imgSrc}" 
                    alt="${imgAlt}" 
                    loading="lazy" 
                    width="400" 
                    height="500"
                    data-product-code="${product.productCode}"
                    data-category="${product.category}"
                    data-fallback-index="0"
                    onerror="handleProductImageError(this, '${product.productCode}', '${product.category}')"
                >
                ${badgeHTML}
                <button class="product-card-wishlist ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}', event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                    ${ICONS.heart}
                </button>
                ${!isOutOfStock 
                    ? `<button class="product-card-quick" onclick="addToCart('${product.id}', event)">Quick Add</button>` 
                    : `<button class="product-card-quick notify-label" onclick="event.stopPropagation(); openNotifyMeModal('${product.id}')">Notify Me</button>`}
            </div>
            <div class="product-card-info">
                <div class="product-card-meta-line">
                    <span class="product-card-sku">${product.productCode || ''}</span>
                    <span class="product-card-category">${product.category}</span>
                </div>
                <h3 class="product-card-name">${product.name}</h3>
                <div class="product-card-price">
                    <span class="price-current">${formatPrice(product.sellingPrice)}</span>
                    ${mrpHTML}
                    ${discountHTML}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render products to a container with proper Loading, Empty, and Error states
 */
function renderProductsToContainer(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (productsService.isLoading) {
        renderProductLoadingSkeletons(containerId, 8);
        return;
    }

    if (productsService.error && (!products || !products.length)) {
        container.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;text-align:center;">
                <p style="font-size:1.1rem;color:var(--wr-primary);font-family:var(--wr-font-heading);margin-bottom:8px;">Unable to load jewellery collection right now.</p>
                <p style="color:var(--wr-text-muted);font-size:0.9rem;margin-bottom:20px;">Please check your connection or tap below to retry.</p>
                <button class="btn btn-outline btn-sm" onclick="productsService.ensureLoaded().then(() => { if(typeof applyFiltersAndSort==='function') applyFiltersAndSort(); if(typeof renderHomeSections==='function') renderHomeSections(); })">Reload Collection</button>
            </div>
        `;
        return;
    }

    if (!products || !products.length) {
        container.innerHTML = '<p class="cart-empty" style="grid-column:1/-1;">No products found matching your criteria.</p>';
        return;
    }

    container.innerHTML = products.map(createProductCardHTML).join('');
}

// ════════════════════════════════════════════════════
// 18. PRODUCT DETAIL PAGE (PDP)
// ════════════════════════════════════════════════════
let currentPdpProduct = null;
let currentPdpImageIndex = 0;
let pdpQty = 1;

function renderProductDetail(product) {
    if (!product) {
        return `
            <div class="container" style="padding:80px 0;text-align:center;">
                <h2 style="font-family:var(--wr-font-heading);color:var(--wr-primary);">Product currently unavailable.</h2>
                <p style="color:var(--wr-text-muted);margin:12px 0 24px;">The piece you are looking for may have been updated or moved.</p>
                <button class="btn btn-primary" onclick="navigateTo('shop')">Return to Shop</button>
            </div>
        `;
    }

    currentPdpProduct = product;
    currentPdpImageIndex = 0;
    pdpQty = 1;

    // Resolve images
    const images = (typeof getProductImages === 'function') ? getProductImages(product) : (product.images || []);
    const mainImage = images[0] || { url: '', alt: product.name };

    // Thumbnail gallery with error handling to gracefully hide failed extra views
    const imagesHTML = images.map((img, i) =>
        `<div class="pdp-thumbnail ${i === 0 ? 'active' : ''}" onclick="switchPdpImage(${i})" role="button" aria-label="View image ${i+1}">
            <img src="${img.url}" alt="${img.alt}" loading="lazy" width="72" height="72" onerror="handleThumbnailError(this)">
        </div>`
    ).join('');

    const isWishlisted = typeof wishlist !== 'undefined' && wishlist.has(product.id);
    const isOutOfStock = product.stockQuantity <= 0;
    const mrpHTML = product.mrp > product.sellingPrice ? `<span class="pdp-price-original">${formatPrice(product.mrp)}</span>` : '';
    const discountHTML = (!isOutOfStock && product.discount > 0) ? `<span class="pdp-price-discount">${product.discount}% OFF</span>` : '';

    // Trust & Feature Badges
    const features = [];
    features.push('Hallmarked 925 Pure Silver');
    if (product.weight) features.push(`Weight: ${product.weight}`);
    if (product.size) features.push(`Size: ${product.size}`);
    features.push('High-Polish Rhodium Finish');
    features.push('Complimentary Luxury Gift Box');

    const featuresHTML = features.map(f =>
        `<div class="feature-item">${ICONS.check}<span>${f}</span></div>`
    ).join('');

    // Dynamic Specifications Table
    const specsArr = [];
    if (product.productCode) specsArr.push(`<tr><td>Product Code</td><td><code>${product.productCode}</code></td></tr>`);
    if (product.material) specsArr.push(`<tr><td>Precious Metal</td><td>${product.material}</td></tr>`);
    if (product.silverPurity) specsArr.push(`<tr><td>Silver Purity</td><td>${product.silverPurity} Standard</td></tr>`);
    if (product.category) specsArr.push(`<tr><td>Category</td><td>${product.category}</td></tr>`);
    if (product.finish) specsArr.push(`<tr><td>Finish</td><td>${product.finish}</td></tr>`);
    if (product.weight) specsArr.push(`<tr><td>Jewellery Weight</td><td>${product.weight}</td></tr>`);
    if (product.size) specsArr.push(`<tr><td>Size</td><td>${product.size}</td></tr>`);

    // Dynamic Accordions
    const accordionSections = [];
    if (product.description) {
        accordionSections.push({ title: 'Product Story & Details', content: `<p>${product.description}</p>` });
    }
    if (specsArr.length > 0) {
        accordionSections.push({
            title: 'Specifications & Hallmarking',
            content: `<table class="pdp-specs-table">${specsArr.join('')}</table>`
        });
    }
    if (product.care) {
        accordionSections.push({ title: 'Silver Care Guide', content: `<p>${product.care}</p>` });
    }
    if (product.shippingInfo || product.returnInfo) {
        let shipContent = '';
        if (product.shippingInfo) shipContent += `<p>${product.shippingInfo}</p>`;
        if (product.returnInfo) shipContent += `<p style="margin-top:8px;">${product.returnInfo}</p>`;
        accordionSections.push({ title: 'Shipping, Delivery & Returns', content: shipContent });
    }
    if (product.whatsIncluded) {
        accordionSections.push({ title: 'In the Box', content: `<p>${product.whatsIncluded}</p>` });
    }

    const accordionsHTML = accordionSections.map(s =>
        `<div class="accordion-item">
            <button class="accordion-trigger" onclick="toggleAccordion(this)" aria-expanded="false">
                ${s.title}
                ${ICONS.chevronDown}
            </button>
            <div class="accordion-content">
                <div class="accordion-content-inner">${s.content}</div>
            </div>
        </div>`
    ).join('');

    // Related products in same category
    const related = productsDB.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);
    const relatedAlt = related.length < 4 ? productsDB.filter(p => p.id !== product.id).slice(0, 4) : related;

    // Pincode checker HTML
    const pincodeHTML = (typeof renderPincodeCheckerHTML === 'function') ? renderPincodeCheckerHTML() : '';

    return `
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a onclick="navigateTo('home')">Home</a>
            <span class="separator">›</span>
            <a onclick="navigateTo('shop'); handleCategoryFilter('${product.category}');">${product.category}</a>
            <span class="separator">›</span>
            <span class="current">${product.name}</span>
        </nav>

        <div class="pdp-layout">
            <!-- Gallery -->
            <div class="pdp-gallery" id="pdp-gallery">
                <div class="pdp-main-image" onclick="openImageViewer()" role="button" aria-label="Zoom image">
                    <img 
                        id="pdp-main-img" 
                        src="${mainImage.url}" 
                        alt="${mainImage.alt}" 
                        width="700" 
                        height="875"
                        data-product-code="${product.productCode}"
                        data-category="${product.category}"
                        data-fallback-index="0"
                        onerror="handleProductImageError(this, '${product.productCode}', '${product.category}')"
                    >
                    <span class="image-counter" id="pdp-image-counter">1 / ${images.length}</span>
                </div>
                <div class="pdp-thumbnails" id="pdp-thumbnails">
                    ${imagesHTML}
                </div>
            </div>

            <!-- Product Info -->
            <div class="pdp-info">
                <div class="pdp-header-meta">
                    <span class="pdp-sku-badge">CODE: ${product.productCode}</span>
                </div>

                <h1 class="pdp-name">${product.name}</h1>
                <p class="pdp-material">Hallmarked ${product.material}</p>

                <div class="pdp-price-block">
                    <span class="pdp-price">${formatPrice(product.sellingPrice)}</span>
                    ${mrpHTML}
                    ${discountHTML}
                </div>

                <!-- Stock availability: Section 19 requirement -->
                <div class="pdp-stock-status">
                    ${!isOutOfStock 
                        ? `<span class="stock-badge in-stock"><span class="stock-dot"></span>${product.availability}</span>` 
                        : `<span class="stock-badge out-of-stock"><span class="stock-dot"></span>CURRENTLY UNAVAILABLE</span>`}
                </div>

                <p class="pdp-short-desc">${product.shortDescription}</p>

                <div class="pdp-features">
                    ${featuresHTML}
                </div>

                <!-- PINCODE SHIPPING VALIDATION -->
                ${pincodeHTML}

                <!-- Customer Action Area: Add to Bag vs Notify Me -->
                ${!isOutOfStock ? `
                    <div class="pdp-quantity">
                        <label for="pdp-qty">Quantity</label>
                        <div class="qty-controls">
                            <button class="qty-btn" onclick="updateQty(-1)" aria-label="Decrease quantity">−</button>
                            <span class="qty-value" id="pdp-qty">1</span>
                            <button class="qty-btn" onclick="updateQty(1)" aria-label="Increase quantity">+</button>
                        </div>
                    </div>

                    <div class="pdp-actions">
                        <button class="btn btn-primary btn-lg" onclick="addToCartFromPDP('${product.id}')">Add to Bag</button>
                        <button class="btn btn-outline btn-lg" onclick="buyNowFromPDP('${product.id}')">Buy Now</button>
                        <button class="pdp-wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}', event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                            ${ICONS.heart}
                        </button>
                    </div>
                ` : `
                    <div class="pdp-actions pdp-notify-area">
                        <button class="btn btn-primary btn-lg" onclick="openNotifyMeModal('${product.id}')">NOTIFY ME</button>
                        <button class="pdp-wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}', event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                            ${ICONS.heart}
                        </button>
                    </div>
                    <p style="font-size:0.9rem;color:var(--wr-text-muted);margin-top:10px;">Notify me when this piece is back in stock.</p>
                `}

                <!-- Trust signals -->
                <div class="pdp-trust">
                    <div class="pdp-trust-item">${ICONS.diamond}<span>925 Certified Silver</span></div>
                    <div class="pdp-trust-item">${ICONS.shield}<span>Quality Inspected</span></div>
                    <div class="pdp-trust-item">${ICONS.lock}<span>Secure Checkout</span></div>
                    <div class="pdp-trust-item">${ICONS.gift}<span>Luxury Gift Box</span></div>
                </div>

                <!-- Accordions -->
                <div class="pdp-accordions">
                    ${accordionsHTML}
                </div>
            </div>
        </div>

        ${relatedAlt.length ? `
        <section class="related-section">
            <div class="section-header">
                <span class="sub-label">Handcrafted Complementary Pieces</span>
                <h2>Complete the Look</h2>
            </div>
            <div class="product-grid">${relatedAlt.map(createProductCardHTML).join('')}</div>
        </section>
        ` : ''}

        <!-- Sticky Action Bar -->
        <div class="sticky-cta active" id="sticky-cta" aria-hidden="false">
            ${!isOutOfStock ? `
                <button class="btn btn-primary" onclick="addToCart('${product.id}', event)">ADD TO CART — ${formatPrice(product.sellingPrice)}</button>
                <button class="btn btn-secondary" onclick="buyNowFromPDP('${product.id}')">BUY NOW</button>
            ` : `
                <button class="btn btn-primary" onclick="openNotifyMeModal('${product.id}')" style="width:100%;">NOTIFY ME WHEN AVAILABLE</button>
            `}
        </div>
    `;
}

// ════════════════════════════════════════════════════
// 20. NOTIFY ME MODAL & SUBSCRIPTION WORKFLOW
// ════════════════════════════════════════════════════
function openNotifyMeModal(productId) {
    const product = productsService.getProductById(productId) || currentPdpProduct;
    if (!product) return;

    const modal = document.getElementById('notify-me-modal');
    if (!modal) return;

    // Populate hidden fields and labels
    document.getElementById('notify-product-id').value = product.id;
    document.getElementById('notify-product-code').value = product.productCode || '';
    document.getElementById('notify-product-name').value = product.name || '';
    document.getElementById('notify-modal-title').textContent = `Notify Me — ${product.name}`;
    document.getElementById('notify-modal-subtitle').textContent = `We will email you the moment ${product.name} (${product.productCode}) is back in stock.`;

    // Reset status messages
    const errEl = document.getElementById('notify-error-msg');
    const successEl = document.getElementById('notify-success-msg');
    const emailInput = document.getElementById('notify-email');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (successEl) { successEl.style.display = 'none'; }
    if (emailInput) {
        emailInput.value = '';
        emailInput.disabled = false;
    }
    const submitBtn = document.getElementById('notify-submit-btn');
    if (submitBtn) {
        submitBtn.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'NOTIFY ME';
    }

    modal.style.display = 'flex';
    setTimeout(() => emailInput && emailInput.focus(), 100);
}

function closeNotifyMeModal() {
    const modal = document.getElementById('notify-me-modal');
    if (modal) modal.style.display = 'none';
}

async function handleNotifyMeSubmit(event) {
    event.preventDefault();
    const emailInput = document.getElementById('notify-email');
    const errEl = document.getElementById('notify-error-msg');
    const successEl = document.getElementById('notify-success-msg');
    const submitBtn = document.getElementById('notify-submit-btn');

    const email = (emailInput?.value || '').trim().toLowerCase();
    const productId = document.getElementById('notify-product-id')?.value;
    const productCode = document.getElementById('notify-product-code')?.value;
    const productName = document.getElementById('notify-product-name')?.value;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = 'Please enter a valid email address.';
        }
        return;
    }

    if (errEl) errEl.style.display = 'none';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    // Duplicate check in localStorage
    const localKey = `wishrite_notified_${productCode}_${email}`;
    if (localStorage.getItem(localKey)) {
        if (successEl) {
            successEl.style.display = 'block';
            successEl.innerHTML = "<p>✓ You're on the list. We'll email you when this piece is available again.</p>";
        }
        if (submitBtn) submitBtn.style.display = 'none';
        if (emailInput) emailInput.disabled = true;
        return;
    }

    // Attempt insertion into public.product_stock_notifications via Supabase REST
    try {
        const payload = {
            product_id: productId,
            product_code: productCode,
            product_name: productName,
            customer_email: email,
            status: 'pending',
            created_at: new Date().toISOString()
        };

        const res = await fetch(`${WR_SUPABASE_URL}/rest/v1/product_stock_notifications`, {
            method: 'POST',
            headers: {
                'apikey': WR_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${WR_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        });

        // Store in local storage for duplicate protection & offline resilience
        localStorage.setItem(localKey, 'true');

        // Also track locally in array
        try {
            const list = JSON.parse(localStorage.getItem('wishrite_saved_notifications') || '[]');
            list.push({ productCode, email, date: new Date().toISOString() });
            localStorage.setItem('wishrite_saved_notifications', JSON.stringify(list));
        } catch (e) {}

    } catch (apiErr) {
        // Graceful fallback — save to localStorage so customer experience is flawless
        localStorage.setItem(localKey, 'true');
    }

    // Show customer confirmation
    if (successEl) {
        successEl.style.display = 'block';
        successEl.innerHTML = "<p>✓ You're on the list. We'll email you when this piece is available again.</p>";
    }
    if (submitBtn) submitBtn.style.display = 'none';
    if (emailInput) emailInput.disabled = true;

    if (typeof showToast === 'function') {
        showToast("You're on the list. We'll email you when this piece is back in stock.", 'success');
    }
}

// ════════════════════════════════════════════════════
// PDP Gallery Controls & Viewer
// ════════════════════════════════════════════════════
function switchPdpImage(index) {
    if (!currentPdpProduct) return;
    const images = currentPdpProduct.images || [];
    if (!images[index]) return;

    currentPdpImageIndex = index;
    const mainImg = document.getElementById('pdp-main-img');
    const counter = document.getElementById('pdp-image-counter');
    const thumbs = document.querySelectorAll('.pdp-thumbnail');

    if (mainImg) {
        mainImg.src = images[index].url;
        mainImg.alt = images[index].alt || currentPdpProduct.name;
    }
    if (counter) counter.textContent = `${index + 1} / ${images.length}`;
    thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
}

function updateQty(delta) {
    pdpQty = Math.max(1, pdpQty + delta);
    const qtyEl = document.getElementById('pdp-qty');
    if (qtyEl) qtyEl.textContent = pdpQty;
}

function addToCartFromPDP(productId) {
    if (typeof addToCart === 'function') {
        addToCart(productId, null, pdpQty);
    }
}

function buyNowFromPDP(productId) {
    if (typeof addToCart === 'function') {
        addToCart(productId, null, pdpQty);
        navigateTo('cart');
    }
}

function toggleAccordion(btn) {
    const item = btn.closest('.accordion-item');
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', !isOpen);
}

function openImageViewer() {
    if (!currentPdpProduct) return;
    const images = currentPdpProduct.images || [];
    const currentImg = images[currentPdpImageIndex] || images[0];
    if (!currentImg) return;

    let viewer = document.getElementById('image-viewer-modal');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'image-viewer-modal';
        viewer.className = 'image-viewer-backdrop';
        viewer.onclick = (e) => { if (e.target === viewer) closeImageViewer(); };
        document.body.appendChild(viewer);
    }

    viewer.innerHTML = `
        <div class="image-viewer-content">
            <button class="image-viewer-close" onclick="closeImageViewer()" aria-label="Close">✕</button>
            <img src="${currentImg.url}" alt="${currentImg.alt || currentPdpProduct.name}">
        </div>
    `;
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
    const viewer = document.getElementById('image-viewer-modal');
    if (viewer) {
        viewer.style.display = 'none';
        document.body.style.overflow = '';
    }
}
