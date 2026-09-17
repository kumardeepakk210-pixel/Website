/**
 * WishRite — Product Image Read API
 * 
 * Customer Website Read-Only Handler.
 * Mutations (Upload / Delete) are strictly prohibited on the customer website
 * and belong exclusively to the separate Inventory Application.
 */

function json(response, statusCode, body) {
  return response.status(statusCode).json(body);
}

module.exports = async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Reject all write / delete attempts
  if (request.method === 'POST' || request.method === 'DELETE' || request.method === 'PUT') {
    return json(response, 403, {
      success: false,
      error: 'Image upload and management is disabled on the customer website. Please use the WishRite Inventory Application.'
    });
  }

  // GET: Read-only listing for customer storefront if needed
  if (request.method === 'GET') {
    const sku = String(request.query?.sku || '').trim();
    if (!sku) {
      return json(response, 400, { success: false, error: 'Product SKU / Code is required.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://ptpuepejciqiktmcpuon.supabase.co';
    const anonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ZHwzEtRBkW9u4T2d_0R2Ag_BX1EeJRX';

    try {
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/product-images`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefix: `${sku}/`, limit: 50 })
      });

      if (!listRes.ok) {
        return json(response, 200, { success: true, sku, images: [] });
      }

      const files = await listRes.json();
      const images = (Array.isArray(files) ? files : [])
        .filter(f => f.name && !f.name.startsWith('.'))
        .map((f, idx) => ({
          name: f.name,
          url: `${supabaseUrl}/storage/v1/object/public/product-images/${sku}/${encodeURIComponent(f.name)}`,
          isMain: idx === 0 || f.name.toLowerCase().includes('main'),
          size: f.metadata?.size || 0,
          updatedAt: f.updated_at
        }));

      return json(response, 200, { success: true, sku, images });
    } catch (err) {
      return json(response, 200, { success: true, sku, images: [] });
    }
  }

  return json(response, 405, { success: false, error: 'Method not allowed.' });
};
