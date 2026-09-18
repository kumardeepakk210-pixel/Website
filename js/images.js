/* ============================================================
   WISHRITE — DYNAMIC PRODUCT IMAGE SERVICE
   ------------------------------------------------------------
   Customer-facing website only.

   SOURCE OF TRUTH:
   Supabase Storage bucket:
       product-images

   FOLDER STRUCTURE:
       product-images/
          {PRODUCT_CODE}/
              image-1.webp
              image-2.webp
              image-3.webp
              ...

   EXAMPLE:
       inventory.product_code = ERN-0021

       Storage:
       product-images/ERN-0021/

   IMPORTANT:
   - No product code is hardcoded.
   - All images inside the product folder are discovered dynamically.
   - Supports unlimited images.
   - Inventory/Admin remains responsible for uploading images.
   - Website only reads images.
   ============================================================ */

(function () {
    'use strict';

    /* ============================================================
       1. CONFIGURATION
       ============================================================ */

    const STORAGE_BUCKET = 'product-images';

    const SUPABASE_URL =
        window.SUPABASE_URL ||
        (typeof window.WR_SUPABASE_URL !== 'undefined'
            ? window.WR_SUPABASE_URL
            : 'https://ptpuepejciqiktmcpuon.supabase.co');

    const SUPABASE_ANON_KEY =
        window.SUPABASE_ANON_KEY ||
        (typeof window.WR_SUPABASE_ANON_KEY !== 'undefined'
            ? window.WR_SUPABASE_ANON_KEY
            : '');

    /*
       Fallback names are used only when Storage listing is unavailable.

       They are NOT required when .list() works.
    */
    const FALLBACK_CANDIDATES = [
        'main.webp',
        'main.png',
        'main.jpg',
        'image-1.webp',
        'image-1.png',
        'image-1.jpg',
        'image1.webp',
        'image1.png',
        'image1.jpg'
    ];

    const VALID_IMAGE_EXTENSIONS = [
        'webp',
        'jpg',
        'jpeg',
        'png'
    ];

    /* ============================================================
       2. INTERNAL CACHE
       ============================================================ */

    const resolvedImageCache = new Map();
    const inFlightResolutions = new Map();

    /*
       Product-code → images

       Example:

       ERN-0021 => [
           {
               url: "...",
               path: "ERN-0021/image1.webp",
               name: "image1.webp"
           },
           ...
       ]
    */

    /* ============================================================
       3. SUPABASE CLIENT
       ============================================================ */

    function getSupabaseClient() {
        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        /*
           Some versions of the website may expose the client
           under another global name.
        */
        if (window.supabase) {
            return window.supabase;
        }

        return null;
    }

    /* ============================================================
       4. NORMALIZE PRODUCT CODE
       ============================================================ */

    function normalizeProductCode(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .trim()
            .replace(/^\/+|\/+$/g, '');
    }

    /* ============================================================
       5. EXTRACT PRODUCT CODE
       ============================================================ */

    function extractProductCode(productOrCode) {
        if (!productOrCode) {
            return '';
        }

        if (typeof productOrCode === 'string') {
            return normalizeProductCode(productOrCode);
        }

        if (typeof productOrCode === 'object') {
            return normalizeProductCode(
                productOrCode.productCode ||
                productOrCode.product_code ||
                productOrCode.sku ||
                productOrCode.code
            );
        }

        return '';
    }

    /* ============================================================
       6. CHECK IMAGE EXTENSION
       ============================================================ */

    function isValidImageFile(filename) {
        if (!filename) {
            return false;
        }

        const cleanName = String(filename)
            .split('?')[0]
            .split('#')[0]
            .toLowerCase();

        /*
           Ignore hidden/system files.
        */
        if (
            cleanName.startsWith('.') ||
            cleanName.endsWith('.folder') ||
            cleanName.endsWith('.txt') ||
            cleanName.endsWith('.json') ||
            cleanName.endsWith('.metadata')
        ) {
            return false;
        }

        const extension = cleanName.includes('.')
            ? cleanName.split('.').pop()
            : '';

        return VALID_IMAGE_EXTENSIONS.includes(extension);
    }

    /* ============================================================
       7. PUBLIC STORAGE URL
       ============================================================ */

    function getSupabaseStoragePublicUrl(storagePath) {
        const cleanPath = String(storagePath || '')
            .replace(/^\/+/, '');

        if (!cleanPath) {
            return '';
        }

        /*
           Preferred method:
           use the existing Supabase JS client.
        */
        const client = getSupabaseClient();

        if (
            client &&
            client.storage &&
            typeof client.storage.from === 'function'
        ) {
            try {
                const result = client
                    .storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(cleanPath);

                if (
                    result &&
                    result.data &&
                    result.data.publicUrl
                ) {
                    return result.data.publicUrl;
                }
            } catch (error) {
                console.warn(
                    '[WishRite Images] getPublicUrl client error:',
                    error
                );
            }
        }

        /*
           Reliable direct public URL fallback.
        */
        return (
            `${SUPABASE_URL}/storage/v1/object/public/` +
            `${encodeURIComponent(STORAGE_BUCKET)}/` +
            cleanPath
                .split('/')
                .map(part => encodeURIComponent(part))
                .join('/')
        );
    }

    /* ============================================================
       8. WAIT FOR SUPABASE CLIENT
       ============================================================ */

    async function waitForSupabaseClient(timeoutMs = 8000) {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            const client = getSupabaseClient();

            if (
                client &&
                client.storage &&
                typeof client.storage.from === 'function'
            ) {
                return client;
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        return null;
    }

    /* ============================================================
       9. SORT STORAGE FILES
       ============================================================ */

    function sortStorageFiles(files) {
        return [...files].sort((a, b) => {
            /*
               Primary/main image first.
            */
            const aName = String(a.name || '').toLowerCase();
            const bName = String(b.name || '').toLowerCase();

            const aMain =
                aName === 'main.webp' ||
                aName === 'main.png' ||
                aName === 'main.jpg';

            const bMain =
                bName === 'main.webp' ||
                bName === 'main.png' ||
                bName === 'main.jpg';

            if (aMain && !bMain) return -1;
            if (!aMain && bMain) return 1;

            /*
               If Storage provides timestamps, use them.
            */
            if (a.created_at && b.created_at) {
                const dateDiff =
                    new Date(a.created_at) -
                    new Date(b.created_at);

                if (dateDiff !== 0) {
                    return dateDiff;
                }
            }

            /*
               Finally sort alphabetically.
            */
            return aName.localeCompare(bName, undefined, {
                numeric: true,
                sensitivity: 'base'
            });
        });
    }

    /* ============================================================
       10. BUILD IMAGE RECORD
       ============================================================ */

    function buildImageRecord(file, productCode, index) {
        const fileName = String(file.name || '').trim();

        const storagePath =
            `${productCode}/${fileName}`;

        const url =
            getSupabaseStoragePublicUrl(storagePath);

        return {
            id: `${productCode}-${index}`,
            productCode: productCode,
            product_code: productCode,
            name: fileName,
            path: storagePath,
            storagePath: storagePath,
            url: url,
            alt: `${productCode} — WishRite 925 Sterling Silver Jewellery`,
            type: 'product',
            isPrimary: index === 0,
            sortOrder: index,
            createdAt: file.created_at || null,
            updatedAt: file.updated_at || null,
            isPlaceholder: false
        };
    }

    /* ============================================================
       11. LIST IMAGES FROM SUPABASE STORAGE
       ============================================================ */

    async function listProductImagesFromStorage(productCode) {
        const cleanCode = normalizeProductCode(productCode);

        if (!cleanCode) {
            return {
                images: [],
                error: new Error('Missing product code')
            };
        }

        const client = await waitForSupabaseClient();

        if (!client) {
            const error = new Error(
                'Supabase client is not ready'
            );

            console.warn(
                `[WishRite Images] Supabase client unavailable for ${cleanCode}`
            );

            return {
                images: [],
                error
            };
        }

        try {
            console.info(
                `[WishRite Images] Checking Storage folder: product-images/${cleanCode}/`
            );

            const {
                data,
                error
            } = await client
                .storage
                .from(STORAGE_BUCKET)
                .list(cleanCode, {
                    limit: 100,
                    offset: 0,
                    sortBy: {
                        column: 'name',
                        order: 'asc'
                    }
                });

            if (error) {
                console.error(
                    `[WishRite Images] Storage listing failed for ${cleanCode}:`,
                    error
                );

                return {
                    images: [],
                    error
                };
            }

            if (!Array.isArray(data)) {
                return {
                    images: [],
                    error: new Error(
                        'Supabase Storage returned invalid file list'
                    )
                };
            }

            const validFiles = data.filter(file =>
                file &&
                file.name &&
                isValidImageFile(file.name)
            );

            const sortedFiles =
                sortStorageFiles(validFiles);

            const images =
                sortedFiles.map((file, index) =>
                    buildImageRecord(
                        file,
                        cleanCode,
                        index
                    )
                );

            console.info(
                `[WishRite Images] ${cleanCode}: found ${images.length} image(s).`
            );

            if (images.length === 0) {
                console.warn(
                    `[WishRite Images] No image files found in product-images/${cleanCode}/`
                );
            }

            return {
                images,
                error: null
            };

        } catch (error) {
            console.error(
                `[WishRite Images] Unexpected Storage error for ${cleanCode}:`,
                error
            );

            return {
                images: [],
                error
            };
        }
    }

    /* ============================================================
       12. FALLBACK PUBLIC URL CHECK
       ============================================================ */

    async function checkFallbackImageUrls(productCode) {
        const cleanCode =
            normalizeProductCode(productCode);

        if (!cleanCode) {
            return [];
        }

        const results = [];

        /*
           This fallback is intentionally limited to common names.
           Normally Storage .list() discovers all files.
        */

        for (
            let index = 0;
            index < FALLBACK_CANDIDATES.length;
            index++
        ) {
            const fileName =
                FALLBACK_CANDIDATES[index];

            const path =
                `${cleanCode}/${fileName}`;

            const url =
                getSupabaseStoragePublicUrl(path);

            try {
                const response =
                    await fetch(url, {
                        method: 'HEAD',
                        cache: 'no-store'
                    });

                if (response.ok) {
                    results.push({
                        id: `${cleanCode}-fallback-${results.length}`,
                        productCode: cleanCode,
                        product_code: cleanCode,
                        name: fileName,
                        path: path,
                        storagePath: path,
                        url: url,
                        alt: `${cleanCode} — WishRite 925 Sterling Silver Jewellery`,
                        type: 'product',
                        isPrimary: results.length === 0,
                        sortOrder: results.length,
                        isPlaceholder: false
                    });
                }

            } catch (error) {
                /*
                   Ignore individual fallback failures.
                */
            }
        }

        return results;
    }

    /* ============================================================
       13. UPDATE PRODUCTS DATABASE
       ============================================================ */

    function updateProductsDatabase(
        productCode,
        images
    ) {
        const cleanCode =
            normalizeProductCode(productCode);

        if (!cleanCode) {
            return;
        }

        if (
            !Array.isArray(window.productsDB)
        ) {
            return;
        }

        window.productsDB.forEach(product => {
            const code =
                normalizeProductCode(
                    product?.productCode ||
                    product?.product_code ||
                    product?.sku ||
                    product?.code
                );

            if (
                code.toUpperCase() ===
                cleanCode.toUpperCase()
            ) {
                product.images = images;

                product.image =
                    images[0]?.url || '';

                product.image_url =
                    images[0]?.url || '';
            }
        });
    }

    /* ============================================================
       14. UPDATE PRODUCT CARDS
       ============================================================ */

    function updateRenderedProductCards(
        productCode,
        imageUrl
    ) {
        const cleanCode =
            normalizeProductCode(productCode);

        if (!cleanCode || !imageUrl) {
            return;
        }

        const images =
            document.querySelectorAll(
                'img[data-product-code]'
            );

        images.forEach(img => {
            const imgCode =
                normalizeProductCode(
                    img.dataset.productCode
                );

            if (
                imgCode.toUpperCase() !==
                cleanCode.toUpperCase()
            ) {
                return;
            }

            /*
               Do not overwrite the PDP main image here.
               updatePdpGallery() handles that.
            */
            if (img.id === 'pdp-main-img') {
                return;
            }

            /*
               Cache busting.
            */
            img.src =
                addCacheBuster(imageUrl);

            img.setAttribute('data-original-src', img.src);

            img.dataset.imageResolved = 'true';

            img.classList.remove(
                'is-placeholder-img'
            );

            img.removeAttribute(
                'data-fallback-index'
            );
        });
    }

    /* ============================================================
       15. CACHE BUSTER
       ============================================================ */

    function addCacheBuster(url) {
        if (!url) {
            return '';
        }

        /*
           Do not constantly change URLs if the URL already
           has a cache-busting version supplied by the app.
        */
        const separator =
            url.includes('?') ? '&' : '?';

        return `${url}${separator}wrimg=${Date.now()}`;
    }

    /* ============================================================
       16. UPDATE PDP IF OPEN
       ============================================================ */

    function updateCurrentPdp(
        productCode,
        images
    ) {
        const cleanCode =
            normalizeProductCode(productCode);

        if (
            !cleanCode ||
            !Array.isArray(images) ||
            images.length === 0
        ) {
            return;
        }

        const current =
            window.currentPdpProduct ||
            null;

        /*
           currentPdpProduct may be maintained privately by
           products.js, so also inspect the DOM.
        */
        const mainImg =
            document.getElementById(
                'pdp-main-img'
            );

        const domCode =
            normalizeProductCode(
                mainImg?.dataset?.productCode
            );

        if (
            domCode &&
            domCode.toUpperCase() !==
            cleanCode.toUpperCase()
        ) {
            return;
        }

        if (
            typeof window.updatePdpGallery ===
            'function'
        ) {
            try {
                window.updatePdpGallery(
                    images,
                    current || {
                        productCode: cleanCode,
                        images: images
                    }
                );

                return;
            } catch (error) {
                console.warn(
                    '[WishRite Images] PDP update failed:',
                    error
                );
            }
        }

        /*
           Direct fallback if updatePdpGallery is not
           available yet.
        */
        if (mainImg) {
            mainImg.src =
                addCacheBuster(images[0].url);

            mainImg.alt =
                images[0].alt ||
                'WishRite Silver Jewellery';
        }
    }

    /* ============================================================
       17. MAIN IMAGE RESOLVER
       ============================================================ */

    async function resolveProductImages(
        productOrCode,
        options = {}
    ) {
        const cleanCode =
            extractProductCode(productOrCode);

        if (!cleanCode) {
            console.warn(
                '[WishRite Images] Cannot resolve images: missing product code.'
            );

            return [
                generateProductPlaceholder(
                    'Product Image'
                )
            ];
        }

        const forceRefresh =
            options.forceRefresh === true;

        /*
           Return cached images unless explicitly
           requesting a refresh.
        */
        if (
            !forceRefresh &&
            resolvedImageCache.has(cleanCode)
        ) {
            const cached =
                resolvedImageCache.get(cleanCode);

            /*
               Update DOM again because a new page/view
               may have been rendered after the cache was created.
            */
            if (cached.length > 0) {
                updateRenderedProductCards(
                    cleanCode,
                    cached[0].url
                );
            }

            return cached;
        }

        /*
           Prevent duplicate Storage requests for the
           same product.
        */
        if (
            !forceRefresh &&
            inFlightResolutions.has(cleanCode)
        ) {
            return inFlightResolutions.get(cleanCode);
        }

        const resolutionPromise =
            (async () => {
                try {
                    const storageResult =
                        await listProductImagesFromStorage(
                            cleanCode
                        );

                    let images =
                        storageResult.images;

                    /*
                       If Storage listing works and returns
                       images, this is the authoritative result.
                    */
                    if (
                        Array.isArray(images) &&
                        images.length > 0
                    ) {
                        resolvedImageCache.set(
                            cleanCode,
                            images
                        );

                        updateProductsDatabase(
                            cleanCode,
                            images
                        );

                        updateRenderedProductCards(
                            cleanCode,
                            images[0].url
                        );

                        updateCurrentPdp(
                            cleanCode,
                            images
                        );

                        window.dispatchEvent(
                            new CustomEvent(
                                'wishrite:productImagesResolved',
                                {
                                    detail: {
                                        productCode:
                                            cleanCode,
                                        images:
                                            images
                                    }
                                }
                            )
                        );

                        return images;
                    }

                    /*
                       Storage listing failed or folder
                       returned no images.

                       Try known public filenames.
                    */
                    if (
                        storageResult.error ||
                        images.length === 0
                    ) {
                        console.warn(
                            `[WishRite Images] Trying public URL fallback for ${cleanCode}`
                        );

                        const fallbackImages =
                            await checkFallbackImageUrls(
                                cleanCode
                            );

                        if (
                            fallbackImages.length > 0
                        ) {
                            resolvedImageCache.set(
                                cleanCode,
                                fallbackImages
                            );

                            updateProductsDatabase(
                                cleanCode,
                                fallbackImages
                            );

                            updateRenderedProductCards(
                                cleanCode,
                                fallbackImages[0].url
                            );

                            updateCurrentPdp(
                                cleanCode,
                                fallbackImages
                            );

                            window.dispatchEvent(
                                new CustomEvent(
                                    'wishrite:productImagesResolved',
                                    {
                                        detail: {
                                            productCode:
                                                cleanCode,
                                            images:
                                                fallbackImages
                                        }
                                    }
                                )
                            );

                            return fallbackImages;
                        }
                    }

                    /*
                       Existing custom-image localStorage
                       compatibility.
                    */
                    try {
                        const custom =
                            JSON.parse(
                                localStorage.getItem(
                                    'wishrite_custom_product_images'
                                ) || '{}'
                            );

                        const localImages =
                            custom[cleanCode] ||
                            custom[
                            cleanCode.toUpperCase()
                            ] ||
                            [];

                        if (
                            Array.isArray(localImages) &&
                            localImages.length > 0
                        ) {
                            const normalized =
                                localImages.map(
                                    (item, index) => {
                                        if (
                                            typeof item ===
                                            'string'
                                        ) {
                                            return {
                                                id: `${cleanCode}-local-${index}`,
                                                productCode: cleanCode,
                                                product_code: cleanCode,
                                                name: `local-${index}`,
                                                path: '',
                                                storagePath: '',
                                                url: item,
                                                alt: `${cleanCode} — WishRite Silver Jewellery`,
                                                type: 'product',
                                                isPrimary:
                                                    index === 0,
                                                sortOrder:
                                                    index,
                                                isPlaceholder:
                                                    false
                                            };
                                        }

                                        return {
                                            ...item,
                                            productCode:
                                                cleanCode,
                                            isPrimary:
                                                index === 0,
                                            sortOrder:
                                                index,
                                            isPlaceholder:
                                                false
                                        };
                                    }
                                );

                            resolvedImageCache.set(
                                cleanCode,
                                normalized
                            );

                            updateProductsDatabase(
                                cleanCode,
                                normalized
                            );

                            updateRenderedProductCards(
                                cleanCode,
                                normalized[0].url
                            );

                            updateCurrentPdp(
                                cleanCode,
                                normalized
                            );

                            return normalized;
                        }

                    } catch (localError) {
                        console.warn(
                            '[WishRite Images] Local image fallback failed:',
                            localError
                        );
                    }

                    /*
                       Nothing found.
                    */
                    console.warn(
                        `[WishRite Images] No images available for ${cleanCode}`
                    );

                    return [
                        generateProductPlaceholder(
                            cleanCode
                        )
                    ];

                } catch (error) {
                    console.error(
                        `[WishRite Images] Failed resolving ${cleanCode}:`,
                        error
                    );

                    return [
                        generateProductPlaceholder(
                            cleanCode
                        )
                    ];

                } finally {
                    inFlightResolutions.delete(
                        cleanCode
                    );
                }
            })();

        inFlightResolutions.set(
            cleanCode,
            resolutionPromise
        );

        return resolutionPromise;
    }

    /* ============================================================
       18. FORCE REFRESH ONE PRODUCT
       ============================================================ */

    async function refreshProductImages(
        productOrCode
    ) {
        const cleanCode =
            extractProductCode(productOrCode);

        if (!cleanCode) {
            return [];
        }

        resolvedImageCache.delete(
            cleanCode
        );

        return resolveProductImages(
            cleanCode,
            {
                forceRefresh: true
            }
        );
    }

    /* ============================================================
       19. CLEAR ALL IMAGE CACHE
       ============================================================ */

    function clearProductImageCache() {
        resolvedImageCache.clear();
        inFlightResolutions.clear();

        console.info(
            '[WishRite Images] Product image cache cleared.'
        );
    }

    /* ============================================================
       20. GET PRODUCT IMAGES
       ============================================================ */

    function getProductImages(product) {
        if (!product) {
            return [
                generateProductPlaceholder(
                    'Product'
                )
            ];
        }

        const productCode =
            extractProductCode(product);

        /*
           1. Dynamic Storage cache
        */
        if (
            productCode &&
            resolvedImageCache.has(productCode)
        ) {
            return resolvedImageCache.get(
                productCode
            );
        }

        /*
           2. Existing product images
        */
        if (
            Array.isArray(product.images) &&
            product.images.length > 0
        ) {
            return product.images;
        }

        /*
           3. Existing image_url
        */
        if (product.image_url) {
            return [
                {
                    id: `${productCode}-image-url`,
                    productCode: productCode,
                    product_code: productCode,
                    name: 'image_url',
                    path: '',
                    storagePath: '',
                    url: product.image_url,
                    alt:
                        product.name ||
                        `${productCode} — WishRite Silver Jewellery`,
                    type: 'product',
                    isPrimary: true,
                    sortOrder: 0,
                    isPlaceholder: false
                }
            ];
        }

        /*
           4. Existing product_media_urls
        */
        if (
            Array.isArray(
                product.product_media_urls
            ) &&
            product.product_media_urls.length > 0
        ) {
            return product.product_media_urls
                .map((url, index) => ({
                    id:
                        `${productCode}-media-${index}`,
                    productCode:
                        productCode,
                    product_code:
                        productCode,
                    name:
                        `media-${index}`,
                    path: '',
                    storagePath: '',
                    url:
                        typeof url === 'string'
                            ? url
                            : url.url,
                    alt:
                        product.name ||
                        `${productCode} — WishRite Silver Jewellery`,
                    type:
                        'product',
                    isPrimary:
                        index === 0,
                    sortOrder:
                        index,
                    isPlaceholder:
                        false
                }))
                .filter(item => item.url);
        }

        /*
           5. Start dynamic Storage resolution.
           Do not block initial product rendering.
        */
        if (productCode) {
            resolveProductImages(
                product
            ).catch(error => {
                console.error(
                    '[WishRite Images] Background resolution failed:',
                    error
                );
            });
        }

        /*
           6. Temporary placeholder.
           It will be replaced automatically once
           Storage resolution completes.
        */
        return [
            generateProductPlaceholder(
                product.name ||
                productCode ||
                'Product'
            )
        ];
    }

    /* ============================================================
       21. PRODUCT IMAGE ERROR HANDLER
       ============================================================ */

    function handleProductImageError(
        img,
        productCode,
        category
    ) {
        if (!img) {
            return;
        }

        const cleanCode =
            normalizeProductCode(
                productCode ||
                img.dataset.productCode
            );

        /*
           Do not repeatedly retry the same URL.
        */
        const currentIndex =
            parseInt(
                img.dataset.fallbackIndex ||
                '0',
                10
            );

        const nextIndex =
            currentIndex + 1;

        if (
            nextIndex <
            FALLBACK_CANDIDATES.length
        ) {
            const fileName =
                FALLBACK_CANDIDATES[nextIndex];

            const fallbackPath =
                `${cleanCode}/${fileName}`;

            const fallbackUrl =
                getSupabaseStoragePublicUrl(
                    fallbackPath
                );

            img.dataset.fallbackIndex =
                String(nextIndex);

            img.src =
                addCacheBuster(
                    fallbackUrl
                );

            return;
        }

        /*
           Final placeholder.
        */
        img.onerror = null;

        img.src =
            generatePlaceholderDataUri(
                category ||
                cleanCode ||
                'Jewellery'
            );

        img.classList.add(
            'is-placeholder-img'
        );
    }

    /* ============================================================
       22. THUMBNAIL ERROR HANDLER
       ============================================================ */

    function handleThumbnailError(img) {
        if (!img) {
            return;
        }

        img.onerror = null;

        img.src =
            generatePlaceholderDataUri(
                'WishRite'
            );
    }

    /* ============================================================
       23. SVG PLACEHOLDER
       ============================================================ */

    function generatePlaceholderDataUri(
        label = 'WishRite'
    ) {
        const safeLabel =
            String(label)
                .replace(
                    /[<>&'"]/g,
                    ''
                )
                .substring(0, 40);

        const svg = `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="700"
                height="875"
                viewBox="0 0 700 875"
            >
                <rect
                    width="700"
                    height="875"
                    fill="#f7f4f1"
                />

                <text
                    x="350"
                    y="410"
                    text-anchor="middle"
                    font-family="Arial, sans-serif"
                    font-size="26"
                    fill="#5e3435"
                >
                    WishRite
                </text>

                <text
                    x="350"
                    y="450"
                    text-anchor="middle"
                    font-family="Arial, sans-serif"
                    font-size="16"
                    fill="#8a7775"
                >
                    ${safeLabel}
                </text>
            </svg>
        `;

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function generateProductPlaceholder(
        label = 'WishRite'
    ) {
        return {
            id: `placeholder-${Date.now()}`,
            productCode:
                extractProductCode(label),
            product_code:
                extractProductCode(label),
            name: 'placeholder',
            path: '',
            storagePath: '',
            url:
                generatePlaceholderDataUri(
                    label
                ),
            alt:
                `${label} — Image coming soon`,
            type: 'placeholder',
            isPrimary: true,
            sortOrder: 0,
            isPlaceholder: true
        };
    }

    /* ============================================================
       24. PRODUCT IMAGE MAP COMPATIBILITY
       ============================================================ */

    const productImagesMap = new Map();

    function setSupabaseProductImages(records) {
        productImagesMap.clear();

        if (!Array.isArray(records)) {
            return;
        }

        records.forEach(record => {
            const code =
                extractProductCode(record);

            if (!code) {
                return;
            }

            const image = {
                id:
                    record.id ||
                    `${code}-${productImagesMap.size}`,
                productCode:
                    code,
                product_code:
                    code,
                url:
                    record.url ||
                    record.image_url ||
                    record.public_url ||
                    '',
                alt:
                    record.alt ||
                    record.image_alt ||
                    `${code} — WishRite Silver Jewellery`,
                type:
                    record.type ||
                    'product',
                isPrimary:
                    record.isPrimary ??
                    record.is_primary ??
                    false,
                sortOrder:
                    Number(
                        record.sortOrder ??
                        record.sort_order ??
                        0
                    ),
                isPlaceholder:
                    false
            };

            if (!image.url) {
                return;
            }

            const existing =
                productImagesMap.get(code) ||
                [];

            existing.push(image);

            productImagesMap.set(
                code,
                existing
            );
        });

        /*
           Sort each product's images.
        */
        productImagesMap.forEach(
            (images, code) => {
                images.sort((a, b) => {
                    if (
                        a.isPrimary &&
                        !b.isPrimary
                    ) {
                        return -1;
                    }

                    if (
                        !a.isPrimary &&
                        b.isPrimary
                    ) {
                        return 1;
                    }

                    return (
                        a.sortOrder -
                        b.sortOrder
                    );
                });

                productImagesMap.set(
                    code,
                    images
                );
            }
        );
    }

    /* ============================================================
       25. OPTIONAL DB IMAGE MAP FALLBACK
       ============================================================ */

    function getMappedProductImages(
        product
    ) {
        const code =
            extractProductCode(product);

        if (!code) {
            return [];
        }

        return (
            productImagesMap.get(code) ||
            productImagesMap.get(
                code.toUpperCase()
            ) ||
            []
        );
    }

    /* ============================================================
       26. EXPOSE PUBLIC API
       ============================================================ */

    window.resolveProductImages =
        resolveProductImages;

    window.refreshProductImages =
        refreshProductImages;

    window.clearProductImageCache =
        clearProductImageCache;

    window.getProductImages =
        getProductImages;

    window.getSupabaseStoragePublicUrl =
        getSupabaseStoragePublicUrl;

    window.setSupabaseProductImages =
        setSupabaseProductImages;

    window.updateRenderedProductCards =
        updateRenderedProductCards;

    window.handleProductImageError =
        handleProductImageError;

    window.handleThumbnailError =
        handleThumbnailError;

    window.generateProductPlaceholder =
        generateProductPlaceholder;

    /* ============================================================
       27. DEBUG HELPERS
       ============================================================ */

    window.wishriteImageDebug = {
        bucket:
            STORAGE_BUCKET,

        resolve:
            resolveProductImages,

        refresh:
            refreshProductImages,

        clearCache:
            clearProductImageCache,

        getCache:
            function (productCode) {
                return resolvedImageCache.get(
                    normalizeProductCode(
                        productCode
                    )
                ) || [];
            },

        getClient:
            getSupabaseClient
    };

    console.info(
        '✓ WishRite dynamic image service initialized.'
    );

})();