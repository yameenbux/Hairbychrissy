/**
 * Scroll-reveal rail — a ported ScrollRevealContentA, no framework.
 *
 * The original is a React component: Next's <Image>, Tailwind classes, and
 * motion/react's useScroll + useMotionValueEvent to turn scroll position into
 * a number. None of that is installed here and none of it needs to be — the
 * mechanism is a scroll offset, a clamp, and a height in percent, which is
 * plain DOM. What is kept is the LANGUAGE:
 *
 *   - a leading-zero numeral above each point
 *   - a hairline rule down the left of each point that FILLS as you read it
 *   - the point you are on at full strength, the rest held back
 *   - a companion image that cross-fades as you move through the list
 *
 * TWO THINGS WERE CHANGED, and both are the content's doing rather than taste.
 *
 * 1. NO 300vh PIN. The original pins the whole row — text and image together —
 *    for three viewport heights, which works because it carries exactly three
 *    points of about twenty words each. Her aftercare guide is eight points
 *    averaging sixty words, and eight of those do not fit in one viewport at a
 *    readable size. Pinning them would mean either cutting her guidance to
 *    three or swapping paragraphs in and out underneath a reader who is
 *    halfway through one. So the text column scrolls at its own length and the
 *    IMAGE column is what stays pinned. Same mechanism, applied to the half of
 *    the layout that can take it — and it adds no scroll to the page, which
 *    three viewport heights of empty track very much would.
 *
 * 2. PROGRESS IS PER POINT, NOT GLOBAL. The original maps one 0–1 scroll value
 *    across fixed thresholds (0–0.33, 0.33–0.66, 0.66–1). That is only correct
 *    while the list is pinned, because then the list and the scroll are the
 *    same thing. Unpinned, fixed bands drift away from what is actually on
 *    screen — the second rule would fill while you were reading the fourth.
 *    Each point is measured against its own position instead.
 */

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Where on the screen a point counts as "being read". */
const READ_LINE = 0.7;

export function createScrollRail(root, opts = {}) {
  const { steps = [], visuals = [] } = opts;
  if (!root || !steps.length) return null;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  root.innerHTML = `
    <ol class="srail-steps"></ol>
    ${visuals.length ? '<div class="srail-visual" aria-hidden="true"></div>' : ''}`;

  const list = root.querySelector('.srail-steps');
  list.innerHTML = steps
    .map(
      (_, i) => `
      <li class="srail-step">
        <p class="srail-num">${String(i + 1).padStart(2, '0')}</p>
        <div class="srail-row">
          <div class="srail-track"><span class="srail-fill"></span></div>
          <div class="srail-text"><h3></h3><p></p></div>
        </div>
      </li>`,
    )
    .join('');

  // Titles and copy go in as text, never as markup — it is her writing coming
  // from the database, and the one place a stray angle bracket must not become
  // an element.
  const items = [...list.querySelectorAll('.srail-step')].map((li, i) => {
    // Scoped to .srail-text, NOT li.querySelector('p') — the numeral is a <p>
    // too and it comes first, so the unscoped selector put sixty words of
    // aftercare into the 12px label slot and left the body paragraph empty.
    li.querySelector('.srail-text h3').textContent = steps[i].title;
    li.querySelector('.srail-text p').textContent = steps[i].text;
    return { li, fill: li.querySelector('.srail-fill') };
  });

  const shots = [];
  const visual = root.querySelector('.srail-visual');
  if (visual) {
    visual.innerHTML = visuals
      .map(
        (v) =>
          `<img class="srail-shot" src="${v.src}" alt="" width="${v.width}" height="${v.height}" loading="lazy" decoding="async">`,
      )
      .join('');
    shots.push(...visual.querySelectorAll('.srail-shot'));
  }

  /*
   * Someone who has asked for less movement gets the finished state, not a
   * frozen half-drawn one: every rule full, every point legible, the first
   * photograph showing. The guide still reads.
   */
  if (reduced) {
    items.forEach(({ li, fill }) => {
      li.classList.add('is-on');
      fill.style.height = '100%';
    });
    shots[0]?.classList.add('is-on');
    return { destroy() {} };
  }

  let frame = 0;

  function paint() {
    frame = 0;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const line = vh * READ_LINE;

    let deepest = -1;
    for (let i = 0; i < items.length; i += 1) {
      const { li, fill } = items[i];
      const rect = li.getBoundingClientRect();
      // Zero while the point is still below the reading line, full once its
      // last line has passed it — so the rule tracks reading, not scrolling.
      const progress = rect.height > 0 ? clamp01((line - rect.top) / rect.height) : 0;
      fill.style.height = `${progress * 100}%`;
      const on = progress > 0;
      li.classList.toggle('is-on', on);
      if (on) deepest = i;
    }

    if (!shots.length) return;
    // The photographs are divided evenly across the points, exactly as the
    // original divides three images across three thresholds.
    const idx = deepest < 0 ? 0 : Math.min(shots.length - 1, Math.floor((deepest / items.length) * shots.length));
    shots.forEach((img, i) => img.classList.toggle('is-on', i === idx));
  }

  // One listener, coalesced to a frame. Scroll fires far more often than the
  // screen redraws, and measuring on every event is how a scroll effect turns
  // into a stutter on the phones most of her clients use.
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();

  return {
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
