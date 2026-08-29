/**
 * Where the app keeps everything it must not lose: the bookings database and
 * the photos clients attach to them.
 *
 * One variable, not two, on purpose. A booking and its inspiration photos are
 * a pair — moving the database to a mounted volume and leaving the photos on
 * an ephemeral disk would orphan every picture on the next restart, and the
 * booking would still be there to make it look like nothing had gone wrong.
 *
 * Defaults to ./data so a local checkout works with no configuration. Set
 * DATA_DIR in production to the mount point of a PERSISTENT disk. Most hosts
 * give a container a fresh filesystem on every deploy, so the default would
 * quietly lose bookings there — which is why the startup banner prints this
 * path and says whether it looks like a volume.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('.', import.meta.url)));

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');

export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

/** True when DATA_DIR is inside the checkout — i.e. almost certainly ephemeral. */
export const DATA_DIR_IS_DEFAULT = !process.env.DATA_DIR;
