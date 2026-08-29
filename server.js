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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { read, write, nextRef, flush } from './lib/store.js';
import { brand, reviews, gallery, faqs, offers, transformations, reels } from './lib/seed.js';
import { slotsFor, monthSummary, validateSlot, getService, dateClosedReason } from './lib/availability.js';
import { isValidDate, toMinutes, toHHMM, longDate, nowIn, addDays } from './lib/time.js';
import { checkPassword, makeToken, isAdmin, sessionCookie, clearCookie, usingDefaultPassword } from './lib/auth.js';
import { isLiveStripe, createCheckoutSession, retrieveCheckoutSession, publicUrl } from './lib/payments.js';
import {
  notify, bookingMessage, getVapid, saveSubscription, removeSubscription,
  listSubscriptions, channelStatus, recentNotifications, latestNotification,
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
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
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
 * Tell Chrissy about a booking. Deliberately fire-and-forget: a slow webhook
 * or an unreachable push service must never delay or fail a client's
 * confirmation, so nothing here is awaited.
 */
function notifyNewBooking(booking) {
  const service = getService(booking.serviceId);
  const message = bookingMessage({ ...booking, dateLong: longDate(booking.date) }, service);
  notify(message)
    .then(() => broadcast('notification', {}))
    .catch((err) => console.error('[notify]', err.message));
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
    total,
    priceOnRequest: quoted,
    depositDue,
    balanceDue,
    payment: effectivePayment,
    // Cash bookings are confirmed immediately. Card bookings wait for payment.
    paymentStatus: effectivePayment === 'cash' ? (quoted ? 'to-be-quoted' : 'due-in-studio') : 'awaiting-deposit',
    status: effectivePayment === 'cash' ? 'confirmed' : 'pending-payment',
    createdAt: new Date().toISOString(),
  };

  write((db) => db.bookings.push(booking));
  broadcast('bookings-changed', { date });

  if (effectivePayment === 'cash') {
    notifyNewBooking(booking);
    return json(res, 201, { booking: publicBooking(booking), next: 'confirmed' });
  }

  // Card: hand back a checkout URL — real Stripe if configured, demo page if not.
  if (isLiveStripe()) {
    try {
      const session = await createCheckoutSession(booking, service);
      write(() => {
        booking.stripeSessionId = session.sessionId;
      });
      return json(res, 201, { booking: publicBooking(booking), next: 'checkout', checkoutUrl: session.url });
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
    checkoutUrl: `/pay/demo?ref=${booking.ref}`,
    demo: true,
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
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(makeToken()) });
  }

  if (p === '/api/admin/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
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
      bookings: bookings.map((b) => ({ ...publicBooking(b), id: b.id, client: b.client, createdAt: b.createdAt })),
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
    return json(res, 200, {
      channels: channelStatus(),
      log: recentNotifications(20),
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

  if (p.startsWith('/api/admin/bookings/') && req.method === 'POST') {
    const [, , , , id, action] = p.split('/');
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) return json(res, 404, { error: 'Booking not found.' });

    if (action === 'cancel') {
      write(() => {
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();
      });
      broadcast('bookings-changed', { date: booking.date });
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

    if (p === '/api/stream') return handleStream(req, res);
    if (p.startsWith('/api/admin/')) return await handleAdminApi(req, res, url);
    if (p.startsWith('/api/')) return await handlePublicApi(req, res, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (p === '/' || p === '/index.html') return servePage(res, 'index.html');
    if (p === '/admin' || p === '/admin/') return servePage(res, 'admin.html');
    if (p === '/confirmed') return servePage(res, 'confirmed.html');
    if (p === '/pay/demo') return servePage(res, 'pay-demo.html');
    if (p === '/booking') return servePage(res, 'confirmed.html');

    return serveStatic(res, p);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) return json(res, 500, { error: 'Something went wrong. Please try again.' });
    res.end();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  H A I R  B Y  C H R I S S Y — booking platform');
  console.log(`  client site  ${publicUrl().replace(/:\d+$/, '')}:${PORT}/`);
  console.log(`  admin        http://localhost:${PORT}/admin`);
  console.log(`  card mode    ${isLiveStripe() ? 'LIVE (Stripe)' : 'DEMO (no real payments)'}`);
  if (usingDefaultPassword()) {
    console.log('  admin password: "chrissy"  — set ADMIN_PASSWORD before going live');
  }
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
