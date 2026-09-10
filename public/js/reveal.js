/**
 * Before-and-after comparison slider — a ported Reveal2, no framework.
 *
 * The original is a React component with Tailwind classes and a shadcn Badge.
 * The mechanism is a clip-path and a pointer position, which is plain DOM, so
 * it ports exactly; the skin speaks in this site's tokens instead.
 *
 * Two things were added rather than copied:
 *
 *   - KEYBOARD. The original marks the box role="slider" with tabIndex={0} and
 *     an aria-valuenow, then handles no keys at all. That is a control that
 *     announces itself as operable and cannot be operated, which is worse than
 *     not claiming the role. Arrows move it, Home and End go to the ends,
 *     PageUp/PageDown take bigger steps.
 *   - POINTER CAPTURE. The original attaches mousemove and touchmove to the
 *     document on drag. One pointerdown with capture covers mouse, touch and
 *     pen in a single path, and the drag survives leaving the element.
 */

const clamp = (n) => Math.max(0, Math.min(100, n));

export function createReveal(root, opts = {}) {
  const {
    before,
    after,
    beforeLabel = 'Before',
    afterLabel = 'After',
    caption = '',
    start = 50,
    label = 'Before and after',
  } = opts;
  if (!before || !after) return null;

  let position = clamp(start);

  root.className = 'reveal-slider';
  root.innerHTML = `
    <figure class="rv-figure">
      <div class="rv-box" role="slider" tabindex="0"
           aria-label="${label}" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(position)}"
           aria-valuetext="${Math.round(position)}% before">
        <img class="rv-img rv-after" src="${after}" alt="${afterLabel}" draggable="false" loading="lazy" decoding="async">
        <div class="rv-clip">
          <img class="rv-img rv-before" src="${before}" alt="${beforeLabel}" draggable="false" loading="lazy" decoding="async">
        </div>
        <span class="rv-tag rv-tag-before">${beforeLabel}</span>
        <span class="rv-tag rv-tag-after">${afterLabel}</span>
        <div class="rv-divider" aria-hidden="true">
          <span class="rv-handle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M9.5 8.5 6 12l3.5 3.5M14.5 8.5 18 12l-3.5 3.5"/>
            </svg>
          </span>
        </div>
      </div>
      ${caption ? `<figcaption class="rv-caption">${caption}</figcaption>` : ''}
    </figure>`;

  const box = root.querySelector('.rv-box');
  const clip = root.querySelector('.rv-clip');
  const divider = root.querySelector('.rv-divider');

  function paint() {
    // The before image is the full frame, revealed from the left. Clipping the
    // WRAPPER rather than the image keeps the photo itself unscaled, so the two
    // halves always line up whatever the position.
    clip.style.clipPath = `inset(0 ${100 - position}% 0 0)`;
    divider.style.left = `${position}%`;
    box.setAttribute('aria-valuenow', String(Math.round(position)));
    box.setAttribute('aria-valuetext', `${Math.round(position)}% before`);
  }

  function moveTo(clientX) {
    const rect = box.getBoundingClientRect();
    if (!rect.width) return;
    position = clamp(((clientX - rect.left) / rect.width) * 100);
    paint();
  }

  let dragging = false;
  box.addEventListener('pointerdown', (e) => {
    dragging = true;
    box.setPointerCapture(e.pointerId);
    box.classList.add('is-dragging');
    moveTo(e.clientX);
    e.preventDefault();
  });
  box.addEventListener('pointermove', (e) => { if (dragging) moveTo(e.clientX); });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('is-dragging');
    if (box.hasPointerCapture?.(e.pointerId)) box.releasePointerCapture(e.pointerId);
  };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);

  box.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -2, ArrowRight: 2, PageDown: -10, PageUp: 10 }[e.key];
    if (step !== undefined) { position = clamp(position + step); paint(); e.preventDefault(); return; }
    if (e.key === 'Home') { position = 0; paint(); e.preventDefault(); }
    else if (e.key === 'End') { position = 100; paint(); e.preventDefault(); }
  });

  paint();
  return { set: (n) => { position = clamp(n); paint(); } };
}
