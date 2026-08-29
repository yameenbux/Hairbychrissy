# Notes for Chrissy — what needs your input

This is a **draft**. Everything works, but some of the content is placeholder
text I wrote so the pages weren't empty. Nothing below is a technical problem —
it is all content you or I can change in minutes.

---

## 1. Instagram content could not be pulled automatically

Instagram blocks automated access, so I could not read your posts, captions,
comments or photographs directly. What I could confirm from public search
results is on the site already:

- hair extension specialist and stylist, **London**
- methods: **nano rings, micro rings, tapes, LA weave, invisi-weft**
- the "**WE DO NOT USE FACEBOOK**" line from your bio, kept in the footer
- your handle and profile link

Everything else marked below is my best guess and needs your word.

---

## 2. Prices and timings — please confirm or correct

These are plausible London market figures, **not yours**. You can edit every one
of them yourself in the dashboard under **Services**, or tell me and I'll set them.

| Service | Time | Price | Deposit |
|---|---|---|---|
| Consultation & colour match | 30m | Free | — |
| Nano rings — full head | 4h | £550 | £100 |
| Nano rings — half head | 3h | £360 | £75 |
| Micro rings — full head | 4h | £500 | £100 |
| Tape-in — full head | 2h | £320 | £75 |
| LA weave — full head | 3h | £340 | £75 |
| Invisi-weft — full head | 3h 30m | £620 | £125 |
| Maintenance / refit | 2h 30m | £190 | £50 |
| Removal | 1h | £60 | £20 |
| Cut & blow dry | 1h 15m | £55 | £15 |

**Durations matter more than you'd think** — they decide how many appointments
fit in a day, so it's worth getting them honest rather than optimistic.

The site currently says prices are for **fitting only**, with hair quoted
separately at consultation. Tell me if that's wrong.

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

## 5. Colours

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

## 6. On phones

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

## 7. Photography

Every photo slot is currently a styled placeholder. Send me:

- **one landscape hero shot** — your best piece of work, or you in the studio
- **six portfolio shots** (portrait crops work best) with a one-line caption each

Drop them into `public/images/` and they appear automatically. Until then the
placeholders sit there without breaking anything.

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

**Currently the deposit model is:** card clients pay a deposit to hold the slot,
cash clients pay everything on the day. If you'd rather take a deposit from
everyone, or from nobody, say so — it's a small change.

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

1. Real prices and durations
2. Your actual working hours
3. Real reviews (with permission)
4. Photographs
5. Real email address and how much location detail to show
6. A yes/no on setting up Stripe
7. Which alert channels you want beyond phone notifications (email? text?)
