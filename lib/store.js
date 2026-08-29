/**
 * Dead-simple JSON file store. No dependencies, no database server.
 * The whole dataset fits comfortably in memory for a single-stylist business;
 * writes are debounced and atomic (write temp, then rename).
 *
 * The file location comes from lib/paths.js, so it can be pointed at a mounted
 * volume in production — see DATA_DIR. Note the ceiling this design has: the
 * database is held in memory, so exactly ONE process may own it. Two instances
 * would each keep their own copy and overwrite each other's bookings.
 *
 * read() and write() are the only ways anything reaches the data, which is
 * what makes swapping the engine later a change to this file rather than a
 * change everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { services, workingHours, rules } from './seed.js';
import { DB_PATH } from './paths.js';

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

let db;

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Merge forward so new seed keys appear in an existing database.
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

db = load();

let pending = null;
function persist() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      const tmp = `${DB_PATH}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_PATH);
    } catch (err) {
      console.error('[store] failed to persist:', err.message);
    }
  }, 50);
}

export function read() {
  return db;
}

/** Mutate the database through here so every change is written to disk. */
export function write(fn) {
  const result = fn(db);
  persist();
  return result;
}

export function nextRef() {
  return write((d) => {
    d.counter += 1;
    return `HBC-${d.counter}`;
  });
}

export function flush() {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
