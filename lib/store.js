/**
 * The bookings store.
 *
 * Two backends behind one interface:
 *
 *   Supabase   when SUPABASE_URL and SUPABASE_SERVICE_KEY are set. Postgres
 *              holds the data, so it survives a redeploy with no mounted disk
 *              and can be read in the Supabase dashboard.
 *   JSON file  otherwise. Local development, the audit suite, and any host
 *              where a persistent volume is simpler than a database.
 *
 * Either way the working copy is IN MEMORY. The availability engine reads the
 * whole dataset many times per request — for every candidate slot on a day —
 * and putting a network round trip behind each of those would make the
 * calendar slow for no benefit at this size. So reads are synchronous and
 * instant; writes go through write(), which persists.
 *
 * The consequence is worth stating plainly: exactly ONE process may own this
 * data. Two instances would each hold their own copy and overwrite each
 * other's bookings. Run a single instance. That is the ceiling of this design,
 * and for one stylist it is nowhere near.
 */
import fs from 'node:fs';
import path from 'node:path';
import { services, workingHours, rules } from './seed.js';
import { DB_PATH } from './paths.js';
import * as sb from './supabase.js';

const STATE_KEYS = [
  'version', 'services', 'workingHours', 'rules', 'blockedDates',
  'counter', 'notifications', 'vapid', 'dayAheadSentFor',
];

function defaults() {
  return {
    version: 1,
    services: structuredClone(services),
    workingHours: structuredClone(workingHours),
    rules: structuredClone(rules),
    blockedDates: [], // [{ date: 'YYYY-MM-DD', reason: 'Holiday' }]
    bookings: [],
    counter: 1000,
  };
}

let db = defaults();
let ready = false;

/* ------------------------------------------------------------------ file */

function loadFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // Merge forward so new seed keys appear in an existing database.
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

function saveFile() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

/* -------------------------------------------------------------- supabase */

/**
 * Serialised bookings as they were last written, keyed by id. Lets a persist
 * send only what actually changed: rewriting every row on every booking would
 * grow into a few hundred KB per appointment for no reason.
 */
let shadow = new Map();
let stateShadow = '';

const bookingRow = (b) => ({
  id: b.id,
  ref: b.ref,
  date: b.date,
  start_min: b.startMin,
  end_min: b.endMin,
  status: b.status,
  service_id: b.serviceId ?? null,
  client_name: b.client?.name ?? null,
  data: b,
  updated_at: new Date().toISOString(),
});

async function loadSupabase() {
  const [stateRows, bookingRows] = await Promise.all([
    sb.select('hbc_state', 'select=data&id=eq.1'),
    sb.select('hbc_bookings', 'select=data&order=date.asc'),
  ]);

  const next = { ...defaults(), ...(stateRows?.[0]?.data || {}) };
  next.bookings = (bookingRows || []).map((r) => r.data);

  // Prime the shadows so the first persist after boot sends nothing.
  shadow = new Map(next.bookings.map((b) => [b.id, JSON.stringify(b)]));
  stateShadow = JSON.stringify(pickState(next));
  return next;
}

const pickState = (d) => Object.fromEntries(STATE_KEYS.filter((k) => k in d).map((k) => [k, d[k]]));

async function saveSupabase() {
  const changed = [];
  const seen = new Set();

  for (const b of db.bookings) {
    seen.add(b.id);
    const json = JSON.stringify(b);
    if (shadow.get(b.id) !== json) changed.push(b);
  }
  const removed = [...shadow.keys()].filter((id) => !seen.has(id));

  if (changed.length) await sb.upsert('hbc_bookings', changed.map(bookingRow));
  if (removed.length) {
    // PostgREST "in" takes a parenthesised list.
    await sb.remove('hbc_bookings', `id=in.(${removed.map(encodeURIComponent).join(',')})`);
  }

  const state = pickState(db);
  const stateJson = JSON.stringify(state);
  if (stateJson !== stateShadow) {
    await sb.upsert('hbc_state', { id: 1, data: state, updated_at: new Date().toISOString() });
    stateShadow = stateJson;
  }

  // Only after every request succeeded, so a failure re-sends next time.
  for (const b of changed) shadow.set(b.id, JSON.stringify(b));
  for (const id of removed) shadow.delete(id);
}

/* ------------------------------------------------------------------ init */

/**
 * Must be awaited before anything calls read(). server.js does this before it
 * listens, so no request can ever see an empty database.
 *
 * If Supabase is configured but unreachable, this THROWS rather than starting
 * on defaults. Starting empty would be the worst possible behaviour: the app
 * would come up, look healthy, and overwrite every real booking with an empty
 * set on the first write.
 */
export async function init() {
  const misconfigured = sb.configError();
  if (misconfigured) throw new Error(misconfigured);

  if (sb.isConfigured) {
    db = await loadSupabase();
    ready = true;
    await proveWritable();
  } else {
    db = loadFile();
    ready = true;
  }
  return db;
}

/**
 * Prove at startup that we can WRITE, not just read.
 *
 * Reading is not enough to know the credentials are right. The schema enables
 * row-level security with no policies, and RLS filters rows rather than
 * raising — so a publishable ("anon") key gets 200 and an empty array from
 * every select. The app would boot looking perfectly healthy, report an empty
 * database, and fail for the first client who tried to book.
 *
 * Writing the state row is the cheapest honest proof: it is idempotent, the
 * values are the ones just loaded, and on a genuinely fresh project it seeds
 * the settings so they are visible in the dashboard straight away.
 */
async function proveWritable() {
  try {
    const state = pickState(db);
    await sb.upsert('hbc_state', { id: 1, data: state, updated_at: new Date().toISOString() });
    stateShadow = JSON.stringify(state);
  } catch (err) {
    const denied = /\b40[13]\b/.test(err.message);
    throw new Error(
      `${err.message}\n\n  The database can be read but not written to.` +
      (denied
        ? '\n  That is what a PUBLISHABLE key looks like: row-level security is on\n' +
          '  with no policies, so reads come back empty and writes are refused.\n' +
          '  SUPABASE_SERVICE_KEY must be the SECRET key — "sb_secret_..." in the\n' +
          '  current dashboard, "service_role" in the older one.'
        : ''),
    );
  }
}

export const backend = () => (sb.isConfigured ? 'supabase' : 'file');

/* --------------------------------------------------------------- reading */

export function read() {
  if (!ready) throw new Error('store.init() has not finished — read() called too early');
  return db;
}

/* --------------------------------------------------------------- writing */

let pending = null;
let inFlight = null;

async function persist() {
  if (sb.isConfigured) await saveSupabase();
  else saveFile();
}

/** Runs one persist at a time; a call during a persist waits for a fresh one. */
function persistSerial() {
  inFlight = (inFlight || Promise.resolve()).then(persist, persist);
  return inFlight;
}

/**
 * Mutate the database through here so every change is written.
 *
 * The write is scheduled, not awaited — right for a setting or an admin note,
 * where a lost millisecond does not matter. For anything a client is told
 * succeeded, follow it with `await commit()` so the promise is only made once
 * the data is actually safe.
 */
export function write(fn) {
  const result = fn(db);
  if (!pending) {
    pending = setTimeout(() => {
      pending = null;
      persistSerial().catch((err) => {
        console.error('[store] PERSIST FAILED — changes are in memory only:', err.message);
      });
    }, 50);
  }
  return result;
}

/**
 * Flush now and report whether it worked.
 *
 * Used on the booking path. A client who sees "confirmed" and a stylist with
 * no record of them is the one failure this whole app exists to prevent, so
 * the 201 is not sent until this resolves.
 */
export async function commit() {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  await persistSerial();
}

export function nextRef() {
  return write((d) => {
    d.counter += 1;
    return `HBC-${d.counter}`;
  });
}

/** Last write on the way out, so a SIGTERM mid-debounce loses nothing. */
export async function flush() {
  try {
    await commit();
  } catch (err) {
    console.error('[store] final flush failed:', err.message);
    // A local copy is better than nothing when the database is unreachable
    // at exactly the moment the process is going away.
    if (sb.isConfigured) {
      try {
        saveFile();
        console.error(`[store] wrote an emergency copy to ${DB_PATH}`);
      } catch { /* nothing further we can do */ }
    }
  }
}
