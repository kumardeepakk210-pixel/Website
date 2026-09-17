/* ============================================
   WISHRITE — PRODUCT IMAGES LAYER
   Read-only customer-facing image resolution from Supabase Storage.
   Product code is the folder key: product-images/{product_code}/
   Fallback cascade:
     1. Database image path (if exists)
     2. {product_code}/main.webp
     3. {product_code}/main.png
     4. {product_code}/main.jpg
     5. {product_code}/image-1.webp
     6. {product_code}/image-1.png
     7. {product_code}/image-1.jpg
     8. Luxury WishRite SVG vector placeholder
   Strictly display-only: no upload or edit functionality.
   ============================================ */

const STORAGE_BUCKET = 'product-images';
const FALLBACK_CANDIDATES = [
    'main.webp',
    'main.png',
    'main.jpg',
    'image-1.webp',
    'image-1.png',
    'image-1.jpg'
];

// In-memory cache for resolved working image URLs per product code
const resolvedImageCache = new Map();
let productImagesMap = new Map();

/**
 * Generate public URL from Supabase Storage bucket 'product-images'
 * Uses supabase.storage.from('product-images').getPublicUrl(storagePath)
 */
function getSupabaseStoragePublicUrl(storagePath) {
    if (!storagePath) return '';
    const cleanPath = String(storagePath).replace(/^\/+/, '').trim();

    try {
        if (window.supabaseClient && window.supabaseClient.storage) {
            const { data } = window.supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(cleanPath);
            if (data && data.publicUrl) return data.publicUrl;
        }
    } catch (err) {
        // Fallback to standard Supabase Storage public URL format
    }

    const baseUrl = window.SUPABASE_URL || 'https://ptpuepejciqiktmcpuon.supabase.co';
    return `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${cleanPath}`;
}

/**
 * Handle image load errors gracefully with progressive fallback cascade.
 * Never displays broken browser image icons or blank areas.
 */
function handleProductImageError(imgEl, productCode, category) {
    if (!imgEl) return;

    const code = (productCode || imgEl.dataset.productCode || '').trim();
    const cat = category || imgEl.dataset.category || 'Jewellery';
    let currentIndex = parseInt(imgEl.dataset.fallbackIndex || '0', 10);

    // Increment index to try next candidate in sequence
    currentIndex += 1;
    imgEl.dataset.fallbackIndex = String(currentIndex);

    if (code && currentIndex < FALLBACK_CANDIDATES.length) {
        const nextFilename = FALLBACK_CANDIDATES[currentIndex];
        const nextUrl = getSupabaseStoragePublicUrl(`${code}/${nextFilename}`);
        imgEl.src = nextUrl;
    } else {
        // All storage candidates exhausted — display luxury SVG vector placeholder
        imgEl.onerror = null; // Prevent infinite loop
        const placeholder = generateProductPlaceholder({ code, product_code: code, category: cat });
        imgEl.src = placeholder.url;
        imgEl.alt = placeholder.alt;
        imgEl.classList.add('is-placeholder-img');
        if (code) resolvedImageCache.set(code, placeholder.url);
    }
}

/**
 * Set image records fetched from Supabase product_images table (if present)
 */
function setSupabaseProductImages(records) {
    productImagesMap.clear();
    if (!Array.isArray(records)) return;

    records.forEach(rec => {
        const key = rec.product_id || rec.sku || rec.product_code;
        if (!key) return;
        if (!productImagesMap.has(key)) {
            productImagesMap.set(key, []);
        }
        productImagesMap.get(key).push({
            url: rec.image_url || (rec.storage_path ? getSupabaseStoragePublicUrl(rec.storage_path) : rec.url),
            alt: rec.alt_text || rec.alt || 'WishRite 925 Sterling Silver Jewellery',
            type: rec.image_type || (rec.is_primary ? 'main' : 'gallery'),
            isPrimary: Boolean(rec.is_primary),
            sortOrder: Number(rec.sort_order) || 0
        });
    });

    // Sort images: primary first, then by sort_order
    productImagesMap.forEach((imgs) => {
        imgs.sort((a, b) => {
            if (a.isPrimary && !b.isPrimary) return -1;
            if (!a.isPrimary && b.isPrimary) return 1;
            return a.sortOrder - b.sortOrder;
        });
    });
}

/**
 * Get display images for a product
 * Priority:
 * 1. Supabase product_images table records (ordered by primary / sort_order)
 * 2. Product's direct image_url property
 * 3. Product's product_media_urls array
 * 4. Supabase Storage public URL: product-images/${product_code}/main.webp
 * 5. Luxury SVG vector placeholder tailored to category
 */
function getProductImages(product) {
    if (!product) return [];

    const productCode = (product.productCode || product.sku || product.code || product.product_code || '').trim();
    const id = product.id;
    const name = product.name || product.product_name || 'WishRite Silver Jewellery';
    const category = product.category || 'Jewellery';

    // 1. Check Supabase product_images map
    if (id && productImagesMap.has(id) && productImagesMap.get(id).length > 0) {
        return productImagesMap.get(id);
    }
    if (productCode && productImagesMap.has(productCode) && productImagesMap.get(productCode).length > 0) {
        return productImagesMap.get(productCode);
    }

    // 2. Check product's direct image_url property (if it exists in DB)
    if (product.image_url && typeof product.image_url === 'string') {
        const fullUrl = product.image_url.startsWith('http') 
            ? product.image_url 
            : getSupabaseStoragePublicUrl(product.image_url);
        return [{
            url: fullUrl,
            alt: name,
            type: 'main',
            isPrimary: true
        }];
    }

    // 3. Check product_media_urls array
    if (Array.isArray(product.product_media_urls) && product.product_media_urls.length > 0) {
        return product.product_media_urls.map((url, idx) => {
            const rawUrl = typeof url === 'string' ? url : url.url;
            const fullUrl = rawUrl.startsWith('http') ? rawUrl : getSupabaseStoragePublicUrl(rawUrl);
            return {
                url: fullUrl,
                alt: `${name} — view ${idx + 1}`,
                type: idx === 0 ? 'main' : 'gallery',
                isPrimary: idx === 0
            };
        });
    }

    // 4. Primary storage path: product-images/${productCode}/main.webp
    if (productCode) {
        const primaryUrl = getSupabaseStoragePublicUrl(`${productCode}/main.webp`);
        const gallery = [
            {
                url: primaryUrl,
                alt: `${name} — 925 Sterling Silver`,
                type: 'main',
                isPrimary: true,
                productCode: productCode
            },
            {
                url: getSupabaseStoragePublicUrl(`${productCode}/image-2.webp`),
                alt: `${name} — Detailed View`,
                type: 'gallery',
                isPrimary: false,
                productCode: productCode
            },
            {
                url: getSupabaseStoragePublicUrl(`${productCode}/image-3.webp`),
                alt: `${name} — Lifestyle View`,
                type: 'gallery',
                isPrimary: false,
                productCode: productCode
            },
            {
                url: getSupabaseStoragePublicUrl(`${productCode}/image-4.webp`),
                alt: `${name} — Hallmarking & Box`,
                type: 'gallery',
                isPrimary: false,
                productCode: productCode
            }
        ];
        return gallery;
    }

    // 5. Fallback placeholder
    return [generateProductPlaceholder(product)];
}

/**
 * Generate luxury vector SVG placeholder for silver jewellery
 * Elegant minimalist design with fine gold/silver metallic accents
 */
function generateProductPlaceholder(product) {
    const category = String(product?.category || 'Jewellery').toLowerCase();
    const name = product?.name || product?.product_name || '925 Sterling Silver Piece';
    const code = product?.productCode || product?.sku || product?.code || product?.product_code || '';

    let iconSvg = '';
    if (category.includes('earring') || category.includes('bali')) {
        iconSvg = `<circle cx="150" cy="130" r="30" fill="none" stroke="#D4AF37" stroke-width="3"/><path d="M150 160 L150 210 M140 210 L160 210" stroke="#8E8E93" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="225" r="8" fill="#5E3435"/>`;
    } else if (category.includes('ring')) {
        iconSvg = `<circle cx="150" cy="180" r="50" fill="none" stroke="#A8A8A8" stroke-width="5"/><polygon points="150,118 165,138 135,138" fill="#D4AF37"/>`;
    } else if (category.includes('necklace') || category.includes('chain') || category.includes('pendant')) {
        iconSvg = `<path d="M90 120 Q150 230 210 120" fill="none" stroke="#B0B0B0" stroke-width="4" stroke-dasharray="6,4"/><polygon points="150,225 140,245 160,245" fill="#5E3435"/>`;
    } else if (category.includes('bracelet') || category.includes('anklet')) {
        iconSvg = `<ellipse cx="150" cy="180" rx="65" ry="45" fill="none" stroke="#A8A8A8" stroke-width="4"/><circle cx="190" cy="150" r="6" fill="#D4AF37"/>`;
    } else if (category.includes('rakhi')) {
        iconSvg = `<circle cx="150" cy="170" r="28" fill="none" stroke="#D4AF37" stroke-width="4"/><path d="M80 170 L122 170 M178 170 L220 170" stroke="#8E8E93" stroke-width="3"/><circle cx="150" cy="170" r="10" fill="#5E3435"/>`;
    } else {
        iconSvg = `<polygon points="150,130 185,160 170,210 130,210 115,160" fill="none" stroke="#A8A8A8" stroke-width="3"/><circle cx="150" cy="175" r="10" fill="#5E3435"/>`;
    }

    const svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="100%" height="100%">
        <defs>
            <linearGradient id="wr-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FDFBF9"/>
                <stop offset="100%" stop-color="#F4ECE6"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(%23wr-bg)"/>
        <rect x="15" y="15" width="270" height="330" fill="none" stroke="#E6DFD9" stroke-width="1"/>
        <g opacity="0.9">${iconSvg}</g>
        <text x="150" y="275" font-family="Playfair Display, Georgia, serif" font-size="14" fill="#5E3435" font-weight="600" text-anchor="middle" letter-spacing="1.5">WISHRITE</text>
        <text x="150" y="295" font-family="Inter, sans-serif" font-size="10" fill="#8E8E93" text-anchor="middle" letter-spacing="2">925 STERLING SILVER</text>
        ${code ? `<text x="150" y="313" font-family="monospace" font-size="9" fill="#B0A69F" text-anchor="middle">${code}</text>` : ''}
    </svg>`;

    return {
        url: svg,
        alt: `${name} — 925 Sterling Silver WishRite Jewellery`,
        type: 'main',
        isPrimary: true,
        isPlaceholder: true
    };
}

/**
 * Helper to remove broken thumbnail in PDP gallery and adjust counter
 */
function handleThumbnailError(thumbEl) {
    if (!thumbEl) return;
    const parent = thumbEl.closest('.pdp-thumbnail');
    if (parent) {
        parent.remove();
        checkPdpThumbnailCount();
    }
}

function checkPdpThumbnailCount() {
    const thumbsContainer = document.getElementById('pdp-thumbnails');
    if (!thumbsContainer) return;
    const remainingThumbs = thumbsContainer.querySelectorAll('.pdp-thumbnail');
    const counterEl = document.getElementById('pdp-image-counter');
    if (remainingThumbs.length <= 1) {
        thumbsContainer.style.display = 'none';
        if (counterEl) counterEl.style.display = 'none';
    } else {
        thumbsContainer.style.display = 'flex';
        if (counterEl) {
            counterEl.style.display = 'block';
            counterEl.textContent = `1 / ${remainingThumbs.length}`;
        }
    }
}
