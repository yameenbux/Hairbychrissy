/**
 * Payments.
 *
 * Two options are offered to every client, exactly as requested:
 *
 *   CASH — nothing is taken online. The booking is held and the full amount
 *          is paid in the studio on the day.
 *   CARD — a deposit is taken online to secure the slot; the balance is paid
 *          on the day (also by card or cash).
 *
 * With no STRIPE_SECRET_KEY set the card route runs in DEMO mode: a simulated
 * card page inside this app, so the whole flow is clickable without any Stripe
 * account. Set the key and it switches to real Stripe Checkout — no other
 * code changes needed.
 */

export function isLiveStripe() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function publicUrl() {
  return (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Create a Stripe Checkout Session with a plain form-encoded POST.
 * Avoids pulling in the Stripe SDK for what is a single API call.
 */
export async function createCheckoutSession(booking, service) {
  const amountPence = Math.round(booking.depositDue * 100);
  const body = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': String(amountPence),
    'line_items[0][price_data][product_data][name]': `Deposit — ${service.name}`,
    'line_items[0][price_data][product_data][description]':
      `${booking.date} at ${booking.start} · Booking ${booking.ref}`,
    client_reference_id: booking.ref,
    'metadata[ref]': booking.ref,
    customer_email: booking.client.email,
    success_url: `${publicUrl()}/confirmed?ref=${booking.ref}`,
    cancel_url: `${publicUrl()}/?cancelled=${booking.ref}`,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Stripe returned ${res.status}`);
  }
  return { url: json.url, sessionId: json.id };
}
