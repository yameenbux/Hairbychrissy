/**
 * Writes public/data/site.json — the content snapshot the site falls back to
 * when it is served as flat files (GitHub Pages), where there is no API.
 *
 *   node tools/build-static-data.js
 *
 * Run it whenever lib/seed.js changes. The Pages workflow runs it on every
 * deploy so the published site never drifts from the source data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand, reviews, gallery, faqs, services, workingHours, rules } from '../lib/seed.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'public', 'data', 'site.json');

const today = new Date().toISOString().slice(0, 10);

/**
 * Which photographs actually exist. The page used to probe for each one and
 * eat a 404 when it was missing; listing them here means zero wasted requests
 * and dropping a new photo in is picked up on the next build.
 */
const imagesDir = path.join(root, 'public', 'images');
let photos = [];
try {
  photos = fs.readdirSync(imagesDir).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
} catch { /* no images yet — placeholders everywhere, which is fine */ }

const payload = {
  photos,
  brand,
  reviews,
  gallery,
  faqs,
  services,
  workingHours,
  rules: {
    cancellationHours: rules.cancellationHours,
    leadTimeHours: rules.leadTimeHours,
    horizonDays: rules.horizonDays,
    timezone: rules.timezone,
  },
  today,
  cardMode: 'static',
  // Makes it obvious in devtools that this is the snapshot, not the live API.
  generatedAt: new Date().toISOString(),
  static: true,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${path.relative(root, out)} — ${services.length} services, ${reviews.length} reviews, ${faqs.length} FAQs, ${photos.length} photos`);
