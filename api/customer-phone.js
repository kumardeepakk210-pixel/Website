const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(response, statusCode, body) {
  response.status(statusCode).json(body);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { success: false, error: 'Method not allowed.' });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json(response, 500, { success: false, error: 'Supabase server configuration is missing.' });
  }

  const mobile = String(request.body?.mobile || '').replace(/\D/g, '');
  if (!/^\d{12}$/.test(mobile)) {
    return json(response, 400, { success: false, error: 'A valid country code and 10-digit mobile number are required.' });
  }

  const formattedPhone = `+${mobile}`;
  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    'Content-Type': 'application/json'
  };

  try {
    const customerResponse = await fetch(
      `${supabaseUrl}/rest/v1/customers?select=*&customer_phone=eq.${encodeURIComponent(formattedPhone)}&limit=1`,
      { headers: { ...headers, Accept: 'application/vnd.pgrst.object+json' } }
    );

    if (customerResponse.status === 406) {
      return json(response, 200, { success: true, isNewCustomer: true, phone: formattedPhone });
    }
    if (!customerResponse.ok) {
      throw new Error('Unable to search for the customer.');
    }

    const customer = await customerResponse.json();
    const now = new Date().toISOString();
    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customer.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ is_phone_verified: true, last_login_at: now, updated_at: now })
    });

    if (!updateResponse.ok) {
      throw new Error('Unable to update customer verification status.');
    }

    return json(response, 200, { success: true, isNewCustomer: false, phone: formattedPhone });
  } catch (error) {
    return json(response, 500, { success: false, error: error.message });
  }
};