import Stripe from "stripe";

// A single Stripe client instance is constructed once per Node.js process,
// keeping the underlying HTTP agent and connection pool alive across requests.
// The API version is pinned so breaking Stripe changes never affect this
// codebase silently — upgrade it deliberately after reviewing the changelog.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Stripe-dependent routes will be unavailable.",
  );
}

export const stripe = new Stripe(stripeSecretKey, {
  // Pinned to the latest API surface exposed by stripe@22.x.
  // Upgrade deliberately after reviewing Stripe's migration guide.
  apiVersion: "2026-06-24.dahlia",
});
