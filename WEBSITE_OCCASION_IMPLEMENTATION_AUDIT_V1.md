# WISHRITE — Phase 3: Occasion Implementation Audit Report (V1)
**Document Version:** 1.0.0  
**Phase:** Phase 3 — Occasion & Festive Mode Architecture Implementation  
**Baseline Commits:** Phase 1 (`bcc010e`), Phase 2 (`e9b60b4`)  
**Active Branch:** `website-inventory-schema-v1`  
**Execution Mode:** STEP 1 — READ-ONLY INSPECTION AUDIT

---

## 1. Executive Summary

This implementation audit establishes the concrete root causes and technical specifications required to fix the end-to-end Occasion / Festive Mode architecture between the Inventory App, the Supabase database (`public.occasion_settings`), and the customer-facing Website.

The canonical database schema is already finalized:
- `public.inventory` = canonical product source
- `public.product_images` = canonical product image metadata
- `public.occasion_settings` = canonical occasion configuration

---

## 2. Exact Root Cause Analysis

### A. Inventory App Festive Mode Toggle Failure
1. **Unseeded Database Table:** Direct query to Supabase REST API (`GET /rest/v1/occasion_settings?select=*`) confirmed that `public.occasion_settings` currently has **0 rows**.
2. **Missing Server Admin Credential:**
   - In `/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/.env`:
     `SUPABASE_SERVICE_ROLE_KEY=sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX`
   - In `/Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/supabase-client.js`:
     ```javascript
     if (rawSecretKey && !rawSecretKey.startsWith('sb_publishable_')) {
         adminKey = rawSecretKey;
     } else if (rawServiceRoleKey && !rawServiceRoleKey.startsWith('sb_publishable_')) {
         adminKey = rawServiceRoleKey;
     }
     ```
   - Because `rawServiceRoleKey` begins with `sb_publishable_`, `adminKey` evaluates to `""`.
   - `hasServerAdminCredential()` returns `false`, and `adminClient` is `null`.
   - Whenever `handleUpdateOccasionSettings` in `api/settings.js` executes `dbInsert` with `{ useAdmin: true }`, it falls back to the public anonymous key. If anonymous inserts are blocked or if the table is empty, inserts fail.
3. **Stateless Serverless Disconnect & Verification Failure:**
   - In `Inventory/index.html` lines 11690–11730:
     After calling `PATCH /api/settings/occasion`, `toggleFestiveMode()` immediately invokes:
     `const verified = await loadFestiveState();`
     which calls `GET /api/settings/occasion`.
   - On Vercel (`inventory-mu-lilac.vercel.app`), instances are stateless. When `public.occasion_settings` has 0 rows, the `PATCH` writes to an ephemeral local JSON file in its container, but the subsequent `GET` hits a new container or cache where `festive_mode_enabled = false`.
   - Consequently, `verified.isLive` evaluates to `false`.
   - `index.html` checks:
     ```javascript
     if (nextLive) {
         if (verified.isLive !== true || verified.selectedOccasion !== targetSlug) {
             throw new Error(`Database verification failed: Occasion '${targetSlug}' not active in database.`);
         }
     }
     ```
   - It throws `Database verification failed`, enters the `catch` block, reverts `currentFestiveState` to `isLive = false`, and re-renders the toggle in gray (`bg-slate-300`).

### B. Website Reflection Problem & Silent Disabling
1. **Website Reads from an Unreliable Proxy Instead of Supabase:**
   - The Website in `js/occasion-config.js` does not query Supabase `public.occasion_settings`.
   - Instead, it calls `/api/occasion-settings`, which proxies `https://inventory-mu-lilac.vercel.app/api/settings/occasion`.
2. **Silent Failure Masquerading as OFF:**
   - In `api/occasion-settings.js` lines 48–74:
     ```javascript
     } catch (err) {
         console.error('[WishRite Occasion Proxy Error]', err.message);
         return response.status(200).json({
             success: false,
             fallback: true,
             error: err.message,
             settings: {
                 isLive: false,
                 festive_mode_enabled: false,
                 selectedOccasion: null,
                 activeOccasion: null
             }
         });
     }
     ```
   - Any proxy timeout (4500ms abort controller), network drop, or upstream 500 error returns `isLive: false` and `festive_mode_enabled: false` with HTTP 200!
   - This causes `js/occasion-config.js` to execute `resetFestiveModeToOff(null)`, hiding all festive banners and nav links on the website even when an occasion is active in the database.
3. **Field Mismatch (`is_active` vs `festive_mode_enabled`):**
   - The Supabase database table uses `is_active` (boolean).
   - `js/occasion-config.js` looked for `s.festive_mode_enabled` or `s.isLive`.

---

## 3. Exact Database Schema & Constraints

Direct PostgREST schema verification against `https://ptpuepejciqiktmcpuon.supabase.co/rest/v1/occasion_settings`:

### Columns
| Column Name | Data Type | Nullable | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key |
| `occasion_slug` | `text` | NO | — | Unique identifier (`durga-puja`, `kali-puja`, `diwali`, etc.) |
| `occasion_name` | `text` | NO | — | Display title (`Durga Puja`, `Diwali`, etc.) |
| `page_title` | `text` | YES | `NULL` | Custom SEO page title |
| `page_description` | `text` | YES | `NULL` | Custom SEO meta description |
| `banner_image` | `text` | YES | `NULL` | Custom banner image URL |
| `start_date` | `date` | YES | `NULL` | Campaign start date |
| `end_date` | `date` | YES | `NULL` | Campaign end date |
| `is_active` | `boolean` | NO | `false` | True ONLY for the single currently active occasion |
| `is_selected` | `boolean` | NO | `false` | True for the currently selected occasion in admin dropdown |
| `created_at` | `timestamptz` | NO | `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | NO | `now()` | Record last update timestamp |

### Indexes & Integrity Constraints
1. **Single-Active Occasion Unique Partial Index:**
   ```sql
   CREATE UNIQUE INDEX idx_occasion_settings_single_active
   ON public.occasion_settings (is_active)
   WHERE is_active = true;
   ```
   *Enforcement:* PostgreSQL physically prevents more than one row with `is_active = true`. Setting a second row active without deactivating the first causes an immediate SQL error (`23505`).
2. **Single-Selected Occasion Unique Partial Index:**
   ```sql
   CREATE UNIQUE INDEX idx_occasion_settings_single_selected
   ON public.occasion_settings (is_selected)
   WHERE is_selected = true;
   ```
3. **Slug Uniqueness:**
   `occasion_slug text UNIQUE NOT NULL`

### Row Level Security (RLS) Policies
In `safe-inventory-migration.sql` / `supabase-occasion-fix.sql`:
- **SELECT Policy:** `Occasion settings are readable by all` ON `public.occasion_settings FOR SELECT TO anon, authenticated, service_role USING (true);`
- **INSERT Policy:** `Occasion settings can be inserted` ON `public.occasion_settings FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);`
- **UPDATE Policy:** `Occasion settings can be updated` ON `public.occasion_settings FOR UPDATE TO anon, authenticated, service_role USING (true) WITH CHECK (true);`
- **DELETE Policy:** No public delete policy exists (records are persistent).

---

## 4. Exact Files Involved

### Inventory Project
1. [`Inventory/api/settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/settings.js):
   - `handleGetOccasionSettings`: Must safely return the authoritative state from `public.occasion_settings`, falling back gracefully without corrupting state.
   - `handleUpdateOccasionSettings`: Must deactivate any active row BEFORE activating a new row (respecting `idx_occasion_settings_single_active`), update `is_active = false` when turning OFF, and perform strict post-update verification against the database.
2. [`Inventory/api/supabase-client.js`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/api/supabase-client.js):
   - Table columns cache and query helpers for `occasion_settings`.
3. [`Inventory/index.html`](file:///Users/deepakkumar/Desktop/WISHRITE/Inventory_Code/Inventory/index.html):
   - `toggleFestiveMode()` and `renderFestiveState()`: Ensure UI switch toggles smoothly and verifies state reliably.

### Website Project
1. [`Website/api/occasion-settings.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/api/occasion-settings.js):
   - Same-origin proxy endpoint. Must query `public.occasion_settings` in Supabase directly using server-side configuration.
   - Must return canonical response format and MUST NOT mask errors as `{ festive_mode_enabled: false }`.
2. [`Website/js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion-config.js) & [`Website/www/js/occasion-config.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion-config.js):
   - Fetch active occasion directly from Supabase REST API (`/rest/v1/occasion_settings?is_active=eq.true`) with fallback to `/api/occasion-settings`.
   - Correctly map `row.is_active` ➔ `isLive` / `festive_mode_enabled`.
   - Distinguish `OFF` from `ERROR`.
3. [`Website/js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/js/occasion.js) & [`Website/www/js/occasion.js`](file:///Users/deepakkumar/Desktop/WISHRITE/WebSite%20Code/Website/www/js/occasion.js):
   - Occasion page renderer. Ensure `getOccasionProducts` checks `p.occasion_enabled !== false` and supports canonical `occasion_featured`.
   - Inherits canonical product image pipeline from Phase 2 via `window.createProductCardHTML`.

---

## 5. Proposed Minimal Implementation Plan

### Step 2: Fix Inventory Festive Mode
1. Ensure the 6 canonical master occasions (`durga-puja`, `kali-puja`, `diwali`, `christmas`, `valentines-day`, `wedding`) are safely seeded in `public.occasion_settings` if the table is empty.
2. In `handleUpdateOccasionSettings`:
   - When turning ON a festival (`targetSlug`):
     - First: Execute `UPDATE occasion_settings SET is_active = false WHERE is_active = true;` to avoid colliding with `idx_occasion_settings_single_active`.
     - Second: Update `is_selected` flags so only `targetSlug` has `is_selected = true`.
     - Third: Execute `UPDATE occasion_settings SET is_active = true, updated_at = now() WHERE occasion_slug = targetSlug;`.
   - When turning OFF Festive Mode:
     - Execute `UPDATE occasion_settings SET is_active = false, updated_at = now() WHERE is_active = true;`.
     - Maintain `is_selected` for the current festival so the admin knows which festival is staged.
3. Post-update verification:
   - Re-query `occasion_settings` where `is_active = true`.
   - Confirm count is exactly 1 when ON, and exactly 0 when OFF.

### Step 3: Canonical API Response Shape
Define the authoritative response format:
- When ON:
  ```json
  {
    "success": true,
    "settings": {
      "isLive": true,
      "festive_mode_enabled": true,
      "is_active": true,
      "occasion_name": "Diwali",
      "occasion_slug": "diwali",
      "page_title": "...",
      "banner_image": "...",
      "start_date": "...",
      "end_date": "..."
    }
  }
  ```
- When OFF:
  ```json
  {
    "success": true,
    "settings": {
      "isLive": false,
      "festive_mode_enabled": false,
      "is_active": false,
      "occasion_name": null,
      "occasion_slug": null
    }
  }
  ```
- On Error (Network/Database failure):
  ```json
  {
    "success": false,
    "error": true,
    "fallback": false,
    "message": "Failed to connect to database"
  }
  ```

### Step 4: Website Configuration (`occasion-config.js`)
- Primary fetch: Direct read from Supabase `public.occasion_settings` via REST API with public publishable key (`is_active=eq.true`).
- Secondary fallback: Same-origin `/api/occasion-settings`.
- Explicit state handling: If the API fails, set `occasionSettingsError = true` and retain previous/safe state without altering `FESTIVE_MODE.enabled = false` as a valid OFF state.

### Step 5: Parity & Security
- Keep `js/occasion.js` == `www/js/occasion.js` and `js/occasion-config.js` == `www/js/occasion-config.js` 100% byte-for-byte identical.
- Zero service-role keys in client-side code.

---

## 6. Files That Must NOT Be Changed
To prevent regressions to verified subsystems, the following files and components are strictly frozen:
- `js/images.js` & `www/js/images.js` (Phase 2 canonical product image metadata & resolver)
- `js/products.js` & `www/js/products.js` (Phase 1 canonical inventory product-data mapping)
- `js/cart.js`, `js/search.js`, `js/wishlist.js`, `js/coupons.js`
- `css/pages.css`, `css/components.css`, `css/styles.css`
- Database schema for `public.inventory` and `public.product_images`
- `idx_occasion_settings_single_active` partial unique index
