/**
 * Admin session handling — one stylist, one password, an HMAC-signed cookie.
 * No user table, no dependency on a session store.
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'hbc-dev-secret-change-me';
const PASSWORD = process.env.ADMIN_PASSWORD || 'chrissy';
const COOKIE = 'hbc_admin';
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

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

export function sessionCookie(token) {
  const maxAge = Math.floor(TTL_MS / 1000);
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
