/**
 * Notifications — "don't miss a booking".
 *
 * Every channel is optional and configured by environment variable, so the app
 * runs with none of them set. They fire in parallel and never block or fail a
 * booking: a client must never see an error because a webhook was slow.
 *
 *   dashboard  always on. The open dashboard chimes and raises a desktop
 *              notification off the existing live event stream.
 *   web push   the important one — reaches her phone with the site closed.
 *              Self-hosted, free, no third party. Keys are generated on first
 *              run and kept in the database.
 *   email      via Resend's HTTP API (RESEND_API_KEY).
 *   webhook    any URL — Slack, Discord, Zapier, IFTTT (NOTIFY_WEBHOOK_URL).
 *   telegram   free instant phone push (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
 *   sms        via Twilio, for when nothing else may be missed.
 *
 * Web Push is sent WITHOUT a payload. That avoids the aes128gcm encryption
 * dance entirely, and means no client's name or number is ever handed to
 * Google's or Apple's push service. The service worker wakes, authenticates
 * against this server with the stylist's own session cookie and fetches the
 * details itself.
 */
import crypto from 'node:crypto';
import { read, write } from './store.js';
import { brand } from './seed.js';

const LOG_LIMIT = 100;

/* ----------------------------------------------------------------- VAPID */

/** Generated once, then reused. Rotating these invalidates every subscription. */
export function getVapid() {
  const existing = read().vapid;
  if (existing?.publicKey && existing?.privateKeyPem) return existing;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  // Uncompressed EC point: 0x04 || X || Y — what the browser expects as
  // applicationServerKey.
  const raw = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);

  const vapid = {
    publicKey: raw.toString('base64url'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    createdAt: new Date().toISOString(),
  };
  write((db) => { db.vapid = vapid; });
  return vapid;
}

/** The "sub" claim must be a contact URI the push service can complain to. */
function contactUri() {
  if (process.env.NOTIFY_CONTACT) return process.env.NOTIFY_CONTACT;
  if (brand.email) return `mailto:${brand.email}`;
  return 'mailto:bookings@example.com';
}

function signVapidJwt(audience, privateKeyPem) {
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: contactUri(),
  })}`;
  // Web Push requires the raw r||s signature, not the DER encoding Node
  // produces by default.
  const signature = crypto.sign('sha256', Buffer.from(data), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${data}.${signature.toString('base64url')}`;
}

/* --------------------------------------------------- push subscriptions */

export function listSubscriptions() {
  return read().pushSubscriptions || [];
}

export function saveSubscription(subscription, label) {
  const endpoint = String(subscription?.endpoint || '');
  if (!/^https:\/\//.test(endpoint)) throw new Error('That push subscription is not valid.');

  return write((db) => {
    db.pushSubscriptions = db.pushSubscriptions || [];
    const existing = db.pushSubscriptions.find((s) => s.endpoint === endpoint);
    if (existing) {
      existing.label = label || existing.label;
      existing.failures = 0;
      return existing;
    }
    const record = {
      id: `sub_${crypto.randomBytes(8).toString('hex')}`,
      endpoint,
      keys: subscription.keys || {},
      label: label || 'This device',
      createdAt: new Date().toISOString(),
      failures: 0,
      lastOk: null,
    };
    db.pushSubscriptions.push(record);
    return record;
  });
}

export function removeSubscription({ endpoint, id }) {
  write((db) => {
    db.pushSubscriptions = (db.pushSubscriptions || []).filter(
      (s) => (endpoint ? s.endpoint !== endpoint : true) && (id ? s.id !== id : true),
    );
  });
}

async function sendWebPush(subscription, vapid) {
  const audience = new URL(subscription.endpoint).origin;
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'high',
      Authorization: `vapid t=${signVapidJwt(audience, vapid.privateKeyPem)}, k=${vapid.publicKey}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  // 404/410 mean the browser threw the subscription away — stop trying it.
  if (res.status === 404 || res.status === 410) {
    removeSubscription({ endpoint: subscription.endpoint });
    return { ok: false, gone: true, status: res.status };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: detail.slice(0, 200) || `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status };
}

async function pushChannel(note) {
  const subs = listSubscriptions();
  if (!subs.length) return { skipped: 'No devices are signed up for push.' };

  const vapid = getVapid();
  const results = await Promise.all(subs.map((s) => sendWebPush(s, vapid).catch((e) => ({ ok: false, error: e.message }))));

  const delivered = results.filter((r) => r.ok).length;
  const gone = results.filter((r) => r.gone).length;

  write((db) => {
    for (const [i, sub] of (db.pushSubscriptions || []).entries()) {
      const result = results[i];
      if (!result) continue;
      if (result.ok) { sub.failures = 0; sub.lastOk = note.at; } else { sub.failures = (sub.failures || 0) + 1; }
    }
  });

  const failure = results.find((r) => !r.ok && !r.gone);
  if (!delivered && failure) throw new Error(failure.error || `push failed (${failure.status})`);

  // A subscription the push service has dropped is NOT a delivery. Saying
  // "sent" here would tell her alerts reached a device that is no longer
  // listening — the precise failure this whole feature exists to prevent.
  if (!delivered && gone) {
    return {
      status: 'failed',
      detail: `${gone} device(s) no longer registered — turn alerts back on from the dashboard.`,
    };
  }

  const detail = `${delivered} device(s)${gone ? `, ${gone} dropped` : ''}`;
  return { delivered, detail };
}

/* ------------------------------------------------------- other channels */

const escHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The email body.
 *
 * She reads these on a phone, in a mirror-lit room, between clients. So the
 * name and the time are set large enough to take in without stopping, the
 * detail sits under them, and there is one link straight into the dashboard.
 *
 * Deliberately table-free and inline-styled: every email client in existence
 * strips <style> blocks, and half of them still choke on flexbox. Plain text
 * is sent alongside, so a client that refuses HTML still shows something
 * readable rather than nothing.
 */
export function emailHtml(note) {
  const dash = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const lines = String(note.body || '').split('\n').filter(Boolean);
  const lead = lines[0] || '';
  const rest = lines.slice(1);

  return `<div style="margin:0;padding:24px 16px;background:#f7f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(51,38,28,0.10);">
    <div style="height:3px;background:#a98744;"></div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b5646;">Hair by Chrissy</p>
      <h1 style="margin:0 0 20px;font-size:21px;line-height:1.25;font-weight:700;color:#33261c;">${escHtml(note.title)}</h1>
      <p style="margin:0 0 14px;font-size:17px;line-height:1.4;color:#33261c;font-weight:700;">${escHtml(lead)}</p>
      ${rest.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#6b5646;">${escHtml(l)}</p>`).join('')}
      ${dash ? `<p style="margin:26px 0 0;"><a href="${escHtml(dash)}/admin" style="display:inline-block;padding:13px 22px;background:#33261c;color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;">Open your dashboard</a></p>` : ''}
    </div>
    <div style="padding:16px 24px;border-top:1px solid rgba(51,38,28,0.10);">
      <p style="margin:0;font-size:11px;line-height:1.5;color:#6b5646;">Sent by your booking system. Reply to this and it goes nowhere — open the dashboard to make changes.</p>
    </div>
  </div>
</div>`;
}

/**
 * One Resend request, with a single retry when the rate limiter says no.
 *
 * The free tier allows two requests a second. A booking sends two emails —
 * Chrissy's alert and the client's confirmation — and when those went out
 * simultaneously one of them could come back 429 while the other succeeded.
 * The visible symptom was the worst possible one: the client is told they are
 * booked and the stylist is not told at all.
 *
 * Sequencing them at the call site fixes the common case; this covers the rest
 * (a busy Saturday, a retry of our own) rather than trusting the spacing.
 */
async function resendSend(payload) {
  const key = process.env.RESEND_API_KEY;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return;

    const body = await res.text().catch(() => '');
    // 429 is "slow down", not "no". Anything else is a real refusal and
    // retrying it just delays an error that is not going to change.
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1100;
      console.warn(`[email] rate limited, retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(body.slice(0, 200) || `HTTP ${res.status}`);
  }
}

async function emailChannel(note) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!key || !to) return { skipped: 'RESEND_API_KEY / NOTIFY_EMAIL_TO not set.' };

  const recipients = to.split(',').map((v) => v.trim()).filter(Boolean);
  if (!recipients.length) return { skipped: 'NOTIFY_EMAIL_TO is empty.' };

  await resendSend({
    from: process.env.NOTIFY_EMAIL_FROM || 'Bookings <onboarding@resend.dev>',
    to: recipients,
    subject: note.title,
    text: note.body,
    html: emailHtml(note),
  });
  return { delivered: recipients.length, detail: `${recipients.length} address(es)` };
}

async function webhookChannel(note) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return { skipped: 'NOTIFY_WEBHOOK_URL not set.' };

  const line = `*${note.title}*\n${note.body}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // text = Slack, content = Discord, the rest for Zapier/IFTTT/anything else.
    body: JSON.stringify({ text: line, content: line, title: note.title, message: note.body, booking: note.booking }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { delivered: 1 };
}

async function telegramChannel(note) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set.' };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: `${note.title}\n\n${note.body}` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')).slice(0, 200) || `HTTP ${res.status}`);
  return { delivered: 1 };
}

async function smsChannel(note) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.NOTIFY_SMS_TO;
  if (!sid || !token || !from || !to) return { skipped: 'Twilio credentials / NOTIFY_SMS_TO not set.' };

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: `${note.title} — ${note.body}` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')).slice(0, 200) || `HTTP ${res.status}`);
  return { delivered: 1 };
}

const CHANNELS = [
  { name: 'push', label: 'Phone / desktop push', run: pushChannel },
  { name: 'email', label: 'Email', run: emailChannel },
  { name: 'webhook', label: 'Webhook (Slack, Discord, Zapier)', run: webhookChannel },
  { name: 'telegram', label: 'Telegram', run: telegramChannel },
  { name: 'sms', label: 'Text message', run: smsChannel },
];

/** What the dashboard shows as configured, without leaking any credentials. */
export function channelStatus() {
  return [
    { name: 'dashboard', label: 'Dashboard alerts', configured: true, detail: 'Always on while the dashboard is open.' },
    { name: 'push', label: 'Phone / desktop push', configured: listSubscriptions().length > 0, detail: `${listSubscriptions().length} device(s) signed up.` },
    { name: 'email', label: 'Email', configured: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO), detail: process.env.NOTIFY_EMAIL_TO || 'Not set up.' },
    { name: 'webhook', label: 'Webhook', configured: Boolean(process.env.NOTIFY_WEBHOOK_URL), detail: process.env.NOTIFY_WEBHOOK_URL ? 'A webhook URL is set.' : 'Not set up.' },
    { name: 'telegram', label: 'Telegram', configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), detail: process.env.TELEGRAM_CHAT_ID ? 'Connected.' : 'Not set up.' },
    { name: 'sms', label: 'Text message', configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.NOTIFY_SMS_TO), detail: process.env.NOTIFY_SMS_TO || 'Not set up.' },
  ];
}

/* ------------------------------------------------------------- the log */

export function recentNotifications(limit = 20) {
  return (read().notifications || []).slice(0, limit);
}

export function latestNotification() {
  return (read().notifications || [])[0] || null;
}

function logNotification(note, results) {
  const entry = {
    id: `n_${crypto.randomBytes(6).toString('hex')}`,
    at: note.at,
    kind: note.kind,
    title: note.title,
    body: note.body,
    ref: note.booking?.ref || null,
    channels: results,
  };
  write((db) => {
    db.notifications = db.notifications || [];
    db.notifications.unshift(entry);
    db.notifications.length = Math.min(db.notifications.length, LOG_LIMIT);
  });
  return entry;
}

/* ------------------------------------------------- the client's own copy */

/**
 * The confirmation the CLIENT receives.
 *
 * Deliberately not one of the channels above. Those fan a single message out
 * to Chrissy across every route she has; this is a different message, to a
 * different person, and it must not be able to reach her channels or be
 * reached by them.
 *
 * Until now a client booked, saw a confirmation page, and got nothing they
 * could keep. Three weeks later there was no reference to check, no time to
 * re-read, and nothing to forward — so they message her to ask, which is the
 * work the booking system was supposed to remove.
 *
 * Sent only for a booking that is actually CONFIRMED. A card booking waiting
 * on payment is not, and telling someone they are booked when the slot may
 * still lapse is worse than telling them nothing.
 *
 * The studio address is not in here. It is deliberately not public, this app
 * has never been given it, and a confirmation that invented one would send a
 * client to the wrong door.
 */
export async function sendClientConfirmation(booking, service) {
  const key = process.env.RESEND_API_KEY;
  const to = booking?.client?.email;

  if (!key) return { skipped: 'RESEND_API_KEY not set.' };
  if (!to) return { skipped: 'No client email on the booking.' };
  if (booking.status !== 'confirmed') return { skipped: `Status is ${booking.status}, not confirmed.` };

  const when = `${booking.dateLong || booking.date} at ${booking.start}`;
  const paying = booking.priceOnRequest
    ? 'This is a consultation — we agree the price when I have seen your hair.'
    : booking.payment === 'cash'
      ? `${money(booking.total)}, payable in the studio on the day.`
      : booking.balanceDue > 0
        ? `${money(booking.depositDue)} paid, ${money(booking.balanceDue)} due on the day.`
        : `${money(booking.depositDue)} paid in full.`;

  const cancelHours = Number(process.env.CANCELLATION_HOURS) || 48;
  const lines = [
    `${service?.name || booking.serviceName}`,
    when,
    paying,
    `Your reference is ${booking.ref}.`,
    `Need to move or cancel? Please give at least ${cancelHours} hours' notice.`,
  ];

  await resendSend({
    from: process.env.NOTIFY_EMAIL_FROM || 'Hair by Chrissy <onboarding@resend.dev>',
    // Replies should reach a person, not the void. Falls back to leaving it
    // off entirely rather than inventing an address that bounces.
    ...(process.env.NOTIFY_REPLY_TO ? { reply_to: [process.env.NOTIFY_REPLY_TO] } : {}),
    to: [to],
    subject: `You're booked in — ${booking.dateLong || booking.date}, ${booking.start}`,
    text: [`Hi ${booking.client.name.split(' ')[0]},`, '', "You're booked in.", '', ...lines].join('\n'),
    html: clientEmailHtml(booking, lines),
  });

  return { delivered: 1, detail: to };
}

function clientEmailHtml(booking, lines) {
  const first = escHtml(String(booking.client.name || '').split(' ')[0] || 'there');
  const [service, when, ...rest] = lines;

  return `<div style="margin:0;padding:24px 16px;background:#f7f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(51,38,28,0.10);">
    <div style="height:3px;background:#a98744;"></div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b5646;">Hair by Chrissy</p>
      <h1 style="margin:0 0 18px;font-size:21px;line-height:1.25;font-weight:700;color:#33261c;">You're booked in, ${first}.</h1>
      <p style="margin:0 0 4px;font-size:17px;line-height:1.4;color:#33261c;font-weight:700;">${escHtml(service)}</p>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.4;color:#33261c;font-weight:700;">${escHtml(when)}</p>
      ${rest.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#6b5646;">${escHtml(l)}</p>`).join('')}
    </div>
    <div style="padding:16px 24px;border-top:1px solid rgba(51,38,28,0.10);">
      <p style="margin:0;font-size:11px;line-height:1.5;color:#6b5646;">I'll send you the studio address before your appointment. See you soon.</p>
    </div>
  </div>
</div>`;
}

/* ------------------------------------------------------------ dispatch */

/**
 * Fire a notification across every configured channel.
 * Always resolves — a failing channel is recorded, never thrown at the caller.
 */
export async function notify({ kind, title, body, booking = null }) {
  const note = { kind, title, body, booking, at: new Date().toISOString() };

  const results = await Promise.all(
    CHANNELS.map(async (channel) => {
      try {
        const outcome = await channel.run(note);
        if (outcome?.skipped) return { name: channel.name, status: 'skipped', detail: outcome.skipped };
        // A channel may report its own outcome — push does, because a pruned
        // subscription is a failure even though nothing threw.
        if (outcome?.status) return { name: channel.name, status: outcome.status, detail: outcome.detail || outcome.status };
        return { name: channel.name, status: 'sent', detail: outcome?.detail || (outcome?.delivered ? `${outcome.delivered} delivered` : 'sent') };
      } catch (err) {
        console.error(`[notify:${channel.name}]`, err.message);
        return { name: channel.name, status: 'failed', detail: err.message.slice(0, 200) };
      }
    }),
  );

  return logNotification(note, results);
}

/* ------------------------------------------------------ message shapes */

const money = (n) => (n ? `£${Number(n).toLocaleString('en-GB')}` : '£0');

export function bookingMessage(booking, service) {
  const paying = booking.priceOnRequest
    ? 'To be quoted — consultation booking.'
    : booking.payment === 'cash'
      ? `Paying cash — ${money(booking.total)} due on the day.`
      : booking.balanceDue > 0
        ? `Card — ${money(booking.depositDue)} deposit paid, ${money(booking.balanceDue)} due on the day.`
        : `Card — ${money(booking.depositDue)} paid in full.`;

  return {
    kind: 'booking',
    title: `New booking — ${booking.client.name}`,
    body: [
      `${service?.name || booking.serviceName}`,
      `${booking.dateLong || booking.date} at ${booking.start} (${booking.start}–${booking.end})`,
      paying,
      `${booking.client.phone} · ${booking.client.email}`,
      booking.client.notes ? `Notes: ${booking.client.notes}` : null,
      // Photos land a moment after the booking, so this is the count the
      // client declared. It is here to send her to the dashboard to look.
      booking.photosToFollow
        ? `${booking.photosToFollow} reference photo${booking.photosToFollow === 1 ? '' : 's'} — open the booking in your dashboard to see ${booking.photosToFollow === 1 ? 'it' : 'them'}.`
        : null,
      `Ref ${booking.ref}`,
    ]
      .filter(Boolean)
      .join('\n'),
    booking: { ref: booking.ref, date: booking.date, start: booking.start, name: booking.client.name },
  };
}

/**
 * A cancellation is news too. A client who drops out of Thursday afternoon
 * frees three hours she could sell — but only if she knows before Thursday.
 */
export function cancellationMessage(booking, service) {
  return {
    kind: 'cancellation',
    title: `Cancelled — ${booking.client.name}`,
    body: [
      `${service?.name || booking.serviceName}`,
      `Was ${booking.dateLong || booking.date} at ${booking.start} (${booking.start}–${booking.end})`,
      'That slot is back on the site now.',
      `${booking.client.phone}${booking.client.email ? ` · ${booking.client.email}` : ''}`,
      `Ref ${booking.ref}`,
    ]
      .filter(Boolean)
      .join('\n'),
    booking: { ref: booking.ref, date: booking.date, start: booking.start, name: booking.client.name },
  };
}

/**
 * The morning run-down.
 *
 * Of everything here this is the message most likely to stop an appointment
 * being missed, because it does not depend on her having seen the one that
 * arrived three weeks ago. `bookings` is already filtered to the day and in
 * time order; `null` means nothing is booked, which is itself worth saying —
 * a quiet day she knows about is a day she can fill.
 */
export function dayAheadMessage(dateLong, bookings) {
  if (!bookings.length) {
    return {
      kind: 'day-ahead',
      title: `Nothing booked ${dateLong.toLowerCase().startsWith('today') ? 'today' : `on ${dateLong}`}`,
      body: 'Your diary is clear. Slots are open on the site if you want to push for a fill.',
    };
  }

  const owed = bookings.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
  const first = bookings[0];
  const last = bookings[bookings.length - 1];

  return {
    kind: 'day-ahead',
    title: `${bookings.length} appointment${bookings.length === 1 ? '' : 's'} — first at ${first.start}`,
    body: [
      `${dateLong}, ${first.start} through ${last.end}.`,
      '',
      ...bookings.map((b) =>
        `${b.start}  ${b.client.name} — ${b.serviceName}${b.balanceDue > 0 ? ` (${money(b.balanceDue)} to collect)` : ''}`,
      ),
      owed ? '' : null,
      owed ? `${money(owed)} to collect across the day.` : null,
    ]
      .filter((l) => l !== null)
      .join('\n'),
  };
}
