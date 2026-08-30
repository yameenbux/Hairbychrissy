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
 *   SUPABASE_URL          https://<project-id>.supabase.co
 *   SUPABASE_SERVICE_KEY  the SECRET key — "sb_secret_..." in the current
 *                         dashboard, "service_role" in the older one
 *   SUPABASE_BUCKET       storage bucket for client photos (default below)
 *
 * That key bypasses row-level security, so it is a full-access
 * credential. It lives on the server only. It must never reach the browser —
 * and it cannot here, because the booking page talks to this app's own API and
 * never to Supabase directly.
 */

// Trimmed because these are pasted into a hosting dashboard by hand, and a
// trailing newline or a stray space is invisible there and fatal here.
const URL_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

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

/** The project ref out of the URL: https://abcdef.supabase.co -> abcdef */
export function projectRef() {
  return URL_BASE.match(/^https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] || null;
}

/**
 * A legacy Supabase key is a JWT whose payload names its role and project.
 * That payload is base64, not a secret — it is the same information the key
 * announces to every server it is sent to. Returns null for anything else.
 */
function jwtClaims() {
  if (!KEY.startsWith('eyJ')) return null;
  try {
    return JSON.parse(Buffer.from(KEY.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Describe the configured key WITHOUT revealing it.
 *
 * A 401 from Supabase says only "Invalid API key", which leaves you guessing
 * between the wrong key type, a key from another project, a truncated paste
 * and a stray newline. All four look identical in a deploy log.
 *
 * Everything reported here is either public metadata or a shape: the key's
 * recognised prefix, its length, and for a legacy JWT the role and project it
 * claims — which is base64, not a secret. No part of the random portion is
 * ever printed.
 */
export function describeKey() {
  if (!KEY) return 'not set';

  if (KEY.startsWith('sb_secret_')) {
    // Real ones are comfortably longer than this. A short one is a paste that
    // lost its tail, which looks identical to a wrong key in a 401.
    return KEY.length < 30
      ? `a secret key (sb_secret_…) but only ${KEY.length} characters — that is too short, it looks truncated`
      : `a secret key (sb_secret_…, ${KEY.length} chars) — the right type`;
  }
  if (KEY.startsWith('sb_publishable_')) {
    return `a PUBLISHABLE key (sb_publishable_…, ${KEY.length} chars) — wrong type, this one is for browsers`;
  }

  if (KEY.startsWith('eyJ')) {
    const claims = jwtClaims();
    if (!claims) return `something JWT-shaped (${KEY.length} chars) whose payload will not decode — likely truncated`;
    const role = claims.role || 'unknown role';
    const mine = projectRef();
    if (mine && claims.ref && claims.ref !== mine) {
      return `a legacy JWT for role "${role}" — but it belongs to project "${claims.ref}", `
        + `while SUPABASE_URL points at "${mine}"`;
    }
    return `a legacy JWT for role "${role}", project "${claims.ref || 'unknown'}"`;
  }

  return `an unrecognised key format (${KEY.length} chars, starts "${KEY.slice(0, 3)}…")`;
}

/** What to try next, given what the key actually looks like. */
export function diagnose() {
  const lines = [`  SUPABASE_URL  ${URL_BASE || 'not set'}`, `  key           ${describeKey()}`];

  if (!projectRef() && URL_BASE) {
    lines.push('', '  That URL does not look like https://<project-id>.supabase.co.');
  }
  if (KEY.startsWith('sb_publishable_')) {
    lines.push('', '  Use the SECRET key instead: Project Settings -> API Keys -> Secret keys.');
  } else if (jwtClaims()?.role === 'anon') {
    lines.push('', '  That is the anon key, which is for browsers. Use the service_role key,');
    lines.push('  or the newer sb_secret_… key under Project Settings -> API Keys.');
  } else if (KEY.startsWith('eyJ') || KEY.startsWith('sb_secret_')) {
    lines.push(
      '',
      '  If that looks right, the usual causes of "Invalid API key" are:',
      '    - the key belongs to a different Supabase project',
      '    - it was cut short when pasted (secret keys are long)',
      '    - legacy JWT keys have been disabled on the project, so the',
      '      sb_secret_… key is now the only one that works',
    );
  }
  return lines.join('\n');
}

/** Confirms the credentials work AND the bucket exists, before anything relies on it. */
export async function check() {
  await select('hbc_state', 'select=id&limit=1');
  const buckets = await call('/storage/v1/bucket');
  if (!buckets.some((b) => b.name === BUCKET)) {
    throw new Error(`Storage bucket "${BUCKET}" does not exist. Create it (private) in the Supabase dashboard.`);
  }
}
