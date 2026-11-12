const STRIPE_SESSIONS = "https://api.stripe.com/v1/checkout/sessions";
const TIMEOUT_MS = 8000;

export function checkoutForm(origin: string, price: string) {
  return new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/thanks`,
    cancel_url: `${origin}/#download`,
  });
}

export async function createCheckout(origin: string, env: Record<string, string | undefined> = process.env) {
  const key = env.STRIPE_SECRET_KEY;
  const price = env.STRIPE_PRICE_ID;
  if (!key || !price) return null;
  const response = await fetch(STRIPE_SESSIONS, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutForm(origin, price),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) {
    if (response) console.error("Stripe checkout failed", response.status, await response.text().catch(() => ""));
    return null;
  }
  const session = (await response.json().catch(() => null)) as { url?: unknown } | null;
  return typeof session?.url === "string" && session.url.startsWith("https://checkout.stripe.com/") ? session.url : null;
}
