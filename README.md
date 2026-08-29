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

## Design

Built to the supplied BMW M design analysis, adapted for a beauty brand:

- near-black canvas (`#000`) with white type; no light mode
- UPPERCASE display at weight 700 against Light (300) body — the weight contrast
  is the whole editorial signature
- **Inter** as the substitute the source names for BMW Type Next Latin, with
  display tracking pulled to −0.5px
- zero border radius everywhere except circular icon buttons
- 1px hairline dividers, 96px section rhythm, full-bleed photography bands
- a 4px signature stripe used only as a brand marker — never as a button fill

**One deliberate substitution:** the source system's M tricolor is BMW's own
brand identity, so it is swapped for a champagne / bronze / rose set that plays
the same structural role. Reverting to the literal palette is a three-line
change at the top of `public/css/app.css`, where the swap is documented.

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
5. Serve over HTTPS and back up `data/db.json`.

Confirmation **emails are not wired up** in this draft — bookings are recorded
and visible in the dashboard, but nothing is sent to the client yet. That is the
first thing to add once the content is signed off.
