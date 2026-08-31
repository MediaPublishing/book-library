import { describe, expect, it, vi } from "vitest";

async function callWorker(env: Record<string, string>, body = "{}") {
  const { default: worker } = await import("../cloudflare-worker/checkout-worker.js");
  const request = new Request("https://example.com/checkout", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
  return worker.fetch(request, env);
}

describe("checkout worker", () => {
  it("liefert einen expliziten Config-Blocker bei fehlenden Secrets", async () => {
    const res = await callWorker({});
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("stripe_config_blocked");
    expect(data.missing).toContain("STRIPE_SECRET_KEY");
  });

  it("erzeugt eine Checkout-Session und gibt die URL zurück", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ url: "https://checkout.stripe.com/c/pay/test", id: "cs_test" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callWorker(
      {
        STRIPE_SECRET_KEY: "sk_live_test",
        PRICE_ID: "price_live_1",
        SUCCESS_URL: "https://example.com/success",
        CANCEL_URL: "https://example.com/cancel",
      },
      JSON.stringify({ email: "test@example.com" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toContain("checkout.stripe.com");
    const init = (fetchMock.mock.calls[0] as any[])[1] as { body?: string };
    const body = String(init?.body || "");
    expect(body).toContain("price_live_1");
    expect(body).toContain("customer_email=test%40example.com");
    vi.unstubAllGlobals();
  });
});
