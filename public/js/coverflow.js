/**
 * Coverflow carousel — a ported CoverflowCarousel, no framework.
 *
 * The original is a React/shadcn component in TypeScript, styled with Tailwind.
 * This site has no React, no Tailwind and no build step — `dependencies: {}` —
 * so bringing the component in as written would have meant migrating the whole
 * client site to get one section. The mechanism is what matters, and it is
 * plain DOM: a fractional index, a ring, and a transform per card. That ports
 * exactly. What changed is the skin, which now speaks in this site's tokens
 * rather than utility classes.
 *
 * The geometry, faithful to the original:
 *   - `pos` is a FRACTIONAL card index at the centre and the single source of
 *     truth. Everything else is derived from it.
 *   - Looping folds each card's offset into the shorter way round the ring, so
 *     there are no cloned nodes and the DOM never gets reshuffled.
 *   - Distance is raised to `falloff` before it drives tilt and depth. Below 1
 *     the rake eases off as cards travel out; a linear ramp folds the second
 *     card shut and you lose the stack.
 *   - Transforms are written straight to the nodes. Sixty renders a second of
 *     numbers nothing else reads would be wasted work.
 */

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Honoured at construction and re-read on change, so a mid-session switch takes. */
const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };

export function createCoverflow(root, slides, options = {}) {
  const {
    rotate = 44,
    depth = 0.6,
    perspective = 3,
    falloff = 0.56,
    fade = 0.1,
    cardWidth = 'clamp(180px, 46vw, 320px)',
    gap = 0.05,
    loop = true,
    showCaption = true,
    showPagination = true,
    showNavigation = true,
    label = 'Her work',
  } = options;

  const count = slides.length;
  if (!count) return null;

  /*
   * The ring needs enough cards to hide the teleport. A card is moved across
   * at exactly half a turn out, and the fade that covers it only has
   * `count / 2` of distance to work in — under about five that fade has to
   * happen so close to the centre that you see it. With few photos the strip
   * simply does not loop, which is honest rather than glitchy.
   */
  const canLoop = loop && count >= 5;

  root.classList.add('coverflow');
  root.style.setProperty('--cf-card', cardWidth);
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-label', label);

  root.innerHTML = `
    <div class="cf-stage">
      <div class="cf-frame" tabindex="0" style="perspective:calc(var(--cf-card) * ${perspective})">
        <div class="cf-track">
          ${slides.map((s, i) => `
            <div class="cf-card" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${count}">
              <img src="${s.src}" alt="${s.alt || ''}" draggable="false" loading="lazy" decoding="async">
            </div>`).join('')}
        </div>
      </div>
      ${showNavigation ? `
        <button class="cf-nav cf-prev" type="button" aria-label="Previous photo">${chevron('left')}</button>
        <button class="cf-nav cf-next" type="button" aria-label="Next photo">${chevron('right')}</button>` : ''}
    </div>
    ${showCaption ? '<div class="cf-caption" aria-live="polite"></div>' : ''}
    ${showPagination ? `<div class="cf-dots">${slides.map((_, i) =>
      `<button class="cf-dot" type="button" aria-label="Show photo ${i + 1}"></button>`).join('')}</div>` : ''}
  `;

  const frame = root.querySelector('.cf-frame');
  const cards = [...root.querySelectorAll('.cf-card')];
  const dots = [...root.querySelectorAll('.cf-dot')];
  const caption = root.querySelector('.cf-caption');

  /*
   * Where the strip opens. A ring is symmetrical wherever it starts, but a
   * FINITE strip opening on card 0 has every other card stacked to its right
   * and nothing at all on its left — lopsided, and it reads as broken rather
   * than as the end of the run. Opening in the middle gives it neighbours
   * both sides, which is the shape the effect is for.
   */
  const home = canLoop ? 0 : Math.floor((count - 1) / 2);

  let pos = home;       // fractional index at the centre
  let target = home;    // where the current settle is headed
  let width = 0;        // card width in px; pitch, depth and rake all derive from it
  let raf = null;
  let drag = null;
  let selected = 0;

  const indexAt = (p) => ((Math.round(p) % count) + count) % count;
  const clampPos = (p) => (canLoop ? p : Math.max(0, Math.min(count - 1, p)));

  function paint() {
    if (!width) return;
    const pitch = width * (1 + gap);

    cards.forEach((card, index) => {
      let offset = index - pos;
      if (canLoop) {
        offset = ((offset % count) + count) % count;
        if (offset > count / 2) offset -= count;
      }

      const distance = Math.abs(offset);
      const ramp = Math.pow(distance, falloff);
      // Capped short of edge-on, so a far card never turns its back entirely.
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset);

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-depth * width * ramp}px) rotateY(${-tilt}deg)`;

      const edge = canLoop ? clamp01(count / 2 - distance) : 1;
      card.style.opacity = String(Math.max(0, 1 - fade * distance) * edge);
      card.style.zIndex = String(100 - Math.round(distance));
      // Only the card in front should take a tap or a tab stop.
      card.classList.toggle('is-active', Math.round(distance) === 0);
    });
  }

  function setSelected(next) {
    if (next === selected) return;
    selected = next;
    const slide = slides[selected];
    if (caption) {
      caption.innerHTML = slide.title
        ? `<p class="cf-title">${slide.title}</p>${slide.subtitle ? `<p class="cf-sub">${slide.subtitle}</p>` : ''}`
        : '';
    }
    dots.forEach((d, i) => {
      d.classList.toggle('is-on', i === selected);
      d.setAttribute('aria-current', i === selected ? 'true' : 'false');
    });
  }

  function settle(to) {
    if (raf !== null) cancelAnimationFrame(raf);
    target = to;
    setSelected(indexAt(to));

    // Nothing to animate if the visitor has asked for less of it.
    if (reduceMotion.matches) {
      pos = to;
      paint();
      raf = null;
      return;
    }

    const step = () => {
      const remaining = target - pos;
      if (Math.abs(remaining) < 0.0004) {
        pos = target;
        paint();
        raf = null;
        return;
      }
      // Exponential ease-out rather than a spring: this should arrive and stop,
      // not overshoot and bob.
      pos += remaining * 0.16;
      paint();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function goTo(index) {
    // Take the shorter way round rather than unwinding the whole ring.
    const to = canLoop ? index + Math.round((target - index) / count) * count : index;
    settle(clampPos(to));
  }

  // Steps off `target`, not `pos` — stepping off a mid-flight position would
  // swallow a second tap that lands before the first has finished arriving.
  const nudge = (by) => settle(clampPos(Math.round(target) + by));

  /* ------------------------------------------------------------- dragging */

  frame.addEventListener('pointerdown', (e) => {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    frame.setPointerCapture(e.pointerId);
    target = pos;
    drag = { id: e.pointerId, x: e.clientX, pos, v: 0, t: performance.now(), moved: false };
    frame.classList.add('is-dragging');
  });

  frame.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const pitch = width * (1 + gap);
    if (!pitch) return;

    const now = performance.now();
    const previous = pos;
    pos = clampPos(drag.pos - (e.clientX - drag.x) / pitch);
    if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
    // Cards per second, for the throw.
    drag.v = ((pos - previous) / Math.max(now - drag.t, 1)) * 1000;
    drag.t = now;
    setSelected(indexAt(pos));
    paint();
  });

  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const flicked = drag;
    drag = null;
    frame.classList.remove('is-dragging');
    // Let a flick carry, but never more than two cards.
    const carried = Math.max(-2, Math.min(2, flicked.v * 0.18));
    settle(clampPos(Math.round(pos + carried)));
  }
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  frame.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
  });

  // A tap on a card either side brings it to the front — the obvious gesture,
  // and the one people try before they find the arrows.
  cards.forEach((card, i) => {
    card.addEventListener('click', () => { if (!drag) goTo(i); });
  });

  root.querySelector('.cf-prev')?.addEventListener('click', () => nudge(-1));
  root.querySelector('.cf-next')?.addEventListener('click', () => nudge(1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  /* ------------------------------------------------------------ measuring */

  // Card width drives pitch, depth and perspective, so it is the only thing
  // worth measuring — and only when the box actually changes.
  function measure() {
    const card = cards[0];
    if (!card) return;
    width = card.offsetWidth;
    paint();
  }

  const observer = new ResizeObserver(measure);
  observer.observe(frame);
  measure();

  // Force the first caption in: setSelected short-circuits on an unchanged index.
  selected = -1;
  setSelected(indexAt(home));
  paint();

  reduceMotion.addEventListener?.('change', () => { pos = target; paint(); });

  return {
    goTo,
    next: () => nudge(1),
    prev: () => nudge(-1),
    destroy() {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    },
  };
}

/** Inline rather than an icon font: one dependency-free glyph, both directions. */
function chevron(dir) {
  const d = dir === 'left' ? 'M14.5 5 8 12l6.5 7' : 'M9.5 5 16 12l-6.5 7';
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;
}
