/**
 * Backs up everything that cannot be regenerated: the bookings database and
 * the photos clients attached to their appointments.
 *
 * Everything else in this repository can be rebuilt from source. These two
 * cannot. A booking lost is a client who turns up to a closed door, so this
 * exists to be run on a schedule rather than remembered in a crisis.
 *
 *   node tools/backup.js                  -> ./backups/hbc-<timestamp>.tar.gz
 *   node tools/backup.js /mnt/somewhere   -> writes there instead
 *
 * Restore is deliberately a plain tar, not a format of ours, so it can be
 * opened by anyone on any machine without this code:
 *
 *   tar -xzf hbc-2026-08-29T2130.tar.gz -C "$DATA_DIR"
 *
 * Reads DATA_DIR, so it backs up whatever the running server is actually
 * using rather than assuming ./data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA_DIR, DB_PATH } from '../lib/paths.js';

const outDir = path.resolve(process.argv[2] || 'backups');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}`);
  console.error('Nothing to back up. Is DATA_DIR set to the same value the server uses?');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// Colons are legal on Linux and a nuisance everywhere else, so the timestamp
// is filename-safe: 2026-08-29T2130.
const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '').replace(/-(\d\d)T/, '-$1T');
const file = path.join(outDir, `hbc-${stamp}.tar.gz`);

// Archive the CONTENTS of DATA_DIR, so restoring is "extract into DATA_DIR"
// rather than "extract and then work out which directory to rename".
const entries = fs.readdirSync(DATA_DIR);
execFileSync('tar', ['-czf', file, '-C', DATA_DIR, ...entries], { stdio: 'inherit' });

const { bookings = [] } = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const size = (fs.statSync(file).size / 1024).toFixed(0);

console.log(`\n  backed up   ${DATA_DIR}`);
console.log(`  to          ${file}  (${size}KB)`);
console.log(`  bookings    ${bookings.length}`);
console.log(`\n  restore with:\n    tar -xzf ${file} -C "${DATA_DIR}"\n`);
