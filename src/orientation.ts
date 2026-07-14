/**
 * Fake-landscape support. Telegram's phone clients essentially never rotate
 * their own UI, so a "rotate your phone" prompt is a dead end — the WebView
 * stays portrait no matter what the player does (the exact reported bug:
 * "надо сперва телегу перевернуть и только тогда можно будет поиграть").
 * Instead, when the viewport is portrait we rotate the ENTIRE page 90°
 * ourselves via a CSS transform on <body>. Because a transformed element
 * becomes the containing block for position:fixed descendants, every DOM
 * surface (HUD, joysticks, overlays, camp) rotates along for free; only two
 * things need explicit handling — the renderer's pixel size (effectiveSize)
 * and pointer coordinates (mapPointer), both of which the rest of the code
 * reads through this module instead of touching window.inner* directly.
 */

let rotated = false;

export function isRotated(): boolean {
  return rotated;
}

/** Game-space viewport size: swapped window dims while fake-landscape is active. */
export function effectiveSize(): { width: number; height: number } {
  return rotated
    ? { width: window.innerHeight, height: window.innerWidth }
    : { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Screen-space pointer coords → game-space. With `rotate(90deg)
 * translateY(-100%)` from a top-left origin, a body point (x, y) lands on
 * screen at (innerWidth - y, x); this is that mapping inverted.
 */
export function mapPointer(clientX: number, clientY: number): { x: number; y: number } {
  if (!rotated) return { x: clientX, y: clientY };
  return { x: clientY, y: window.innerWidth - clientX };
}

/**
 * Installs the rotation and keeps it in sync with viewport changes.
 * `onChange` fires after every re-evaluation (including the initial one) so
 * the renderer can resize itself to the new effective dimensions.
 */
export function setupFakeLandscape(onChange: () => void): void {
  const apply = (): void => {
    rotated = window.innerHeight > window.innerWidth;
    const b = document.body;
    if (rotated) {
      b.style.transformOrigin = 'top left';
      b.style.transform = 'rotate(90deg) translateY(-100%)';
      b.style.width = `${window.innerHeight}px`;
      b.style.height = `${window.innerWidth}px`;
    } else {
      b.style.transform = '';
      b.style.width = '';
      b.style.height = '';
    }
    onChange();
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  apply();
}
