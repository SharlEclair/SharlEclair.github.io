/**
 * Scroll -> progress mapping (docs/06 §1) and render-loop visibility gating (docs/06 §2).
 *
 * Everything here is deliberately free of timers and of the clock: progress is a pure function of
 * `window.scrollY` and the hero container's measured rect, and the only override is the docs/07 §2
 * test hook.
 */

/**
 * @param {object} options
 * @param {HTMLElement} options.hero the tall container that defines the 0..1 runway
 * @param {Window} [options.viewport] injectable for tests
 */
export function createProgress({ hero, viewport = window }) {
  let heroTop = 0; // document-space offset of the hero's top edge
  let range = 0; // scrollable distance that maps to a full 0 -> 1 sweep
  let override = null; // docs/07 §2: wins over scroll while set

  /**
   * Re-measure the runway. Called on load and on every resize; never inside the render loop, so
   * the runtime performs at most one layout read per resize (docs/06 §2 / Step 4 hardening).
   */
  function measure() {
    const rect = hero.getBoundingClientRect();
    heroTop = rect.top + viewport.scrollY;
    range = rect.height - viewport.innerHeight;
  }

  /** @returns {number} clamped u_progress in 0..1 (0 when the runway has no scrollable range) */
  function read() {
    if (override !== null) {
      return override;
    }
    if (!(range > 0)) {
      return 0; // zero-height container: clamp instead of dividing by zero (no NaN downstream)
    }
    const scrolled = (viewport.scrollY - heroTop) / range;
    if (scrolled < 0) {
      return 0;
    }
    if (scrolled > 1) {
      return 1;
    }
    return scrolled;
  }

  /**
   * docs/07 §2: force u_progress, bypassing scroll until cleared.
   * @param {number|null} value progress to force, or null to hand control back to scroll
   * @returns {number|null} the accepted override
   */
  function setOverride(value) {
    override =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : null;
    return override;
  }

  measure();

  return {
    measure,
    read,
    setOverride,
    get overridden() {
      return override !== null;
    }
  };
}

/**
 * docs/06 §2: stop rendering while the WebGL container is off-screen; resume when it returns.
 *
 * The callbacks fire only on a real transition, so the initial "on-screen at load" state is the
 * caller's job (render once, then start the loop).
 *
 * @param {HTMLElement} element
 * @param {{ onVisible: () => void, onHidden: () => void }} handlers
 */
export function observeVisibility(element, { onVisible, onHidden }) {
  let visible = true;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const next = entry.isIntersecting;
        if (next === visible) {
          continue;
        }
        visible = next;
        if (next) {
          onVisible();
        } else {
          onHidden();
        }
      }
    },
    { threshold: 0 }
  );
  observer.observe(element);

  return {
    get visible() {
      return visible;
    },
    disconnect() {
      observer.disconnect();
    }
  };
}
