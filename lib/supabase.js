/**
 * A very small Supabase client, over fetch.
 *
 * The official SDK would be one npm install, and this project has none — the
 * whole app runs on the Node standard library, which is a property worth
 * keeping for a one-person business that should not inherit a supply chain it
 * cannot audit. Supabase's PostgREST and Storage APIs are plain HTTP, so the
 * parts this app actually needs are the sixty lines below.
 *
 * Configuration (all or nothing — set none of it and the app stays on the
 * local JSON file, which is what local development and the audits use):
 *
 *   SUPABASE_URL          https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY  the service_role key
 *   SUPABASE_BUCKET       storage bucket for client photos (default below)
 *
 * The service_role key bypasses row-level security, so it is a full-access
 * credential. It lives on the server only. It must never reach the browser —
 * and it cannot here, because the booking page talks to this app's own API and
 * never to Supabase directly.
 */

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';

export const BUCKET = process.env.SUPABASE_BUCKET || 'booking-photos';
export const isConfigured = Boolean(URL_BASE && KEY);

/** Both halves are needed. One without the other is a misconfiguration, not a mode. */
export function configError() {
  if (isConfigured) return null;
  if (!URL_BASE && !KEY) return null;
  return URL_BASE
    ? 'SUPABASE_URL is set but SUPABASE_SERVICE_KEY is missing.'
    : 'SUPABASE_SERVICE_KEY is set but SUPABASE_URL is missing.';
}

const headers = (extra = {}) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  ...extra,
});

async function call(path, { method = 'GET', body, extraHeaders, raw = false } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: headers(extraHeaders),
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // The key appears in no error message: these get logged.
    throw new Error(`Supabase ${method} ${path} — ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------------------- postgrest */

export function select(table, query = '') {
  return call(`/rest/v1/${table}?${query || 'select=*'}`);
}

/** Insert or update by primary key. rows may be one object or an array. */
export function upsert(table, rows) {
  return call(`/rest/v1/${table}`, {
    method: 'POST',
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    extraHeaders: {
      'Content-Type': 'application/json',
      // merge-duplicates makes this an upsert; return=minimal keeps the
      // response empty, which matters when writing every booking at once.
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });
}

export function remove(table, query) {
  return call(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    extraHeaders: { Prefer: 'return=minimal' },
  });
}

/* --------------------------------------------------------------- storage */

export function putObject(path, bytes, contentType) {
  return call(`/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    body: bytes,
    extraHeaders: {
      'Content-Type': contentType || 'application/octet-stream',
      // Re-uploading the same path replaces rather than 409s. Photo filenames
      // are generated per booking, so a collision means a retry, not a clash.
      'x-upsert': 'true',
    },
  });
}

export async function getObject(path) {
  const res = await call(`/storage/v1/object/${BUCKET}/${path}`, { raw: true });
  return Buffer.from(await res.arrayBuffer());
}

export function deleteObject(path) {
  return call(`/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE' });
}

/** Confirms the credentials work AND the bucket exists, before anything relies on it. */
export async function check() {
  await select('hbc_state', 'select=id&limit=1');
  const buckets = await call('/storage/v1/bucket');
  if (!buckets.some((b) => b.name === BUCKET)) {
    throw new Error(`Storage bucket "${BUCKET}" does not exist. Create it (private) in the Supabase dashboard.`);
  }
}
