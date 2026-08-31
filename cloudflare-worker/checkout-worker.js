/**
 * Cloudflare Worker: erzeugt eine Stripe Checkout Session für Book Library Pro.
 *
 * Env-Variablen (Cloudflare Secrets, nie committen):
 * - STRIPE_SECRET_KEY
 * - PRICE_ID
 * - SUCCESS_URL
 * - CANCEL_URL
 *
 * Fehlende Secrets antworten mit 503 und einem expliziten Config-Blocker.
 * Die erste echte Live-Transaktion (Paid-Smoke + sofortiger Refund) bleibt
 * Human-Gate.
 */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, corsHeaders());
    }
    const blocked = missingConfig(env);
    if (blocked && blocked.length > 0) {
      return json(
        {
          error: "stripe_config_blocked",
          missing: blocked,
          hint: "STRIPE_SECRET_KEY, PRICE_ID, SUCCESS_URL und CANCEL_URL in Cloudflare Secrets setzen.",
        },
        503,
        corsHeaders()
      );
    }
    try {
      const body = await request.json().catch(() => ({}));
      const customerEmail = typeof body.email === "string" ? body.email.slice(0, 254) : "";
      const params = new URLSearchParams({
        mode: "payment",
        "line_items[0][price]": env.PRICE_ID,
        "line_items[0][quantity]": "1",
        success_url: env.SUCCESS_URL,
        cancel_url: env.CANCEL_URL,
        "metadata[app]": "book-library",
      });
      if (customerEmail) params.set("customer_email", customerEmail);
      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const data = await stripeRes.json();
      if (!stripeRes.ok || !data.url) {
        return json(
          { error: "stripe_checkout_failed", detail: data.error?.message || "unknown" },
          stripeRes.status >= 400 ? stripeRes.status : 502,
          corsHeaders()
        );
      }
      return json({ url: data.url, id: data.id }, 200, corsHeaders());
    } catch (error) {
      return json({ error: "internal_error" }, 500, corsHeaders());
    }
  },
};

function missingConfig(env) {
  return ["STRIPE_SECRET_KEY", "PRICE_ID", "SUCCESS_URL", "CANCEL_URL"].filter(
    (key) => !env[key]
  );
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
