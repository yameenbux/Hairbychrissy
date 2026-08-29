/**
 * Hero scrim check.
 *
 * CLAUDE.md: "Accessible contrast on all text over imagery — use a scrim, not
 * hope." A stylesheet cannot tell you whether that holds, because the answer
 * depends on the photograph. So this renders the hero, records where each
 * element sits, hides the text, screenshots the bare background, and measures
 * white against the LIGHTEST pixel behind each element — the worst case.
 *
 * Re-run it whenever the hero photograph changes.
 *
 *   node server.js &
 *   node tools/scrim-audit.js
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Minimum ratio per element, by text size and weight.
const NEED = { label: 4.5, h1: 3.0, lede: 4.5, btn: 4.5 };

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Minimal PNG reader — enough for the RGBA screenshots Playwright produces. */
async function readPixels(file) {
  const { chromium: c } = await import('playwright-core');
  const b = await c.launch({ executablePath: EXE });
  const p = await b.newPage();
  const data = fs.readFileSync(file).toString('base64');
  const px = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, img.width, img.height);
    return { w: img.width, h: img.height, data: Array.from(d.data) };
  }, data);
  await b.close();
  return px;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const boxes = await page.evaluate(() => {
    const pick = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.right), Math.round(r.bottom)];
    };
    return { label: pick('.hero .label'), h1: pick('.hero .display'), lede: pick('.hero .lede'), btn: pick('.hero .btn-outline') };
  });

  await page.evaluate(() => { document.querySelector('.hero .shell').style.visibility = 'hidden'; });
  await page.waitForTimeout(250);
  const shot = path.join(os.tmpdir(), `hbc-scrim-${Date.now()}.png`);
  await page.screenshot({ path: shot });
  await browser.close();

  const { w, h, data } = await readPixels(shot);
  fs.unlinkSync(shot);

  let failures = 0;
  const white = [255, 255, 255];
  for (const [name, box] of Object.entries(boxes)) {
    if (!box) continue;
    const [x0, y0, x1, y1] = box;
    let lightest = [0, 0, 0];
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y += 2) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 2) {
        const i = (y * w + x) * 4;
        const px = [data[i], data[i + 1], data[i + 2]];
        if (luminance(px) > luminance(lightest)) lightest = px;
      }
    }
    const ratio = contrast(white, lightest);
    const need = NEED[name] ?? 4.5;
    const ok = ratio >= need;
    if (!ok) failures += 1;
    const hex = lightest.map((v) => v.toString(16).padStart(2, '0')).join('');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(6)} white on #${hex}  ${ratio.toFixed(2)}:1  (need ${need})`);
  }

  console.log(`\n########## HERO SCRIM FAILURES: ${failures} ##########`);
  process.exit(failures === 0 ? 0 : 1);
})();
