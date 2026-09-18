// ==============================================================================
// WishRite Supabase Edge Function: verify-razorpay-payment
// Purpose: Securely verify Razorpay HMAC signature, validate payment status with
//          Razorpay API, record payment in public.orders, and trigger server-side fulfillment.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Calculates HMAC-SHA256 hexadecimal digest using Web Crypto API.
 */
async function calculateHmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );
  return Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe string comparison to protect against timing side-channel attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < aBuf.length; i++) {
    mismatch |= aBuf[i] ^ bBuf[i];
  }
  return mismatch === 0;
}

serve(async (req: Request) => {
  // 1. Handle OPTIONS with CORS response
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2. Accept POST only
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        verified: false,
        error: "Method not allowed. Only POST is accepted.",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    // Read Razorpay credentials securely from environment
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("verify-razorpay-payment error: Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variable.");
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment gateway server configuration error.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Read Supabase credentials securely from environment
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    let supabaseSecretKey: string | undefined;

    if (rawSecretKeys) {
      try {
        const parsedKeys = JSON.parse(rawSecretKeys);
        if (parsedKeys && typeof parsedKeys === "object" && parsedKeys["default"]) {
          supabaseSecretKey = parsedKeys["default"];
        } else if (typeof parsedKeys === "string") {
          supabaseSecretKey = parsedKeys;
        }
      } catch {
        supabaseSecretKey = rawSecretKeys;
      }
    }

    if (!supabaseSecretKey) {
      supabaseSecretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    }

    if (!SUPABASE_URL || !supabaseSecretKey) {
      console.error("verify-razorpay-payment error: Missing Supabase URL or secret key in environment.");
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Server database configuration error.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Parse JSON request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Invalid JSON payload in request body.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const {
      internal_order_id,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = body || {};

    // 4. Require: internal_order_id, razorpay_payment_id, razorpay_order_id, razorpay_signature
    if (
      !internal_order_id ||
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Missing required fields: internal_order_id, razorpay_payment_id, razorpay_order_id, and razorpay_signature are required.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Create an admin Supabase client using SUPABASE_URL and privileged secret key
    const supabaseAdmin = createClient(SUPABASE_URL, supabaseSecretKey);

    // 6. Load the order from public.orders by id = internal_order_id
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, grand_total, currency, payment_status, order_status, razorpay_order_id, razorpay_payment_id, razorpay_signature"
      )
      .eq("id", internal_order_id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "verify-razorpay-payment fetch error for internal_order_id:",
        internal_order_id,
        fetchError.message
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Failed to query order details.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. If no order: HTTP 404
    if (!order) {
      console.warn("verify-razorpay-payment: Order not found for internal_order_id:", internal_order_id);
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Order not found.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 8. If database razorpay_order_id is NULL: HTTP 400
    if (!order.razorpay_order_id) {
      console.warn(
        "verify-razorpay-payment: Order has no razorpay_order_id. internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Order has not been initialized with a Razorpay order.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 9. Compare the database razorpay_order_id with the razorpay_order_id supplied by the browser
    if (order.razorpay_order_id !== razorpay_order_id) {
      console.warn(
        "verify-razorpay-payment: Razorpay order ID mismatch. internal_order_id:",
        internal_order_id,
        "database:",
        order.razorpay_order_id,
        "supplied:",
        razorpay_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Razorpay order ID mismatch.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 10. Already-paid idempotency check:
    // If the database order already has payment_status = "paid" AND order.razorpay_payment_id is already populated,
    // verify that the incoming razorpay_payment_id exactly matches the stored payment ID.
    // If it does not match, reject the request with HTTP 400.
    if (
      order.payment_status === "paid" &&
      order.razorpay_payment_id &&
      order.razorpay_payment_id !== razorpay_payment_id
    ) {
      console.warn(
        "verify-razorpay-payment: Payment ID mismatch on already-paid order. internal_order_id:",
        internal_order_id,
        "database payment_id:",
        order.razorpay_payment_id,
        "incoming payment_id:",
        razorpay_payment_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Order has already been paid with a different payment ID.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 11. Security Gate: Verify the Razorpay signature using HMAC-SHA256
    // Message: databaseRazorpayOrderId + "|" + razorpayPaymentId
    // Secret: RAZORPAY_KEY_SECRET
    const payloadToSign = `${order.razorpay_order_id}|${razorpay_payment_id}`;
    const calculatedSignature = await calculateHmacSha256Hex(
      RAZORPAY_KEY_SECRET,
      payloadToSign
    );

    const isSignatureValid = timingSafeCompare(
      calculatedSignature.toLowerCase(),
      String(razorpay_signature).trim().toLowerCase()
    );

    // If signature verification fails: return HTTP 400 and do NOT update or fulfill the order
    if (!isSignatureValid) {
      console.warn(
        "verify-razorpay-payment: Signature verification failed. internal_order_id:",
        internal_order_id,
        "razorpay_order_id:",
        order.razorpay_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment signature verification failed.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 12. Server-side Razorpay API Payment Verification
    // GET https://api.razorpay.com/v1/payments/{razorpay_payment_id}
    const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    let rzpPaymentResponse: Response;

    try {
      rzpPaymentResponse = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${rzpAuth}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (fetchErr: any) {
      console.error(
        "verify-razorpay-payment: Network error querying Razorpay API. internal_order_id:",
        internal_order_id,
        fetchErr?.message || fetchErr
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Failed to connect to payment gateway to verify transaction status.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!rzpPaymentResponse.ok) {
      console.error(
        "verify-razorpay-payment: Razorpay API returned error status:",
        rzpPaymentResponse.status,
        "for internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment gateway could not locate or verify payment details.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payment = await rzpPaymentResponse.json();

    // Verify:
    // a. payment.id matches razorpay_payment_id
    if (payment.id !== razorpay_payment_id) {
      console.warn("verify-razorpay-payment: Payment ID mismatch. internal_order_id:", internal_order_id);
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment identifier mismatch with payment gateway.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // b. payment.order_id matches the database order.razorpay_order_id
    if (payment.order_id !== order.razorpay_order_id) {
      console.warn(
        "verify-razorpay-payment: Razorpay order ID mismatch in gateway record. internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment is not associated with the expected order.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // c. payment.status is "captured"
    if (payment.status !== "captured") {
      console.warn(
        "verify-razorpay-payment: Payment status is not captured. Status:",
        payment.status,
        "internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: `Payment is not in captured status (current: ${payment.status || 'unknown'}).`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // d. payment.amount exactly equals orders.grand_total * 100 (in paise)
    const expectedAmountPaise = Math.round(Number(order.grand_total) * 100);
    if (Number(payment.amount) !== expectedAmountPaise) {
      console.warn(
        "verify-razorpay-payment: Payment amount mismatch. Expected paise:",
        expectedAmountPaise,
        "actual paise:",
        payment.amount,
        "internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment amount does not match the order total.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // e. payment.currency exactly matches orders.currency
    const expectedCurrency = String(order.currency || "INR").trim().toUpperCase();
    const actualCurrency = String(payment.currency || "").trim().toUpperCase();
    if (actualCurrency !== expectedCurrency) {
      console.warn(
        "verify-razorpay-payment: Currency mismatch. Expected:",
        expectedCurrency,
        "actual:",
        actualCurrency,
        "internal_order_id:",
        internal_order_id
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: "Payment currency does not match the order currency.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Signature and Razorpay API verification checks have all passed successfully
    const wasAlreadyPaid = order.payment_status === "paid";

    // 13. Update payment fields on public.orders if not already recorded as paid
    if (!wasAlreadyPaid) {
      const currentTimestamp = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          razorpay_payment_id: razorpay_payment_id,
          razorpay_signature: razorpay_signature,
          payment_status: "paid",
          paid_at: currentTimestamp,
          updated_at: currentTimestamp,
        })
        .eq("id", order.id);

      if (updateError) {
        console.error(
          "verify-razorpay-payment: Failed to update order status to paid. internal_order_id:",
          internal_order_id,
          updateError.message
        );
        return new Response(
          JSON.stringify({
            success: false,
            verified: true,
            error: "Payment verified but failed to update order record.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // 14. Server-side Fulfillment: Call public.fulfill_paid_order(p_order_id)
    // Atomically deducts inventory, creates a single sales record, and sets order_status = 'processing'
    const { data: fulfillmentResult, error: fulfillError } = await supabaseAdmin.rpc(
      "fulfill_paid_order",
      { p_order_id: order.id }
    );

    if (fulfillError) {
      console.error(
        "verify-razorpay-payment: fulfill_paid_order RPC execution error. internal_order_id:",
        internal_order_id,
        fulfillError.message
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: true,
          error: "Payment verified, but order fulfillment encountered an error.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if fulfillment function reported a failure in its JSON result
    if (
      fulfillmentResult &&
      typeof fulfillmentResult === "object" &&
      fulfillmentResult.success === false
    ) {
      console.error(
        "verify-razorpay-payment: fulfill_paid_order reported fulfillment failure. internal_order_id:",
        internal_order_id,
        fulfillmentResult.error || fulfillmentResult.message
      );
      return new Response(
        JSON.stringify({
          success: false,
          verified: true,
          error:
            fulfillmentResult.error ||
            fulfillmentResult.message ||
            "Payment verified, but inventory fulfillment failed.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isAlreadyFulfilled = Boolean(
      fulfillmentResult &&
        typeof fulfillmentResult === "object" &&
        fulfillmentResult.already_fulfilled
    );

    // Resolve actual fulfillment status reported by fulfill_paid_order (falling back to "processing")
    const resolvedOrderStatus =
      (fulfillmentResult &&
        typeof fulfillmentResult === "object" &&
        fulfillmentResult.order_status) ||
      "processing";

    console.log(
      "verify-razorpay-payment: Order verified and fulfillment completed. internal_order_id:",
      internal_order_id,
      "already_fulfilled:",
      isAlreadyFulfilled,
      "order_status:",
      resolvedOrderStatus
    );

    // 15. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        already_verified: wasAlreadyPaid,
        already_fulfilled: isAlreadyFulfilled,
        internal_order_id: order.id,
        order_number: order.order_number,
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        payment_status: "paid",
        order_status: resolvedOrderStatus,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("verify-razorpay-payment unhandled error:", err?.message || err);
    return new Response(
      JSON.stringify({
        success: false,
        verified: false,
        error: "Internal server error while processing payment verification and fulfillment.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
