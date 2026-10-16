# WishRite Website — Inventory Master Schema V1 Alignment Audit

**Audit Date:** October 17, 2026  
**Auditor:** Antigravity AI  
**Branch:** `website-inventory-schema-v1`  
**Scope:** Read-Only Audit of Product Data Flow, Schema Alignment, and Security Boundaries  
**Target Schema:** Supabase Inventory Master Schema V1 (`public.inventory`, `public.product_images`, `public.product_stock_notifications`)

---

## 1. Executive Summary

This audit evaluates the WishRite Website repository against the **Supabase Inventory Master Schema V1**.

### Key Directives & Architectural Invariants:
1. **Single Source of Truth:** `public.inventory` remains the sole canonical table for products. No separate `website_products` table is created or assumed.
2. **Pricing Policy:** `selling_price` is the actual selling price; `compare_at_price` is the MRP / strikethrough price. **MRP must NEVER be calculated as `selling_price * 1.25`**.
3. **Audience Taxonomy:** Canonical database values are `Female`, `Male`, `Boys`, `Girls`.
4. **Lifecycle & Stock Independence:** `status` values are `Active`, `Draft`, `Archived`. `stock_quantity` is strictly independent of `status`. Only `Active` products are publicly listed. `Active` with `stock_quantity = 0` represents Out of Stock (triggers "Notify Me When Available").
5. **Data Security & Privacy:** Internal financial columns (`cost_price`, `purchase_price`), purchase dates, and supplier shop details must **never** be exposed publicly over the REST API or stored in browser memory/localStorage.
6. **Images:** `public.product_images` is the canonical metadata source with `image_role` (`primary`, `hover`, `lifestyle`, `model`, `gallery`). Existing Storage paths (`product-images/{PRODUCT_CODE}/`) and images are preserved with non-breaking fallbacks.
7. **Design Preservation:** Existing WishRite customer-facing luxury aesthetics and frontend UI remain preserved.

---

## 2. Inventory Master Schema V1 Alignment Matrix

| Schema Column / Domain | Canonical DB Specification | Current Website Implementation | Compliance Status | Action Needed |
| :--- | :--- | :--- | :--- | :--- |
| **Data Source Table** | `public.inventory` | Reads from `public.inventory` via Supabase REST API | ✅ **COMPLIANT** | Preserve canonical query |
| **Selling Price** | `inventory.selling_price` | `item.selling_price` mapped to `product.sellingPrice` & `product.price` | ✅ **COMPLIANT** | Preserve mapping |
| **MRP / Compare Price** | `inventory.compare_at_price` | Ignored. Hardcoded formula: `Math.round((sellingPrice * 1.25) / 50) * 50` | ❌ **CRITICAL VIOLATION** | Map `compare_at_price`; eliminate `* 1.25` |
| **Internal Cost Prices** | `inventory.cost_price`, `inventory.purchase_price` | `purchase_price` queried via `select=*` & exposed on `product.purchase_price` | ❌ **CRITICAL SECURITY RISK** | Exclude from `select` & strip from product model |
| **Supplier Metadata** | `shop_name`, `shop_address`, `purchase_date` | Exposed on `product.shopName`, `product.shopAddress`, searched in `search.js` | ❌ **PRIVACY LEAK** | Exclude from `select` & strip from product model |
| **Product Status** | `Active`, `Draft`, `Archived` | Unfiltered `select=*`. Overwritten as `stock > 0 ? 'Active' : 'Currently Unavailable'` | ❌ **CRITICAL BUG** | Filter `status=eq.Active`; decouple from stock |
| **Stock Availability** | `stock_quantity >= 0` independent of status | Correctly used in PDP & Cart guards; mixed up with `status` in mapper | ⚠️ **PARTIAL** | Decouple `status` from `stock_quantity` |
| **Audience Taxonomy** | `Female`, `Male`, `Boys`, `Girls` | Checks `Female`, `Men`, `Kids-Girl`, `Kids-Boy`; misses `Boys`, `Girls`, `Male` | ❌ **FUNCTIONAL BUG** | Align audience mappings; add backward compatibility |
| **Canonical Slugs** | `inventory.product_slug` | Read if present, but fallback slug generator takes precedence in some links | ⚠️ **PARTIAL** | Set `product.slug = product.product_slug \|\| fallback` |
| **Product Attributes** | `material`, `purity`, `finish`, `weight`, `size` | `material`, `purity`, `finish` hardcoded for silver jewellery | ❌ **NON-COMPLIANT** | Read directly from `item.material`, `item.purity`, `item.finish` |
| **Festive Attributes** | `occasion_featured`, `occasion_slug`, `color`, `fabric`, etc. | Checks `item.is_occasion_featured` instead of `item.occasion_featured` | ⚠️ **BUG** | Align property names |
| **SEO Fields** | `seo_title`, `seo_description`, `seo_keywords` | Exists in DB but ignored in mapper; `seo.js` falls back to defaults | ⚠️ **SUB-OPTIMAL** | Pass `seo_title`, `seo_description`, `seo_keywords` to `product` |
| **Images Source** | `public.product_images` table | Bypasses table; directly lists Supabase Storage bucket `product-images` | ❌ **NON-COMPLIANT** | Implement `product_images` query with Storage fallback |
| **Image Roles** | `primary`, `hover`, `lifestyle`, `model`, `gallery` | Inferred by regex on file name or hardcoded product codes | ❌ **NON-COMPLIANT** | Support `image_role` from metadata |
| **Notify Me Workflow** | `public.product_stock_notifications` | Fully functional modal & REST insertion, but disabled button in `app.js` sticky CTA | ⚠️ **DISCREPANCY** | Align `app.js` sticky CTA to trigger Notify Me |

---

## 3. Detailed Audit Findings by Component

### Finding 1: Artificial MRP Calculation via `selling_price * 1.25`
- **File:** `js/products.js` (and mirrored in `www/js/products.js`)
- **Lines:** 198–199, 348–349
- **Current Logic:**
  ```javascript
  const mrp = sellingPrice > 0 ? Math.round((sellingPrice * 1.25) / 50) * 50 : sellingPrice;
  const discount = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
  ```
- **Required Logic:**
  - Read `compare_at_price` from `inventory` row:
    ```javascript
    const compareAtPrice = Number(item.compare_at_price) || 0;
    const mrp = compareAtPrice > sellingPrice ? compareAtPrice : sellingPrice;
    const discount = compareAtPrice > sellingPrice
        ? Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 100)
        : 0;
    ```
  - **Zero multiplication by 1.25.**
- **Risk / Impact:** **High.** False discount calculation violates legal e-commerce price disclosure requirements and overrides verified merchant MRPs configured in the Inventory app.
- **Urgency:** **Required Now.**

---

### Finding 2: Exposure of Sensitive Cost & Supplier Information
- **Files:**
  - `js/products.js`: Lines 183, 321–328, 445
  - `js/search.js`: Line 60
  - `www/js/products.js`: Lines 183, 321–328, 445
  - `www/js/search.js`: Line 60
- **Current Logic:**
  - `inventoryUrl = `${WR_SUPABASE_URL}/rest/v1/inventory?select=*&order=created_at.desc`;`
  - Maps `purchase_price`, `purchase_date`, `shop_name`, `shop_address` into `window.productsDB`.
  - Serializes `window.productsDB` into `localStorage('wishrite_inventory_cache')`.
  - `search.js` matches queries against `p.shopName`.
- **Required Logic:**
  - Never select or expose `cost_price`, `purchase_price`, `purchase_date`, `shop_name`, or `shop_address` on the customer-facing storefront.
  - The REST query must specify explicit public columns:
    ```text
    select=id,product_code,product_name,product_description,short_description,category,catalog_type,stock_quantity,selling_price,compare_at_price,weight,size,storage_folder,audience,design_group,variant_type,variant_value,product_slug,status,material,purity,finish,occasion_slug,occasion_category,occasion_featured,occasion_enabled,fabric,color,pattern,border_style,design,matching_tags,seo_title,seo_description,seo_keywords,created_at,updated_at
    ```
  - Completely remove `purchase_price`, `purchasePrice`, `shop_name`, `shopName`, `shop_address`, `shopAddress`, `purchase_date`, `purchaseDate` from `mapInventoryToProduct`.
  - Remove `p.shopName` from `search.js`.
- **Risk / Impact:** **Critical Security & Business Risk.** Profit margins, cost prices, and wholesale supplier identities are exposed in browser DevTools and localStorage.
- **Urgency:** **Required Now.**

---

### Finding 3: Lack of Status Filtering & Overwriting Status with Stock
- **Files:** `js/products.js` (and `www/js/products.js`)
- **Lines:** 362, 445
- **Current Logic:**
  - Query does not filter by status: fetches `Active`, `Draft`, and `Archived` indiscriminately.
  - In `mapInventoryToProduct`:
    ```javascript
    status: stock > 0 ? 'Active' : 'Currently Unavailable'
    ```
- **Required Logic:**
  - Restrict query to active products: `&status=eq.Active` (or filter in mapper: `if (item.status && item.status !== 'Active') return null;`).
  - Decouple status from stock:
    ```javascript
    status: item.status || 'Active',
    stock_quantity: stock,
    isAvailable: stock > 0,
    availability: stock > 3 ? 'In Stock' : (stock > 0 ? `Only ${stock} left` : 'Currently Unavailable')
    ```
- **Risk / Impact:** **High.** Draft or Archived products can leak onto the public website; status semantics are conflated with stock quantities.
- **Urgency:** **Required Now.**

---

### Finding 4: Audience Mapping Mismatch for Canonical Values
- **Files:**
  - `js/products.js`: Lines 211–244, 1098–1100
  - `js/app.js`: Lines 599–601, 637–658
  - `js/ui.js`: Lines 358–390
  - `www/js/*`: Duplicate lines
- **Current Logic:**
  - Compares `audience === 'Female'`, `audience === 'Men'`, `audience === 'Kids-Girl'`, `audience === 'Kids-Boy'`.
  - `getKidsProducts()` tests `aud === 'Kids-Girl' || aud === 'Kids-Boy'`.
  - `ui.js` checks `aud === 'kids-boy'` / `aud === 'kids-girl'` and strictly excludes `aud === 'male'`.
- **Required Logic:**
  - Align with canonical DB values: `'Female'`, `'Male'`, `'Boys'`, `'Girls'`.
  - Maintain backward compatibility for legacy records:
    ```javascript
    const audNorm = (item.audience || '').trim();
    if (audNorm === 'Female' || audNorm === 'Women') {
        gender = 'female'; targetGender = 'female'; ageGroup = 'adult'; targetAudience = 'women';
    } else if (audNorm === 'Male' || audNorm === 'Men') {
        gender = 'men'; targetGender = 'male'; ageGroup = 'adult'; targetAudience = 'men';
    } else if (audNorm === 'Girls' || audNorm === 'Kids-Girl') {
        gender = 'girls'; targetGender = 'female'; ageGroup = 'kids'; targetAudience = 'kids';
    } else if (audNorm === 'Boys' || audNorm === 'Kids-Boy') {
        gender = 'boys'; targetGender = 'male'; ageGroup = 'kids'; targetAudience = 'kids';
    }
    ```
  - In `getKidsProducts`: match `audNorm === 'Boys' || audNorm === 'Girls' || audNorm === 'Kids-Boy' || audNorm === 'Kids-Girl' || audNorm.toLowerCase().includes('kid')`.
  - In `ui.js` scope `'men'`: accept `aud === 'male' || aud === 'men'`.
  - In `ui.js` scope `'kids'`: accept `boys` / `girls`.
- **Risk / Impact:** **High.** Any product tagged with canonical `Boys`, `Girls`, or `Male` in Inventory Master Schema fails to appear in Kids or Men store sections.
- **Urgency:** **Required Now.**

---

### Finding 5: Canonical `product_slug` Routing & URL Consistency
- **Files:** `js/products.js`, `js/seo.js` (and `www/` duplicates)
- **Lines:** `js/products.js`: Lines 191, 246–254, 304, 311, 483–497, 660–672; `js/seo.js`: Line 85
- **Current Logic:**
  - Generates fallback slug if `item.product_slug` is absent.
  - When `product_slug` is present, it sets `product.product_slug = item.product_slug`.
  - However, card click handlers and URL generators intermittently use `product.slug` instead of prioritizing `product.product_slug`.
- **Required Logic:**
  - Store canonical slug directly in `product.slug`:
    ```javascript
    const canonicalSlug = (item.product_slug || '').trim().toLowerCase()
        || generateProductSlug(name, productCode, existingSlugs);
    product.slug = canonicalSlug;
    product.product_slug = canonicalSlug;
    ```
  - Index `productSlugMap` with both canonical `slug`, `product_code`, and `id`.
- **Risk / Impact:** **Medium.** Discrepancy between generated fallback slugs and database canonical slugs can cause PDP navigation or SEO canonical mismatches.
- **Urgency:** **Required Now.**

---

### Finding 6: Material, Purity, and Finish Overridden with Hardcoded Strings
- **Files:** `js/products.js` (and `www/js/products.js`)
- **Lines:** 283–296, 359–361, 1405–1407, 2068–2075
- **Current Logic:**
  - For `silver_jewellery`, hardcodes:
    ```javascript
    let material = '925 Sterling Silver';
    let silverPurity = '92.5%';
    let finish = 'High-Polish Rhodium';
    ```
  - `item.purity` and `item.finish` are completely discarded.
  - `item.material` is only read if `catalog_type === 'artificial_jewellery'`.
- **Required Logic:**
  - Read directly from `item`:
    ```javascript
    const material = (item.material || '').trim() || '925 Sterling Silver';
    const silverPurity = (item.purity || '').trim() || (catalogType === 'silver_jewellery' ? '92.5%' : null);
    const finish = (item.finish || '').trim() || (catalogType === 'silver_jewellery' ? 'High-Polish Rhodium' : 'Fine Polish');
    ```
- **Risk / Impact:** **Medium.** Custom attributes (e.g. 18K Gold Plated 925 Silver, Oxidised Antique finish, Rose Gold polish) set in the Inventory app are ignored.
- **Urgency:** **Required Now.**

---

### Finding 7: Festive Occasion Attribute Name Inconsistency
- **Files:** `js/products.js` (and `www/js/products.js`)
- **Lines:** 281, 336
- **Current Logic:**
  ```javascript
  const isOccasionFeatured = Boolean(item.is_occasion_featured);
  ```
- **DB Schema V1 Column:**
  `occasion_featured` (boolean) and `occasion_enabled` (boolean).
- **Required Logic:**
  ```javascript
  const isOccasionFeatured = Boolean(item.occasion_featured || item.is_occasion_featured);
  const isOccasionEnabled = item.occasion_enabled !== undefined ? Boolean(item.occasion_enabled) : true;
  ```
- **Risk / Impact:** **Medium.** Products marked as featured for festivals in the Inventory app fail to show up in festive showcase slots.
- **Urgency:** **Required Now.**

---

### Finding 8: Image Resolution Directly Queries Storage Instead of `product_images`
- **Files:** `js/images.js` (and `www/js/images.js`)
- **Lines:** 1–30, 401–500, 835–950
- **Current Logic:**
  - Queries Supabase Storage API (`client.storage.from('product-images').list(cleanFolder)`).
  - Infers lifestyle/model images via regex on file names or hardcoded product codes.
  - `public.product_images` table is never queried.
- **Required Logic:**
  - Support `public.product_images` as canonical metadata source:
    ```javascript
    // Fetch from product_images table ordered by sort_order
    const res = await client
        .from('product_images')
        .select('id, product_id, product_code, storage_path, image_url, image_role, sort_order, is_primary, alt_text')
        .eq('product_code', cleanCode)
        .order('sort_order', { ascending: true });
    ```
  - Map `image_role` (`primary`, `hover`, `lifestyle`, `model`, `gallery`).
  - **Graceful Fallback:** If `product_images` returns 0 rows for a product, seamlessly fall back to existing Storage list mechanism (`product-images/{PRODUCT_CODE}/`). This guarantees **zero broken images** during migration.
- **Risk / Impact:** **Medium.** Currently images work via Storage listing, but editorial curation (setting primary photo, hover photo, or model wear role in Inventory app) is ignored.
- **Urgency:** **Required (Phase 1 can implement dual-lookup with storage fallback).**

---

### Finding 9: Sticky CTA Out-of-Stock Button Inconsistency in `app.js`
- **Files:** `js/app.js` (and `www/js/app.js`)
- **Lines:** 338, 347–348
- **Current Logic:**
  - In `renderStickyCTA(product)`:
    ```javascript
    <button class="btn btn-primary btn-disabled" disabled style="width:100%;">OUT OF STOCK</button>
    ```
  - In `products.js` (line 2367):
    ```javascript
    <button class="btn btn-primary" onclick="openNotifyMeModal('${product.id}')">NOTIFY ME WHEN AVAILABLE</button>
    ```
- **Required Logic:**
  - Replace the dead disabled button in `app.js` with `openNotifyMeModal('${product.id}')` so mobile customers can subscribe to back-in-stock alerts from the sticky CTA.
- **Risk / Impact:** **Low-Medium.** Missed lead capture and customer frustration on mobile PDPs when scrolling past out-of-stock items.
- **Urgency:** **Can be aligned during PDP alignment.**

---

### Finding 10: `www/` Directory Mirroring for Capacitor App
- **Files:** `www/js/*`, `www/index.html`
- **Observation:** `capacitor.config.json` specifies `"webDir": "www"`. All JavaScript files in `www/js/` are exact clones of `js/`.
- **Required Action:** Whenever `js/products.js` or `js/images.js` is modified, the changes must be mirrored to `www/js/` to keep the Android/Capacitor app fully in sync.
- **Risk / Impact:** **Medium.** If unmirrored, the web app and native Android app will run different product logic.
- **Urgency:** **Required on every change.**

---

## 4. Existing Compliant Logic (DO NOT CHANGE)

The following components and subsystems are already aligned with the Master Schema V1 and **must be preserved as-is**:

1. **`js/cart.js` — Order Items Data Model:**
   - Lines 2162–2182 correctly map `inventory_id` to `public.inventory.id`, `product_code`, `quantity`, `unit_price`, `line_total`, and `size`.
   - Cart stock guards (lines 158–179) prevent purchase of 0-stock products and cap additions at `product.stockQuantity`.
2. **`js/products.js` — Category Normalization (`normalizeCategory`):**
   - Clean taxonomy map (lines 75–102) correctly handles singular/plural mappings (e.g. `Earring` → `Earrings`, `Ring` → `Rings`).
3. **`js/products.js` — Notify Me Subscription (`handleNotifyMeSubmit`):**
   - Lines 2483–2570 insert directly into `public.product_stock_notifications` with `product_id`, `product_code`, `product_name`, `customer_email`, `status: 'pending'`, and duplicate guard. Fully compliant.
4. **`js/occasion-config.js` — Dynamic Occasion Settings:**
   - Authoritative API settings proxy (`/api/occasion-settings`) and live festival resolution.
5. **`js/seo.js` — Schema.org & OpenGraph Generation:**
   - Structured JSON-LD Product & BreadcrumbList generation using live `product.sellingPrice` and canonical URLs.
6. **Existing Supabase Storage Paths:**
   - Public URL generation for `product-images/{PRODUCT_CODE}/{fileName}` works reliably and must be retained as the image URL target.

---

## 5. Phased Implementation Roadmap

### Phase 1: Core Product Service Alignment (`js/products.js`)
- [ ] Explicitly select public columns in Supabase REST query (omit sensitive cost/supplier fields).
- [ ] Add `status=eq.Active` query filter.
- [ ] Map `compare_at_price` to `product.mrp` and calculate discount strictly against `compare_at_price`.
- [ ] Remove `selling_price * 1.25` formula completely.
- [ ] Map canonical audience values (`Female`, `Male`, `Boys`, `Girls`).
- [ ] Read `material`, `purity`, `finish`, `weight`, `size`, `short_description`, `occasion_featured`.
- [ ] Map `seo_title`, `seo_description`, `seo_keywords`.
- [ ] Mirror changes to `www/js/products.js`.

### Phase 2: Audience & Filter Harmony (`js/app.js`, `js/ui.js`)
- [ ] Update `getFilteredKidsProducts` in `app.js` to recognize `Boys` and `Girls`.
- [ ] Update `getScopeBaseProducts` in `ui.js` to recognize `Male`, `Boys`, `Girls`.
- [ ] Align sticky CTA out-of-stock button in `app.js` to open Notify Me modal.
- [ ] Mirror changes to `www/js/app.js` and `www/js/ui.js`.

### Phase 3: Image Metadata Service Alignment (`js/images.js`)
- [ ] Query `public.product_images` by `product_code` ordered by `sort_order`.
- [ ] Support `image_role` (`primary`, `hover`, `lifestyle`, `model`, `gallery`).
- [ ] Retain fallback to Supabase Storage listing (`product-images/{PRODUCT_CODE}/`) when `product_images` is empty.
- [ ] Mirror changes to `www/js/images.js`.

---

## 6. Audit Conclusion

The WishRite website repository architecture is sound and well-structured, but requires surgical, non-breaking alignment in `js/products.js`, `js/images.js`, and audience filters to achieve full compatibility with the **Supabase Inventory Master Schema V1**.

No database changes are needed. No UI redesign is required.
Following the phased roadmap above will eliminate pricing inaccuracies, seal data privacy exposures, support canonical audiences, and integrate canonical image metadata safely.
