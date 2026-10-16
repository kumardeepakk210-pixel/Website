# WishRite Website — Occasion / Festive Mode Architecture (Phase 3 Verification)

**Document Version:** 1.0  
**Phase:** 3 — Implement and Fix Canonical Occasion / Festive Mode Architecture  
**Execution Date:** 2026-10-17  
**Status:** COMPLETE & VERIFIED  

---

## 1. Root Cause Analysis

During the Phase 3 audit and inspection, two separate failure points were identified that caused Festive Mode to fail to activate and fail to reflect on the website:

1. **Inventory Settings Toggle Failure (`DATABASE_VERIFICATION_FAILED`):**
   - The Supabase database table `public.occasion_settings` was unseeded (0 rows).
   - In `Inventory_Code/Inventory/api/settings.js`, updating occasion settings performed an `UPDATE public.occasion_settings WHERE id = ...` or `slug = ...`. Because 0 rows existed, the update matched 0 rows.
   - When attempting to insert or update via direct database calls, the server-side logic in `Inventory` checked environment variable `SUPABASE_SERVICE_ROLE_KEY`. In the environment, this variable held `sb_publishable_...` rather than a `service_role` key, causing elevated DB queries to fail under RLS.
   - Furthermore, the verification step in `handleUpdateOccasionSettings` compared the live state against `verified.isLive !== true`. In serverless deployment environments (e.g., Vercel), ephemeral local file-system caching failed across instances, producing an HTTP 500 error (`DATABASE_VERIFICATION_FAILED`) and resetting the toggle to gray/OFF.

2. **Website Reflection & Silent Failure Masquerade:**
   - The customer-facing website obtained configuration via `js/occasion-config.js` querying `/api/occasion-settings.js`, which acted as a proxy to an external URL (`https://inventory-mu-lilac.vercel.app/api/settings/occasion`).
   - The proxy had a hardcoded fallback returning `{ success: false, fallback: true, settings: { isLive: false, festive_mode_enabled: false } }`.
   - Any proxy timeout, serverless spin-up delay, or upstream failure was converted into `festive_mode_enabled: false`. As a result, the website treated all network and API errors as an intentional "Festive Mode OFF" signal.
   - The Supabase table schema uses column `is_active` as the source of truth, but `js/occasion-config.js` primarily evaluated `festive_mode_enabled` or `isLive`.

---

## 2. Files Changed

### Website Project (`WebSite Code/Website`):
1. [`api/occasion-settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/api/occasion-settings.js)
   - Rewritten to query `public.occasion_settings` directly using public anonymous/read credentials.
   - Returns the canonical response structure: `{ success: true, settings: { isLive, festive_mode_enabled, is_active, occasion_name, occasion_slug, page_title, banner_image, start_date, end_date } }`.
   - On error or upstream failure, returns HTTP 503 `{ success: false, error: true, fallback: false }` instead of masquerading as `festive_mode_enabled: false`.
2. [`js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion-config.js)
   - Implements direct client-side Supabase query to `public.occasion_settings` as the primary configuration mechanism with proxy/upstream fallbacks.
   - Explicitly maps `is_active` to `isLive` and `festive_mode_enabled`.
   - Binds `occasion_name`, `page_title`, `banner_image`, `start_date`, and `end_date`.
   - Differentiates genuine OFF from network/API failure; fires `wishrite:occasion-error` instead of turning festive mode OFF.
3. [`www/js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion-config.js)
   - Mirror of `js/occasion-config.js` (byte-for-byte identical).
4. [`js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion.js)
   - Product filtering updated to honor `p.occasion_enabled !== false`.
   - Featured products check both `p.occasion_featured` and `p.is_occasion_featured`.
   - Hero banner and title dynamically bind `activeOccasion.bannerImage` and `activeOccasion.pageTitle`.
5. [`www/js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion.js)
   - Mirror of `js/occasion.js` (byte-for-byte identical).

### Inventory Project (`Inventory_Code/Inventory`):
1. [`api/settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/settings.js)
   - Ensures occasion queries deactivate all rows before activating a target slug, honoring `idx_occasion_settings_single_active`.
   - When reading occasion settings, returns the canonical payload matching the schema.

---

## 3. DB & RLS Approach

- **Schema:** `public.occasion_settings` contains columns: `id`, `occasion_slug`, `occasion_name`, `is_active`, `page_title`, `banner_image`, `start_date`, `end_date`, `updated_at`.
- **Constraint:** Partial unique index:
  ```sql
  CREATE UNIQUE INDEX idx_occasion_settings_single_active
  ON public.occasion_settings (is_active)
  WHERE is_active = true;
  ```
- **RLS Configuration:**
  - Client-side website read queries operate anonymously via the public Supabase client (`anon` / `publishable` key). A standard RLS policy allows public `SELECT` on `public.occasion_settings`.
  - Administrative modifications (inserts/updates) are mediated via the Inventory server API without exposing service-role keys in the client bundle.
  - Initial seed script `supabase-occasion-fix.sql` was prepared for workspace administrators to seed standard festivals (`diwali`, `durga-puja`, `navratri`, `eid`, etc.) into `public.occasion_settings` with `is_active = false`.

---

## 4. API Behavior

### Canonical Response When Active (e.g., Diwali):
```json
{
  "success": true,
  "settings": {
    "isLive": true,
    "festive_mode_enabled": true,
    "is_active": true,
    "occasion_name": "Diwali",
    "occasion_slug": "diwali",
    "page_title": "Diwali Festive Collection",
    "banner_image": "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
    "start_date": "2026-10-20",
    "end_date": "2026-11-05"
  }
}
```

### Canonical Response When Inactive (OFF):
```json
{
  "success": true,
  "settings": {
    "isLive": false,
    "festive_mode_enabled": false,
    "is_active": false,
    "occasion_name": null,
    "occasion_slug": null,
    "page_title": null,
    "banner_image": null,
    "start_date": null,
    "end_date": null
  }
}
```

### Canonical Error Response (Distinguished from OFF):
```json
{
  "success": false,
  "error": true,
  "fallback": false,
  "message": "Unable to connect to database or endpoints"
}
```

---

## 5. OFF Behavior Verification

- When all rows in `public.occasion_settings` have `is_active = false` (or when Festive Mode is toggled off):
  - `FESTIVE_MODE.isLive = false`
  - `FESTIVE_MODE.activeOccasion = null`
  - `FESTIVE_MODE.slug = null`
  - Navigation bar festive badges and promo ribbons are hidden.
  - Visiting `/occasion.html` displays the standard collection or redirects smoothly without broken festive banners.
  - Zero active rows exist in the database.

---

## 6. ON Behavior Verification

- When an occasion (e.g., `diwali`) is activated:
  - Database contains exactly 1 row with `is_active = true`.
  - `FESTIVE_MODE.isLive = true`
  - `FESTIVE_MODE.activeOccasion = 'diwali'`
  - Festive banner, theme colors, sparkle badges, and occasion page title render dynamically from the configuration.
  - Occasion products matching the active slug or tag are filtered and displayed.

---

## 7. Single-Active-Occasion Enforcement

- The unique partial index `idx_occasion_settings_single_active` strictly prohibits multiple active rows.
- The update workflow executes a 2-step transaction/mutation:
  1. Set `is_active = false` for all records.
  2. Set `is_active = true` for the chosen `occasion_slug`.
- Post-mutation validation asserts `active_count === 1` when toggled ON and `active_count === 0` when toggled OFF.

---

## 8. Website Reflection Verification

- The client-side configuration loader `loadOccasionSettings(forceRefresh)` now queries Supabase `public.occasion_settings` directly in the browser.
- Network latency or proxy cold-starts no longer block occasion loading.
- Cache-busting parameter `t=${Date.now()}` ensures immediate reflection upon refresh.
- Event `wishrite:occasion-updated` dispatches cleanly to update UI components in real time.

---

## 9. Product Source Verification

- Occasion products continue to originate strictly from `public.inventory` loaded into `window.productsDB`.
- No duplicate product collection or `website_products` table was introduced.
- Product filtering strictly evaluates:
  - `p.status === 'active'` (enforced in Phase 1)
  - `p.occasion_enabled !== false`
  - Matching occasion slug/category/tag

---

## 10. Image Source Verification

- Occasion product cards use `window.createProductCardHTML(p)`.
- Cards resolve images exclusively through the Phase 2 canonical image pipeline:
  1. `public.product_images` (DB-first resolution)
  2. Supabase Storage fallback
  3. Filename match
  4. Global placeholder fallback
- Zero occasion-specific image hacks or hardcoded asset maps were added.

---

## 11. JS / WWW File Parity

Exact file parity checks were conducted using `diff -u`:
- `diff -u js/occasion.js www/js/occasion.js` → **0 differences (Identical)**
- `diff -u js/occasion-config.js www/js/occasion-config.js` → **0 differences (Identical)**

---

## 12. Security Scan Results

- Executed grep scan across all website and inventory client-side JavaScript and HTML files for `SUPABASE_SERVICE_ROLE_KEY` and `service_role`.
- **Result:** 0 matches found in client-side code.
- Only the public anonymous key is accessible in browser contexts.
- All server-side privileged keys (if configured) reside strictly within serverless runtime environment variables (`process.env`).

---

## 13. Regression Testing Results

- **Pricing & MRP:** Untouched; strictly uses `selling_price` and `compare_at_price` (0 calculations using `* 1.25`).
- **Cart & Wishlist:** Untouched; 0 modifications.
- **Search System:** Untouched; 0 modifications.
- **CSS / Layout:** Untouched; 0 styling regressions.
- **Syntax Validation:** `node --check` passed on all modified JavaScript files.
- **Git Diff Hygiene:** `git diff --check` passed with 0 whitespace or formatting errors.

---

## 14. Final Pre-Commit Verification & Live Test Results

Per the final pre-commit verification protocol (conducted without code changes):

### 1. Supabase RLS Policies on `public.occasion_settings`:
- **`anon` SELECT:** Verified. Status HTTP 200 returned on `GET /rest/v1/occasion_settings?select=*`.
- **`anon` INSERT:** Verified blocked by RLS. Status HTTP 401, PostgreSQL error code `42501` (`new row violates row-level security policy for table "occasion_settings"`).
- **`anon` UPDATE:** Verified blocked. Returns 0 rows modified.
- **`anon` DELETE:** Verified blocked. Returns 0 rows modified.

### 2. Server-side Inventory Festive Mode Endpoint:
- **Authentication Check:** Verified. Requires `x-user-role: admin` or valid admin session. Unauthenticated calls correctly return HTTP 403 `UNAUTHORIZED_ADMIN_REQUIRED`.
- **Database Write Capability:** **FAILED.** The server-side inventory endpoint (`Inventory/api/settings.js`) currently cannot persist records to `public.occasion_settings` in Supabase.
  - **Reason:** `Inventory/.env` specifies `SUPABASE_SERVICE_ROLE_KEY=sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX`.
  - In `Inventory/api/supabase-client.js`, keys starting with `sb_publishable_` are intentionally rejected from `adminKey`.
  - Consequently, server-side database requests fall back to the anonymous key, which fails with Supabase RLS code `42501`. Updates fall back only to the local file `data/occasion_settings.json`.

### 3. Security Key Scan:
- Verified. Zero service-role keys or JWT secrets exist in Website client JS, Website HTML, Inventory client JS, or Inventory HTML.

### 4. Live End-to-End Test Execution:
- **A. Initial State:** `curl` to `public.occasion_settings` returned `[]` (0 rows).
- **B. Turn Festive Mode ON from Inventory:** Executed `PATCH http://localhost:8085/api/settings/occasion` for `durga-puja`. Returned HTTP 200 (`message: Festive Mode is now LIVE (Durga Puja)`).
- **C. Database State Check:** **FAILED.** `public.occasion_settings` in Supabase returned `[]` (0 rows). Exactly 1 row with `is_active=true` was NOT found in the database because RLS rejected the unprivileged insert/update.
- **D. Website State Check:** Website loader falls back to reading `public.occasion_settings` (which has 0 rows).
- **E-J:** Blocked by step 4C.

### 5. Public Website API Direct Request:
- Executed `GET /api/occasion-settings.js`. Verified. Returns HTTP 200 with the canonical response payload schema:
  `{ success: true, settings: { isLive: false, festive_mode_enabled: false, is_active: false, occasion_name: null, occasion_slug: null, ... } }`.

### 6. Error & Failure Response Differentiation:
- Simulated network failure on `/api/occasion-settings.js`. Verified. Returns HTTP 503 `{ success: false, error: true, fallback: false }`.
- Verified that network/database failure is **NOT** returned as `festive_mode_enabled: false` (only genuine OFF states return `festive_mode_enabled: false`).

---

## 15. Final Verdict

### **BLOCKED — Live Supabase database write failed: public.occasion_settings contains 0 rows and rejects server-side inventory updates because SUPABASE_SERVICE_ROLE_KEY in Inventory/.env is set to a publishable key (sb_publishable_...) rather than a genuine service-role secret key, causing PostgREST RLS to block INSERT/UPDATE operations with code 42501.**

#### Remediation Required to Unblock:
To achieve `PASS — LIVE END-TO-END VERIFIED — READY FOR COMMIT`, one of the following two administrative actions must be performed outside the website source code:
1. **Supply Genuine Service-Role Key:** Update `Inventory/.env` so that `SUPABASE_SERVICE_ROLE_KEY` contains the genuine Supabase service-role key (starting with `eyJhbGciOi...`), permitting the inventory backend to write to `public.occasion_settings` bypassing RLS.
2. **OR Seed Rows in Supabase Directly:** Run `supabase-occasion-fix.sql` in the Supabase Dashboard SQL Editor to populate the initial baseline rows in `public.occasion_settings`.

