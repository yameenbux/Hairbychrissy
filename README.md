# H A I R • B Y • C H R I S S Y — booking platform

A live-calendar booking site for [@hairbychrissy_x](https://www.instagram.com/hairbychrissy_x),
hair extension specialist, London.

Clients pick a service, see genuine live availability, choose a slot and pay by
**cash or card**. Chrissy sets her own working days, hours, breaks and time off
from a private dashboard — and the client calendar updates the moment she saves.

> **Draft.** Prices, services, copy and photography are now hers — taken from
> her price list, services and maintenance graphics. Still outstanding: service
> durations, real reviews, and contact details. See
> [CLIENT-NOTES.md](CLIENT-NOTES.md).

---

## Publishing

There are two deployments, and they are not interchangeable:

| | What it serves | Where |
|---|---|---|
| **GitHub Pages** | the site as flat files | `https://<user>.github.io/Hairbychrissy/` |
| **Node** | the same site **plus the booking API** | any host that runs Node |

**GitHub Pages cannot run the booking engine.** Live availability, the event
stream, admin sessions, push notifications and payments are all server-side.
Published to Pages alone, the site shows the full price list and routes bookings
to an enquiry rather than pretending to hold a slot it cannot.

### Configuring Pages — one setting

`.github/workflows/pages.yml` publishes `public/` on every push. It needs one
change, once:

> **Settings → Pages → Build and deployment → Source: `GitHub Actions`**

No `gh-pages` branch and no `/docs` folder — the workflow uploads the same
`public/` the Node app serves, so the two cannot drift. It regenerates
`public/data/site.json` on every deploy, so the published content always matches
`lib/seed.js`.

### Making the published page book for real

Host the Node app somewhere (Render, Railway, Fly, a VPS), then:

1. Set the repository variable **`HBC_API`** to the API's base URL. The workflow
   injects `<meta name="hbc-api">` and the Pages site switches to the live
   calendar.
2. Set **`ALLOWED_ORIGINS`** on the Node app to the Pages origin, so CORS
   permits it. It is an allowlist and never `*` — the admin routes share that
   origin and carry a session cookie.

### Subpath safety

Pages serves from `/Hairbychrissy/`, not a domain root. Every asset path is
relative, and both scripts derive their base from their own URL via
`import.meta.url` rather than assuming `/`. The manifest uses `./` for
`start_url` and `scope`, so Add to Home Screen works from the subpath too.

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

## Pricing model

Her price list has three shapes, and the booking engine handles each:

| Shape | Example | What happens |
|---|---|---|
| **Price on request** | Extensions & fittings | Books a consultation. No payment offered, the card option is hidden, and the slot is held. She quotes in person. |
| **Fixed price, no deposit** | Hollywood waves, £30 | Cash pays on the day; card pays the full amount at booking. A zero-value checkout would be rejected by Stripe, so "deposit of £0" is never charged. |
| **Fixed price with deposit** | none currently | Deposit online, balance on the day. Set a deposit per service in the dashboard to switch a service to this. |

Deposits are all zero because her list does not mention any. Changing one in the
dashboard moves that service to the third shape with no code change.

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

Built to `CLAUDE.md` — editorial luxury minimal. The palette is resampled from
her Instagram profile mark, as that file instructs ("resample from source
assets before finalising"): the token **roles** are the spec's, the **values**
are hers.

| Role | Spec | Resampled from her logo |
|---|---|---|
| `--espresso` | `#2E1A12` | `#33261c` |
| `--espresso-70` | `#4A3226` | `#6b5646` |
| `--clay` | `#C98A7E` | `#a98744` |
| `--cream` | `#FAF7F4` | `#f7f2ea` |
| `--paper` | `#FFFFFF` | `#ffffff` |

The one real divergence is clay. The spec's is a dusty rose; her single accent
is the gold of the crown and script, so that is what the resample gives.

Rules held from the spec:

- **One accent, used as a marker only** — process numerals, connector lines,
  the active tab rule, the FAQ toggle. Never on body copy, never on a button.
- **Backgrounds alternate paper and cream**, no dark sections. The espresso
  legal bar closing the footer is the single band the spec allows. The hero is
  an imagery band with a scrim, not a dark section.
- **No gradients as fills, no shadows on UI.** Depth comes from photography.
- **Three type roles**: a display serif for the wordmark only, a grotesque for
  uppercase display headings at `clamp(2.5rem, 7vw, 6rem)` / `0.95` line-height
  / `0.02em` tracking, and body at `1rem–1.125rem` / `1.6` capped to `42ch`.
- **Oversized thin numerals as layout anchors** on the process section.
- **Whitespace as the primary device** — bands run `clamp(88px, 18vh, 200px)`.
- **Asymmetric splits that alternate sides** down the page.
- **Service grid 4 / 2 / 1** with a full-width SELECT bar revealed over the
  image bottom. On touch, where there is no hover, the bar is always visible.
- **Motion**: fade plus 20px rise, 600ms ease-out, 80ms stagger, driven by
  `IntersectionObserver`. A slow 26s drift on the organic shapes. Nothing
  animates above the fold. `prefers-reduced-motion` drops to opacity only.

### The header

The wordmark carries her logo mark and is centred against the **page**, not
against a grid column. That distinction matters: a three-column grid only
centres its middle column while the outer two stay equal, and they do not — at
1024px the five nav links outgrew their share and pushed the wordmark 41px
right, while hiding the right-hand links on mobile collapsed that column and
pushed it the other way. Absolute centring is immune to whatever the nav weighs.

`tools/header-audit.js` (`npm run audit:header`) measures it at eleven widths
from 320px to 1920px, and checks two things, because they are not the same
question: that the wordmark is within 2px of the page centre, **and** that
nothing in the header overlaps it. The first version of that audit passed while
the nav links were running straight through the wordmark on every phone.

### The hero video

The spec allows a video hero on strict terms — "muted, autoplay, playsinline,
loop, poster image mandatory" — and this one meets them, with two additions the
spec does not require but a phone-first audience does:

- **Nothing downloads until it is wanted.** The `<source>` tags are `data-`
  attributes; the script adds them only after checking `prefers-reduced-motion`
  and `navigator.connection.saveData`. Pausing a video still costs the
  download, which on a phone is someone's data spent on a decoration they asked
  not to see. The poster is a complete hero on its own.
- **Trimmed and re-encoded**: 22s to 12s, 30fps to 24, 576px to 640, audio
  stripped. 3.6MB to 435KB (mp4) with a 440KB webm alternative. Audio is
  removed because the spec requires a muted hero anyway and shipping someone
  else's music on a website is a licensing problem.
- Playback pauses when the hero scrolls out of view.

### The non-negotiables, checked not assumed

`tools/sticky-audit.js` (`npm run audit:sticky`) navigates to every in-page
anchor at **1280, 1440 and 1920** and asserts the destination heading clears the
sticky header — the spec's explicit requirement. It also asserts the nav labels
are identical in header and footer, and that focus rings are visible. It exits
non-zero on failure and currently reports **zero**.

Prices render as clean rounded values (`£50`, never raw FX output), and a
service with no fixed price reads "On request" rather than "£0".

Text over imagery sits on a scrim, and `tools/scrim-audit.js`
(`npm run audit:scrim`) proves it. It renders the hero, hides the text,
screenshots the bare background and measures white against the **lightest pixel
behind each element** — the worst case, which no stylesheet can tell you because
it depends on the imagery.

With a video hero, one frame is not enough: the background changes every moment,
so measuring one frame measures luck. The audit pauses the video, steps through
it at five points plus the poster, and keeps the worst case per element, naming
which frame caused it.

It has caught two real regressions so far — her still hero (label 3.63:1) and
again when the video replaced it (label 4.23:1 at t=0). **Re-run it whenever the
hero media changes.**

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
  css/app.css          the design system + booking UI
  css/admin.css        dashboard-only additions
  js/app.js            client site — live under Node, static on Pages
  js/admin.js          dashboard
  sw.js                service worker (push notifications)
  manifest.webmanifest home-screen install (and the iOS push precondition)
  data/site.json       generated content snapshot for the flat-file build
  video/               hero reel, trimmed and re-encoded, audio stripped
  images/logo.jpg      the profile mark the palette is sampled from
.github/workflows/
  pages.yml            GitHub Pages deployment
tools/
  contrast-audit.js    WCAG AA check across every page and state
  mobile-audit.js      tap targets, iOS zoom traps and overflow, six handsets
  sticky-audit.js      heading clearance, nav parity, focus rings
  header-audit.js      wordmark centring and collisions, 11 widths
  scrim-audit.js       white hero type vs the lightest pixel of the photo
  build-static-data.js writes the content snapshot the flat-file build reads
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
