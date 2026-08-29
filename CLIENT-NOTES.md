# Notes for Chrissy — what needs your input

This is a **draft**. Everything works, but some of the content is placeholder
text I wrote so the pages weren't empty. Nothing below is a technical problem —
it is all content you or I can change in minutes.

---

## 1. Your real prices are now in — thank you

The price list and services graphics you sent replaced the biggest guess in the
whole project. **Everything below is now yours, not my estimate:**

| Service | Price |
|---|---|
| Extensions & fittings | **Price on request** |
| Removals | **£50** |
| Hollywood waves | **£30** |
| Hollywood waves with clip-ins | **£35** |
| Pinned curls | **£35** |
| Hair ups / any style | **£35** |
| Dry from wet & style | **£45** |

Your three headline services now lead the page in your own words — Hair
Extensions (all methods), Hair Extension Removals, Hair Styling — with
"BEAUTY. CONFIDENCE. EVERY DAY." and your closing line, "Let's create your next
hair chapter."

**How extensions work on the site.** Because they are priced on request, I have
not invented a number. Booking extensions books a **consultation** instead: the
site says the price is agreed once you have seen the hair, takes no payment, and
holds the slot. You quote in person and book the fitting yourself. If you would
rather clients booked a fitting directly at a set price, tell me the price and I
will change it.

**One thing I still need: how long each service takes.** Your graphics give
prices but not timings, so those are still my estimates — an hour for most
styling, 30 minutes for a consultation. Durations decide how many appointments
fit in your day, so they are worth getting right. Just tell me the real ones.

**Deposits.** Your list does not mention any, so I have set them to zero. That
means: cash clients pay on the day, and card clients pay the whole amount when
they book (a £30 booking takes £30). If you would rather take a small deposit
instead, say the amount and I will set it.

---

## 2. Your photos are on the site

The two you sent are now doing real work:

- The **Hollywood waves** shot is the full-width image at the top of the page.
- The **studio shot** runs alongside the "how it works" section and on the
  service cards.
- Your **maintenance essentials** graphic sits in the maintenance section.

They are resized and compressed so the page still loads fast on a phone.

**More would help.** Right now four service cards share two photographs, cropped
differently. Six or seven more — one per service, plus a couple of before and
afters — and every card has its own.

---

## 3. Your hours — currently a guess

Set as Tuesday–Saturday, 9–6 (Thursday to 8pm), Saturday 9–5, with a 1:00–1:45
lunch. Sunday and Monday closed.

**Change these yourself:** dashboard → **My hours**. Toggle any day on or off,
set your times, save. Clients see it immediately.

---

## 4. Reviews are placeholder text

The six testimonials on the site are **written by me, not by real clients**.
They must be replaced before this goes public.

Send me screenshots of real comments or DMs — **with each client's permission** —
and I'll put the genuine ones in with their first name and initial.

---

## 5. The look, and where the site lives

The site has been rebuilt in a quieter, more editorial style — lots of white
space, cream and white sections alternating, one gold accent used sparingly, and
your name set large in a serif at the bottom of every page. It reads more like a
magazine feature than a shop, which suits the work.

Colours are still taken from your Instagram profile picture, sampled from the
image rather than guessed.

**About the live page.** You mentioned publishing it through GitHub. Two things
you should know:

1. There was nothing for it to publish — the page would have been blank. That is
   now set up properly, and it needs **one setting** flipped once:
   *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
   After that it republishes itself every time anything changes.

2. **A page published that way cannot take live bookings.** GitHub Pages can
   only serve fixed files; the calendar, your dashboard and the notifications
   all need a running server behind them. So the published page shows your full
   price list and sends clients to message you, rather than pretending to hold a
   slot it cannot.

   To get the real calendar on the live page, the booking side needs hosting
   somewhere that runs a server — a few pounds a month, and I can set it up.
   Nothing about the site changes; it just switches on.

---

## 6. Colours

The site now takes its colours straight from your Instagram profile picture. I
sampled them from the image rather than guessing: the taupe background, the
cream of the HAIR letters, the gold of the crown and the "Chrissy" script, and
the blonde of the hair itself.

- Pages sit on a **warm cream**, the same family as your logo
- The top banner and the footer drop to a **deep version of your taupe** with
  cream lettering — the same look as the logo itself
- The **gold** runs through as a thin stripe at the top of the page, on buttons
  and on the calendar, the way the crown does on your mark

One thing worth knowing: your logo is cream lettering on a light taupe, which
looks lovely as a small mark but is too low-contrast for paragraphs of text —
some people genuinely could not read it. So where there's real text I've taken
the same colours a few shades deeper. It's your palette, just made readable.
Every page has been checked against the accessibility standard and passes.

If you'd like it lighter, darker, pinker, or closer to the logo, say so — it's a
single block of settings and takes minutes to change.

---

## 7. On phones

You mentioned most clients book from their phone, so that's now the main target
rather than an afterthought. Checked on iPhone SE, 13 mini, 15 Pro, 15 Pro Max,
a Pixel and a narrow Android — the booking flow works on all of them.

What changed for your clients:

- Everything is big enough to tap properly. A lot of things weren't.
- The calendar goes edge to edge, so the days are comfortable to hit even on a
  small phone.
- A bar stays at the bottom of the screen showing what they've picked and what
  it costs, so they never lose track of the price while scrolling.
- After they pick a day, the times scroll into view by themselves — before, they
  appeared further down and it looked like nothing had happened.
- The right keyboard comes up for each box (number pad for the phone number,
  email keyboard for the email).
- The form no longer makes iPhones zoom in when a client taps a box, which used
  to leave them stuck sideways halfway through booking.

**And one thing that was properly broken:** on a phone, your dashboard menu was
invisible with no way to open it. You could sign in and then reach nothing — not
your hours, not your prices, not the Alerts page. That's fixed; there's a menu
button in the corner now.

**Worth doing:** open the site on your phone and add it to your Home Screen
(Share → Add to Home Screen). It then behaves like a proper app, with your logo
as the icon — and on an iPhone that's the only way notifications are allowed to
work at all.

---

## 8. Contact and location

Currently showing:

- **Studio:** "Private studio, London — exact address sent on booking"
- **Email:** hello@hairbychrissy.co.uk *(made up)*
- **Phone:** not shown

Tell me the real email, whether you want a phone number public, and how much of
the address you're comfortable showing before someone has booked.

---

## 9. Cancellation policy

Currently: **free to move or cancel up to 48 hours before**, deposit retained
inside that window. Change the hours in dashboard → **Settings**; tell me if you
want the wording different.

---

## 10. Card payments

Card is fully built but running in **draft mode** — clients can choose it and go
through a simulated checkout, but no real money moves, and the page says so.

To switch on real card payments I need a **Stripe account** in your name.
Stripe takes roughly 1.5% + 20p per UK card transaction. Once you've set one up,
switching it on is a single setting — nothing else changes.

Cash bookings already work exactly as they will on the live site.

**Currently:** your list has no deposits, so card clients pay the full amount
when they book and cash clients pay on the day. Extensions take nothing at all,
since they are quoted. If you'd rather take a small deposit to stop no-shows,
tell me the amount.

---

## 11. Getting told about bookings

You will not miss one. Alerts are already built in:

**On your phone (the important one).** Open **/admin** on your phone, go to
**Alerts**, and tap **turn on alerts here**. From then on your phone notifies
you the moment someone books — with the site closed, phone in your bag. Do it
once per device; there's a **send me a test** button so you can prove it works
before you rely on it.

Two things to know:

- **On an iPhone** you have to add the site to your Home Screen first
  (Share → Add to Home Screen) and open it from there. Apple only allows
  notifications that way. The page tells you this if it applies.
- The site must be on **https://** for this to work. It will be when it goes
  live — just worth knowing it won't work from a plain test link.

**On your laptop.** With the dashboard open you get a banner across the top, a
chime, and the tab title changes — so a booking that lands while you're on
another tab is still obvious.

**Anywhere else you want.** I can also send alerts to any of these — tell me
which you'd like and it takes a few minutes each:

| | Good for |
|---|---|
| **Email** | a written record of every booking |
| **Telegram** | free, instant, very reliable on a phone |
| **Text message** | reaches you with no internet at all (a few pence each) |
| **WhatsApp / Slack / Discord** | if you already live in one of those |

My suggestion: **phone alerts plus email**. Phone so you know immediately,
email so there's a paper trail you can search later.

You get alerted when a booking is **confirmed** — cash bookings straight away,
card bookings once the deposit goes through. Someone who starts a card payment
and abandons it never bothers you.

Every alert that goes out is listed in the dashboard under **Alerts**, including
any that failed, so you can always see it's working.

---

## 12. Not built yet

Deliberately left out of the draft, easy to add once you've seen it:

- **Confirmation emails to the client.** You get alerted, and everything's in
  your dashboard, but the client doesn't get an email yet. Most important next
  step.
- **Reminders** to the client the day before.
- **Client self-service cancellation** — right now they message you and you
  cancel it in the dashboard.
- **Deposit refunds** through the site.
- **Recurring maintenance booking** ("same time in ten weeks").
- **A patch-test flag** on services that need one.

---

## 13. Your dashboard

Go to **/admin**, password **`chrissy`** for now — I'll change it to something
only you know before anything goes public.

From there you can: see your day, set your hours, block holidays, edit prices,
cancel appointments, mark people as paid, and turn on booking alerts.

Worth doing on your phone as well as your laptop — that's how you get the
notifications.

---

## What I need from you to move to a proper version

Prices are done. What is left:

1. **How long each service takes** — the last real guess in the booking system
2. Your actual working hours
3. Real reviews (with permission) — your Reviews highlight is the place
4. A few more photographs, one per service
5. Real email address and how much location detail to show
6. A yes/no on setting up Stripe, and whether you want deposits
7. Which alert channels you want beyond phone notifications (email? text?)
