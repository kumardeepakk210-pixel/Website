// ==============================================================================
// WishRite Supabase Edge Function: Back-in-Stock Email Dispatcher
// Triggered when inventory.stock_quantity changes from 0 to > 0
// Uses Resend API with RESEND_API_KEY stored securely as an environment secret
// Idempotent: Marks status = 'notified' and notified_at = now()
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { record, old_record } = await req.json();

    // Only proceed if stock transitioned from 0 to > 0
    const oldStock = old_record?.stock_quantity ?? 0;
    const newStock = record?.stock_quantity ?? 0;

    if (newStock <= 0 || oldStock > 0) {
      return new Response(JSON.stringify({ message: "No restock transition detected (stock did not change from 0 to > 0)." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const productCode = record.product_code;
    const productName = record.product_name || "Handcrafted Silver Jewellery";

    if (!productCode) {
      return new Response(JSON.stringify({ error: "Missing product_code in payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Query pending notifications for this product code
    const { data: subscribers, error: subError } = await supabase
      .from("product_stock_notifications")
      .select("id, customer_email, product_name, product_code")
      .eq("product_code", productCode)
      .eq("status", "pending");

    if (subError) throw subError;
    if (!subscribers || subscribers.length === 0) {
      return new Response(JSON.stringify({ message: `No pending subscribers for ${productCode}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${productCode}/main.webp`;
    const productUrl = `https://www.wishrite.in/product/${productCode.toLowerCase()}`;
    let successfulDispatches = 0;

    for (const sub of subscribers) {
      try {
        if (!RESEND_API_KEY) {
          console.warn("RESEND_API_KEY secret not set. Skipping live email dispatch.");
          continue;
        }

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #faf7f5; margin: 0; padding: 40px 20px; color: #2C2A29; }
              .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #EBE5E1; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
              .header { background: #5E3435; padding: 28px; text-align: center; color: #ffffff; }
              .logo { font-size: 22px; letter-spacing: 3px; font-weight: 700; margin: 0; }
              .sub-logo { font-size: 10px; letter-spacing: 2px; color: #d4af37; margin-top: 4px; }
              .body { padding: 36px 28px; text-align: center; }
              .h1 { font-size: 20px; color: #5E3435; margin-bottom: 12px; }
              .p { font-size: 14px; line-height: 1.6; color: #6e6762; margin-bottom: 24px; }
              .img-box { margin: 20px auto; max-width: 260px; aspect-ratio: 4/5; border-radius: 6px; overflow: hidden; border: 1px solid #f0ebe7; }
              .img-box img { width: 100%; height: 100%; object-fit: cover; }
              .code-badge { font-family: monospace; font-size: 12px; color: #8e8e93; margin-top: 8px; }
              .btn { display: inline-block; background: #5E3435; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-weight: 600; font-size: 13px; letter-spacing: 1px; margin-top: 16px; }
              .footer { background: #F5F1EE; padding: 20px; text-align: center; font-size: 11px; color: #8E8E93; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div class="logo">WISHRITE</div>
                <div class="sub-logo">925 STERLING SILVER</div>
              </div>
              <div class="body">
                <div class="h1">Back in Stock</div>
                <p class="p">Good news — the handcrafted silver piece you requested is now available again.</p>
                <div class="img-box">
                  <img src="${imageUrl}" alt="${productName}" />
                </div>
                <h3 style="margin: 12px 0 4px; color:#2C2A29;">${productName}</h3>
                <div class="code-badge">Product Code: ${productCode}</div>
                <div style="margin-top: 24px;">
                  <a href="${productUrl}" class="btn">SHOP NOW</a>
                </div>
              </div>
              <div class="footer">
                WishRite Fine Silver Jewellery · Kolkata, India<br>
                You received this notification because you subscribed on wishrite.in.
              </div>
            </div>
          </body>
          </html>
        `;

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "WishRite <care@wishrite.in>",
            to: [sub.customer_email],
            subject: `WishRite — ${productName} is Back in Stock`,
            html: emailHtml,
          }),
        });

        if (resendRes.ok) {
          // Idempotent: Mark as notified immediately
          await supabase
            .from("product_stock_notifications")
            .update({
              status: "notified",
              notified_at: new Date().toISOString(),
            })
            .eq("id", sub.id);

          successfulDispatches++;
        } else {
          console.error(`Resend API error for ${sub.customer_email}:`, await resendRes.text());
        }
      } catch (sendErr) {
        console.error(`Failed to notify ${sub.customer_email}:`, sendErr);
        // Remains 'pending' for retry
      }
    }

    return new Response(JSON.stringify({ success: true, notifiedCount: successfulDispatches }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
