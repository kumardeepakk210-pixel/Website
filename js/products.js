/* ============================================
   WISHRITE — PRODUCTS & INVENTORY DATA LAYER
   Dynamic Product Sync from Supabase, Customer-Safe Mapping,
   Product Catalog Rendering, PDP with Pincode Validation,
   Real-Time Updates, Skeletons & Resilient Error Handling
   ============================================ */

// Configuration for out-of-stock visibility & threshold
const WISHRITE_CONFIG_STORE = {
    showOutOfStockInCatalog: true, // Show with 'Out of Stock' badge
    lowStockThreshold: 3
};

// Initial catalog is empty — populated dynamically from Supabase
let productsDB = [];

// Inverted index for rapid slug / SKU lookups
let productSlugMap = new Map();
let productSkuMap = new Map();

// Track data sync status
let isInventoryLoading = false;
let inventorySyncError = null;

/**
 * Generate SEO-friendly and unique slug from product name and code
 */
function generateProductSlug(name, code, existingSlugs = new Set()) {
    const baseSlug = String(name || 'product')
        .toLowerCase()
        .replace(/925\s*sterling\s*silver/gi, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    let finalSlug = baseSlug || 'silver-jewellery';
    if (existingSlugs.has(finalSlug) && code) {
        finalSlug = `${finalSlug}-${String(code).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    }
    existingSlugs.add(finalSlug);
    return finalSlug;
}

/**
 * Normalize category naming from database to luxury e-commerce taxonomy
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
        'Toys': 'Toys',
        'Household': 'Household',
        'Customized Gifts': 'Customized Gifts',
        'Other': 'Accessories'
    };
    return map[clean] || (clean.endsWith('s') ? clean : clean + 's');
}

/**
 * Customer-Safe Mapping Layer
 * Translates Supabase `public.inventory` row into the storefront product model.
 * Strictly excludes wholesale details: purchase_price, purchase_date, shop_name, shop_address.
 */
function mapInventoryToProduct(item, existingSlugs) {
    if (!item) return null;

    // Check status if available: Draft and Archived products are not visible to customers
    const rawStatus = (item.status || '').trim();
    if (rawStatus === 'Draft' || rawStatus === 'Archived') {
        return null;
    }

    const sku = item.product_code || 'WR-' + String(item.id || '').substring(0, 6).toUpperCase();
    const name = item.product_name || 'WishRite 925 Sterling Silver Piece';
    const category = normalizeCategory(item.category);
    const stock = typeof item.stock_quantity === 'number' ? item.stock_quantity : (parseInt(item.stock_quantity, 10) || 0);
    const sellingPrice = Number(item.selling_price) || 0;

    // Compare-at price / MRP
    const comparePrice = Number(item.compare_at_price) || 0;
    const mrp = comparePrice > sellingPrice 
        ? comparePrice 
        : (sellingPrice > 0 ? Math.round((sellingPrice * 1.25) / 50) * 50 : sellingPrice);
    const discount = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

    // Weight formatted if exists
    const weightStr = (item.weight !== null && item.weight !== undefined && String(item.weight).trim() !== '')
        ? `${item.weight}g`
        : null;

    // Size formatted if exists
    const sizeStr = (item.size !== null && item.size !== undefined && String(item.size).trim() !== '')
        ? String(item.size).trim()
        : null;

    // Slug: use database slug if present, otherwise generate deterministically
    const slug = (item.slug && item.slug.trim()) 
        ? item.slug.trim() 
        : generateProductSlug(name, sku, existingSlugs);

    // Stock availability & badge logic
    let availability = 'Out of Stock';
    let lowStock = false;
    if (rawStatus === 'Out of Stock' || stock <= 0) {
        availability = 'Out of Stock';
    } else if (stock > WISHRITE_CONFIG_STORE.lowStockThreshold) {
        availability = 'In Stock';
    } else if (stock > 0) {
        availability = `Only ${stock} left`;
        lowStock = true;
    }

    const material = item.material || "925 Sterling Silver";
    const purity = item.purity || "92.5%";

    const product = {
        id: item.id,
        name: name,
        slug: slug,
        sku: sku,
        code: sku,
        category: category,
        rawCategory: item.category,
        description: item.product_description || `${name} crafted in pure ${material} with a refined high-polish finish.`,
        shortDescription: item.short_description || item.product_description || `Pure ${material} ${category.toLowerCase().slice(0, -1)} crafted for everyday elegance.`,
        sellingPrice: sellingPrice,
        mrp: mrp,
        discount: discount,
        weight: weightStr,
        size: sizeStr,
        stockQuantity: stock,
        availability: availability,
        lowStock: lowStock,
        material: material,
        silverPurity: purity,
        finish: "High-Polish Rhodium",
        status: (stock <= 0 || rawStatus === 'Out of Stock') ? 'Out of Stock' : 'Active',
        seoTitle: item.seo_title || null,
        seoDescription: item.seo_description || null,
        care: "Store in a cool, dry place inside an airtight zip pouch. Keep away from water, perfumes, and harsh chemicals. Polish gently with a soft microfibre cloth.",
        shippingInfo: "Complimentary insured express delivery on all qualifying orders. Dispatched within 24-48 hours.",
        returnInfo: "Hassle-free 7-day return and exchange policy.",
        whatsIncluded: "1 piece in signature WishRite luxury jewellery box with 925 Authenticity Certificate.",
        isNew: stock > 0 && String(sku).endsWith('1'),
        isBestseller: stock > 0 && stock <= 5,
        tag: stock <= 0 ? 'SOLD OUT' : (discount >= 20 ? 'SALE' : (stock <= 3 ? 'FEW LEFT' : ''))
    };

    // Attach direct image properties if present in row
    if (item.image_url) product.image_url = item.image_url;
    if (item.product_media_urls) product.product_media_urls = item.product_media_urls;

    // Attach images via customer-safe image layer
    if (typeof getProductImages === 'function') {
        product.images = getProductImages(product);
    } else {
        product.images = [generateProductPlaceholder(product)];
    }
    product.image = product.images[0]?.url;

    return product;
}

/**
 * Fetch products and images dynamically from Supabase
 * Queries only customer-safe fields.
 */
async function loadProductsFromInventory() {
    if (isInventoryLoading) return productsDB;
    isInventoryLoading = true;
    inventorySyncError = null;

    try {
        const headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
        };

        // 1. Attempt to fetch product_images table if present
        try {
            const imagesUrl = `${SUPABASE_URL}/rest/v1/product_images?select=id,product_id,image_url,storage_path,image_type,sort_order,alt_text,is_primary&order=sort_order.asc,created_at.asc`;
            const imgRes = await fetch(imagesUrl, { headers });
            if (imgRes.ok) {
                const imgData = await imgRes.json();
                if (Array.isArray(imgData) && typeof setSupabaseProductImages === 'function') {
                    setSupabaseProductImages(imgData);
                }
            }
        } catch (e) {
            // product_images table is optional until setup sql is run
        }

        // 2. Fetch products from inventory table
        // Attempt full extended column set first, fallback to core set if extended columns don't exist yet
        let rawData = null;
        const extendedUrl = `${SUPABASE_URL}/rest/v1/inventory?select=id,product_code,product_name,product_description,category,stock_quantity,selling_price,weight,size,created_at,updated_at,status,compare_at_price,image_url,product_media_urls,short_description,material,purity,slug,seo_title,seo_description&order=created_at.desc`;
        const coreUrl = `${SUPABASE_URL}/rest/v1/inventory?select=id,product_code,product_name,product_description,category,stock_quantity,selling_price,weight,size,created_at,updated_at&order=created_at.desc`;

        let res = await fetch(extendedUrl, { headers });
        if (res.ok) {
            rawData = await res.json();
        } else {
            // Fallback to core columns
            res = await fetch(coreUrl, { headers });
            if (res.ok) {
                rawData = await res.json();
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        }

        if (Array.isArray(rawData)) {
            const existingSlugs = new Set();
            const mapped = rawData
                .map(item => mapInventoryToProduct(item, existingSlugs))
                .filter(Boolean); // Filter out Draft and Archived

            productsDB = mapped;

            // Rebuild index maps
            productSlugMap.clear();
            productSkuMap.clear();
            productsDB.forEach(p => {
                productSlugMap.set(p.slug, p);
                productSkuMap.set((p.sku || p.code || '').toUpperCase(), p);
            });

            // Cache in local storage for offline resilience
            try {
                localStorage.setItem('wishrite_inventory_cache', JSON.stringify(mapped));
                localStorage.setItem('wishrite_inventory_last_sync', String(Date.now()));
            } catch (e) {
                // Ignore quota errors
            }

            console.info(`✓ Loaded ${mapped.length} products dynamically from WishRite Supabase database.`);
            return mapped;
        }
    } catch (err) {
        console.warn('Live database sync notice: checking offline cache.', err.message);
        inventorySyncError = err;

        // Offline cache fallback
        try {
            const cached = localStorage.getItem('wishrite_inventory_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    productsDB = parsed;
                    productSlugMap.clear();
                    productSkuMap.clear();
                    productsDB.forEach(p => {
                        productSlugMap.set(p.slug, p);
                        productSkuMap.set((p.sku || p.code || '').toUpperCase(), p);
                    });
                    console.info(`✓ Restored ${parsed.length} products from offline cache.`);
                    return parsed;
                }
            }
        } catch (cacheErr) {
            console.warn('Cache restoration error:', cacheErr);
        }
    } finally {
        isInventoryLoading = false;
    }

    return productsDB;
}

/**
 * Realtime Supabase Subscription
 * Automatically updates prices, stock, and status without manual reload.
 */
let realtimeChannel = null;

function initRealtimeInventorySync() {
    if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) {
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            try {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            } catch (e) {
                return;
            }
        } else {
            return;
        }
    }

    if (realtimeChannel) return;

    try {
        realtimeChannel = window.supabaseClient
            .channel('customer-inventory-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'inventory' },
                (payload) => {
                    handleRealtimeInventoryChange(payload);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.info('✓ Supabase Realtime active: listening for product updates.');
                }
            });
    } catch (e) {
        console.warn('Supabase Realtime subscription not initialized:', e.message);
    }
}

/**
 * Handle live change payload from Supabase Realtime
 */
function handleRealtimeInventoryChange(payload) {
    if (!payload || !payload.eventType) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;
    console.info(`Supabase Realtime event [${eventType}]:`, newRecord?.product_code || oldRecord?.id);

    if (eventType === 'DELETE') {
        const delId = oldRecord?.id;
        productsDB = productsDB.filter(p => p.id !== delId);
    } else if (eventType === 'INSERT') {
        const existingSlugs = new Set(productsDB.map(p => p.slug));
        const mapped = mapInventoryToProduct(newRecord, existingSlugs);
        if (mapped) {
            productsDB.unshift(mapped);
            productSlugMap.set(mapped.slug, mapped);
            productSkuMap.set((mapped.sku || mapped.code || '').toUpperCase(), mapped);
        }
    } else if (eventType === 'UPDATE') {
        const existingSlugs = new Set(productsDB.filter(p => p.id !== newRecord.id).map(p => p.slug));
        const mapped = mapInventoryToProduct(newRecord, existingSlugs);
        const idx = productsDB.findIndex(p => p.id === newRecord.id);

        if (mapped) {
            if (idx >= 0) {
                productsDB[idx] = mapped;
            } else {
                productsDB.unshift(mapped);
            }
            productSlugMap.set(mapped.slug, mapped);
            productSkuMap.set((mapped.sku || mapped.code || '').toUpperCase(), mapped);
        } else if (idx >= 0) {
            // Status changed to Draft or Archived -> remove from public view
            productsDB.splice(idx, 1);
            if (newRecord.slug) productSlugMap.delete(newRecord.slug);
        }
    }

    // Refresh active view to reflect updated price, stock, or status
    const currentView = (typeof getCurrentView === 'function') ? getCurrentView() : 'home';
    if (currentView === 'shop' && typeof applyFiltersAndSort === 'function') {
        applyFiltersAndSort();
    } else if (currentView === 'home' && typeof renderHomeSections === 'function') {
        renderHomeSections();
    } else if (currentView === 'product') {
        const currentSlug = window.location.pathname.replace('/product/', '');
        const currentProd = getProductBySlug(currentSlug);
        if (currentProd) {
            const targetView = document.getElementById('product-view');
            if (targetView) {
                targetView.innerHTML = renderProductDetail(currentProd);
                if (typeof renderStickyCTA === 'function') renderStickyCTA(currentProd);
            }
        }
    }

    // If cart contains updated item, update price and stock limits
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
        cart.forEach(cartItem => {
            const updated = productsDB.find(p => p.id === cartItem.id);
            if (updated) {
                cartItem.sellingPrice = updated.sellingPrice;
                cartItem.stockQuantity = updated.stockQuantity;
                if (cartItem.qty > updated.stockQuantity) {
                    cartItem.qty = Math.max(1, updated.stockQuantity);
                }
            }
        });
        if (typeof renderCart === 'function') renderCart();
    }
}

// Icons
const ICONS = {
    heart: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="9 18 15 12 9 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    truck: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="15" height="13" stroke-linecap="round" stroke-linejoin="round"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    gift: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="20 12 20 22 4 22 4 12" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="7" width="20" height="5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="22" x2="12" y2="7" stroke-linecap="round"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    diamond: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3h12l4 6-10 13L2 9z" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9h20" stroke-linecap="round"/><path d="M10 3l-4 6 6 13 6-13-4-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sparkle: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    rotate: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`
};

// Format price to INR
function formatPrice(price) {
    return '₹' + (Number(price) || 0).toLocaleString('en-IN');
}

/**
 * Render luxury product shimmer skeleton cards while fetching from Supabase
 */
function renderProductSkeletons(containerId, count = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let skeletonHTML = '';
    for (let i = 0; i < count; i++) {
        skeletonHTML += `
            <div class="product-card skeleton-card">
                <div class="product-card-image skeleton-box" style="aspect-ratio:4/5;background:linear-gradient(90deg, #F5F1EE 25%, #EBE5E1 50%, #F5F1EE 75%);background-size:200% 100%;animation:skeletonShimmer 1.5s infinite;"></div>
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
    const isOutOfStock = product.stockQuantity <= 0 || product.status === 'Out of Stock';
    
    let badgeHTML = '';
    if (isOutOfStock) {
        badgeHTML = `<span class="product-card-badge badge-out-of-stock">SOLD OUT</span>`;
    } else if (product.tag) {
        const badgeClass = product.tag === 'NEW' ? 'badge-new' : (product.tag === 'SALE' ? 'badge-sale' : 'badge-gold');
        badgeHTML = `<span class="product-card-badge ${badgeClass}">${product.tag}</span>`;
    }

    const discountHTML = (!isOutOfStock && product.discount > 0) ? `<span class="price-discount">${product.discount}% OFF</span>` : '';
    const mrpHTML = (product.mrp > product.sellingPrice) ? `<span class="price-original">${formatPrice(product.mrp)}</span>` : '';

    const imgSrc = product.images?.[0]?.url || product.image;
    const imgAlt = product.images?.[0]?.alt || product.name;

    return `
        <div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="navigateTo('product', '${product.slug}')">
            <div class="product-card-image">
                <img src="${imgSrc}" alt="${imgAlt}" loading="lazy" width="400" height="500">
                ${badgeHTML}
                <button class="product-card-wishlist ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}', event)" aria-label="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">
                    ${ICONS.heart}
                </button>
                ${!isOutOfStock 
                    ? `<button class="product-card-quick" onclick="addToCart('${product.id}', event)">Quick Add</button>` 
                    : `<div class="product-card-quick out-of-stock-label">Out of Stock</div>`}
            </div>
            <div class="product-card-info">
                <div class="product-card-meta-line">
                    <span class="product-card-sku">${product.sku || product.code || ''}</span>
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

// Render products to a container with appropriate empty and error states
function renderProductsToContainer(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (inventorySyncError && (!products || !products.length)) {
        container.innerHTML = `
            <div class="cart-empty" style="grid-column:1/-1;padding:60px 20px;">
                <p style="font-size:1.1rem;color:var(--wr-primary);font-family:var(--wr-font-heading);">Products are temporarily unavailable.</p>
                <p style="color:var(--wr-text-muted);font-size:0.9rem;margin:8px 0 16px;">Please check back shortly or refresh to reload available pieces.</p>
                <button class="btn btn-outline btn-sm" onclick="loadProductsFromInventory().then(() => { if (typeof renderHomeSections==='function') renderHomeSections(); if (typeof applyFiltersAndSort==='function') applyFiltersAndSort(); })">Reload Products</button>
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

// Product getters
function getProductBySlug(slug) {
    if (!slug) return null;
    return productSlugMap.get(slug) || productsDB.find(p => p.slug === slug || p.id === slug || p.sku === slug || p.code === slug);
}

function getProductById(id) {
    if (!id) return null;
    return productsDB.find(p => p.id === id || String(p.id) === String(id) || p.sku === id || p.code === id);
}

function getProductsByCategory(category) {
    if (!category || category === 'All') return productsDB;
    return productsDB.filter(p => p.category === category || p.rawCategory === category);
}

function getCategories() {
    return [...new Set(productsDB.map(p => p.category))].filter(Boolean);
}

function getCollections() {
    return ['All', '925 Sterling Silver', 'Daily Elegance', 'Occasion Edit', 'Signature Essentials'];
}

/**
 * Render Product Detail Page (PDP)
 * Completely customer-facing: no Manage Image or Admin controls.
 */
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

    // Ensure images are resolved
    const images = (typeof getProductImages === 'function') ? getProductImages(product) : (product.images || []);
    const mainImage = images[0] || { url: '', alt: product.name };

    const imagesHTML = images.map((img, i) =>
        `<div class="pdp-thumbnail ${i === 0 ? 'active' : ''}" onclick="switchPdpImage(${i})" role="button" aria-label="View image ${i+1}">
            <img src="${img.url}" alt="${img.alt}" loading="lazy" width="72" height="72">
        </div>`
    ).join('');

    const isWishlisted = typeof wishlist !== 'undefined' && wishlist.has(product.id);
    const isOutOfStock = product.stockQuantity <= 0 || product.status === 'Out of Stock';
    const mrpHTML = product.mrp > product.sellingPrice ? `<span class="pdp-price-original">${formatPrice(product.mrp)}</span>` : '';
    const discountHTML = (!isOutOfStock && product.discount > 0) ? `<span class="pdp-price-discount">${product.discount}% OFF</span>` : '';

    // Trust & Feature Badges
    const features = [];
    if (product.material) features.push(product.material);
    if (product.silverPurity) features.push(`${product.silverPurity} Pure Silver`);
    if (product.weight) features.push(`Weight: ${product.weight}`);
    features.push('Hallmarked 925');
    features.push('Complimentary Packaging');

    const featuresHTML = features.map(f =>
        `<div class="feature-item">${ICONS.check}<span>${f}</span></div>`
    ).join('');

    // Dynamic Specifications — Only render fields that actually exist
    const specsArr = [];
    if (product.sku || product.code) specsArr.push(`<tr><td>Product Code / SKU</td><td><code>${product.sku || product.code}</code></td></tr>`);
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
        accordionSections.push({ title: "In the Box", content: `<p>${product.whatsIncluded}</p>` });
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

    // Related products in the same category
    const related = productsDB.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);
    const relatedAlt = related.length < 4 ? productsDB.filter(p => p.id !== product.id).slice(0, 4) : related;

    // Pincode checker HTML
    const pincodeHTML = (typeof renderPincodeCheckerHTML === 'function') 
        ? renderPincodeCheckerHTML() 
        : '';

    return `
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a onclick="navigateTo('home')">Home</a>
            <span class="separator">›</span>
            <a onclick="navigateTo('shop'); currentFilters.category='${product.category}'; applyFiltersAndSort();">${product.category}</a>
            <span class="separator">›</span>
            <span class="current">${product.name}</span>
        </nav>

        <div class="pdp-layout">
            <!-- Gallery -->
            <div class="pdp-gallery" id="pdp-gallery">
                <div class="pdp-main-image" onclick="openImageViewer()" role="button" aria-label="Zoom image">
                    <img id="pdp-main-img" src="${mainImage.url}" alt="${mainImage.alt}" width="700" height="875">
                    <span class="image-counter" id="pdp-image-counter">1 / ${images.length}</span>
                </div>
                <div class="pdp-thumbnails" id="pdp-thumbnails">
                    ${imagesHTML}
                </div>
            </div>

            <!-- Product Info -->
            <div class="pdp-info">
                <div class="pdp-header-meta">
                    <span class="pdp-sku-badge">SKU: ${product.sku || product.code}</span>
                </div>

                <h1 class="pdp-name">${product.name}</h1>
                <p class="pdp-material">Hallmarked ${product.material || '925 Sterling Silver'}</p>

                <div class="pdp-price-block">
                    <span class="pdp-price">${formatPrice(product.sellingPrice)}</span>
                    ${mrpHTML}
                    ${discountHTML}
                </div>

                <!-- Stock availability -->
                <div class="pdp-stock-status">
                    ${!isOutOfStock 
                        ? `<span class="stock-badge in-stock"><span class="stock-dot"></span>${product.availability}</span>` 
                        : `<span class="stock-badge out-of-stock"><span class="stock-dot"></span>Sold Out / Currently Unavailable</span>`}
                </div>

                <p class="pdp-short-desc">${product.shortDescription}</p>
                <div class="pdp-features">
                    ${featuresHTML}
                </div>

                <!-- PINCODE SHIPPING VALIDATION COMPONENT -->
                ${pincodeHTML}

                <!-- Quantity & Purchase Actions -->
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
                    <div class="pdp-actions">
                        <button class="btn btn-primary btn-lg btn-disabled" disabled>Out of Stock</button>
                        <button class="pdp-wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}', event)" aria-label="Add to wishlist">
                            ${ICONS.heart}
                        </button>
                    </div>
                    <p style="font-size:0.85rem;color:var(--wr-text-muted);margin-top:8px;">Save to your wishlist to get notified when restocked.</p>
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

        <!-- Sticky Product Action Bar — Scoped directly inside product-view -->
        <div class="sticky-cta active" id="sticky-cta" aria-hidden="false">
            ${!isOutOfStock ? `
                <button class="btn btn-primary" onclick="addToCart('${product.id}', event)">ADD TO CART — ${formatPrice(product.sellingPrice)}</button>
                <button class="btn btn-secondary" onclick="buyNowFromPDP('${product.id}')">BUY NOW</button>
            ` : `
                <button class="btn btn-primary btn-disabled" disabled style="width:100%;">OUT OF STOCK</button>
            `}
        </div>
    `;
}

// PDP Image Gallery interaction
let currentPdpImageIndex = 0;
let currentPdpProduct = null;

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

let pdpQty = 1;
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
