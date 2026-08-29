/**
 * Inspiration photos a client attaches to a booking.
 *
 * Clients arrive with a screenshot of a look they want. Chrissy currently
 * gets those over Instagram, separately from the booking, and has to match
 * them up by memory. Attaching them to the appointment is the point.
 *
 * The rules here are deliberately strict, because this is the only place on
 * the site where a stranger can put a file on the server:
 *
 *   - The type is decided by READING THE FILE, not by trusting the extension
 *     or the Content-Type the browser claimed. A .jpg that is really a script
 *     is the oldest trick there is.
 *   - Filenames are generated here. Nothing a client sends is ever used as a
 *     path segment, so "../../server.js" cannot be a filename.
 *   - Files land in DATA_DIR/uploads, OUTSIDE public/, so no web server will
 *     ever serve them by accident. They come back out only through an
 *     authenticated admin route. They share DATA_DIR with the database on
 *     purpose: a booking and its photos must move, and be backed up, together
 *     or the pictures orphan on the next restart.
 *   - Count and size are capped before anything is decoded.
 *
 * These are pictures of a client's hair, sent in confidence to one stylist.
 * They are not public, they are not in the repository, and they are not in
 * the static snapshot that publishes to GitHub Pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './paths.js';
import * as sb from './supabase.js';

export { UPLOAD_DIR };

export const MAX_PHOTOS = 5;
export const MAX_BYTES = 4 * 1024 * 1024; // per photo, decoded

/**
 * Magic numbers. The first bytes of a file say what it really is; the name
 * and the declared MIME type are both just claims made by the sender.
 */
const SIGNATURES = [
  { ext: 'jpg',  mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png',  mime: 'image/png',  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'gif',  mime: 'image/gif',  test: (b) => b.slice(0, 3).toString('latin1') === 'GIF' },
  {
    ext: 'webp', mime: 'image/webp',
    test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  },
  {
    // iPhones shoot HEIC. Safari usually converts on upload, but not always,
    // and a photo she cannot open is worse than one she was warned about.
    ext: 'heic', mime: 'image/heic',
    test: (b) => b.slice(4, 8).toString('latin1') === 'ftyp'
      && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(b.slice(8, 12).toString('latin1')),
  },
];

function sniff(buf) {
  if (buf.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buf)) || null;
}

/**
 * Decode and check one client-supplied photo.
 * Returns { ok, buf, ext, mime } or { ok: false, error }.
 */
export function verifyPhoto(base64) {
  if (typeof base64 !== 'string' || !base64) return { ok: false, error: 'Empty file.' };

  // Cap the ENCODED length first: decoding a 500MB string to find out it is
  // too big is the denial of service, not the file.
  if (base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 1024) {
    return { ok: false, error: 'That photo is larger than 4MB.' };
  }

  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, error: 'That file could not be read.' };
  }
  if (!buf.length) return { ok: false, error: 'That file is empty.' };
  if (buf.length > MAX_BYTES) return { ok: false, error: 'That photo is larger than 4MB.' };

  const kind = sniff(buf);
  if (!kind) return { ok: false, error: 'That is not an image file. JPEG, PNG, WebP, GIF or HEIC.' };

  return { ok: true, buf, ext: kind.ext, mime: kind.mime };
}

/**
 * Both backends key photos the same way — <bookingId>/<n>.<ext> — so the
 * records stored on a booking mean the same thing whichever is in use, and
 * moving between them is a copy rather than a migration.
 *
 * The id is ours, generated when the booking was made. It is validated anyway:
 * it reaches these functions back out of a URL, and a value that was safe when
 * we made it is not automatically safe when it returns.
 */
function assertBookingId(bookingId) {
  if (!/^bk_[a-z0-9]+$/i.test(bookingId)) throw new Error('Bad booking id');
  return bookingId;
}

function bookingDir(bookingId) {
  return path.join(UPLOAD_DIR, assertBookingId(bookingId));
}

/** The stored name is one we generated, checked again on the way back in. */
const isPhotoName = (file) => /^[0-9]+\.(jpg|png|gif|webp|heic)$/.test(file);

/** Write verified photos and return the records to store on the booking. */
export async function savePhotos(bookingId, verified) {
  if (sb.isConfigured) {
    assertBookingId(bookingId);
    const out = [];
    for (const [i, v] of verified.entries()) {
      const file = `${i + 1}.${v.ext}`;
      await sb.putObject(`${bookingId}/${file}`, v.buf, v.mime);
      out.push({ file, mime: v.mime, bytes: v.buf.length });
    }
    return out;
  }

  const dir = bookingDir(bookingId);
  fs.mkdirSync(dir, { recursive: true });
  return verified.map((v, i) => {
    const file = `${i + 1}.${v.ext}`;
    fs.writeFileSync(path.join(dir, file), v.buf);
    return { file, mime: v.mime, bytes: v.buf.length };
  });
}

/** Read one photo back for the dashboard. Returns null if it is not there. */
export async function readPhoto(bookingId, file) {
  if (!isPhotoName(file)) return null;

  if (sb.isConfigured) {
    try {
      assertBookingId(bookingId);
      return await sb.getObject(`${bookingId}/${file}`);
    } catch {
      return null;
    }
  }

  try {
    const full = path.join(bookingDir(bookingId), file);
    if (!full.startsWith(UPLOAD_DIR + path.sep)) return null;
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

/** Remove a booking's photos — used when its record is deleted. */
export async function removePhotos(bookingId, files = []) {
  if (sb.isConfigured) {
    try {
      assertBookingId(bookingId);
      // Storage has no "delete this prefix", so the caller passes what the
      // booking recorded. A photo whose record is gone is unreachable anyway.
      await Promise.all(
        files.filter(isPhotoName).map((f) => sb.deleteObject(`${bookingId}/${f}`).catch(() => {})),
      );
    } catch {
      /* nothing to remove */
    }
    return;
  }

  try {
    fs.rmSync(bookingDir(bookingId), { recursive: true, force: true });
  } catch {
    /* nothing to remove */
  }
}
