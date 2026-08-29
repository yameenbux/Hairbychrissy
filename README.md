# H A I R • B Y • C H R I S S Y — booking platform

A live-calendar booking site for [@hairbychrissy_x](https://www.instagram.com/hairbychrissy_x),
hair extension specialist, London.

Clients pick a service, see genuine live availability, choose a slot and pay by
**cash or card**. Chrissy sets her own working days, hours, breaks and time off
from a private dashboard — and the client calendar updates the moment she saves.

> **This is a draft.** Prices, reviews, photography and contact details are
> placeholders pending Chrissy's confirmation. See [CLIENT-NOTES.md](CLIENT-NOTES.md).

---

## Running it

```bash
npm start          # http://localhost:3000
```

No `npm install` needed — the app has **zero runtime dependencies**, just Node 18+.

| URL | What it is |
|---|---|
| `/` | Client site + booking calendar |
| `/admin` | Chrissy's dashboard (default password `chrissy`) |
| `/confirmed?ref=…` | Booking confirmation |
| `/pay/demo?ref=…` | Simulated card checkout (draft mode only) |

Configuration is via environment variables — copy `.env.example` to `.env`.
Everything has a working default, so nothing must be set to try it out.

---

## How availability works

A slot appears to a client only when **all** of these hold:

- the weekday is switched on in Chrissy's working hours
- the date is not blocked off (holiday, personal day)
- the whole appointment fits inside that day's opening hours
- it does not overlap her lunch/break window
- it does not overlap an existing booking, with the clean-down buffer applied
  to **both** sides
- it is at least the minimum-notice period ahead of now
- it is inside the booking horizon

Because a 4-hour set and a 1-hour blow dry fit a day differently, availability
is always computed **per service** — the calendar changes shape depending on
what the client picked.

The client's slot list can be seconds out of date, so it is never trusted: the
server re-validates the slot at the moment of booking and returns a clear
"that time has just been taken" if two people race for it.

### "Live" is genuinely live

Every open browser holds a `Server-Sent Events` connection to `/api/stream`.
When anyone books, cancels, or when Chrissy changes her hours, the server pushes
an event and each client repaints its calendar **without a refresh**. Verified:
a second client booking a slot drops it out of the first client's view in under
a second.

---

## Payments — cash and card

Both options are offered on every booking.

| | Taken online | On the day | Booking status |
|---|---|---|---|
| **Cash** | nothing | full amount | confirmed immediately |
| **Card** | deposit | balance | confirmed once the deposit clears |

**Card is in draft mode.** With no `STRIPE_SECRET_KEY` set, the card route goes
to a simulated checkout inside this app so the whole journey is clickable — no
real money moves, and the page says so plainly. Setting a real key switches on
Stripe Checkout with **no other code changes**. Card details never touch this
server in either mode.

A card booking holds its slot for 20 minutes. If the client abandons checkout,
a sweeper releases the slot automatically — one abandoned checkout must not
block a four-hour appointment forever.

---

## Notifications — not missing a booking

A booking Chrissy doesn't see is a booking she can't honour, so alerts run over
several independent channels. Only the first two need any setup at all, and the
first needs none.

| Channel | Reaches her when | Setup |
|---|---|---|
| **Dashboard alerts** | the dashboard is open | none — always on |
| **Phone / desktop push** | **the site is closed** | she taps "turn on alerts" once per device |
| Email | anywhere | `RESEND_API_KEY` + `NOTIFY_EMAIL_TO` |
| Webhook (Slack, Discord, Zapier, IFTTT) | anywhere | `NOTIFY_WEBHOOK_URL` |
| Telegram | phone, instantly, free | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| Text message | phone, no data needed | Twilio credentials + `NOTIFY_SMS_TO` |

Channels fire in parallel and are **fire-and-forget**: a slow webhook or an
unreachable push service can never delay or fail a client's booking. Every
attempt is recorded in the dashboard under **Alerts**, including failures, so a
channel that has quietly stopped working is visible rather than silent.

Alerts fire when a booking is **confirmed** — a cash booking immediately, a card
booking once the deposit clears. Abandoned card checkouts never generate noise.

### Dashboard alerts

With the dashboard open, a new booking raises a banner with the client, service,
time, payment method and phone number, plays a short chime, badges the tab title
and (with permission) raises a desktop notification.

New bookings are detected by **diffing booking references after a refresh**, not
by pushing details down the event stream — `/api/stream` is public, so no
client's name, number or appointment ever travels over it.

### Web push

Self-hosted, free, no third party in the middle. VAPID keys are generated on
first run and stored in the database; rotating them invalidates every device, so
they are written once and left alone.

Pushes are sent **with no payload**. That sidesteps `aes128gcm` payload
encryption entirely, and more importantly means **no client's details ever pass
through Google's or Apple's push infrastructure**. The push is a bare wake-up;
the service worker then calls back to this server, authenticated with Chrissy's
own session cookie, and fetches the text itself. If her sign-in has lapsed it
still shows a generic "new booking" — a reason to open the dashboard, never
silence.

Practical caveats, both surfaced in the UI rather than left to fail quietly:

- **Push requires HTTPS.** On plain `http` the browser API is simply absent. The
  dashboard detects this and says so instead of looking broken.
- **On iPhone**, the site must be added to the Home Screen (Share → Add to Home
  Screen) and opened from there before iOS will allow push. The dashboard
  explains this on any device where push isn't available.
- Subscriptions the push service has dropped are pruned automatically, and
  reported as a **failure**, not a delivery — telling her an alert arrived at a
  device that stopped listening would defeat the point.

### A note on card bookings in live Stripe mode

When the client returns from Stripe, the confirmation page asks the server to
verify the payment against Stripe's own API before confirming and alerting — the
browser is never trusted for this. That covers the normal path. For full
coverage (a client who pays then closes the tab before redirecting), add a
Stripe webhook to `/api/pay/stripe/verify`'s logic; it is a small addition and
the verification code is already written.

---

## The dashboard

| Section | What Chrissy does there |
|---|---|
| **Today** | Appointments today and this week, money booked, money to collect |
| **Bookings** | Every appointment, filterable and searchable; cancel or mark paid |
| **My hours** | Toggle each day on/off, set start, finish and break |
| **Time off** | Block a single day or a date range |
| **Services** | Edit names, durations, prices and deposits; add or remove services |
| **Settings** | Slot spacing, gap between clients, minimum notice, booking horizon |

Saving hours or time off pushes straight to any client with the page open.

---

## Mobile

Most of Chrissy's clients book from a phone, so the phone is the primary target
rather than an adaptation. Everything below is enforced by
`tools/mobile-audit.js`, which walks the whole booking flow and the dashboard on
six real handset sizes — iPhone SE through 15 Pro Max, Pixel 7 and a 360px
Galaxy S8 — and exits non-zero on any finding:

```bash
npm start &
npm run audit:mobile
```

It checks three things that actually break a booking on a handset:

- **Tap targets under 44×44.** Apple's HIG minimum. Sizing is applied by
  `@media (pointer: coarse)` rather than screen width, so a touch tablet gets it
  too.
- **Inputs under 16px.** Below that, iOS Safari zooms the page the moment a
  field is focused and leaves the client scrolled sideways mid-form.
- **Horizontal overflow**, page-level and per element.

### What the phone gets

- **The calendar runs edge to edge.** Boxed inside the normal gutter, a 360px
  handset gave 43px cells — under the minimum. Full bleed gives ~50px.
- **A pinned running total.** The summary rail sits after the form in the
  source, so on a narrow screen a client would scroll past every control before
  seeing the price. The bar appears the moment a service is chosen; the full
  rail is suppressed until the payment step, where its deposit breakdown earns
  the space.
- **Times scroll themselves into view** once a date is picked — otherwise they
  appear below the fold and the tap looks like it did nothing.
- **Step navigation scrolls to the tabs, not the section heading**, which on a
  phone fills the screen with an intro the client has already read.
- **No stuck hover states.** A phone has no hover but does leave `:hover`
  applied after a tap — on a slot or calendar cell that reads as a selection the
  client never made. Every hover-only rule is gated behind
  `(hover: hover) and (pointer: fine)`.
- **Correct keyboards**, via `inputmode` and `autocomplete` rather than `type`
  alone, which Android does not always honour.
- **Safe areas.** `viewport-fit=cover` plus `env(safe-area-inset-*)` on the
  gutters, footer and pinned bar, so nothing hides under a notch or the home
  indicator. The hero uses `dvh` so the iOS URL bar collapsing does not crop it.

### Home screen

The site ships a web app manifest and Apple touch icons taken from Chrissy's own
logo, so it installs to the Home Screen as a standalone app. That is worth
having on its own — and on iOS it is also the **precondition for push
notifications**, which Safari only permits for an installed site.

## Design

The structure follows the supplied BMW M design analysis; the colours come from
Chrissy's own Instagram profile mark (`public/images/logo.jpg`).

**Kept from the source system:** UPPERCASE display at weight 700 against Light
(300) body, zero border radius except circular icon buttons, 1px hairline
dividers, the 96px section rhythm, full-bleed photography bands, alternating
band surfaces, and a 4px signature stripe used only as a brand marker — never as
a button fill. **Inter** remains the substitute the source document names for
BMW Type Next Latin, with display tracking at −0.5px.

**Changed:** the palette. The source system is near-black; this is her brand.
Every value below was sampled from the logo rather than picked by eye:

| Sampled from the logo | Hex | Role |
|---|---|---|
| Logo ground | `#b99a7b` | `--taupe`, the brand tone |
| Cream letterforms | `#fdf7ef` | type on dark grounds |
| Blonde hair midtone | `#dccbb6` | elevated surfaces |
| Crown and script gold | `#dcc189` · `#b8944f` · `#8a6d3a` | the signature stripe |

The page floor is warm cream (`#f5efe7`); the hero and footer invert to a deep
version of her taupe (`#5f4832`) carrying cream type, mirroring the logo's own
cream-on-taupe. Inverted bands work by **re-scoping the tokens** in a single
`.on-dark` block, so buttons, hairlines, inputs and labels all follow without
being restyled individually.

### Contrast

Her logo is cream on a light taupe — beautiful as a mark, but that exact pairing
is 2.5:1, well under the 4.5:1 body text needs. So the palette keeps her hue and
takes each tone only as far in lightness as legibility requires:

- a four-step ink ladder (`--ink` → `--body-strong` → `--body` → `--muted`),
  every step ≥4.5:1 on all four light surfaces
- three golds, because one gold cannot do every job on a light ground:
  `--gold` for accents, `--gold-deep` for small text that must clear 4.5:1
  (calendar counts, star rows), `--gold-pale` for dark grounds only
- semantic colours warmed to sit in the palette rather than shipped as stock
  red/green

This is checked, not assumed:

```bash
npm start &
npm run audit:contrast     # needs playwright-core + Chromium
```

`tools/contrast-audit.js` walks every rendered text node on every page and state
— landing, calendar, slots, payment, and all seven dashboard views — resolves
the real painted background behind each one, and applies the WCAG AA threshold
for that text's own size and weight. It exits non-zero on any failure, so it
drops straight into CI. **It currently reports zero failures.** Re-run it after
any palette change.

### Reverting or re-theming

Every colour on the site derives from the token block at the top of
`public/css/app.css`. Re-sampling a redrawn logo, or swapping the palette
wholesale, means editing that one block — no rule below it hard-codes a colour.

### Photography

The site expects Chrissy's own Instagram photography in `public/images/`:

```
hero.jpg          full-bleed hero (landscape, ~2000px wide)
work-01.jpg …     portfolio grid (4:5 portrait)
```

Any file that is missing degrades to a styled placeholder panel — nothing
breaks, and the layout is identical once the real photographs are dropped in.

---

## Layout

```
server.js              HTTP server, routing, API, live event stream
lib/
  seed.js              brand info, services, hours, reviews — first-run defaults
  store.js             JSON file store (atomic writes, debounced)
  availability.js      the slot engine
  time.js              date/time helpers, timezone-safe
  auth.js              admin session (HMAC-signed cookie)
  payments.js          Stripe Checkout / demo mode
public/
  index.html           client site
  admin.html           dashboard
  confirmed.html       confirmation
  pay-demo.html        simulated card checkout
  css/app.css          the design system
  css/admin.css        dashboard-only additions
  js/app.js            booking flow
  js/admin.js          dashboard
  sw.js                service worker (push notifications)
  manifest.webmanifest home-screen install (and the iOS push precondition)
  images/logo.jpg      the profile mark the palette is sampled from
tools/
  contrast-audit.js    WCAG AA check across every page and state
  mobile-audit.js      tap targets, iOS zoom traps and overflow, six handsets
data/db.json           created on first run; gitignored
```

Data lives in a single JSON file. For one stylist that is genuinely enough, and
it keeps the whole thing deployable anywhere Node runs. If the business grows
past it, `lib/store.js` is the only file that changes.

---

## Before this goes live

1. Set `ADMIN_PASSWORD` — the dashboard warns while the default is in use.
2. Set `SESSION_SECRET` to a long random string.
3. Add `STRIPE_SECRET_KEY` and `PUBLIC_URL` to switch card payments on.
4. Confirm everything in [CLIENT-NOTES.md](CLIENT-NOTES.md).
5. Serve over HTTPS — **push notifications will not work without it**.
6. Have Chrissy open `/admin` on her phone and turn on alerts.
7. Back up `data/db.json` (it holds bookings, hours and the push keys).

Confirmation **emails to the client are not wired up** in this draft — bookings
are recorded, Chrissy is alerted, and everything is visible in the dashboard, but
the client themselves gets no email yet. That is the first thing to add once the
content is signed off; the email plumbing already exists in `lib/notify.js`.
