/**
 * H A I R • B Y • C H R I S S Y — booking platform.
 *
 * A single-file HTTP server with no runtime dependencies. Run with `npm start`.
 *
 *   /            client-facing site + live booking calendar
 *   /admin       Chrissy's dashboard (availability, services, bookings)
 *   /api/*       JSON API
 *   /api/stream  server-sent events — pushes slot changes to every open browser
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { read, write, nextRef, flush, commit, init as initStore, backend } from './lib/store.js';
import { brand, reviews, gallery, faqs, offers, benefits, maintenance, transformations, reels } from './lib/seed.js';
import { slotsFor, monthSummary, validateSlot, validateAdminSlot, clashesWith, getService, dateClosedReason } from './lib/availability.js';
import { isValidDate, toMinutes, toHHMM, longDate, nowIn, addDays } from './lib/time.js';
import { checkPassword, makeToken, isAdmin, sessionCookie, clearCookie, usingDefaultPassword } from './lib/auth.js';
import { isLiveStripe, createCheckoutSession, retrieveCheckoutSession, publicUrl } from './lib/payments.js';
import { verifyPhoto, savePhotos, readPhoto, MAX_PHOTOS } from './lib/photos.js';
import { DATA_DIR, DATA_DIR_IS_DEFAULT } from './lib/paths.js';
import { diagnose as supabaseDiagnosis } from './lib/supabase.js';
import {
  notify, bookingMessage, cancellationMessage, dayAheadMessage, getVapid,
  saveSubscription, removeSubscription, listSubscriptions, channelStatus,
  recentNotifications, latestNotification,
  sendClientConfirmation,
} from './lib/notify.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

/* ------------------------------------------------------------------ utils */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/**
 * Origins allowed to call the booking API cross-origin, so the site can be
 * published as flat files (GitHub Pages) while the API lives elsewhere.
 * Set ALLOWED_ORIGINS as a comma-separated list. Deliberately an allowlist and
 * never "*": the admin routes share this origin and carry a session cookie.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    ...(res._cors || {}),
    ...headers,
  });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Malformed JSON body');
  }
}

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = (v) => /^[+()\d\s-]{7,20}$/.test(v);

/* ---------------------------------------------------- live event stream */

const listeners = new Set();

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners) {
    try {
      res.write(payload);
    } catch {
      listeners.delete(res);
    }
  }
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...corsHeaders(req),
  });
  res.write('retry: 4000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  listeners.add(res);

  // Keep-alive comment so proxies don't drop an idle connection.
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* cleaned up below */
    }
  }, 25000);

  const close = () => {
    clearInterval(ping);
    listeners.delete(res);
  };
  req.on('close', close);
  req.on('error', close);
}

/* --------------------------------------------------------- static files */

function serveStatic(res, urlPath) {
  const rel = urlPath.replace(/^\/+/, '');
  const target = path.join(PUBLIC, rel);
  // Guard against path traversal.
  if (!target.startsWith(PUBLIC + path.sep) && target !== PUBLIC) {
    return send(res, 403, 'Forbidden');
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return serveNotFound(res);
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    const cacheable = /\.(jpg|jpeg|png|webp|avif|svg|woff2|ico|mp4|webm)$/i.test(target);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': cacheable ? 'public, max-age=3600' : 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  });
}

/**
 * The 404 page, not the word "Not found".
 *
 * public/404.html has existed since the rebuild and GitHub Pages serves it
 * automatically, so it was only ever missing under Node — which is to say it
 * was missing everywhere it is actually being used right now. A dead end is
 * still a page a client is looking at, and it is the one page with nothing to
 * lose by asking them to book.
 */
function serveNotFound(res) {
  fs.readFile(path.join(PUBLIC, '404.html'), (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 404, buf, { 'Content-Type': 'text/html; charset=utf-8' });
  });
}

function servePage(res, file) {
  fs.readFile(path.join(PUBLIC, file), (err, buf) => {
    if (err) return send(res, 500, 'Page missing');
    send(res, 200, buf, { 'Content-Type': 'text/html; charset=utf-8' });
  });
}

/* ------------------------------------------------------- public payloads */

/** A booking as the client themselves may see it. */
function publicBooking(b) {
  const service = getService(b.serviceId);
  return {
    ref: b.ref,
    date: b.date,
    dateLong: longDate(b.date),
    start: b.start,
    end: b.end,
    serviceName: service?.name || b.serviceName,
    duration: b.duration,
    total: b.total,
    priceOnRequest: Boolean(b.priceOnRequest),
    depositDue: b.depositDue,
    balanceDue: b.balanceDue,
    payment: b.payment,
    paymentStatus: b.paymentStatus,
    status: b.status,
    clientName: b.client.name,
  };
}

/**
 * Tell Chrissy about a booking, and send the client their own copy.
 *
 * Deliberately fire-and-forget: a slow webhook or an unreachable mail service
 * must never delay or fail a booking that is already saved. By the time this
 * runs the slot is the client's — nothing here can take it away.
 *
 * Both live in one function on purpose. Every path that alerts her about a new
 * booking is a path where the client should be told too, and there are four of
 * them; splitting the calls would eventually leave one behind.
 */
function notifyNewBooking(booking) {
  const service = getService(booking.serviceId);
  const withDate = { ...booking, dateLong: longDate(booking.date) };

  /*
   * One after the other, not both at once.
   *
   * A booking sends two emails through the same provider, and the free tier
   * allows two requests a second. Fired simultaneously they raced, and the
   * loser came back rate-limited — which produced the worst possible pairing
   * in production: the CLIENT was told they were booked and CHRISSY was not
   * told at all. Hers goes first, because a booking she does not know about
   * is the failure this whole application exists to prevent.
   */
  (async () => {
    try {
      const entry = await notify(bookingMessage(withDate, service));
      /*
       * Say out loud what happened to HER alert. A channel that is not
       * configured resolves as 'skipped' and writes nothing anywhere, so the
       * exact failure a stylist reports — "the client got an email, I got
       * nothing" — used to leave no trace at all in the log. Now the reason
       * is printed next to the booking that triggered it.
       */
      for (const ch of entry?.channels || []) {
        if (ch.status === 'sent') console.log(`[stylist-alert] ${ch.name} sent — ${ch.detail}`);
        else console.warn(`[stylist-alert] ${ch.name} ${ch.status} — ${ch.detail}`);
      }
      if (!(entry?.channels || []).some((ch) => ch.status === 'sent')) {
        console.error(`[stylist-alert] NOBODY WAS TOLD about ${booking.ref} — no notification channel is working.`);
      }
      broadcast('notification', {});
    } catch (err) {
      console.error('[notify]', err.message);
    }

    try {
      const r = await sendClientConfirmation(withDate, service);
      if (r?.skipped) console.log(`[client-email] not sent — ${r.skipped}`);
      else console.log(`[client-email] sent to ${r.detail}`);
    } catch (err) {
      // Logged loudly rather than swallowed: the client has a slot either way,
      // but Chrissy should know they were not told about it.
      console.error(`[client-email] FAILED for ${booking.ref}:`, err.message);
    }
  })();
}

/** Photographs actually present, so the page never probes for missing files. */
function availablePhotos() {
  try {
    return fs.readdirSync(path.join(PUBLIC, 'images')).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
  } catch {
    return [];
  }
}

function siteConfig() {
  const db = read();
  return {
    photos: availablePhotos(),
    brand,
    offers,
    benefits,
    maintenance,
    transformations,
    reels,
    reviews,
    gallery,
    faqs,
    services: db.services,
    rules: {
      cancellationHours: db.rules.cancellationHours,
      leadTimeHours: db.rules.leadTimeHours,
      horizonDays: db.rules.horizonDays,
      timezone: db.rules.timezone,
    },
    workingHours: db.workingHours,
    today: nowIn(db.rules.timezone).date,
    cardMode: isLiveStripe() ? 'live' : 'demo',
  };
}

/* --------------------------------------------------------- API: public */

async function handlePublicApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/site' && req.method === 'GET') {
    return json(res, 200, siteConfig());
  }

  if (p === '/api/availability' && req.method === 'GET') {
    const date = url.searchParams.get('date');
    const serviceId = url.searchParams.get('service');
    if (!isValidDate(date)) return json(res, 400, { error: 'A valid date is required.' });
    if (!getService(serviceId)) return json(res, 400, { error: 'A valid service is required.' });
    return json(res, 200, {
      date,
      dateLong: longDate(date),
      reason: dateClosedReason(date),
      slots: slotsFor(date, serviceId),
    });
  }

  if (p === '/api/month' && req.method === 'GET') {
    const month = url.searchParams.get('month');
    const serviceId = url.searchParams.get('service');
    if (!/^\d{4}-\d{2}$/.test(month || '')) return json(res, 400, { error: 'A valid month is required.' });
    if (!getService(serviceId)) return json(res, 400, { error: 'A valid service is required.' });
    return json(res, 200, monthSummary(month, serviceId));
  }

  if (p === '/api/bookings' && req.method === 'POST') {
    return createBooking(req, res);
  }

  if (p.startsWith('/api/bookings/') && req.method === 'GET') {
    const ref = decodeURIComponent(p.slice('/api/bookings/'.length)).toUpperCase();
    const booking = read().bookings.find((b) => b.ref === ref);
    if (!booking) return json(res, 404, { error: 'No booking found with that reference.' });
    return json(res, 200, publicBooking(booking));
  }

  if (p === '/api/pay/demo/complete' && req.method === 'POST') {
    const { ref } = await readJson(req);
    const booking = read().bookings.find((b) => b.ref === clean(ref, 24).toUpperCase());
    if (!booking) return json(res, 404, { error: 'No booking found with that reference.' });
    write(() => {
      booking.paymentStatus = 'deposit-paid';
      booking.status = 'confirmed';
      booking.paidAt = new Date().toISOString();
    });
    broadcast('bookings-changed', { date: booking.date });
    notifyNewBooking(booking);
    return json(res, 200, publicBooking(booking));
  }

  if (p === '/api/pay/stripe/verify' && req.method === 'POST') {
    const { ref } = await readJson(req).catch(() => ({}));
    const booking = read().bookings.find((b) => b.ref === clean(ref, 24).toUpperCase());
    if (!booking) return json(res, 404, { error: 'No booking found with that reference.' });
    if (!isLiveStripe() || !booking.stripeSessionId) {
      return json(res, 200, publicBooking(booking));
    }
    if (booking.paymentStatus === 'deposit-paid' || booking.paymentStatus === 'paid-in-full') {
      return json(res, 200, publicBooking(booking));
    }

    try {
      const session = await retrieveCheckoutSession(booking.stripeSessionId);
      if (session.payment_status === 'paid') {
        write(() => {
          booking.paymentStatus = 'deposit-paid';
          booking.status = 'confirmed';
          booking.paidAt = new Date().toISOString();
        });
        broadcast('bookings-changed', { date: booking.date });
        notifyNewBooking(booking);
      }
    } catch (err) {
      console.error('[stripe:verify]', err.message);
    }
    return json(res, 200, publicBooking(booking));
  }

  /**
   * Inspiration photos, attached to a booking that was just made.
   *
   * Guarded by a one-time token handed back by the booking itself, NOT by the
   * reference number. References are sequential — HBC-1001, 1002 — so anyone
   * could guess a live one and attach pictures to a stranger's appointment.
   * The token is random, used once, and cleared the moment it is spent.
   */
  if (/^\/api\/bookings\/[^/]+\/photos$/.test(p) && req.method === 'POST') {
    let body;
    try {
      // Photos arrive base64 in JSON, so the limit here is much larger than
      // the 64KB the rest of the API allows. It is still a hard cap.
      body = JSON.parse(await readBody(req, (MAX_PHOTOS + 1) * 6 * 1024 * 1024) || '{}');
    } catch (err) {
      return json(res, 400, { error: 'Those photos could not be read.' });
    }

    const ref = clean(decodeURIComponent(p.split('/')[3]), 24).toUpperCase();
    const booking = read().bookings.find((b) => b.ref === ref);
    if (!booking) return json(res, 404, { error: 'No booking found with that reference.' });

    const token = clean(body.token, 64);
    if (!booking.uploadToken || !token || token !== booking.uploadToken) {
      return json(res, 403, { error: 'That upload link is no longer valid.' });
    }

    const list = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : [];
    if (!list.length) return json(res, 400, { error: 'No photos were sent.' });

    const verified = [];
    for (const item of list) {
      const check = verifyPhoto(typeof item === 'string' ? item : item?.data);
      if (!check.ok) return json(res, 400, { error: check.error });
      verified.push(check);
    }

    let saved;
    try {
      saved = await savePhotos(booking.id, verified);
    } catch (err) {
      console.error('[photos]', err.message);
      return json(res, 500, { error: 'Those photos could not be saved.' });
    }

    write(() => {
      booking.photos = saved;
      // Spent. One booking, one upload.
      delete booking.uploadToken;
    });
    return json(res, 200, { count: saved.length });
  }

  return json(res, 404, { error: 'Unknown endpoint.' });
}

async function createBooking(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  const serviceId = clean(payload.serviceId, 60);
  const date = clean(payload.date, 10);
  const start = clean(payload.start, 5);
  const payment = payload.payment === 'card' ? 'card' : 'cash';

  const name = clean(payload.name, 80);
  const email = clean(payload.email, 120).toLowerCase();
  const phone = clean(payload.phone, 20);
  const notes = clean(payload.notes, 600);
  /**
   * How many inspiration photos are about to follow. Only a hint: the photos
   * upload after the booking exists, which is deliberate — a failed photo must
   * never cost someone their slot — but that timing would otherwise send the
   * "new booking" email with no sign that pictures are on their way.
   * Unverified by design; the worst a wrong number does is have her glance at
   * a booking and find nothing attached.
   */
  const photosToFollow = Math.min(Math.max(Number(payload.photoCount) || 0, 0), MAX_PHOTOS);

  if (name.length < 2) return json(res, 400, { error: 'Please enter your full name.' });
  if (!isEmail(email)) return json(res, 400, { error: 'Please enter a valid email address.' });
  if (!isPhone(phone)) return json(res, 400, { error: 'Please enter a valid phone number.' });
  if (!isValidDate(date)) return json(res, 400, { error: 'Please choose a date.' });
  if (toMinutes(start) == null) return json(res, 400, { error: 'Please choose a time.' });

  const check = validateSlot(date, start, serviceId);
  if (!check.ok) return json(res, 409, { error: check.error });

  const { service, startMin, endMin } = check;

  /**
   * Three shapes, because her price list has three:
   *
   *   price on request  — extensions. Nothing to charge until it is quoted, so
   *                       the appointment is held and no payment is offered.
   *   deposit set       — a deposit online, balance in the studio.
   *   no deposit        — her styling prices are small, so paying by card means
   *                       paying the whole thing now. A zero-value checkout
   *                       would be rejected by Stripe anyway.
   */
  const quoted = Boolean(service.priceOnRequest);
  const total = quoted ? 0 : service.price;
  const wantsCard = payment === 'card' && !quoted && total > 0;
  const depositDue = wantsCard ? (service.deposit > 0 ? Math.min(service.deposit, total) : total) : 0;
  const balanceDue = total - depositDue;
  // A quoted service cannot take a card payment, so it is always held as cash.
  const effectivePayment = wantsCard ? 'card' : 'cash';

  const booking = {
    id: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    ref: nextRef(),
    serviceId: service.id,
    serviceName: service.name,
    date,
    start,
    end: toHHMM(endMin),
    startMin,
    endMin,
    duration: service.duration,
    client: { name, email, phone, notes },
    photosToFollow,
    total,
    priceOnRequest: quoted,
    depositDue,
    balanceDue,
    payment: effectivePayment,
    // Cash bookings are confirmed immediately. Card bookings wait for payment.
    paymentStatus: effectivePayment === 'cash' ? (quoted ? 'to-be-quoted' : 'due-in-studio') : 'awaiting-deposit',
    status: effectivePayment === 'cash' ? 'confirmed' : 'pending-payment',
    createdAt: new Date().toISOString(),
    /**
     * One-time permission to attach inspiration photos to THIS booking.
     * Handed back once, in the response to the person who just booked, and
     * deleted the moment it is used. Booking references are sequential and
     * therefore guessable; this is not.
     */
    uploadToken: crypto.randomBytes(24).toString('base64url'),
  };

  write((db) => db.bookings.push(booking));

  /*
   * Do not tell anyone they are booked until the booking is actually stored.
   *
   * write() schedules the persist rather than awaiting it, which is right for
   * a setting or an admin note. It is wrong here. If the database is
   * unreachable, a fire-and-forget write would return a cheerful 201, the
   * client would screenshot their confirmation, and Chrissy would have no
   * record of them — the single failure this whole application exists to
   * prevent. So the slot is given up and the client told the truth instead.
   */
  try {
    await commit();
  } catch (err) {
    console.error('[booking] could not be saved:', err.message);
    write((db) => {
      const i = db.bookings.indexOf(booking);
      if (i !== -1) db.bookings.splice(i, 1);
    });
    return json(res, 503, {
      error: 'We could not save your booking just now. Nothing has been taken — please try again in a moment.',
    });
  }

  broadcast('bookings-changed', { date });

  if (effectivePayment === 'cash') {
    notifyNewBooking(booking);
    return json(res, 201, { booking: publicBooking(booking), next: 'confirmed', uploadToken: booking.uploadToken });
  }

  // Card: hand back a checkout URL — real Stripe if configured, demo page if not.
  if (isLiveStripe()) {
    try {
      const session = await createCheckoutSession(booking, service);
      write(() => {
        booking.stripeSessionId = session.sessionId;
      });
      return json(res, 201, { booking: publicBooking(booking), next: 'checkout', checkoutUrl: session.url, uploadToken: booking.uploadToken });
    } catch (err) {
      console.error('[stripe]', err.message);
      // Don't strand the client — hold the slot and let them pay in studio.
      write(() => {
        booking.payment = 'cash';
        booking.paymentStatus = 'due-in-studio';
        booking.balanceDue = booking.total;
        booking.depositDue = 0;
        booking.status = 'confirmed';
        booking.paymentNote = 'Card checkout unavailable at time of booking.';
      });
      broadcast('bookings-changed', { date });
      notifyNewBooking(booking);
      return json(res, 201, {
        booking: publicBooking(booking),
        next: 'confirmed',
        warning: 'Card payment was unavailable, so your slot is held for payment in the studio.',
      });
    }
  }

  return json(res, 201, {
    booking: publicBooking(booking),
    next: 'checkout',
    // Relative and with the extension, so it resolves on a static host as
    // well as under Node. Root-absolute sent the client to the SITE origin's
    // /pay-demo, which does not exist once the two are split across hosts.
    checkoutUrl: `./pay-demo.html?ref=${booking.ref}`,
    demo: true,
    uploadToken: booking.uploadToken,
  });
}

/* ---------------------------------------------------------- API: admin */

async function handleAdminApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/admin/login' && req.method === 'POST') {
    const { password } = await readJson(req).catch(() => ({}));
    if (!checkPassword(password)) {
      return json(res, 401, { error: 'Incorrect password.' });
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(makeToken(), req) });
  }

  if (p === '/api/admin/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
  }

  if (p === '/api/admin/session' && req.method === 'GET') {
    return json(res, 200, { authenticated: isAdmin(req), defaultPassword: usingDefaultPassword() });
  }

  if (!isAdmin(req)) return json(res, 401, { error: 'Please sign in.' });

  const db = read();

  if (p === '/api/admin/state' && req.method === 'GET') {
    const today = nowIn(db.rules.timezone).date;
    const bookings = [...db.bookings].sort((a, b) =>
      a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
    );
    return json(res, 200, {
      workingHours: db.workingHours,
      blockedDates: [...db.blockedDates].sort((a, b) => (a.date < b.date ? -1 : 1)),
      services: db.services,
      rules: db.rules,
      bookings: bookings.map((b) => ({
        ...publicBooking(b),
        id: b.id,
        client: b.client,
        createdAt: b.createdAt,
        // Her own working record of the appointment, never shown to clients.
        adminNote: b.adminNote || '',
        source: b.source || 'online',
        completedAt: b.completedAt || null,
        noShowAt: b.noShowAt || null,
        rescheduledFrom: b.rescheduledFrom || null,
        // Names only. The bytes come back through the authenticated route
        // below, never through this payload and never from public/.
        photos: (b.photos || []).map((ph) => ph.file),
      })),
      today,
      cardMode: isLiveStripe() ? 'live' : 'demo',
      defaultPassword: usingDefaultPassword(),
    });
  }

  if (p === '/api/admin/hours' && req.method === 'PUT') {
    const body = await readJson(req);
    const incoming = body.workingHours;
    if (!incoming || typeof incoming !== 'object') return json(res, 400, { error: 'No hours supplied.' });

    const next = {};
    for (let d = 0; d <= 6; d += 1) {
      const src = incoming[String(d)] || incoming[d] || {};
      const start = clean(src.start, 5);
      const end = clean(src.end, 5);
      const breakStart = clean(src.breakStart, 5);
      const breakEnd = clean(src.breakEnd, 5);
      const open = Boolean(src.open);

      if (open) {
        const s = toMinutes(start);
        const e = toMinutes(end);
        if (s == null || e == null) return json(res, 400, { error: `Day ${d}: times must be in HH:MM format.` });
        if (e <= s) return json(res, 400, { error: `Day ${d}: closing time must be after opening time.` });
        if (breakStart || breakEnd) {
          const bs = toMinutes(breakStart);
          const be = toMinutes(breakEnd);
          if (bs == null || be == null) return json(res, 400, { error: `Day ${d}: break times must be in HH:MM format.` });
          if (be <= bs) return json(res, 400, { error: `Day ${d}: break end must be after break start.` });
          if (bs < s || be > e) return json(res, 400, { error: `Day ${d}: the break must sit inside opening hours.` });
        }
      }
      next[String(d)] = { open, start, end, breakStart, breakEnd };
    }

    write((d) => {
      d.workingHours = next;
    });
    broadcast('availability-changed', {});
    return json(res, 200, { workingHours: next });
  }

  if (p === '/api/admin/rules' && req.method === 'PUT') {
    const body = await readJson(req);
    const num = (v, fallback, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
    };
    write((d) => {
      d.rules.slotInterval = num(body.slotInterval, d.rules.slotInterval, 5, 120);
      d.rules.leadTimeHours = num(body.leadTimeHours, d.rules.leadTimeHours, 0, 720);
      d.rules.horizonDays = num(body.horizonDays, d.rules.horizonDays, 1, 365);
      d.rules.bufferMins = num(body.bufferMins, d.rules.bufferMins, 0, 120);
      d.rules.cancellationHours = num(body.cancellationHours, d.rules.cancellationHours, 0, 336);
    });
    broadcast('availability-changed', {});
    return json(res, 200, { rules: read().rules });
  }

  if (p === '/api/admin/blocked-dates' && req.method === 'POST') {
    const body = await readJson(req);
    const from = clean(body.date, 10);
    const to = clean(body.until, 10) || from;
    const reason = clean(body.reason, 80) || 'Unavailable';
    if (!isValidDate(from) || !isValidDate(to)) return json(res, 400, { error: 'Please choose valid dates.' });
    if (to < from) return json(res, 400, { error: 'The end date must be on or after the start date.' });

    const added = [];
    write((d) => {
      for (let cur = from; cur <= to; cur = addDays(cur, 1)) {
        if (!d.blockedDates.some((b) => b.date === cur)) {
          d.blockedDates.push({ date: cur, reason });
          added.push(cur);
        }
        if (added.length > 366) break;
      }
    });
    broadcast('availability-changed', {});
    return json(res, 200, { added, blockedDates: read().blockedDates });
  }

  if (p === '/api/admin/blocked-dates' && req.method === 'DELETE') {
    const date = clean(url.searchParams.get('date'), 10);
    write((d) => {
      d.blockedDates = d.blockedDates.filter((b) => b.date !== date);
    });
    broadcast('availability-changed', {});
    return json(res, 200, { blockedDates: read().blockedDates });
  }

  if (p === '/api/admin/services' && req.method === 'PUT') {
    const body = await readJson(req);
    const incoming = Array.isArray(body.services) ? body.services : null;
    if (!incoming) return json(res, 400, { error: 'No services supplied.' });

    const next = [];
    for (const s of incoming.slice(0, 60)) {
      const name = clean(s.name, 80);
      if (!name) continue;
      const id = clean(s.id, 60) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const duration = Math.max(15, Math.min(600, Math.round(Number(s.duration) || 60)));
      const price = Math.max(0, Math.round(Number(s.price) || 0));
      const deposit = Math.max(0, Math.min(price, Math.round(Number(s.deposit) || 0)));
      if (next.some((x) => x.id === id)) continue;
      next.push({
        id,
        name,
        category: clean(s.category, 40).toUpperCase() || 'EXTENSIONS',
        duration,
        price,
        priceOnRequest: Boolean(s.priceOnRequest),
        deposit,
        blurb: clean(s.blurb, 300),
      });
    }
    if (!next.length) return json(res, 400, { error: 'Keep at least one service.' });

    write((d) => {
      d.services = next;
    });
    broadcast('availability-changed', {});
    return json(res, 200, { services: next });
  }

  /* ---------------------------------------------------- notifications */

  if (p === '/api/admin/notifications' && req.method === 'GET') {
    const hour = Number(process.env.DAY_AHEAD_HOUR);
    return json(res, 200, {
      channels: channelStatus(),
      log: recentNotifications(20),
      dayAhead: {
        enabled: Number.isInteger(hour) && hour >= 0 && hour <= 23,
        hour: Number.isInteger(hour) ? hour : null,
        sentFor: db.dayAheadSentFor || null,
        today: nowIn(db.rules.timezone).date,
      },
      vapidPublicKey: getVapid().publicKey,
      devices: listSubscriptions().map((sub) => ({
        id: sub.id,
        label: sub.label,
        createdAt: sub.createdAt,
        lastOk: sub.lastOk,
        failures: sub.failures,
        host: (() => { try { return new URL(sub.endpoint).host; } catch { return 'unknown'; } })(),
      })),
    });
  }

  /**
   * Called by the service worker when a push wakes it. The push itself carries
   * no payload, so no client's name or number ever passes through Google's or
   * Apple's push service — the worker comes back here, authenticated, for the
   * detail.
   */
  if (p === '/api/admin/notifications/latest' && req.method === 'GET') {
    const latest = latestNotification();
    if (!latest) return json(res, 200, { title: 'New booking', body: 'Open your dashboard to see it.' });
    return json(res, 200, { title: latest.title, body: latest.body, ref: latest.ref, at: latest.at });
  }

  if (p === '/api/admin/notifications/test' && req.method === 'POST') {
    const entry = await notify({
      kind: 'test',
      title: 'Test notification',
      body: 'If you can read this, alerts are reaching you. A real booking looks like this, with the client, service, time and how they are paying.',
    });
    broadcast('notification', {});
    return json(res, 200, { notification: entry });
  }

  /**
   * Send today's run-down on demand. Useful as a real test — it exercises
   * every channel with a message shaped like the ones she will actually get,
   * rather than a line of filler — and useful in its own right on a morning
   * she wants it again after clearing the notification.
   */
  if (p === '/api/admin/notifications/day-ahead' && req.method === 'POST') {
    const today = nowIn(db.rules.timezone).date;
    const list = db.bookings
      .filter((b) => b.date === today && b.status !== 'cancelled' && b.status !== 'expired')
      .sort((a, b) => a.startMin - b.startMin);
    const entry = await notify(dayAheadMessage(longDate(today), list));
    broadcast('notification', {});
    return json(res, 200, { notification: entry });
  }

  if (p === '/api/admin/push/subscribe' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      const record = saveSubscription(body.subscription, clean(body.label, 60));
      return json(res, 200, { device: { id: record.id, label: record.label } });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (p === '/api/admin/push/unsubscribe' && req.method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    removeSubscription({ endpoint: clean(body.endpoint, 500), id: clean(body.id, 60) });
    return json(res, 200, { devices: listSubscriptions().length });
  }

  /**
   * A booking Chrissy places herself.
   *
   * Most of her enquiries arrive as Instagram DMs, not through the website,
   * and until now there was nowhere to put them. That is not a convenience
   * gap: an appointment she has agreed to but not recorded is a slot the
   * public calendar is still selling, so the first thing this fixes is
   * double bookings.
   *
   * She is allowed to override her own hours, notice period and time off —
   * those are business decisions. She is never allowed to override a clash.
   */
  if (p === '/api/admin/bookings' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    const serviceId = clean(body.serviceId, 60);
    const date = clean(body.date, 10);
    const start = clean(body.start, 5);
    const name = clean(body.name, 80);
    // Taken over the phone, so an email is genuinely optional — she may only
    // have a number. A phone number is the one contact detail she must hold.
    const email = clean(body.email, 120).toLowerCase();
    const phone = clean(body.phone, 20);
    const notes = clean(body.notes, 600);
    const adminNote = clean(body.adminNote, 600);
    const paidNow = body.paid === true;

    if (name.length < 2) return json(res, 400, { error: 'Give the client a name.' });
    if (email && !isEmail(email)) return json(res, 400, { error: 'That email address does not look right.' });
    if (!isPhone(phone)) return json(res, 400, { error: 'Give a contact number for the client.' });
    if (!isValidDate(date)) return json(res, 400, { error: 'Choose a date.' });

    const durationOverride = Number(body.duration);
    const check = validateAdminSlot(date, start, serviceId, {
      duration: Number.isFinite(durationOverride) ? durationOverride : null,
    });
    if (!check.ok) return json(res, 409, { error: check.error });

    // Warnings are surfaced once and only once. She confirms, and it goes in.
    if (check.warnings.length && body.override !== true) {
      return json(res, 409, { error: 'Confirm before this is booked.', warnings: check.warnings, needsOverride: true });
    }

    const { service, startMin, endMin, duration } = check;
    const quoted = Boolean(service.priceOnRequest);
    const total = quoted ? 0 : service.price;

    const booking = {
      id: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      ref: nextRef(),
      serviceId: service.id,
      serviceName: service.name,
      date,
      start: toHHMM(startMin),
      end: toHHMM(endMin),
      startMin,
      endMin,
      duration,
      client: { name, email, phone, notes },
      total,
      priceOnRequest: quoted,
      depositDue: 0,
      balanceDue: paidNow ? 0 : total,
      payment: 'cash',
      paymentStatus: quoted ? 'to-be-quoted' : paidNow ? 'paid-in-full' : 'due-in-studio',
      status: 'confirmed',
      source: 'manual',
      adminNote,
      createdAt: new Date().toISOString(),
      ...(paidNow ? { paidAt: new Date().toISOString() } : {}),
      ...(check.warnings.length ? { overrides: check.warnings } : {}),
    };

    write((db) => db.bookings.push(booking));
    broadcast('bookings-changed', { date });
    // No notification: she is standing there, she knows.
    return json(res, 201, { booking: publicBooking(booking), id: booking.id, warnings: check.warnings });
  }

  /**
   * Her bookings as a spreadsheet. One-person businesses do their books in
   * a spreadsheet, and re-typing a year of appointments out of a web page
   * is how figures get wrong.
   */
  if (p === '/api/admin/bookings.csv' && req.method === 'GET') {
    const cell = (v) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [
      ['Date', 'Start', 'End', 'Client', 'Phone', 'Email', 'Service', 'Minutes', 'Total', 'Owed', 'Payment', 'Status', 'Source', 'Reference', 'Booked at', 'Your note'],
      ...[...db.bookings]
        .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
        .map((b) => [
          b.date, b.start, b.end,
          b.client?.name, b.client?.phone, b.client?.email,
          b.serviceName,
          b.duration,
          b.priceOnRequest ? 'On request' : b.total,
          b.balanceDue,
          b.payment,
          b.status,
          b.source || 'online',
          b.ref,
          b.createdAt,
          b.adminNote || '',
        ]),
    ];
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const stamp = nowIn(db.rules.timezone).date;
    return send(res, 200, `﻿${csv}`, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hairbychrissy-bookings-${stamp}.csv"`,
      ...(res._cors || {}),
    });
  }

  /**
   * One inspiration photo, for the dashboard.
   *
   * This is the only way the bytes ever leave the server. They live in
   * data/uploads, outside public/, so nothing serves them by accident, and
   * this route sits behind the same session check as the rest of the
   * dashboard — the client sent them to Chrissy, not to the internet.
   */
  if (/^\/api\/admin\/bookings\/[^/]+\/photos\/[^/]+$/.test(p) && req.method === 'GET') {
    const [, , , , id, , file] = p.split('/');
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) return json(res, 404, { error: 'Booking not found.' });

    const record = (booking.photos || []).find((ph) => ph.file === file);
    if (!record) return json(res, 404, { error: 'No such photo.' });

    const buf = await readPhoto(booking.id, record.file);
    if (!buf) return json(res, 404, { error: 'That photo could not be found.' });

    return send(res, 200, buf, {
      'Content-Type': record.mime,
      'Content-Length': buf.length,
      // Belt and braces: even though the type was verified by reading the
      // file, the browser is told not to second-guess it.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'",
      'Cache-Control': 'private, max-age=300',
      ...(res._cors || {}),
    });
  }

  if (p.startsWith('/api/admin/bookings/') && req.method === 'POST') {
    const [, , , , id, action] = p.split('/');
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) return json(res, 404, { error: 'Booking not found.' });

    if (action === 'cancel') {
      const wasUpcoming = booking.date >= nowIn(db.rules.timezone).date;
      write(() => {
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
      });
      broadcast('bookings-changed', { date: booking.date });
      // Worth a record in the log either way, but only worth interrupting her
      // for an appointment that had not happened yet.
      if (wasUpcoming) {
        const note = cancellationMessage({ ...booking, dateLong: longDate(booking.date) }, getService(booking.serviceId));
        notify(note).then(() => broadcast('notification', {})).catch((err) => console.error('[notify]', err.message));
      }
      return json(res, 200, { booking: publicBooking(booking) });
    }

    if (action === 'mark-paid') {
      write(() => {
        booking.paymentStatus = 'paid-in-full';
        booking.balanceDue = 0;
        booking.status = booking.status === 'cancelled' ? 'cancelled' : 'confirmed';
        booking.paidAt = new Date().toISOString();
      });
      return json(res, 200, { booking: publicBooking(booking) });
    }

    if (action === 'confirm') {
      write(() => {
        booking.status = 'confirmed';
      });
      broadcast('bookings-changed', { date: booking.date });
      return json(res, 200, { booking: publicBooking(booking) });
    }

    /**
     * Moving an appointment rather than cancelling and re-booking it. A
     * client who rings to change the day should not lose their slot to the
     * public calendar in the seconds between the two operations, and should
     * not end up with a second reference number for the same appointment.
     */
    if (action === 'reschedule') {
      let body;
      try {
        body = await readJson(req);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
      const date = clean(body.date, 10);
      const start = clean(body.start, 5);
      if (!isValidDate(date)) return json(res, 400, { error: 'Choose a date to move it to.' });

      const check = validateAdminSlot(date, start, booking.serviceId, {
        ignoreId: booking.id,
        duration: booking.duration,
      });
      if (!check.ok) return json(res, 409, { error: check.error });
      if (check.warnings.length && body.override !== true) {
        return json(res, 409, { error: 'Confirm before this is moved.', warnings: check.warnings, needsOverride: true });
      }

      const from = { date: booking.date, start: booking.start };
      write(() => {
        booking.rescheduledFrom = from;
        booking.date = date;
        booking.start = toHHMM(check.startMin);
        booking.end = toHHMM(check.endMin);
        booking.startMin = check.startMin;
        booking.endMin = check.endMin;
        booking.rescheduledAt = new Date().toISOString();
      });
      // Both days changed: the old slot is free again and the new one is not.
      broadcast('bookings-changed', { dates: [...new Set([from.date, date])] });
      return json(res, 200, { booking: publicBooking(booking), warnings: check.warnings });
    }

    /**
     * Closing an appointment off after the fact. Without this every past
     * booking reads the same as every other, and there is no record of who
     * did not turn up — which is exactly the client she wants a deposit from
     * next time.
     */
    if (action === 'complete' || action === 'no-show') {
      write(() => {
        booking.status = action === 'complete' ? 'completed' : 'no-show';
        booking[action === 'complete' ? 'completedAt' : 'noShowAt'] = new Date().toISOString();
        // Any outstanding balance is left exactly as it was. Marking an
        // appointment done says it happened, not that it was paid for, and
        // quietly clearing what she is owed would be the wrong guess.
      });
      return json(res, 200, { booking: publicBooking(booking) });
    }

    /**
     * Putting a booking back. The clash check matters more here than anywhere:
     * the moment she cancelled, that slot went back on sale, and the website
     * may well have sold it since. Reopening without checking would put two
     * clients in the chair — the one thing nothing in here is allowed to do.
     */
    if (action === 'reopen') {
      const taken = clashesWith(booking.date, booking.startMin, booking.endMin, booking.id)[0];
      if (taken) {
        return json(res, 409, {
          error: `That time has gone — ${taken.client?.name || 'someone else'} is booked in at ${taken.start}. Add it again at another time.`,
        });
      }
      write(() => {
        booking.status = 'confirmed';
        delete booking.completedAt;
        delete booking.noShowAt;
        delete booking.cancelledAt;
      });
      broadcast('bookings-changed', { date: booking.date });
      return json(res, 200, { booking: publicBooking(booking) });
    }

    /** Her own note on the appointment — colour formula, hair ordered, who
     *  referred them. Never sent to the client and never shown on the site. */
    if (action === 'note') {
      let body;
      try {
        body = await readJson(req);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
      write(() => {
        booking.adminNote = clean(body.note, 600);
      });
      return json(res, 200, { booking: publicBooking(booking), adminNote: booking.adminNote });
    }

    return json(res, 400, { error: 'Unknown action.' });
  }

  return json(res, 404, { error: 'Unknown endpoint.' });
}

/* ------------------------------------------- abandoned checkout cleanup */

/**
 * A card booking holds its slot while the client is on the checkout page.
 * If they close the tab and never pay, that slot must come back — otherwise
 * one abandoned checkout blocks a four-hour appointment forever.
 */
const HOLD_MINUTES = 20;

function releaseAbandonedHolds() {
  const cutoff = Date.now() - HOLD_MINUTES * 60 * 1000;
  const released = [];
  write((db) => {
    for (const b of db.bookings) {
      if (b.status === 'pending-payment' && Date.parse(b.createdAt) < cutoff) {
        b.status = 'expired';
        b.expiredAt = new Date().toISOString();
        released.push(b.date);
      }
    }
  });
  if (released.length) {
    broadcast('bookings-changed', { dates: [...new Set(released)] });
  }
}

setInterval(releaseAbandonedHolds, 60 * 1000).unref();
releaseAbandonedHolds();

/* ------------------------------------------------ the morning run-down */

/**
 * One email a morning listing the day ahead.
 *
 * Every other notification here fires at the moment a booking is made, which
 * is exactly when she is least able to read it — mid-fitting, hands full. The
 * day-ahead is the one that catches an appointment booked three weeks ago and
 * forgotten since, so it is the one most likely to earn its keep.
 *
 * Set DAY_AHEAD_HOUR to the hour she wants it (0–23, her local time), or
 * leave it unset to turn the whole thing off. The check runs every minute and
 * a flag in the database makes it idempotent, so a restart at 07:59 does not
 * send it twice and a restart at 08:30 still sends it once.
 */
function sendDayAhead() {
  const hour = Number(process.env.DAY_AHEAD_HOUR);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;

  const db = read();
  const now = nowIn(db.rules.timezone);
  if (now.minutes < hour * 60) return;

  const today = now.date;
  if (db.dayAheadSentFor === today) return;

  const bookings = db.bookings
    .filter((b) => b.date === today && b.status !== 'cancelled' && b.status !== 'expired')
    .sort((a, b) => a.startMin - b.startMin);

  // Written before sending, not after: a failing email service must not turn
  // into an email every minute for the rest of the day.
  write((d) => { d.dayAheadSentFor = today; });

  notify(dayAheadMessage(longDate(today), bookings))
    .then(() => broadcast('notification', {}))
    .catch((err) => console.error('[day-ahead]', err.message));
}

setInterval(sendDayAhead, 60 * 1000).unref();
sendDayAhead();

/* ------------------------------------------------------------- routing */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    // Stash the CORS headers for this request so every json() reply carries them.
    res._cors = corsHeaders(req);

    if (req.method === 'OPTIONS' && p.startsWith('/api/')) {
      return send(res, 204, '', res._cors);
    }

    /*
     * Health check, for whatever is watching the process — Render, an uptime
     * monitor, a load balancer. Above the /api/ dispatch because it is not a
     * client API and should not answer to the CORS allowlist.
     *
     * It reports the storage backend and the booking count, because "the
     * process is listening" is the least interesting thing that could be
     * wrong. The app refuses to boot on an unreachable database, so a 200
     * here means the data genuinely loaded. It says nothing about who is
     * booked — this endpoint is public.
     */
    if (p === '/health' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        storage: backend(),
        bookings: read().bookings.length,
        cardMode: isLiveStripe() ? 'live' : 'demo',
        uptime: Math.round(process.uptime()),
      });
    }

    if (p === '/api/stream') return handleStream(req, res);
    if (p.startsWith('/api/admin/')) return await handleAdminApi(req, res, url);
    if (p.startsWith('/api/')) return await handlePublicApi(req, res, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (p === '/' || p === '/index.html') return servePage(res, 'index.html');
    if (p === '/admin' || p === '/admin/') return servePage(res, 'admin.html');
    if (p === '/confirmed') return servePage(res, 'confirmed.html');
    /*
     * One path segment, not two.
     *
     * This page was served at /pay/demo, which is two directories deep, so
     * every relative asset on it — the stylesheet included — resolved to
     * /pay/css/... and 404'd. The demo checkout has been rendering as
     * unstyled black-on-white HTML for every client who chose to pay by card.
     * Relative paths are not optional here: the same files are published to
     * GitHub Pages under a /Hairbychrissy/ subpath, so they cannot be made
     * root-absolute. The page moves to the same depth as every other page
     * instead, and the old URL redirects so any link already sent still lands.
     */
    if (p === '/book' || p === '/book.html') return servePage(res, 'book.html');
    if (p === '/pay-demo') return servePage(res, 'pay-demo.html');
    if (p === '/pay/demo') {
      return send(res, 301, '', { Location: `/pay-demo${url.search}` });
    }
    if (p === '/booking') return servePage(res, 'confirmed.html');

    return serveStatic(res, p);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
    res.end();
  }
});

/*
 * Load the data BEFORE accepting a request, and refuse to start if it cannot
 * be loaded. An app that comes up healthy on an empty database is worse than
 * one that does not come up: the first write would overwrite every real
 * booking with nothing, and the only symptom until then is a quiet diary.
 */
try {
  await initStore();
} catch (err) {
  console.error('');
  console.error('  Could not load the bookings database. Refusing to start.');
  console.error(`  ${err.message}`);
  console.error('');
  console.error(supabaseDiagnosis());
  console.error('');
  console.error('  Starting on an empty database would overwrite real bookings,');
  console.error('  so this is deliberate. Nothing has been changed in Supabase.');
  console.error('');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log('');
  console.log('  H A I R  B Y  C H R I S S Y — booking platform');
  console.log(`  client site  ${publicUrl().replace(/:\d+$/, '')}:${PORT}/`);
  console.log(`  admin        http://localhost:${PORT}/admin`);
  console.log(`  card mode    ${isLiveStripe() ? 'LIVE (Stripe)' : 'DEMO (no real payments)'}`);
  // Whether she gets told about a booking is not something to leave implicit.
  const emailOn = Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO);
  const dayHour = Number(process.env.DAY_AHEAD_HOUR);
  console.log(`  email        ${emailOn
    ? `on — ${process.env.NOTIFY_EMAIL_TO}`
    : `OFF — she will NOT be told about bookings (${!process.env.RESEND_API_KEY && !process.env.NOTIFY_EMAIL_TO
        ? 'set RESEND_API_KEY and NOTIFY_EMAIL_TO'
        : !process.env.RESEND_API_KEY ? 'set RESEND_API_KEY' : 'set NOTIFY_EMAIL_TO'})`}`);
  console.log(`  run-down     ${Number.isInteger(dayHour) && dayHour >= 0 && dayHour <= 23
    ? `each morning around ${String(dayHour).padStart(2, '0')}:00`
    : 'off (set DAY_AHEAD_HOUR)'}`);
  /*
   * Where the bookings are written. Printed because the way this goes wrong
   * in production is silent: the app runs, takes bookings, answers every
   * request correctly, and loses the lot on the next deploy because DATA_DIR
   * was never pointed at a mounted disk. A line at startup is the difference
   * between noticing on day one and noticing when a client turns up.
   */
  console.log(`  bookings     ${backend() === 'supabase'
    ? `Supabase — ${read().bookings.length} loaded`
    : `local file — ${DATA_DIR}${DATA_DIR_IS_DEFAULT ? '  (default — set DATA_DIR to a persistent disk, or configure Supabase)' : ''}`}`);
  if (usingDefaultPassword()) {
    console.log('  admin password: "chrissy"  — set ADMIN_PASSWORD before going live');
  }
  console.log('');
});

/*
 * A deploy is a SIGTERM. Persisting is now a network call rather than a file
 * write, so the last booking is only safe if we WAIT for it — the old
 * fire-and-forget flush would have raced the process exit and lost it.
 *
 * The grace window is generous enough for a round trip and short enough that
 * a hung database cannot stop the process going away. flush() falls back to
 * writing a local copy if the network call fails.
 */
let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    const escape = setTimeout(() => process.exit(0), 8000).unref();
    await flush();
    clearTimeout(escape);
    process.exit(0);
  });
}
