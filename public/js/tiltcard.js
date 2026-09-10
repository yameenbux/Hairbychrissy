/**
 * Tilt card — a ported InteractiveTravelCard, no framework.
 *
 * The original is React with framer-motion springs and Tailwind classes. The
 * mechanism is a rotation driven by pointer position and a few layers pushed
 * forward on Z, which is plain DOM and ports exactly.
 *
 * What changed, and why:
 *
 *   - NO SPRING. The tilt follows the pointer directly while the pointer is
 *     over the card — that is direct manipulation, and a spring between your
 *     hand and the thing you are moving reads as lag. The ease is on the way
 *     BACK, once, when the pointer leaves.
 *   - POINTER, NOT MOUSE. mousemove never fires for a finger. The card simply
 *     sits flat on a touch screen, which is correct: there is no hover state
 *     to express and nothing to tilt towards.
 *   - THE ARROW GOES SOMEWHERE ELSE. In the original the corner link and the
 *     action button are separate props that the demo points at two different
 *     places. Sending both to the booking page would be two controls doing one
 *     job, so the arrow goes to the price list — which is what somebody
 *     weighing up a booking actually wants next.
 */

const reduceMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

export function createTiltCard(root, opts = {}) {
  const {
    image,
    alt = '',
    title = '',
    subtitle = '',
    actionText = 'Book your slot',
    actionHref = './book.html',
    cornerHref = '',
    cornerLabel = '',
    tilt = 10.5,
  } = opts;
  if (!image) return null;

  root.className = 'tiltcard';
  root.innerHTML = `
    <div class="tc-inner">
      <img class="tc-img" src="${image}" alt="${alt}" loading="lazy" decoding="async" draggable="false">
      <span class="tc-scrim" aria-hidden="true"></span>
      <div class="tc-content">
        <div class="tc-head">
          <div class="tc-titles">
            ${title ? `<p class="tc-title">${title}</p>` : ''}
            ${subtitle ? `<p class="tc-sub">${subtitle}</p>` : ''}
          </div>
          ${cornerHref ? `
            <a class="tc-corner" href="${cornerHref}" aria-label="${cornerLabel}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" aria-hidden="true">
                <path d="M8 16 16 8M9.5 8H16v6.5"/>
              </svg>
            </a>` : ''}
        </div>
        <a class="tc-action" href="${actionHref}">${actionText}</a>
      </div>
    </div>`;

  const inner = root.querySelector('.tc-inner');

  // A finger has no hover, so there is nothing to tilt towards; and somebody
  // who has asked for less motion should not get a card that moves at all.
  if (reduceMotion.matches || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
    return { destroy() {} };
  }

  function onMove(e) {
    const r = root.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    // No transition while the pointer is driving it — the tilt should be the
    // pointer's position, not a delayed reaction to it.
    inner.style.transition = 'none';
    inner.style.transform = `rotateX(${-py * tilt * 2}deg) rotateY(${px * tilt * 2}deg)`;
  }

  function onLeave() {
    // The one eased move, and it sits inside the site's motion band.
    inner.style.transition = 'transform 200ms linear';
    inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
  }

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  return {
    destroy() {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    },
  };
}
