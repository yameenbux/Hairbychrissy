# Notes for Chrissy — what needs your input

This is a **draft**. Everything works, but some of the content is placeholder
text I wrote so the pages weren't empty. Nothing below is a technical problem —
it is all content you or I can change in minutes.

---

## 1. Latest round — booking has its own page now

**Book your slot** used to scroll you down the home page to a booking form
wedged between your photographs. It now opens its own page, and that page does
four things in order.

**1. What you're having done.** A dropdown of your real service list — Hair Ups,
Pinned Curls, Hollywood Waves, Extensions, Removals, all of it. The price and
roughly how long it takes appear the moment they choose. This has to come first
because your Saturday morning fits a blow dry and does not fit a full install,
so the calendar can only be drawn once it knows what they want.

**2. A day.** A month calendar. Days you cannot take them are greyed out.

**3. A time.** Only the times that actually fit that service on that day.

**4. Them.** Name, phone, email — and two new things you asked for.

### The note box

A free-text box: *"anything I should know before the day."* Whatever they write
lands on the booking in your dashboard under **They asked for:**, and it is in
the email you get.

### Photographs of what they want

They can attach **up to five pictures** — the screenshot of the look they've
saved from your grid, or from someone else's. They show up on the booking in
your dashboard; tap one to see it full size.

This is the part I think saves you the most time. At the moment a client sends
you a picture on Instagram and books separately, and you are left matching a
photo in your DMs to a name in your diary. Now they arrive together.

Three things I did deliberately, in case you ever wonder why:

- **The booking is made first, then the photos upload.** If someone's photo
  fails to send — bad signal on the bus, a picture that's too big — they still
  have their slot. A photo problem must never cost you a booking.
- **The pictures are private.** They are not on the website and not in the
  public files anywhere. They can only be opened from inside your dashboard,
  logged in as you.
- **Your email tells you they're coming.** The photos land a second after the
  booking, so the alert says *"2 reference photos — open the booking in your
  dashboard to see them."*

### Your hours are now the real ones

| Day | Hours |
|---|---|
| Monday – Friday | 10:00 – 19:00 |
| Saturday | 09:00 – 12:00 |
| Sunday | 11:00 – 15:00 |

Open seven days, as you said. I had previously invented a 1pm lunch break —
**I have taken it out.** Blocking an hour in the middle of your five busiest
days is an hour of bookings you never see, and if you do want lunch you can
block it yourself in the dashboard, on the days you actually want it.

These are still just the starting values. Change any of them in dashboard →
**My hours** and the calendar follows straight away.

---

## 2. The top of the page now fits the screen

You spotted it: on your iPad the **Book your slot** button was cut off at the
bottom of the first screen. Fixed, and it was a worse problem than it looked.

The big heading was being sized off the **width** of the screen. An iPad held
sideways is wide but not tall, so the heading grew to its maximum and stayed
there while the screen got shorter — which pushed the button off the bottom.
It was doing the same on an ordinary laptop, cutting the button off by about
28 pixels there too. So anyone landing on the site on a laptop or a sideways
tablet saw a beautiful page with no way to book on it until they scrolled.

The heading now takes its size from whichever direction is tighter, so a short
screen gets slightly smaller type instead of the same type falling off the end.
Everything — heading, text and button — is inside the first screen now.

**A phone held sideways** was the hardest case: about 850 wide and only 330
tall. Nothing stacks into that. Rather than shrink it all to nothing or throw
the words away, the heading now takes the left half and the text and button sit
beside it on the right — using the space that screen actually has.

I have added an automatic check (nine screen sizes, from an iPhone SE up to a
1920 desktop) that fails if the button, the heading or the text ever falls
below the first screen again. It caught a second one while I was fixing this:
the small *See the price list* link had wrapped underneath the button and off
the edge on a sideways phone.

---

## 3. The look, tightened

A design pass. Nothing about how the booking works changed; this is all about
how it reads.

**On a phone, your price list is now two across instead of one.** It was
showing one service per screen — seven full-width photographs — so reading six
prices meant scrolling past about seven thousand pixels of pictures, and you
could never see two prices at once to compare them. Four services fit on screen
now and the whole page is a third shorter.

**One thing to book, said the same way everywhere.** Every page now pushes to
the same button, in the same words: *Book your slot*. It is in the header, the
hero, after the services, after your work, after the reviews, after the FAQ,
and on the confirmation and error pages. Before this the hero offered two
buttons of equal weight — "Book an appointment" and "View services" — which
splits people rather than pointing them. "See the price list" is a quiet link
under the button now.

**Headings are in your serif.** The big headings were set in the same plain
sans as the body, which read like a software product rather than a hair studio.
They are now in the same elegant serif as your name at the top.

**Two things I fixed that were genuinely broken:**

1. **The card payment page had no styling at all.** It was being served from a
   web address one folder deeper than every other page, so it could not find
   the stylesheet — anyone who chose to pay by card got a page of plain black
   text on white. It has been moved and it looks like the rest of the site now.
2. **The "page not found" page never appeared.** It existed, but the server was
   showing the words "Not found" instead. It works now, and it asks them to
   book rather than leaving them at a dead end.

**One thing I need from you:** two of your service photos are the same picture.
*Pinned curls* and *Hollywood waves with clip-ins* were the identical file, and
now that the price list is two across they sit side by side, so it looked like
a mistake. I have re-cropped one as a stopgap, but **a photo of pinned curls
would fix it properly**.

---

## 4. Previous round — your dashboard, and email

Two things you asked for.

### Your dashboard now runs your day, not just your diary

Open **/admin** on your phone. **Today** is now a run sheet: one day at a time,
in order, with **the gaps between your appointments spelled out** and a button
to fill each one. Arrows either side to move through the days.

The gaps are the bit that matters. When someone messages asking "have you got
anything Thursday", the answer is in the spaces, not the appointments — and it
now tells you *3h 45m free* rather than making you work it out between two
start times. Your break is counted as taken, not free, so it never offers your
lunch to a client.

**You can add a booking yourself.** This was the real gap. Most of your
enquiries come through Instagram DMs, and until now there was nowhere to put
them — which meant the website was still selling a slot you had already
promised. Tap **Add a booking** (or **Book this** on a gap) and it goes in the
diary and comes off the site.

You can break your own rules doing it — squeeze someone in outside your hours,
at short notice, or on a day you'd blocked off. It tells you what you're
overriding and you tap again to confirm. The one thing it will not let you do
is **double-book yourself**. That is not a rule you'd ever choose to break, so
it just says no.

Also new on every appointment:

- **Move** — a client rings to change the day, you move it. They keep the same
  reference and nobody can grab the slot in between. It then shows where it
  moved from, so you can see what happened.
- **Done** and **No show** — for closing off an appointment afterwards. Now you
  have a record of who didn't turn up, which is exactly who to ask for a
  deposit next time.
- **Note** — your own private line on a booking. Colour formula, hair ordered,
  who referred them. Marked in gold so you never mix it up with what the client
  wrote, and they never see it.
- **Money owing** as a filter, and **Export** to hand the lot to whoever does
  your books as a spreadsheet.

### Email alerts

The email side is built and tested. It needs **two things from whoever puts
this on a live server**, both of which take about ten minutes:

1. A free account at **resend.com** and the API key it gives you.
2. Your email address, set on the server.

**Your address is deliberately not written into the code.** The code is
published publicly on GitHub, and a personal email address in a public
repository is a personal email address on a spam list within the week. It goes
in the server's private settings instead, where nobody can read it.

Two extras worth having:

- **The morning run-down.** One email each morning listing everything booked
  for that day. Tell me what time you want it. Honestly this is the one most
  likely to save you — every other alert arrives the moment someone books,
  which is exactly when you're mid-fitting and can't look. This one catches the
  appointment made three weeks ago that you'd stopped thinking about. There's a
  **send me today's run-down** button under **Alerts** so you can try it now.
- **Sending from your own domain.** By default the emails come from a shared
  address, which works but is more likely to land in spam — and an alert in
  your spam folder is a missed booking. If you have a domain, verifying it in
  Resend fixes that.

You also now get told when someone **cancels** an upcoming appointment, not
just when they book. A client dropping out of Thursday afternoon frees three
hours you could sell, but only if you find out before Thursday.

---

## 5. Your "4 Benefits" graphic

Your four benefits are now a section on the page, under **Why extensions**,
sitting just after "Hair that is maintained, not fixed" and before the prices.

I set them as **text rather than dropping the graphic in as a picture**. That
matters more than it sounds: text can be read out by a screen reader, found by
Google, translated, and it stays sharp and re-flows to one column on a phone —
a screenshot of text does none of those things and goes fuzzy when it scales.

**Two wording changes I made. Say the word and I will put either back.**

1. Your first benefit read *"go from from short to long"* — the word "from" was
   in there twice. I took one out.
2. Your third heading read *"Protection FROM natural hair"*, but the line under
   it is about protecting the client's own hair. As written the heading says the
   opposite of your own sentence, so I changed it to **"Protection for your
   natural hair"**. If you meant something different by it, tell me and I will
   write it your way.

I also dropped the exclamation marks, only because nothing else on the site uses
them and they stood out. Easy to put back if you want the warmth.

---

## 6. Previous round

Your three photos and two reels are all in:

- **Every service now has its own photograph.** That was the last real gap —
  four cards were sharing two pictures. The platinum waves, the braid and the
  brunette waves each landed on the right service.
- **A portfolio section**, "The Portfolio", showing those three pieces of work
  with a link through to your Instagram.
- **Three before-and-afters** instead of one, pulled from your reels.
- **Both reels play on the page**, under "In motion". Your caption — *"Probably
  needed a hug. Got hair extensions instead."* — is kept as the caption on that
  one, because it is better than anything I would write.

The reels only download when a client actually scrolls to them, and not at all
if they have reduce-motion or Data Saver on. The still shows instead.

One fix worth mentioning: your second reel had black bars baked into the top and
bottom. I cropped them out rather than letting the page squash around them.

---

## 7. Earlier round

- **Your logo is now in the header**, beside the "Hair by Chrissy" wordmark,
  masked to a circle so it reads as a mark rather than a photo tile.
- **The header is properly centred.** It was off on phones and, less obviously,
  off by 41px at tablet width. It now measures dead centre at every screen size
  from 320px up to 1920px.
- **"Site by YSB Designs" is in the footer**, in the bar at the very bottom.
  Send me a web address for YSB and I will link it.

---

## 8. Your real prices are now in — thank you

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

## 9. Your video is now the top of the page

The transformation reel you sent is the moving image at the top of the site —
her before, then the finished hair. It is the strongest thing on the page: it
shows what you actually do in about ten seconds.

A few things I did to it:

- **Trimmed and compressed.** The original was 3.6MB, which is a lot to push
  down a phone connection before a client sees anything. It is now 435KB, and
  there is a still image behind it so something is on screen instantly.
- **Muted, and the music removed.** Autoplaying sound would be blocked by every
  browser anyway, and putting someone else's track on a website is a licensing
  risk you do not need.
- **It does not play for everyone.** If a client has "reduce motion" turned on,
  or Data Saver, they get the still instead and the video never downloads. That
  is the polite thing to do and it saves their data.

I also pulled a **before and after pair** out of the reel and gave them their own
section — that comparison is the most persuasive thing on the whole site.

**One note:** I checked all 23 seconds and there is no text or pricing in the
video. The prices, services and maintenance points on the site came from the
three graphics you sent before, and they are all already in.

---

## 10. Your photos are on the site

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

## 11. Your hours — now the ones you gave me

Monday to Friday 10–7, Saturday 9–12, Sunday 11–3. No invented lunch break.
See section 1 for the detail.

**Change these yourself:** dashboard → **My hours**. Toggle any day on or off,
set your times, save. Clients see it immediately.

---

## 12. Reviews are placeholder text

The six testimonials on the site are **written by me, not by real clients**.
They must be replaced before this goes public.

Send me screenshots of real comments or DMs — **with each client's permission** —
and I'll put the genuine ones in with their first name and initial.

---

## 13. The look, and where the site lives

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

## 14. Colours

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

## 15. On phones

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

## 16. Contact and location

Currently showing:

- **Studio:** "Private studio, London — exact address sent on booking"
- **Email:** hello@hairbychrissy.co.uk *(made up)*
- **Phone:** not shown

Tell me the real email, whether you want a phone number public, and how much of
the address you're comfortable showing before someone has booked.

---

## 17. Cancellation policy

Currently: **free to move or cancel up to 48 hours before**, deposit retained
inside that window. Change the hours in dashboard → **Settings**; tell me if you
want the wording different.

---

## 18. Card payments

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

## 19. Getting told about bookings

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

## 20. Not built yet

Deliberately left out of the draft, easy to add once you've seen it:

- **Confirmation emails to the client.** You get alerted, and everything's in
  your dashboard, but the client doesn't get an email yet. Most important next
  step.
- **Reminders** to the client the day before.
- **Client self-service cancellation** — right now they message you and you
  cancel it in the dashboard (which now alerts you, so nothing gets lost).
- **A regular-clients list** — you can search bookings by name, but there is no
  page yet that says "Amara, eleven visits, last in June, always books waves".
- **Deposit refunds** through the site.
- **Recurring maintenance booking** ("same time in ten weeks").
- **A patch-test flag** on services that need one.

---

## 21. Your dashboard

Go to **/admin**, password **`chrissy`** for now — I'll change it to something
only you know before anything goes public.

From there you can: work through your day on the run sheet, add bookings you
took by DM or phone, move and close them off, keep private notes, set your
hours, block holidays, edit prices, mark people as paid, export the lot to a
spreadsheet, and turn on booking alerts.

Worth doing on your phone as well as your laptop — that's how you get the
notifications.

---

## What I need from you to move to a proper version

Prices are done. What is left:

1. **How long each service takes** — the last real guess in the booking system
2. Real reviews (with permission) — your Reviews highlight is the place
3. A few more photographs, one per service
4. How much location detail to show, and whether you want a **public** contact
   address on the site. Your own address is now set up to receive the booking
   alerts privately — that is a separate thing from putting one on the page,
   and you may not want one there at all if Instagram DMs suit you
5. A yes/no on setting up Stripe, and whether you want deposits
6. What time you want the morning run-down, if you want it
7. A domain, if you have one, so the alert emails come from you rather than a
   shared address — it keeps them out of spam

Everything on your side of the email setup is done. What's outstanding is on
the server: a Resend key and your address in the private settings. Fifteen
minutes when there's a live server to put them on.
