/**
 * WishRite — Product Image Upload & Storage API
 * 
 * Secure backend serverless handler for Supabase Storage uploads.
 * Uses SUPABASE_SERVICE_ROLE_KEY safely on the server side.
 */

const supabaseUrl = process.env.SUPABASE_URL || 'https://ptpuepejciqiktmcpuon.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(response, statusCode, body) {
  return response.status(statusCode).json(body);
}

module.exports = async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // GET: List images for a given SKU
  if (request.method === 'GET') {
    const sku = String(request.query?.sku || '').trim();
    if (!sku) {
      return json(response, 400, { success: false, error: 'Product SKU / Code is required.' });
    }

    try {
      const authHeader = supabaseServiceRoleKey ? `Bearer ${supabaseServiceRoleKey}` : undefined;
      const headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;

      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/product-images`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prefix: `${sku}/`, limit: 100 })
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
      return json(response, 500, { success: false, error: err.message });
    }
  }

  // POST: Upload an image for a product SKU
  if (request.method === 'POST') {
    if (!supabaseServiceRoleKey) {
      return json(response, 500, {
        success: false,
        error: 'Supabase service role key is not configured on the server.'
      });
    }

    const { sku, fileName, fileBase64, contentType } = request.body || {};

    if (!sku || !fileBase64) {
      return json(response, 400, {
        success: false,
        error: 'Missing required parameters: sku and fileBase64.'
      });
    }

    // Clean SKU and filename
    const cleanSku = String(sku).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    let safeName = String(fileName || 'image.webp').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!/\.(jpg|jpeg|png|webp)$/i.test(safeName)) {
      safeName += '.webp';
    }

    const mimeType = contentType || (safeName.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

    // Decode base64
    let buffer;
    try {
      const base64Data = fileBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } catch (decodeErr) {
      return json(response, 400, { success: false, error: 'Invalid base64 image data.' });
    }

    // Enforce 10MB limit
    if (buffer.length > 10 * 1024 * 1024) {
      return json(response, 400, { success: false, error: 'Image exceeds the maximum allowed size (10MB).' });
    }

    const storagePath = `${cleanSku}/${safeName}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/product-images/${encodeURIComponent(storagePath)}`;

    try {
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'apikey': supabaseServiceRoleKey,
          'Content-Type': mimeType,
          'x-upsert': 'true'
        },
        body: buffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return json(response, uploadRes.status, {
          success: false,
          error: `Storage upload failed: ${errText}`
        });
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${storagePath}`;

      return json(response, 200, {
        success: true,
        sku: cleanSku,
        fileName: safeName,
        publicUrl,
        size: buffer.length
      });
    } catch (uploadErr) {
      return json(response, 500, { success: false, error: uploadErr.message });
    }
  }

  // DELETE: Remove an image
  if (request.method === 'DELETE') {
    if (!supabaseServiceRoleKey) {
      return json(response, 500, { success: false, error: 'Supabase server configuration missing.' });
    }

    const { sku, fileName } = request.body || request.query || {};
    if (!sku || !fileName) {
      return json(response, 400, { success: false, error: 'sku and fileName are required.' });
    }

    const path = `${sku}/${fileName}`;
    try {
      const delRes = await fetch(`${supabaseUrl}/storage/v1/object/product-images`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'apikey': supabaseServiceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [path] })
      });

      if (!delRes.ok) {
        const errText = await delRes.text();
        return json(response, delRes.status, { success: false, error: errText });
      }

      return json(response, 200, { success: true, message: `Image ${fileName} deleted successfully.` });
    } catch (err) {
      return json(response, 500, { success: false, error: err.message });
    }
  }

  response.setHeader('Allow', 'GET, POST, DELETE');
  return json(response, 405, { success: false, error: 'Method not allowed.' });
};
