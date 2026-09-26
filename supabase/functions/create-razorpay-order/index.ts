// ==============================================================================
// WishRite Supabase Edge Function: create-razorpay-order
// Purpose: Securely create a Razorpay Order based strictly on public.orders record,
//          save the returned razorpay_order_id to the database, and return credentials
//          to open Razorpay Checkout on the frontend.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // 1. Handle OPTIONS for CORS
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
    console.log("create-razorpay-order invoked");

    // 3. Read securely from environment: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("create-razorpay-order error: Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variable.");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Razorpay credentials",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Read Supabase credentials securely from environment
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
      console.error("create-razorpay-order error: Missing Supabase URL or service role key in environment.");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server database configuration error.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Parse JSON request body & extract order_id
    interface OrderRequestBody {
      order_id?: string;
      internal_order_id?: string;
    }

    let body: OrderRequestBody | null = null;
    try {
      body = (await req.json()) as OrderRequestBody;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON payload in request body.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const orderId = body?.order_id || body?.internal_order_id;
    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing order ID",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const trimmedOrderId = orderId.trim();
    console.log("create-razorpay-order: internal order received:", trimmedOrderId);

    // 6. Query internal order from public.orders using privileged admin client
    // Select at minimum: id, order_number, grand_total, currency, payment_method, payment_status, order_status, razorpay_order_id
    const supabaseAdmin = createClient(SUPABASE_URL, supabaseSecretKey);

    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, grand_total, currency, payment_method, payment_status, order_status, razorpay_order_id")
      .eq("id", trimmedOrderId)
      .maybeSingle();

    if (fetchError) {
      console.error("create-razorpay-order fetch error for order:", trimmedOrderId, fetchError.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to query order details.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!order) {
      console.warn("create-razorpay-order: Order not found for id:", trimmedOrderId);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("create-razorpay-order: internal order found:", order.id, "order_number:", order.order_number);

    // 7. Validate:
    // a. grand_total > 0 (Never trust browser amount, must come from public.orders.grand_total)
    const grandTotal = Number(order.grand_total);
    if (isNaN(grandTotal) || grandTotal <= 0) {
      console.warn("create-razorpay-order: Invalid order grand_total:", order.grand_total);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid order amount",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // b. payment_method is prepaid/online
    const method = String(order.payment_method || "").trim().toLowerCase();
    const isOnlinePrepaid = method === "prepaid" || method === "online" || method === "razorpay";
    if (method === "cod" || (!isOnlinePrepaid && method !== "")) {
      console.warn("create-razorpay-order: Invalid payment method for online payment:", order.payment_method);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid payment method",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // c. payment_status is pending
    const paymentStatus = String(order.payment_status || "").trim().toLowerCase();
    if (paymentStatus === "paid" || paymentStatus === "completed") {
      console.warn("create-razorpay-order: Order already paid. Status:", order.payment_status);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order already paid",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (paymentStatus !== "pending") {
      console.warn("create-razorpay-order: Order payment_status is not pending. Status:", order.payment_status);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order payment is not pending",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const orderAmountPaise = Math.round(Number(order.grand_total) * 100);
    const orderCurrency = String(order.currency || "INR").trim().toUpperCase();

    // 8. DUPLICATE PROTECTION:
    // If orders.razorpay_order_id already exists:
    // return the existing Razorpay order. Do NOT create another Razorpay order.
    if (order.razorpay_order_id && String(order.razorpay_order_id).trim()) {
      const existingRazorpayOrderId = String(order.razorpay_order_id).trim();
      console.log("create-razorpay-order: Returning existing razorpay_order_id:", existingRazorpayOrderId, "for internal order:", order.id);
      return new Response(
        JSON.stringify({
          success: true,
          key_id: RAZORPAY_KEY_ID,
          order_id: existingRazorpayOrderId,
          amount: Math.round(Number(order.grand_total) * 100),
          currency: order.currency || "INR",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 9. If no Razorpay order exists:
    // Create an order through POST https://api.razorpay.com/v1/orders
    // Basic authentication: RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET
    console.log("create-razorpay-order: Razorpay order creation requested for order:", order.id, "amount (paise):", orderAmountPaise);

    const rzpAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const receiptId = String(order.order_number || order.id).slice(0, 40);

    const razorpayPayload = {
      amount: Math.round(Number(order.grand_total) * 100),
      currency: order.currency || "INR",
      receipt: order.order_number,
      notes: {
        internal_order_id: order.id,
        order_number: order.order_number,
      },
    };

    let rzpResponse: Response;
    try {
      rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${rzpAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(razorpayPayload),
      });
    } catch (fetchErr: unknown) {
      const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error("create-razorpay-order: Network error communicating with Razorpay API:", fetchErrMsg);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Razorpay API failure",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!rzpResponse.ok) {
      const errorText = await rzpResponse.text();
      console.error("create-razorpay-order: Razorpay API error status:", rzpResponse.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Razorpay API failure",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const razorpayOrder = await rzpResponse.json();
    if (!razorpayOrder || !razorpayOrder.id) {
      console.error("create-razorpay-order: Invalid Razorpay order response payload:", razorpayOrder);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Razorpay API failure",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("create-razorpay-order: Razorpay order created:", razorpayOrder.id);

    // 10. After Razorpay successfully creates the order:
    // Update public.orders where id = order.id set razorpay_order_id = razorpayOrder.id
    const currentTimestamp = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        razorpay_order_id: razorpayOrder.id,
        updated_at: currentTimestamp,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("create-razorpay-order: Failed to update order with razorpay_order_id:", updateError.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Database update failure",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("create-razorpay-order: database razorpay_order_id updated for order:", order.id);

    // 11. Return exactly:
    // {
    //     success: true,
    //     key_id: RAZORPAY_KEY_ID,
    //     order_id: razorpayOrder.id,
    //     amount: razorpayOrder.amount,
    //     currency: razorpayOrder.currency
    // }
    return new Response(
      JSON.stringify({
        success: true,
        key_id: RAZORPAY_KEY_ID,
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error("create-razorpay-order unhandled error:", errMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error while creating payment order.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
