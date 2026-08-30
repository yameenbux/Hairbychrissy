/**
 * Admin session handling — one stylist, one password, an HMAC-signed cookie.
 * No user table, no dependency on a session store.
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'hbc-dev-secret-change-me';
const PASSWORD = process.env.ADMIN_PASSWORD || 'chrissy';
const COOKIE = 'hbc_admin';
// Long-lived on purpose: Chrissy signs in on her own phone once, and the
// service worker needs that cookie to still be valid days later to fetch the
// detail behind a push. Override with ADMIN_SESSION_DAYS.
const TTL_DAYS = Number(process.env.ADMIN_SESSION_DAYS) > 0 ? Number(process.env.ADMIN_SESSION_DAYS) : 14;
const TTL_MS = 1000 * 60 * 60 * 24 * TTL_DAYS;

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

/** Constant-time compare that tolerates different lengths. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function checkPassword(candidate) {
  return safeEqual(candidate ?? '', PASSWORD);
}

export function usingDefaultPassword() {
  return !process.env.ADMIN_PASSWORD;
}

export function makeToken() {
  const expires = Date.now() + TTL_MS;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token) return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!safeEqual(sig, sign(payload))) return false;
  const expires = Number(payload.split('.')[1]);
  return Number.isFinite(expires) && Date.now() < expires;
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const i = part.indexOf('=');
      if (i < 0) return [part.trim(), ''];
      return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    }),
  );
}

export function isAdmin(req) {
  return verifyToken(parseCookies(req)[COOKIE]);
}

/*
 * The dashboard is served from Pages (hairbychrissy.ysbdesigns.uk) while the
 * API answers from Render. To a browser that is a CROSS-SITE request, and a
 * SameSite=Lax cookie is never sent on one — so the sign-in succeeded, the
 * cookie was thrown away, and the very next call came back 401. That is the
 * "correct password, still cannot get in" loop.
 *
 * SameSite=None is what a cross-site cookie needs, and browsers only accept
 * it alongside Secure, which means HTTPS. So the attributes follow the
 * connection: HTTPS gets None+Secure, plain http (local development) keeps
 * Lax, because Secure over http would be dropped instead.
 */
function crossSite(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return Boolean(req?.socket?.encrypted);
}

function attrs(req) {
  return crossSite(req) ? 'SameSite=None; Secure' : 'SameSite=Lax';
}

export function sessionCookie(token, req) {
  const maxAge = Math.floor(TTL_MS / 1000);
  return `${COOKIE}=${token}; Path=/; HttpOnly; ${attrs(req)}; Max-Age=${maxAge}`;
}

export function clearCookie(req) {
  return `${COOKIE}=; Path=/; HttpOnly; ${attrs(req)}; Max-Age=0`;
}
