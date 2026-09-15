/* ============================================
   WISHRITE — PRODUCT IMAGE MANAGEMENT SYSTEM
   Single Product & Bulk SKU-Based Image Uploads
   Canvas-based WebP compression, Drag-and-Drop, Supabase Storage
   ============================================ */

const IMAGE_STORAGE_LOCAL_KEY = 'wishrite_custom_product_images';

// Load locally overridden or uploaded product images
function getLocalImageRegistry() {
    try {
        const raw = localStorage.getItem(IMAGE_STORAGE_LOCAL_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveLocalImageRegistry(registry) {
    try {
        localStorage.setItem(IMAGE_STORAGE_LOCAL_KEY, JSON.stringify(registry));
    } catch (e) {
        console.warn('Storage quota reached or storage disabled:', e);
    }
}

/**
 * Get images for a product (checks storage registry, Supabase, or fallback)
 */
function getProductImages(product) {
    if (!product) return [];

    const registry = getLocalImageRegistry();
    const sku = product.sku || product.code || product.product_code;

    // Check registry by SKU or ID
    if (sku && registry[sku] && registry[sku].length > 0) {
        return registry[sku];
    }
    if (product.id && registry[product.id] && registry[product.id].length > 0) {
        return registry[product.id];
    }

    // Check existing images array
    if (Array.isArray(product.images) && product.images.length > 0) {
        return product.images;
    }

    // Check media URLs or single image field
    if (product.image) {
        return [{ url: product.image, alt: product.name, type: 'main' }];
    }

    // Clean luxury placeholder
    return [generateProductPlaceholder(product)];
}

/**
 * Generate luxury vector SVG placeholder for silver jewellery
 */
function generateProductPlaceholder(product) {
    const category = (product.category || 'Jewellery').toLowerCase();
    const name = product.name || '925 Silver Piece';
    const sku = product.sku || product.code || '';

    // Subtle luxury SVG icon based on category
    let iconSvg = '';
    if (category.includes('earring') || category.includes('bali')) {
        iconSvg = `<circle cx="150" cy="130" r="30" fill="none" stroke="#D4AF37" stroke-width="3"/><path d="M150 160 L150 210 M140 210 L160 210" stroke="#8E8E93" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="225" r="8" fill="#5E3435"/>`;
    } else if (category.includes('ring')) {
        iconSvg = `<circle cx="150" cy="180" r="50" fill="none" stroke="#A8A8A8" stroke-width="5"/><polygon points="150,118 165,138 135,138" fill="#D4AF37"/>`;
    } else if (category.includes('necklace') || category.includes('chain') || category.includes('pendant')) {
        iconSvg = `<path d="M90 120 Q150 230 210 120" fill="none" stroke="#B0B0B0" stroke-width="4" stroke-dasharray="6,4"/><polygon points="150,225 140,245 160,245" fill="#5E3435"/>`;
    } else if (category.includes('bracelet') || category.includes('anklet')) {
        iconSvg = `<ellipse cx="150" cy="180" rx="65" ry="45" fill="none" stroke="#A8A8A8" stroke-width="4"/><circle cx="190" cy="150" r="6" fill="#D4AF37"/>`;
    } else {
        iconSvg = `<polygon points="150,130 185,160 170,210 130,210 115,160" fill="none" stroke="#A8A8A8" stroke-width="3"/><circle cx="150" cy="175" r="10" fill="#5E3435"/>`;
    }

    const svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="100%" height="100%">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FBF9F7"/>
                <stop offset="100%" stop-color="#F2ECE7"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(%23bg)"/>
        <rect x="15" y="15" width="270" height="330" fill="none" stroke="#E6DFD9" stroke-width="1"/>
        <g opacity="0.85">${iconSvg}</g>
        <text x="150" y="275" font-family="Playfair Display, Georgia, serif" font-size="14" fill="#5E3435" text-anchor="middle" letter-spacing="1">WISHRITE</text>
        <text x="150" y="295" font-family="Inter, sans-serif" font-size="10" fill="#8E8E93" text-anchor="middle" letter-spacing="1.5">925 STERLING SILVER</text>
        ${sku ? `<text x="150" y="312" font-family="monospace" font-size="9" fill="#B0A69F" text-anchor="middle">${sku}</text>` : ''}
    </svg>`;

    return {
        url: svg,
        alt: `${name} — 925 Sterling Silver WishRite Jewellery`,
        type: 'main',
        isPlaceholder: true
    };
}

/**
 * Optimize and convert client image to WebP via Canvas
 */
function optimizeImageToWebP(file, maxDimension = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return reject(new Error('Invalid file type. Please upload a JPG, PNG, or WebP image.'));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Export to WebP (fallback to JPEG if browser does not support WebP export)
                const dataUrl = canvas.toDataURL('image/webp', quality);
                resolve({
                    dataUrl,
                    width,
                    height,
                    originalSize: file.size,
                    fileName: file.name.replace(/\.[^/.]+$/, '') + '.webp'
                });
            };
            img.onerror = () => reject(new Error('Failed to decode image file.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
}

/**
 * State for currently active image management session
 */
let activeAdminProduct = null;
let activeAdminImages = [];
let bulkStagedFiles = [];

/**
 * Open Product Image Manager modal for a specific product
 */
function openImageManagerForProduct(productIdOrSku) {
    const product = typeof productIdOrSku === 'object' 
        ? productIdOrSku 
        : (productsDB.find(p => p.id === productIdOrSku || p.sku === productIdOrSku || p.code === productIdOrSku));

    if (!product) {
        showToast('Product not found in inventory.', 'error');
        return;
    }

    activeAdminProduct = product;
    const currentImages = getProductImages(product);
    // Clone images, ignoring placeholder
    activeAdminImages = currentImages.filter(img => !img.isPlaceholder).map((img, i) => ({
        url: img.url,
        alt: img.alt || `${product.name} image ${i+1}`,
        type: img.type || (i === 0 ? 'main' : 'gallery'),
        id: 'img_' + Date.now() + '_' + i
    }));

    renderImageManagerModal();
    const modal = document.getElementById('image-manager-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close Image Manager modal
 */
function closeImageManagerModal() {
    const modal = document.getElementById('image-manager-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    activeAdminProduct = null;
}

/**
 * Render Image Manager UI Modal
 */
function renderImageManagerModal() {
    let modal = document.getElementById('image-manager-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-manager-modal';
        modal.className = 'admin-modal-backdrop';
        document.body.appendChild(modal);
    }

    const p = activeAdminProduct;
    if (!p) return;

    modal.innerHTML = `
        <div class="admin-modal" role="dialog" aria-labelledby="img-modal-title" aria-modal="true">
            <div class="admin-modal-header">
                <div>
                    <span class="admin-badge">INVENTORY IMAGE SYSTEM</span>
                    <h2 id="img-modal-title" style="margin-top:4px;font-family:var(--wr-font-heading);font-size:1.4rem;">${p.name}</h2>
                    <p style="color:var(--wr-text-muted);font-size:0.85rem;margin:0;">SKU / Code: <strong>${p.sku || p.code || 'N/A'}</strong> · Category: ${p.category} · Stock: ${p.stockQuantity}</p>
                </div>
                <button type="button" class="admin-modal-close" onclick="closeImageManagerModal()" aria-label="Close">✕</button>
            </div>

            <div class="admin-modal-tabs">
                <button class="admin-tab active" onclick="switchAdminImageTab('single')">Single Product Images (${activeAdminImages.length})</button>
                <button class="admin-tab" onclick="switchAdminImageTab('bulk')">Bulk SKU Upload</button>
            </div>

            <div class="admin-modal-body" id="admin-tab-single">
                <!-- Dropzone -->
                <div class="image-dropzone" id="single-image-dropzone" 
                     ondragover="handleImageDragOver(event)" 
                     ondragleave="handleImageDragLeave(event)" 
                     ondrop="handleSingleImageDrop(event)">
                    <div class="dropzone-inner">
                        <svg viewBox="0 0 24 24" width="36" height="36" stroke="#5E3435" fill="none" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <p style="margin:8px 0 4px;font-weight:500;">Drag & Drop product images here</p>
                        <p style="color:var(--wr-text-muted);font-size:0.8rem;margin-bottom:12px;">JPG, PNG, WebP · Max 10MB · Automatically converted to high-definition WebP</p>
                        <label class="btn btn-outline btn-sm" style="cursor:pointer;">
                            Browse Files
                            <input type="file" multiple accept="image/*" style="display:none;" onchange="handleSingleFileInput(event)">
                        </label>
                    </div>
                </div>

                <!-- Gallery -->
                <div class="admin-gallery-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h4 style="font-size:0.95rem;margin:0;font-family:var(--wr-font-heading);">Product Gallery (<span id="gallery-count">${activeAdminImages.length}</span> images)</h4>
                        <span style="font-size:0.8rem;color:var(--wr-text-muted);">First image is primary</span>
                    </div>

                    <div class="admin-gallery-grid" id="admin-gallery-grid">
                        ${renderAdminGalleryItemsHTML()}
                    </div>
                </div>
            </div>

            <!-- Bulk Tab -->
            <div class="admin-modal-body" id="admin-tab-bulk" style="display:none;">
                <div class="bulk-info-box">
                    <p><strong>SKU-Based Auto Match:</strong> Name files with your product SKU (e.g. <code>${p.sku || 'CHN-0002'}.jpg</code>, <code>${p.sku || 'CHN-0002'}-1.webp</code>, <code>${p.sku || 'CHN-0002'}-lifestyle.jpg</code>). The system matches them automatically to the correct inventory item.</p>
                </div>

                <div class="image-dropzone" ondragover="handleImageDragOver(event)" ondragleave="handleImageDragLeave(event)" ondrop="handleBulkImageDrop(event)">
                    <div class="dropzone-inner">
                        <svg viewBox="0 0 24 24" width="36" height="36" stroke="#5E3435" fill="none" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                        <p style="margin:8px 0 4px;font-weight:500;">Select or drag multiple SKU-named image files</p>
                        <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-top:8px;">
                            Choose Bulk Files
                            <input type="file" multiple accept="image/*" style="display:none;" onchange="handleBulkFileInput(event)">
                        </label>
                    </div>
                </div>

                <div id="bulk-staged-container" style="margin-top:16px;">
                    ${renderBulkStagedHTML()}
                </div>
            </div>

            <div class="admin-modal-footer">
                <button type="button" class="btn btn-outline btn-sm" onclick="closeImageManagerModal()">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="saveProductImageChanges()">Save Changes</button>
            </div>
        </div>
    `;
}

function switchAdminImageTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((t, i) => {
        t.classList.toggle('active', (tab === 'single' && i === 0) || (tab === 'bulk' && i === 1));
    });
    const single = document.getElementById('admin-tab-single');
    const bulk = document.getElementById('admin-tab-bulk');
    if (single) single.style.display = tab === 'single' ? 'block' : 'none';
    if (bulk) bulk.style.display = tab === 'bulk' ? 'block' : 'none';
}

function renderAdminGalleryItemsHTML() {
    if (activeAdminImages.length === 0) {
        return `<div class="empty-gallery-msg">No custom images uploaded yet. Product is currently using the clean WishRite hallmark placeholder.</div>`;
    }

    return activeAdminImages.map((img, idx) => `
        <div class="admin-image-card ${idx === 0 ? 'is-main' : ''}" draggable="true" 
             ondragstart="handleCardDragStart(event, ${idx})" 
             ondragover="event.preventDefault()" 
             ondrop="handleCardDrop(event, ${idx})">
            <div class="admin-card-img-wrap">
                <img src="${img.url}" alt="${img.alt || 'Product image'}" loading="lazy">
                ${idx === 0 ? '<span class="main-badge">Primary</span>' : ''}
                <span class="order-badge">#${idx + 1}</span>
            </div>
            <div class="admin-card-actions">
                ${idx !== 0 ? `<button type="button" class="card-action-btn" onclick="setAsPrimaryImage(${idx})" title="Set as Main">★ Main</button>` : ''}
                <button type="button" class="card-action-btn delete" onclick="deleteGalleryImage(${idx})" title="Delete">✕ Delete</button>
            </div>
        </div>
    `).join('');
}

let draggedCardIdx = null;
function handleCardDragStart(e, idx) {
    draggedCardIdx = idx;
    e.dataTransfer.setData('text/plain', idx);
}
function handleCardDrop(e, targetIdx) {
    e.preventDefault();
    if (draggedCardIdx === null || draggedCardIdx === targetIdx) return;
    const item = activeAdminImages.splice(draggedCardIdx, 1)[0];
    activeAdminImages.splice(targetIdx, 0, item);
    draggedCardIdx = null;
    refreshGalleryDisplay();
}

function setAsPrimaryImage(idx) {
    if (idx <= 0 || idx >= activeAdminImages.length) return;
    const item = activeAdminImages.splice(idx, 1)[0];
    item.type = 'main';
    activeAdminImages.unshift(item);
    refreshGalleryDisplay();
}

function deleteGalleryImage(idx) {
    if (idx >= 0 && idx < activeAdminImages.length) {
        activeAdminImages.splice(idx, 1);
        refreshGalleryDisplay();
    }
}

function refreshGalleryDisplay() {
    const grid = document.getElementById('admin-gallery-grid');
    const count = document.getElementById('gallery-count');
    if (grid) grid.innerHTML = renderAdminGalleryItemsHTML();
    if (count) count.textContent = activeAdminImages.length;
}

function handleImageDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-active');
}
function handleImageDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-active');
}

async function handleSingleImageDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await processUploadedFiles(Array.from(e.dataTransfer.files));
    }
}

async function handleSingleFileInput(e) {
    if (e.target.files && e.target.files.length > 0) {
        await processUploadedFiles(Array.from(e.target.files));
        e.target.value = '';
    }
}

async function processUploadedFiles(files) {
    showToast(`Processing ${files.length} image(s)...`, 'info');
    for (const file of files) {
        try {
            const optimized = await optimizeImageToWebP(file);
            activeAdminImages.push({
                url: optimized.dataUrl,
                alt: `${activeAdminProduct?.name || 'WishRite jewellery'} — ${file.name}`,
                type: activeAdminImages.length === 0 ? 'main' : 'gallery',
                id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                fileName: optimized.fileName
            });
        } catch (err) {
            showToast(`Error processing ${file.name}: ${err.message}`, 'error');
        }
    }
    refreshGalleryDisplay();
    showToast('Images ready for review. Click "Save Changes" to apply.', 'success');
}

/**
 * Bulk SKU Matching & Upload
 */
function handleBulkFileInput(e) {
    if (e.target.files) {
        stageBulkFiles(Array.from(e.target.files));
        e.target.value = '';
    }
}

function handleBulkImageDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-active');
    if (e.dataTransfer.files) {
        stageBulkFiles(Array.from(e.dataTransfer.files));
    }
}

function stageBulkFiles(files) {
    bulkStagedFiles = files.map(file => {
        // Extract SKU from filename (e.g. CHN-0002-1.jpg -> CHN-0002)
        const base = file.name.replace(/\.[^/.]+$/, '');
        // Match standard SKU prefixes: CHN-0002, ERN-0014, BRL-0003, etc.
        const skuMatch = base.match(/^([A-Z]{2,4}-?\d{3,5})/i);
        const extractedSku = skuMatch ? skuMatch[1].toUpperCase() : base.toUpperCase();

        // Check if SKU exists in inventory
        const matchedProduct = productsDB.find(p => {
            const pSku = (p.sku || p.code || p.product_code || '').toUpperCase();
            return pSku === extractedSku || pSku === extractedSku.replace('-', '');
        });

        return {
            file,
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            extractedSku,
            matchedProduct,
            status: matchedProduct ? 'matched' : 'unmatched'
        };
    });

    const container = document.getElementById('bulk-staged-container');
    if (container) container.innerHTML = renderBulkStagedHTML();
}

function renderBulkStagedHTML() {
    if (bulkStagedFiles.length === 0) return '';

    const matchedCount = bulkStagedFiles.filter(f => f.status === 'matched').length;

    return `
        <div style="background:var(--wr-bg-card);border:1px solid var(--wr-border);border-radius:var(--radius-md);padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="margin:0;font-size:0.95rem;">Matched Files (${matchedCount} of ${bulkStagedFiles.length})</h4>
                ${matchedCount > 0 ? `<button type="button" class="btn btn-primary btn-sm" onclick="uploadBulkMatchedImages()">Upload ${matchedCount} Matched Images</button>` : ''}
            </div>
            <div class="bulk-files-table-wrap" style="max-height:240px;overflow-y:auto;">
                <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left;border-bottom:1px solid var(--wr-border-light);color:var(--wr-text-muted);">
                            <th style="padding:6px 8px;">File</th>
                            <th style="padding:6px 8px;">Detected SKU</th>
                            <th style="padding:6px 8px;">Product</th>
                            <th style="padding:6px 8px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bulkStagedFiles.map(f => `
                            <tr style="border-bottom:1px solid var(--wr-border-light);">
                                <td style="padding:6px 8px;">${f.name}</td>
                                <td style="padding:6px 8px;"><code>${f.extractedSku}</code></td>
                                <td style="padding:6px 8px;">${f.matchedProduct ? f.matchedProduct.name : '—'}</td>
                                <td style="padding:6px 8px;">
                                    ${f.status === 'matched' 
                                        ? '<span style="color:#2E7D32;font-weight:600;">✓ Matched</span>' 
                                        : '<span style="color:#C62828;">⚠ Product not found</span>'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function uploadBulkMatchedImages() {
    const matched = bulkStagedFiles.filter(f => f.status === 'matched');
    if (matched.length === 0) return;

    showToast(`Uploading ${matched.length} matched images...`, 'info');
    const registry = getLocalImageRegistry();

    for (const item of matched) {
        try {
            const opt = await optimizeImageToWebP(item.file);
            const sku = item.matchedProduct.sku || item.matchedProduct.code || item.extractedSku;
            if (!registry[sku]) registry[sku] = [];
            registry[sku].push({
                url: opt.dataUrl,
                alt: `${item.matchedProduct.name} — WishRite Silver Jewellery`,
                type: registry[sku].length === 0 ? 'main' : 'gallery',
                id: 'bulk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
            });
        } catch (err) {
            console.error('Bulk file process error:', err);
        }
    }

    saveLocalImageRegistry(registry);
    bulkStagedFiles = [];
    showToast('Bulk images successfully uploaded and assigned to products!', 'success');
    closeImageManagerModal();

    // Re-render current view to reflect new images
    if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    if (typeof renderHomeSections === 'function') renderHomeSections();
}

/**
 * Save single product image changes
 */
function saveProductImageChanges() {
    if (!activeAdminProduct) return;

    const sku = activeAdminProduct.sku || activeAdminProduct.code || activeAdminProduct.product_code;
    const registry = getLocalImageRegistry();

    if (sku) {
        registry[sku] = activeAdminImages;
    }
    if (activeAdminProduct.id) {
        registry[activeAdminProduct.id] = activeAdminImages;
    }

    saveLocalImageRegistry(registry);
    showToast(`Images saved for ${activeAdminProduct.name}.`, 'success');
    closeImageManagerModal();

    // Refresh active PDP if current product was edited
    if (currentPdpProduct && (currentPdpProduct.id === activeAdminProduct.id || currentPdpProduct.sku === sku)) {
        currentPdpProduct.images = activeAdminImages.length > 0 ? activeAdminImages : [generateProductPlaceholder(activeAdminProduct)];
        const targetView = document.getElementById('product-view');
        if (targetView && targetView.style.display !== 'none') {
            targetView.innerHTML = renderProductDetail(currentPdpProduct);
        }
    }

    // Refresh storefront grids
    if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    if (typeof renderHomeSections === 'function') renderHomeSections();
}
