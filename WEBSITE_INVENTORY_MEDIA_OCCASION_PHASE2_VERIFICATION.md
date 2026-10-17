# WishRite Website — Phase 2 Canonical Image Architecture Verification Report

**Verification Date:** October 17, 2026  
**Branch:** `website-inventory-schema-v1`  
**Mode:** Implementation Verification  
**Target Canonical Source:** `public.product_images`  
**Storage Fallback Bucket:** `product-images`  
**Status:** **PASS — READY FOR PHASE 2 COMMIT**

---

## 1. Files Changed

Only the four approved source files were modified:
- [`js/images.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/images.js)
- [`www/js/images.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/images.js)
- [`js/products.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/products.js)
- [`www/js/products.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/products.js)

`git diff --stat`:
```text
 js/images.js       | 177 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 js/products.js     |  33 +++++++++-
 www/js/images.js   | 177 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 www/js/products.js |  33 +++++++++-
 4 files changed, 414 insertions(+), 6 deletions(-)
```

---

## 2. Database Image Query (`public.product_images`)

Implemented in [`js/images.js:L467-550`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/images.js#L467-L550) (`fetchProductImagesFromDatabase(productCode)`):
- **Canonical Table:** `public.product_images`
- **Selected Columns (Public fields only):**
  - `product_code`
  - `image_url`
  - `storage_path`
  - `file_name`
  - `image_type`
  - `image_role`
  - `sort_order`
  - `alt_text`
  - `is_primary`
  - `is_active`
- **Filter:** `.eq('product_code', cleanCode).eq('is_active', true)`
- **Order:** `.order('sort_order', { ascending: true })`
- **Query Mechanism:**
  1. Primary: Uses the standard public Supabase JavaScript client (`client.from('product_images').select(...)`).
  2. Fallback: Direct REST API query via anonymous key (`${SUPABASE_URL}/rest/v1/product_images?...`) if client is uninitialized or fails.

---

## 3. Canonical Image Role Mapping

Implemented in [`js/images.js:L401-465`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/images.js#L401-L465) (`mapDatabaseImageRecord(row, productCode, index)`):
The ten canonical roles are explicitly defined and supported:
1. `01_main_ecommerce`: Studio product on white/neutral background (Primary ecommerce image)
2. `02_premium_hero`: High-impact hero composition/banner angle
3. `03_angle_45`: 45-degree angled perspective (Preferred hover image)
4. `04_detail_closeup`: Macro close-up on hallmark, pavé gemstones, or clasp
5. `05_luxury_lifestyle`: Editorial lifestyle/flatlay scene setting
6. `06_model_wearing`: Authentic human model wearing jewellery
7. `07_gift_presentation`: Velvet keepsake box, certificate, packaging
8. `08_extreme_macro`: Extreme craftsmanship / hallmark zoom
9. `09_reverse_view`: Backside, earring post, or chain lock
10. `10_size_reference`: Scale indicator with hand, coin, or dimension reference

Each mapped object preserves:
- `url`: Preferred `row.image_url`, fallback to `getSupabaseStoragePublicUrl(storage_path)`
- `name` / `path` / `storagePath`: Filename and bucket path information
- `type` / `image_type`: Image category type (`model`, `lifestyle`, or `product`)
- `imageRole` / `image_role`: Exact canonical string
- `isPrimary` / `is_primary`: Boolean primary flag
- `alt` / `alt_text`: Accessibility text
- `sortOrder` / `sort_order`: Numeric display order
- `isModel`: `role === '06_model_wearing'`
- `isLifestyle`: `role === '05_luxury_lifestyle'`
- `isPlaceholder`: `false`

---

## 4. Sort Order & Primary Image Logic

- Database query requests `.order('sort_order', { ascending: true })`.
- `fetchProductImagesFromDatabase` additionally enforces a deterministic in-memory sort guarantee:
  ```javascript
  mapped.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.sortOrder - b.sortOrder;
  });
  ```
- Primary status is granted if `row.is_primary === true`, `row.image_role === '01_main_ecommerce'`, or `index === 0`.
- The primary image always occupies index 0 of `product.images`.

---

## 5. Product Card Hover Image Logic

Implemented in [`js/products.js:L1208-1237`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/products.js#L1208-L1237) (`createProductCardHTML`):
- **Primary Image:**
  `product.images.find(img => img.imageRole === '01_main_ecommerce' || img.isPrimary) || product.images[0]`
- **Hover Image Selection Preference:**
  1. `03_angle_45` (Angled view preferred for hover)
  2. Fallback: `02_premium_hero` (Hero view)
  3. Fallback: `product.images[1]` (Original array index 1)
- If a product does not yet have role metadata, it seamlessly uses `product.images[1]`. No cards are broken.

---

## 6. Model-Wearing Image Logic

Implemented in [`js/products.js:L1380-1415`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/products.js#L1380-L1415) (`getProductModelWearImage(product, customImages)`):
- **Priority 1:** Canonical role `06_model_wearing` from `public.product_images`
- **Priority 2:** Canonical role `05_luxury_lifestyle` from `public.product_images`
- **Priority 2a:** Explicit `isModel` / `isLifestyle` flags
- **Priority 2b:** Filename / Alt keyword regex match (`model`, `wearing`, `on-neck`, `on-wrist`...)
- **Priority 2c (Preserved Legacy):** `VERIFIED_MODEL_URLS` and `VERIFIED_ON_MODEL_INDICES` for unmigrated catalog items
- **Priority 2d:** Studio upload index heuristics (`[2, 3, 4, 1]`)
- **Priority 2e:** Secondary shot (`imgs[1]`) or primary shot (`imgs[0]`)
- **Step 3 Fallback:** Category-specific studio assets (`assets/categories/cute-studs.jpg`, `assets/categories/cat-rings.jpg`...)

---

## 7. Migration-Safe Storage Fallback Chain

Implemented in [`js/images.js:L900-975`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/images.js#L900-L975) (`resolveProductImages`):
1. **Tier 1 (Canonical DB):** `fetchProductImagesFromDatabase(cleanCode)` queries `public.product_images`. If `dbImages.length > 0`, caches and returns immediately.
2. **Tier 2 (Storage Listing):** If DB returns 0 rows, proceeds to `listProductImagesFromStorage(cleanCode, cleanFolder)` scanning bucket `product-images/{PRODUCT_CODE}/`.
3. **Tier 3 (Public Candidates):** If Storage listing returns empty, probes common filenames (`main.webp`, `image-1.webp`...).
4. **Tier 4 (Relatable 8K Studio):** If no files exist anywhere, returns authentic category placeholder from `/assets/categories/`.

---

## 8. Caching & In-Flight Deduplication

- Uses existing `resolvedImageCache` (`Map`): once resolved, cached images are returned synchronously without repeated network requests.
- Preserves `inFlightResolutions` (`Map`): concurrent requests for the same product share a single in-flight resolution promise.
- `updateProductsDatabase(cleanCode, images)` updates `window.productsDB` objects in place.
- `updateRenderedProductCards(cleanCode, images[0].url)` patches rendered card DOM elements.
- `updateCurrentPdp(cleanCode, images)` updates open PDP gallery in real time.

---

## 9. Security & Credential Check

- **`SUPABASE_SERVICE_ROLE_KEY`:** Zero occurrences in customer-facing code. Verified via:
  ```bash
  grep -rn "SUPABASE_SERVICE_ROLE_KEY" js/ www/js/ index.html www/index.html css/ www/css/
  # Exit code 1 (0 matches found)
  ```
- **Credentials Used:** Only standard public anonymous key (`SUPABASE_ANON_KEY` / publishable key) authorized for public reads.

---

## 10. Source / WWW Parity & Syntax Verification

- **Node Syntax Checks:**
  - `node -c js/images.js` → **PASS** (exit 0)
  - `node -c www/js/images.js` → **PASS** (exit 0)
  - `node -c js/products.js` → **PASS** (exit 0)
  - `node -c www/js/products.js` → **PASS** (exit 0)
- **File Parity:**
  - `diff -u js/images.js www/js/images.js` → **0 differences** (exit 0)
  - `diff -u js/products.js www/js/products.js` → **0 differences** (exit 0)
- **Git Diff Hygiene:**
  - `git diff --check` → **0 whitespace or conflict errors** (exit 0)

---

## 11. Untouched Files & Strict Boundary Adherence

The following components were verified strictly unchanged:
- **CSS Stylesheets:** Zero CSS files modified.
- **Supabase Migrations & Schema:** Zero SQL files modified.
- **Occasion Files:** [`js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion.js) and [`js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion-config.js) unchanged.
- **Checkout & Cart:** [`js/cart.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/cart.js) unchanged.
- **Predictive Search:** [`js/search.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/search.js) unchanged.
- **Wishlist:** [`js/wishlist.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/wishlist.js) unchanged.
- **HTML:** [`index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/index.html) and [`www/index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/index.html) unchanged.

---

## 12. Final Verdict

### **PASS — READY FOR PHASE 2 COMMIT**

Phase 2 implementation meets all requirements:
- `public.product_images` is the canonical image source.
- All 10 canonical roles are supported.
- Card hover image prefers `03_angle_45` then `02_premium_hero`.
- Model wear image prioritizes `06_model_wearing` then `05_luxury_lifestyle`, with legacy fallbacks intact.
- Tier 2 Storage discovery and Tier 4 studio placeholders guarantee zero broken images during migration.
- `js/` and `www/js/` maintain 100% byte-for-byte parity.
- Zero private keys exposed.
- No files committed or pushed.
