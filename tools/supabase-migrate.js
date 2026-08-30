/**
 * Moves an existing local database into Supabase — bookings, settings, and the
 * photos clients attached.
 *
 * Run it once, after creating the schema:
 *
 *   node tools/supabase-migrate.js            # show what would move
 *   node tools/supabase-migrate.js --apply    # actually move it
 *
 * Safe to re-run: every write is an upsert keyed on the booking id, so a run
 * that fails halfway can simply be run again.
 *
 * It never deletes the local files. If something is wrong you still have them,
 * and `npm run backup` is the belt to this braces.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH, UPLOAD_DIR } from '../lib/paths.js';
import * as sb from '../lib/supabase.js';

const APPLY = process.argv.includes('--apply');

if (!sb.isConfigured) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must both be set.');
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`No local database at ${DB_PATH} — nothing to migrate.`);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const bookings = db.bookings || [];

const STATE_KEYS = [
  'version', 'services', 'workingHours', 'rules', 'blockedDates',
  'counter', 'notifications', 'vapid', 'dayAheadSentFor',
];
const state = Object.fromEntries(STATE_KEYS.filter((k) => k in db).map((k) => [k, db[k]]));

// Photos are listed from the booking records rather than the filesystem, so a
// stray directory left over from a deleted booking is not carried across.
const photos = [];
for (const b of bookings) {
  for (const ph of b.photos || []) {
    const full = path.join(UPLOAD_DIR, b.id, ph.file);
    if (fs.existsSync(full)) photos.push({ bookingId: b.id, ...ph, full });
    else console.warn(`  ! missing on disk: ${b.ref} ${ph.file}`);
  }
}

console.log('');
console.log(`  from      ${DB_PATH}`);
console.log(`  to        ${process.env.SUPABASE_URL}`);
console.log(`  bookings  ${bookings.length}`);
console.log(`  photos    ${photos.length}`);
console.log(`  settings  ${Object.keys(state).length} keys${state.vapid ? ' (including the push keys)' : ''}`);
console.log('');

if (!APPLY) {
  /*
   * Name the people you are about to copy into a live database.
   *
   * A local database is very often full of test bookings — this one was, at
   * the point this was written: "Amara Okafor", "Probe", "Photo Tester". A
   * count alone does not tell you that, and the first place it shows up is
   * the stylist's own dashboard on her phone.
   */
  const names = [...new Set(bookings.map((b) => b.client?.name).filter(Boolean))];
  if (names.length) {
    console.log('  clients you are about to copy across:');
    console.log(`    ${names.slice(0, 12).join(', ')}${names.length > 12 ? `, and ${names.length - 12} more` : ''}`);
    console.log('');
    console.log('  If those are test names, do NOT run this. A fresh database seeds');
    console.log('  its services, hours and rules from lib/seed.js on first boot.');
    console.log('');
  }
  console.log('  Dry run. Re-run with --apply to migrate.');
  console.log('');
  process.exit(0);
}

console.log('  checking credentials and bucket…');
await sb.check();

const row = (b) => ({
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

if (bookings.length) {
  // In batches, so one enormous request cannot be the thing that fails.
  const SIZE = 100;
  for (let i = 0; i < bookings.length; i += SIZE) {
    const batch = bookings.slice(i, i + SIZE);
    await sb.upsert('hbc_bookings', batch.map(row));
    console.log(`  bookings  ${Math.min(i + SIZE, bookings.length)}/${bookings.length}`);
  }
}

await sb.upsert('hbc_state', { id: 1, data: state, updated_at: new Date().toISOString() });
console.log('  settings  done');

let done = 0;
for (const ph of photos) {
  await sb.putObject(`${ph.bookingId}/${ph.file}`, fs.readFileSync(ph.full), ph.mime);
  done += 1;
  if (done % 10 === 0 || done === photos.length) console.log(`  photos    ${done}/${photos.length}`);
}

// Read it back rather than trusting the writes: the point of a migration is
// that the new home has everything, and the only proof is asking it.
const check = await sb.select('hbc_bookings', 'select=id');
console.log('');
console.log(`  verified  ${check.length} bookings now in Supabase`);
console.log('');
console.log('  Set SUPABASE_URL and SUPABASE_SERVICE_KEY on your host and restart.');
console.log('  The startup banner will say "bookings  Supabase".');
console.log(`  Your local files are untouched at ${DB_PATH}`);
console.log('');
