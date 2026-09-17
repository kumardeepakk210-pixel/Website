/* ============================================
   WISHRITE — PRODUCTS & INVENTORY DATA LAYER
   Dynamic Inventory Sync from Supabase, Customer-Safe Mapping,
   Product Catalog Rendering, PDP with Pincode Validation
   ============================================ */

// Configuration for out-of-stock visibility
const WISHRITE_CONFIG_STORE = {
    showOutOfStockInCatalog: true, // Show with 'Out of Stock' badge vs hide
    lowStockThreshold: 3
};

// Initial fallback catalogue (ensures instant rendering before network sync)
let productsDB = [
    {
        id: "wrd-ed-001",
        name: "Petal Drop Earrings",
        slug: "petal-drop-earrings",
        code: "WR-ED-001",
        sku: "WRED001",
        category: "Earrings",
        subcategory: "Drop Earrings",
        collection: "Floral Edit",
        shortDescription: "Delicate petal-inspired drop earrings crafted in 925 sterling silver with a soft polished finish.",
        description: "These Petal Drop Earrings capture the grace of nature in 925 sterling silver. The design draws inspiration from softly unfurling petals, creating a refined silhouette that moves beautifully. Lightweight and comfortable for all-day wear.",
        mrp: 2999,
        sellingPrice: 2499,
        discount: 17,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        jewelleryType: "Earrings",
        finish: "Polished Rhodium",
        stockQuantity: 15,
        availability: "In Stock",
        care: "Store in a dry place. Avoid perfumes and direct chemicals. Wipe gently with a soft microfibre cloth.",
        shippingInfo: "Standard express delivery within 2-5 business days.",
        returnInfo: "Easy returns within 7 days of delivery.",
        images: [
            { url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=85", alt: "WishRite petal drop earrings in 925 sterling silver", type: "main" }
        ],
        isBestseller: true,
        isNew: false
    }
];

// Inverted index for rapid slug / SKU lookups
let productSlugMap = new Map();
let productSkuMap = new Map();

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
    const clean = raw.trim();
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
        'Other': 'Accessories'
    };
    return map[clean] || (clean.endsWith('s') ? clean : clean + 's');
}

/**
 * Customer-Safe Mapping Layer
 * Translates Supabase `public.inventory` row into the storefront product model.
 * Strictly excludes: purchase_price, purchase_date, shop_name, shop_address.
 */
function mapInventoryToProduct(item, existingSlugs) {
    const sku = item.product_code || 'WR-' + (item.id || '').substring(0, 6).toUpperCase();
    const name = item.product_name || 'WishRite 925 Sterling Silver Piece';
    const category = normalizeCategory(item.category);
    const stock = typeof item.stock_quantity === 'number' ? item.stock_quantity : (parseInt(item.stock_quantity, 10) || 0);
    const sellingPrice = Number(item.selling_price) || 0;
    
    // MRP anchor
    const mrp = sellingPrice > 0 ? Math.round((sellingPrice * 1.25) / 50) * 50 : sellingPrice;
    const discount = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

    // Weight formatted if exists
    const weightStr = (item.weight !== null && item.weight !== undefined && String(item.weight).trim() !== '')
        ? `${item.weight}g`
        : null;

    // Size formatted if exists
    const sizeStr = (item.size !== null && item.size !== undefined && String(item.size).trim() !== '')
        ? String(item.size).trim()
        : null;

    const slug = generateProductSlug(name, sku, existingSlugs);

    // Stock availability
    let availability = 'Out of Stock';
    let lowStock = false;
    if (stock > WISHRITE_CONFIG_STORE.lowStockThreshold) {
        availability = 'In Stock';
    } else if (stock > 0) {
        availability = `Only ${stock} left`;
        lowStock = true;
    }

    const product = {
        id: item.id,
        name: name,
        slug: slug,
        sku: sku,
        code: sku,
        category: category,
        rawCategory: item.category,
        description: item.product_description || `${name} crafted in pure 925 sterling silver with a refined high-polish finish.`,
        shortDescription: item.product_description || `Pure 925 sterling silver ${category.toLowerCase().slice(0, -1)} crafted for everyday elegance.`,
        sellingPrice: sellingPrice,
        mrp: mrp,
        discount: discount,
        weight: weightStr,
        size: sizeStr,
        stockQuantity: stock,
        availability: availability,
        lowStock: lowStock,
        material: "925 Sterling Silver",
        silverPurity: "92.5%",
        finish: "High-Polish Rhodium",
        care: "Store in a cool, dry place inside an airtight zip pouch. Keep away from water, perfumes, and harsh chemicals. Polish gently with a soft microfibre cloth.",
        shippingInfo: "Complimentary insured shipping on all orders. Dispatched within 24-48 hours.",
        returnInfo: "Hassle-free 7-day return and exchange policy.",
        whatsIncluded: "1 piece in signature WishRite luxury jewellery box with 925 Authenticity Certificate.",
        isNew: stock > 0 && Math.random() < 0.25, // highlight dynamic selection
        isBestseller: stock > 0 && Math.random() < 0.35,
        tag: stock === 0 ? 'SOLD OUT' : (discount >= 20 ? 'SALE' : (stock <= 3 ? 'FEW LEFT' : ''))
    };

    // Attach images via image-manager registry or placeholder
    if (typeof getProductImages === 'function') {
        product.images = getProductImages(product);
    } else {
        product.images = [{
            url: `https://images.unsplash.com/photo-1599643478514-4a4e0f6c2dc1?auto=format&fit=crop&w=800&q=80`,
            alt: product.name,
            type: 'main'
        }];
    }
    product.image = product.images[0]?.url;

    return product;
}

/**
 * Fetch products from Supabase `inventory` table
 * Queries ONLY customer-safe fields.
 */
async function loadProductsFromInventory() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/inventory?select=id,product_code,product_name,product_description,category,stock_quantity,selling_price,weight,size,created_at,updated_at&order=created_at.desc`;
        const headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept': 'application/json'
        };

        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Inventory fetch failed with status ${response.status}`);
        }

        const rawData = await response.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
            const existingSlugs = new Set();
            const mapped = rawData.map(item => mapInventoryToProduct(item, existingSlugs));

            // Set global productsDB
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
            } catch (e) {
                // Ignore storage quota warnings
            }

            console.info(`✓ Loaded ${mapped.length} products dynamically from WishRite inventory database.`);
            return mapped;
        }
    } catch (err) {
        console.warn('Could not sync with remote inventory table, checking local cache:', err.message);
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
    }
    return productsDB;
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
    rotate: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`
};

// Format price to INR
function formatPrice(price) {
    return '₹' + (Number(price) || 0).toLocaleString('en-IN');
}

/**
 * Create a product card HTML
 */
function createProductCardHTML(product) {
    const isWishlisted = typeof wishlist !== 'undefined' && wishlist.has(product.id);
    const isOutOfStock = product.stockQuantity <= 0;
    
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

// Render products to a container
function renderProductsToContainer(products, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!products || !products.length) {
        container.innerHTML = '<p class="cart-empty" style="grid-column:1/-1;">No products found in this category.</p>';
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
 * Dynamically renders only available attributes without empty dashes.
 */
function renderProductDetail(product) {
    if (!product) return '<div class="container" style="padding:80px 0;text-align:center;"><h2>Product not found.</h2><button class="btn btn-primary" onclick="navigateTo(\'shop\')">Return to Shop</button></div>';

    // Ensure images are resolved
    const images = (typeof getProductImages === 'function') ? getProductImages(product) : (product.images || []);
    const mainImage = images[0] || { url: '', alt: product.name };

    const imagesHTML = images.map((img, i) =>
        `<div class="pdp-thumbnail ${i === 0 ? 'active' : ''}" onclick="switchPdpImage(${i})" role="button" aria-label="View image ${i+1}">
            <img src="${img.url}" alt="${img.alt}" loading="lazy" width="72" height="72">
        </div>`
    ).join('');

    const isWishlisted = typeof wishlist !== 'undefined' && wishlist.has(product.id);
    const isOutOfStock = product.stockQuantity <= 0;
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
    if (product.stoneType) specsArr.push(`<tr><td>Stone</td><td>${product.stoneType}</td></tr>`);

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
                    <button class="btn-manage-images-link" onclick="openImageManagerForProduct('${product.id}')" title="Upload custom images for this product">
                        ${ICONS.camera} <span>Manage Images</span>
                    </button>
                </div>

                <h1 class="pdp-name">${product.name}</h1>
                <p class="pdp-material">Hallmarked 925 Sterling Silver</p>

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
                    <p style="font-size:0.85rem;color:var(--wr-text-muted);margin-top:8px;">Add to your wishlist to get notified when restocked.</p>
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
