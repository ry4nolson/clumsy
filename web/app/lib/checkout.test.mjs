import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutForm, createCheckout } from "./checkout.server";

describe("checkout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks Stripe for one of the configured price, returning to this site", () => {
    const form = checkoutForm("https://clumsyapp.netlify.app", "price_123");
    expect(Object.fromEntries(form)).toEqual({
      mode: "payment",
      "line_items[0][price]": "price_123",
      "line_items[0][quantity]": "1",
      success_url: "https://clumsyapp.netlify.app/thanks",
      cancel_url: "https://clumsyapp.netlify.app/#download",
    });
  });

  it("gives up without keys, on a Stripe error, or on a URL that isn't Stripe's", async () => {
    expect(await createCheckout("https://x", {})).toBeNull();
    const env = { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_ID: "price_1" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 400 }));
    expect(await createCheckout("https://x", env)).toBeNull();
    vi.stubGlobal("fetch", async () => Response.json({ url: "https://evil.example/pay" }));
    expect(await createCheckout("https://x", env)).toBeNull();
  });

  it("returns the session URL", async () => {
    let sent;
    vi.stubGlobal("fetch", async (url, init) => {
      sent = { url, auth: init.headers.Authorization, body: String(init.body) };
      return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    });
    const url = await createCheckout("https://x", { STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_ID: "price_1" });
    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(sent.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(sent.auth).toBe("Bearer sk_test");
    expect(sent.body).toContain("line_items%5B0%5D%5Bprice%5D=price_1");
  });
});
