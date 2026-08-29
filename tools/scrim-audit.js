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

/**
 * PNG decoding, via one long-lived page rather than a browser per screenshot.
 * Launching Chromium six times took longer than the rest of the audit combined.
 */
let decoderBrowser = null;
let decoderPage = null;

async function decoder() {
  if (decoderPage) return decoderPage;
  decoderBrowser = await chromium.launch({ executablePath: EXE });
  decoderPage = await decoderBrowser.newPage();
  return decoderPage;
}

async function closeDecoder() {
  if (decoderBrowser) await decoderBrowser.close();
  decoderBrowser = null;
  decoderPage = null;
}

/**
 * Returns the lightest pixel inside each box, in one pass per image. Doing the
 * scan in the page avoids shipping several megabytes of pixel data per frame
 * across the bridge.
 */
async function lightestInBoxes(file, boxes) {
  const page = await decoder();
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(
    async ([data, boxList]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;

      const lum = ([r, g, b]) => {
        const c = [r, g, b].map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };

      const out = {};
      for (const [name, box] of boxList) {
        const [x0, y0, x1, y1] = box;
        let best = [0, 0, 0];
        let bestL = -1;
        for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y += 2) {
          for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x += 2) {
            const i = (y * img.width + x) * 4;
            const p = [px[i], px[i + 1], px[i + 2]];
            const l = lum(p);
            if (l > bestL) { bestL = l; best = p; }
          }
        }
        out[name] = best;
      }
      return out;
    },
    [b64, Object.entries(boxes).filter(([, b]) => b)],
  );
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

  /**
   * A video hero shows a different frame every moment, so measuring one is
   * measuring luck. Pause it and step through the clip, keeping the worst case
   * per element across every frame sampled — plus the poster, which is what
   * anyone with reduced motion or a failed autoplay actually sees.
   */
  const timestamps = await page.evaluate(async () => {
    const v = document.getElementById('heroVideo');
    if (!v || !v.duration || !isFinite(v.duration)) return null;
    v.pause();
    const d = v.duration;
    return [0, d * 0.25, d * 0.5, d * 0.75, Math.max(0, d - 0.1)];
  });

  const shots = [];
  const shoot = async (labelText) => {
    const f = path.join(os.tmpdir(), `hbc-scrim-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await page.screenshot({ path: f });
    shots.push({ label: labelText, file: f });
  };

  if (timestamps) {
    for (const t of timestamps) {
      await page.evaluate(
        (time) =>
          new Promise((resolve) => {
            const v = document.getElementById('heroVideo');
            v.addEventListener('seeked', resolve, { once: true });
            v.currentTime = time;
            setTimeout(resolve, 1200);
          }),
        t,
      );
      await page.waitForTimeout(180);
      await shoot(`t=${t.toFixed(1)}s`);
    }
    // And the poster on its own.
    await page.evaluate(() => {
      const v = document.getElementById('heroVideo');
      v.style.visibility = 'hidden';
      const el = document.getElementById('heroMedia');
      el.style.backgroundImage = `url("${v.poster}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center 28%';
    });
    await page.waitForTimeout(400);
    await shoot('poster');
  } else {
    await shoot('still');
  }
  await browser.close();

  const white = [255, 255, 255];
  const worst = {};
  for (const shot of shots) {
    const lightestPerBox = await lightestInBoxes(shot.file, boxes);
    fs.unlinkSync(shot.file);
    for (const [name, lightest] of Object.entries(lightestPerBox)) {
      const ratio = contrast(white, lightest);
      if (!worst[name] || ratio < worst[name].ratio) worst[name] = { ratio, lightest, at: shot.label };
    }
  }
  await closeDecoder();

  let failures = 0;
  console.log(`  sampled ${shots.length} frame(s): ${shots.map((s) => s.label).join(', ')}\n`);
  for (const [name, r] of Object.entries(worst)) {
    const need = NEED[name] ?? 4.5;
    const ok = r.ratio >= need;
    if (!ok) failures += 1;
    const hex = r.lightest.map((v) => v.toString(16).padStart(2, '0')).join('');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(6)} white on #${hex}  ${r.ratio.toFixed(2)}:1  (need ${need})  worst at ${r.at}`);
  }

  console.log(`\n########## HERO SCRIM FAILURES: ${failures} ##########`);
  process.exit(failures === 0 ? 0 : 1);
})();
