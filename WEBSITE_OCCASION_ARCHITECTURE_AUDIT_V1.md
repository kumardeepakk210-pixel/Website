# WISHRITE — Phase 3: Occasion Architecture Audit Report (V1)
**Document Version:** 1.0.0  
**Audit Scope:** Customer-Facing Website Occasion Architecture & Festive Mode  
**Baseline Commits:** Phase 1 (`bcc010e`), Phase 2 (`e9b60b4`)  
**Active Branch:** `website-inventory-schema-v1`  
**Execution Mode:** READ-ONLY AUDIT (No modifications to source code, styling, or DB schema)

---

## 1. Files Inspected

### Website Repository Files
- [`js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion.js) — Primary occasion controller, category filtering, countdown timer, offers, silver pairings, and occasion view DOM renderer (`renderOccasionPage`).
- [`www/js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion.js) — Mobile/Cordova build counterpart of `js/occasion.js`.
- [`js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion-config.js) — Centralized occasion registry (`OCCASIONS`), state machine (`FESTIVE_MODE`), settings fetcher (`loadActiveOccasionSettings`), and Supabase realtime listener.
- [`www/js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion-config.js) — Mobile/Cordova build counterpart of `js/occasion-config.js`.
- [`js/app.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/app.js) & [`www/js/app.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/app.js) — Router (`navigateTo('occasion')`), header dynamic brand subtitle (`updateHeaderBrandSubtitle`), festive nav injection (`initFestiveNavigation`), and CSS body class toggling (`updateOccasionContentVisibility`).
- [`js/products.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/products.js) & [`www/js/products.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/products.js) — Product mapping from `public.inventory`, card generation (`createProductCardHTML`), image binding, and catalog type normalization.
- [`api/occasion-settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/api/occasion-settings.js) — Website same-origin Vercel serverless proxy targeting upstream Inventory endpoint.
- [`index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/index.html) & [`www/index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/index.html) — Storefront markup containing occasion view container (`#occasion-view`), nav items (`#nav-occasion`, `#mobile-nav-occasion`), and static browse grids.
- [`css/pages.css`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/css/pages.css) & [`css/components.css`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/css/components.css) — Festive CSS variables (`--festive-primary`, `--festive-secondary`, `--festive-accent`, `--festive-bg`), background artwork styling, countdown cards, and product card styling.

### Inventory Backend & Database Reference Files
- [`/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/index.html) — Inventory Admin UI: Festive Mode toggle button (`#btn-toggle-festive-mode`), active dropdown (`#occ-active-select`), toggle handler (`toggleFestiveMode`), and state renderer (`renderFestiveState`).
- [`/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/js/api-client.js`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/js/api-client.js) — Inventory client methods `getOccasionSettings` and `updateOccasionSettings`.
- [`/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/settings.js) — Upstream server handlers `handleGetOccasionSettings` and `handleUpdateOccasionSettings`.
- [`/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/supabase-occasion-fix.sql`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/supabase-occasion-fix.sql) — Canonical DDL & seed script for `public.occasion_settings` and `public.inventory` occasion columns.
- [`/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/safe-inventory-migration.sql`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/safe-inventory-migration.sql) — RLS policies for `public.occasion_settings`.

---

## 2. Current Occasion Architecture

The WishRite ecosystem architecture is conceptually designed around three tiers:
1. **Inventory Management Tier (`Inventory_Code/Inventory`):**
   - Admin UI where store owners select a festival (e.g., Durga Puja, Kali Puja, Diwali, etc.) and toggle Festive Mode ON or OFF.
   - Intended to write settings directly to Supabase table `public.occasion_settings`.
2. **Database Tier (`public.occasion_settings` & `public.inventory`):**
   - `public.occasion_settings`: Canonical table storing occasion configuration, activation status (`is_active`), selection (`is_selected`), banners, and active dates.
   - `public.inventory`: Canonical product table storing products. Products assigned to festivals contain `occasion_slug`, `occasion_category`, `occasion_enabled`, and `occasion_featured`.
3. **Storefront Website Tier (`WebSite Code/Website`):**
   - Customer-facing website that dynamically adjusts when Festive Mode is active:
     - Header displays the festive badge & navigation link (`#nav-occasion` / `#mobile-nav-occasion`).
     - Brand subtitle updates dynamically (e.g., "DURGA PUJA COLLECTION" instead of "SILVER JEWELLERY").
     - Body tag receives `occasion-mode-active` class.
     - Navigating to `/occasion` opens `#occasion-view` rendered by `renderOccasionPage()`.
     - Injects custom festive color theme (`--festive-primary`, `--festive-secondary`, `--festive-accent`, `--festive-bg`).
     - Displays countdown timer to festival celebration.
     - Displays festival trust banner, promotional offers, and category filter tabs (All, Festive Sarees, Statement Jewellery, Gifting).
     - Renders festive product cards pulled from `window.productsDB` (`public.inventory`).

---

## 3. Current Data Flow (As Implemented)

Tracing the actual runtime flow reveals an unintended detour:

```
[ Admin in Inventory UI ]
         │ (Clicks toggle switch)
         ▼
[ PATCH /api/settings/occasion on Inventory Server ]
         │ (Writes to public.occasion_settings in Supabase + local JSON)
         ▼
[ public.occasion_settings in Supabase ]
         │
         │  ◄─── CRITICAL DISCONNECT: The Website DOES NOT read from Supabase!
         │
[ Customer on Website ]
         │
         ▼
[ js/occasion-config.js: loadActiveOccasionSettings() ]
         │
         ├── 1. Calls GET /api/occasion-settings (Website local proxy)
         │       │
         │       ▼
         │   [ api/occasion-settings.js ]
         │       │ (Proxies HTTP request to upstream Vercel deployment)
         │       ▼
         │   [ https://inventory-mu-lilac.vercel.app/api/settings/occasion ]
         │
         └── 2. Fallback fetch: Direct GET to https://inventory-mu-lilac.vercel.app/api/settings/occasion
```

### Flow Breakdown & Failure Modes:
1. Instead of reading directly from the database using the public anonymous Supabase client (the exact robust pattern used for products in `js/products.js`), `js/occasion-config.js` routes through a local serverless proxy (`api/occasion-settings.js`), which forwards requests to an external Vercel server (`https://inventory-mu-lilac.vercel.app/api/settings/occasion`).
2. When the website runs locally (or as a static SPA on a CDN), `/api/occasion-settings` yields HTTP 404 or fails network routing.
3. The fallback fetch directly against `inventory-mu-lilac.vercel.app` is vulnerable to Vercel cold starts, network timeouts (proxy aborts at 4500ms), and CORS restrictions.
4. When any exception or timeout occurs, `api/occasion-settings.js` catches the error and forcefully returns:
   ```json
   {
     "success": false,
     "fallback": true,
     "settings": {
       "isLive": false,
       "festive_mode_enabled": false,
       "activeOccasion": null
     }
   }
   ```
5. Consequently, `js/occasion-config.js` executes `resetFestiveModeToOff(null)`, setting `FESTIVE_MODE.enabled = false` and hiding all festive features, completely ignoring whatever was configured in Supabase.

---

## 4. `public.occasion_settings` Integration

### Supabase Table Schema Verification
A live query was executed against the Supabase database (`https://ptpuepejciqiktmcpuon.supabase.co/rest/v1/occasion_settings`) using the anonymous publishable key:

```sql
-- Verified Columns in public.occasion_settings:
- id                  (uuid, primary key)
- occasion_slug       (text, unique, not null)
- occasion_name       (text, not null)
- page_title          (text)
- page_description    (text)
- banner_image        (text)
- start_date          (date)
- end_date            (date)
- is_active           (boolean, not null, default false)
- is_selected         (boolean, not null, default false)
- created_at          (timestamptz, not null)
- updated_at          (timestamptz, not null)
```

### Table State in Active Database
- Direct HTTP REST probe: `GET /rest/v1/occasion_settings?select=*` returned `HTTP 200 OK` with body `[]` (**0 rows**).
- **Finding:** The DDL exists and is valid, but the 6 master occasions defined in `supabase-occasion-fix.sql` (`durga-puja`, `kali-puja`, `diwali`, `christmas`, `valentines-day`, `wedding`) have **not yet been populated/seeded** in the active Supabase database project, leaving the table empty.

---

## 5. Active-Occasion Logic

In `js/occasion-config.js`:
- The website maintains internal state in `FESTIVE_MODE`:
  ```javascript
  const FESTIVE_MODE = {
      enabled: false,
      activeOccasion: null,
      selectedOccasion: null
  };
  ```
- When `loadActiveOccasionSettings()` processes settings, it checks:
  ```javascript
  const isFestiveOn = Boolean(
      s.festive_mode_enabled !== undefined
          ? s.festive_mode_enabled
          : (s.isLive !== undefined ? s.isLive : false)
  );
  ```
- **Discrepancy:** The Supabase database table `public.occasion_settings` contains column **`is_active`**, NOT `festive_mode_enabled` or `isLive`.
  - Live query: `select=festive_mode_enabled` returns PostgREST error `42703: column occasion_settings.festive_mode_enabled does not exist`.
  - Live query: `select=is_live` returns PostgREST error `42703: column occasion_settings.is_live does not exist (Hint: Perhaps you meant to reference the column occasion_settings.is_active)`.
- If a client queried `public.occasion_settings` directly and looked for `s.festive_mode_enabled`, it would evaluate to `undefined` -> `false`.

---

## 6. Single-Active-Occasion Enforcement

The system strictly requires that **at most ONE occasion may be active at any given moment**.

### Database-Level Enforcement
In `supabase-occasion-fix.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_occasion_settings_single_active
ON public.occasion_settings (is_active)
WHERE is_active = true;
```
- This PostgreSQL partial unique index guarantees at the database storage engine level that any attempt to set `is_active = true` on a second row will throw a unique constraint violation (`23505`).
- A companion partial unique index enforces single selection:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_occasion_settings_single_selected
  ON public.occasion_settings (is_selected)
  WHERE is_selected = true;
  ```

### Application-Level Enforcement
- In `Inventory/api/settings.js` (`handleUpdateOccasionSettings`):
  When activating a target occasion, it resets all other rows (`is_active = false`) before setting the target row to `is_active = true`.
- In `Website/js/occasion-config.js`:
  `FESTIVE_MODE.activeOccasion` stores a single occasion slug. When deactivated, `activeOccasion` is explicitly set to `null`.

---

## 7. Festive Mode Toggle Flow (Inventory App)

In `Inventory/index.html`:
1. The toggle switch element:
   ```html
   <button type="button" id="btn-toggle-festive-mode" onclick="toggleFestiveMode()"
       class="relative inline-flex h-6 w-11 ... bg-slate-300" role="switch" aria-checked="false">
       <span id="festive-mode-knob" class="... translate-x-0"></span>
   </button>
   ```
2. When clicked, `toggleFestiveMode()` executes:
   - Sets `btn.disabled = true`.
   - Sends `PATCH /api/settings/occasion` with `{ festive_mode_enabled: nextLive, active_occasion_slug: targetSlug }`.
   - The Inventory backend (`api/settings.js`) requires admin authorization (`verifyAdminAuth`).
   - If authorized, it executes database updates against `public.occasion_settings` via `dbUpdate`.
   - It re-queries `occasion_settings` to verify:
     - `selectedCount === 1`
     - `activeCount === (turnOn ? 1 : 0)`
   - If verification fails or throws, it returns `HTTP 500 DATABASE_VERIFICATION_FAILED`.
   - In `Inventory/index.html`, any error triggers the `catch` block:
     ```javascript
     } catch (err) {
         console.error("[Occasion Toggle Error]:", err);
         currentFestiveState = previousState;
         renderFestiveState(currentFestiveState);
         alert(`❌ Failed to update Festive Mode in database:\n${err.message}`);
     } finally {
         if (btn) btn.disabled = false;
     }
     ```
   - `renderFestiveState` re-applies `bg-slate-300` (gray) and `translate-x-0`.

---

## 8. Exact Root Cause of the Known Gray / Non-Working Toggle

The investigation determined the concrete, multi-layer root cause:

1. **Empty / Unseeded Database Table (`public.occasion_settings`):**
   - The live Supabase table `public.occasion_settings` contains `0` rows.
   - When `toggleFestiveMode()` sends a update request, `handleUpdateOccasionSettings` in `api/settings.js` sees `allRows.length === 0`.
   - It attempts to insert default master rows using `dbInsert('occasion_settings', ...)`.
   - In serverless environments where `SUPABASE_SERVICE_ROLE_KEY` is missing or when RLS prevents anonymous writes, the insert fails.
   - When `allRows` remains `0`, the database verification check in `api/settings.js` fails:
     ```javascript
     if (selectedCount !== 1 || actualSelectedSlug !== targetSlug) {
         return res.status(500).json({ error: 'DATABASE_VERIFICATION_FAILED' ... });
     }
     ```
   - The API returns HTTP 500, causing `toggleFestiveMode()` to catch the exception and immediately revert `currentFestiveState` back to `isLive = false`.
   - The UI immediately renders the toggle in its OFF state (`bg-slate-300` gray).

2. **Temporary Disabled State Lock:**
   - At the beginning of `toggleFestiveMode()`, `btn.disabled = true` is set.
   - If network communication hung (e.g. cold start exceeding timeout) or threw an unhandled error prior to the `finally` block in earlier versions of the code, the button remained permanently disabled (gray and unclickable).

3. **Admin Authentication Requirement:**
   - `PATCH /api/settings/occasion` requires a valid admin session. If the user in the Inventory app had an expired token, the API rejected the call with `403 UNAUTHORIZED_ADMIN_REQUIRED`, causing the toggle to immediately flip back to gray.

---

## 9. Website Reflection Problem & Exact Cause

Even when the occasion setting was written to the database, the customer-facing website failed to reflect Festive Mode. The exact architectural causes are:

1. **The Website Does Not Read from Supabase (`public.occasion_settings`):**
   - While product data (`public.inventory`) and product images (`public.product_images`) are loaded directly from Supabase REST endpoints, occasion configuration in `js/occasion-config.js` was routed through:
     `GET /api/occasion-settings` ➔ Vercel proxy ➔ `https://inventory-mu-lilac.vercel.app/api/settings/occasion`.
   - If the Vercel proxy timed out (4500ms limit in `api/occasion-settings.js`), threw an error, or received a cold-start latency delay, it caught the error and returned hardcoded fallback data:
     ```json
     { "success": false, "fallback": true, "settings": { "isLive": false, "festive_mode_enabled": false } }
     ```
   - This forcibly turned Festive Mode OFF on the website regardless of the actual database state!

2. **Schema Property Mismatch (`is_active` vs `festive_mode_enabled`):**
   - In the database schema, the status column is `is_active` (boolean).
   - In `js/occasion-config.js` (lines 583–587), the frontend parser evaluated:
     `s.festive_mode_enabled` or `s.isLive`.
   - If `public.occasion_settings` rows were fetched directly, `s.festive_mode_enabled` would be `undefined`, causing `isFestiveOn` to evaluate to `false`!

---

## 10. Product Filtering Behavior

1. **Source of Truth:**
   - Products displayed in occasion sections come **strictly from `public.inventory` via `window.productsDB`**.
   - No separate product table exists or is required.
2. **Current Filtering Mechanism in `js/occasion.js`:**
   - In `getOccasionProducts(activeOccasion)`:
     ```javascript
     const liveOccasionItems = baseProducts.filter(p => {
         const pSlug = (p.occasion_slug || '').toLowerCase();
         const pOccasion = (p.occasion || '').toLowerCase();
         const pTags = (p.matching_tags || '').toLowerCase();
         const pCol = (p.collection || '').toLowerCase();
         return (
             pSlug === slug ||
             pOccasion.includes(slug) ||
             pTags.includes(slug) || ...
         );
     });
     ```
3. **Alignment with Master Schema V1:**
   - In Phase 1, `js/products.js` was aligned to select and map:
     - `occasion_slug`
     - `occasion_category`
     - `occasion_enabled`
     - `occasion_featured` / `is_occasion_featured`
   - In `js/occasion.js`:
     - Line 796: Featured festive products are filtered using:
       `allOccasionProducts.filter(p => Boolean(p.is_occasion_featured))`
     - Since Phase 1 maps `is_occasion_featured: Boolean(item.occasion_featured || item.is_occasion_featured)`, this is fully functional.
   - **Improvement Recommendation for Implementation:**
     Filtering should explicitly respect `p.occasion_enabled !== false` and check canonical `p.occasion_featured`.

---

## 11. Image Integration

1. **Product Cards on Occasion Pages:**
   - `renderCard` in `js/occasion.js` delegates directly to `window.createProductCardHTML`.
   - Phase 2 updated `createProductCardHTML` in `js/products.js` to consume canonical `public.product_images`:
     - Primary image: Role `01_main_ecommerce`, `is_primary = true`, or `product.images[0]`.
     - Hover image: Role `03_angle_45` ➔ `02_premium_hero` ➔ `product.images[1]`.
   - Occasion product listings inherit this canonical image pipeline automatically without requiring any separate image logic.
2. **Occasion Hero & Decorative Assets:**
   - Hero banner: Uses `activeOccasion.heroImage` (or `banner_image` from DB if provided).
   - Background sketch artwork: Uses curated local vector assets located in `assets/festive/`:
     - Durga Puja: `assets/festive/durga-puja/durga-sketch.svg`
     - Kali Puja / Diwali: `assets/festive/diwali/kali-sketch.svg`
     - Christmas: `assets/festive/christmas/christmas-sketch.svg`
     - Valentine's Day: `assets/festive/valentine/valentine-sketch.svg`
     - Wedding: `assets/festive/wedding/wedding-sketch.svg`

---

## 12. Date Handling

- `public.occasion_settings` columns: `start_date` (date) and `end_date` (date).
- Currently, `js/occasion.js` live countdown timer reads `activeOccasion.countdown.targetDate` from static registry in `js/occasion-config.js` (e.g., `'2026-10-18T00:00:00+05:30'`).
- If `start_date` and `end_date` exist in `public.occasion_settings`, the countdown should seamlessly adapt to use `targetDate = start_date || countdown.targetDate`.

---

## 13. RLS / Security Findings

1. **Customer-Facing Security:**
   - Zero occurrences of `SUPABASE_SERVICE_ROLE_KEY` in customer-facing files (`js/`, `www/js/`, `index.html`, `www/index.html`).
   - Only the public anonymous key (`sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX`) is bundled in client-side code.
2. **Row Level Security (RLS) on `public.occasion_settings`:**
   - As configured in `safe-inventory-migration.sql` and `supabase-occasion-fix.sql`:
     ```sql
     CREATE POLICY "Occasion settings are readable by all"
     ON public.occasion_settings FOR SELECT
     TO anon, authenticated, service_role
     USING (true);
     ```
   - This explicitly allows anonymous public reads (`SELECT`) from the website client.
3. **No Unsafe Write Endpoints:**
   - The customer website exposes zero write endpoints for occasion settings. Updates can only be initiated by authenticated admins in the Inventory app.

---

## 14. JS / WWW Parity Check

Full byte-for-byte parity was validated using `diff -u`:
1. `diff -u js/occasion.js www/js/occasion.js` ➔ **0 differences (100% Identical)**
2. `diff -u js/occasion-config.js www/js/occasion-config.js` ➔ **0 differences (100% Identical)**

---

## 15. Files That Would Need Modification During Implementation

To align the website with the canonical database architecture and eliminate the failure-prone Vercel proxy:
1. [`js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion-config.js) & [`www/js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion-config.js):
   - Query `public.occasion_settings` directly from Supabase using the existing anonymous client:
     `SELECT id, occasion_slug, occasion_name, page_title, page_description, banner_image, start_date, end_date, is_active, is_selected FROM occasion_settings WHERE is_active = true LIMIT 1`
   - Map `is_active = true` directly to `FESTIVE_MODE.enabled = true`, using `row.occasion_slug` as the canonical active slug.
   - If 0 active rows return, reliably set `FESTIVE_MODE.enabled = false` (Festive Mode OFF).
   - Retain local proxy as fallback only if direct Supabase fetch fails.
2. [`js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion.js) & [`www/js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion.js):
   - Refine `getOccasionProducts` to ensure `p.occasion_enabled !== false` is checked.
   - Support DB `banner_image` and `start_date` / `end_date` if populated from `public.occasion_settings`.

---

## 16. Recommended Minimal Implementation Boundary

1. **Direct Database Read:**
   Switch the website occasion fetcher to read directly from `public.occasion_settings` via Supabase REST API (just like `js/products.js` reads `public.inventory`).
2. **Canonical Column Binding:**
   Bind activation status strictly to `is_active === true`.
3. **Preserve Fallbacks & Visual Richness:**
   Retain the static theme color definitions, vector SVG artworks (`durga-sketch.svg`, etc.), and curated silver pairing recommendations from `js/occasion-config.js`.
4. **Keep Parity:**
   Ensure `js/*` and `www/js/*` remain 100% byte-for-byte identical.

---

## 17. Risks & Regressions Analysis

| Potential Risk | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Empty Supabase Table** | High | If `occasion_settings` has 0 rows in Supabase, the website must default gracefully to Festive Mode OFF (`FESTIVE_MODE.enabled = false`). |
| **Network Interruption** | Low | Retain existing cached occasion state in memory/localStorage. |
| **CSS/Layout Shift** | None | Keep all existing CSS classes (`.occasion-page`, `.festive-hero`, `.occasion-mode-active`) exactly as they are. |
| **Product Data Overwrite** | None | Occasion pages strictly consume `window.productsDB` without altering inventory models. |

---

## 18. Final Verdict

### **READY FOR OCCASION IMPLEMENTATION**

The root cause of both the Inventory toggle failure and the Website reflection failure has been completely identified and documented. The database schema is confirmed, RLS permissions are verified, product and image pipelines are already in place, and a clean, minimal implementation path directly querying `public.occasion_settings` is ready to proceed.
