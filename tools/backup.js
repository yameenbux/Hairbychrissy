/**
 * Backs up everything that cannot be regenerated: the bookings database and
 * the photos clients attached to their appointments.
 *
 * Works against whichever backend is configured, and says which:
 *
 *   node tools/backup.js                  -> ./backups/hbc-<timestamp>.tar.gz
 *   node tools/backup.js /mnt/somewhere   -> writes there instead
 *
 * With Supabase configured it reads from SUPABASE, not from the local files.
 * Backing up a stale local copy while the real data lives elsewhere is worse
 * than having no backup, because it looks like one.
 *
 * The archive is a plain tar of the same shape either backend uses — db.json
 * and uploads/<booking>/<file> — so a Supabase backup can be restored to a
 * local checkout and vice versa. Restoring is deliberately not a tool of ours:
 *
 *   tar -xzf hbc-2026-08-29T2130.tar.gz -C "$DATA_DIR"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA_DIR, DB_PATH, UPLOAD_DIR } from '../lib/paths.js';
import * as sb from '../lib/supabase.js';

const outDir = path.resolve(process.argv[2] || 'backups');
const STATE_KEYS = [
  'version', 'services', 'workingHours', 'rules', 'blockedDates',
  'counter', 'notifications', 'vapid', 'dayAheadSentFor',
];

/** Stage the data as a directory, then tar it — same layout for both backends. */
async function stageFromSupabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbc-backup-'));
  const [stateRows, bookingRows] = await Promise.all([
    sb.select('hbc_state', 'select=data&id=eq.1'),
    sb.select('hbc_bookings', 'select=data&order=date.asc'),
  ]);

  const db = { ...(stateRows?.[0]?.data || {}), bookings: (bookingRows || []).map((r) => r.data) };
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(db, null, 2));

  let photos = 0;
  let missing = 0;
  for (const b of db.bookings) {
    for (const ph of b.photos || []) {
      try {
        const bytes = await sb.getObject(`${b.id}/${ph.file}`);
        const into = path.join(dir, 'uploads', b.id);
        fs.mkdirSync(into, { recursive: true });
        fs.writeFileSync(path.join(into, ph.file), bytes);
        photos += 1;
      } catch {
        // Named rather than swallowed: a photo in the record but not in
        // storage is a real inconsistency and the backup should say so.
        console.warn(`  ! could not fetch ${b.ref} ${ph.file}`);
        missing += 1;
      }
    }
  }
  return { dir, bookings: db.bookings.length, photos, missing, temp: true };
}

function stageFromFiles() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No database at ${DB_PATH}`);
    console.error('Is DATA_DIR set to the same value the server uses?');
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const photos = (db.bookings || []).reduce((n, b) => n + (b.photos || []).length, 0);
  return { dir: DATA_DIR, bookings: (db.bookings || []).length, photos, missing: 0, temp: false };
}

const source = sb.isConfigured ? 'Supabase' : DATA_DIR;
if (sb.isConfigured) console.log(`\n  reading from Supabase (${process.env.SUPABASE_URL})`);

const staged = sb.isConfigured ? await stageFromSupabase() : stageFromFiles();

fs.mkdirSync(outDir, { recursive: true });
// Colons are legal on Linux and a nuisance everywhere else.
const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '');
const file = path.join(outDir, `hbc-${stamp}.tar.gz`);

// Archive the CONTENTS, so restoring is "extract into DATA_DIR" rather than
// "extract, then work out which directory to rename".
const entries = fs.readdirSync(staged.dir);
if (!entries.length) {
  console.error('Nothing to back up.');
  process.exit(1);
}
execFileSync('tar', ['-czf', file, '-C', staged.dir, ...entries], { stdio: 'inherit' });

if (staged.temp) fs.rmSync(staged.dir, { recursive: true, force: true });

const size = (fs.statSync(file).size / 1024).toFixed(0);
console.log(`\n  source      ${source}`);
console.log(`  to          ${file}  (${size}KB)`);
console.log(`  bookings    ${staged.bookings}`);
console.log(`  photos      ${staged.photos}${staged.missing ? `  (${staged.missing} could not be fetched)` : ''}`);
console.log(`\n  restore with:\n    tar -xzf ${file} -C "${DATA_DIR}"\n`);

if (staged.missing) process.exitCode = 1;
