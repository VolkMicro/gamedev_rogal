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

interface TelegramInsets {
  safeAreaInset?: { top?: number; bottom?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number };
}

/**
 * Game-space safe insets while fake-landscape is active. The PORTRAIT
 * screen's top edge — iOS status bar (clock) plus Telegram's own header
 * buttons («Закрыть», chevron) — maps onto the game's LEFT edge, exactly
 * where the move stick and HP bar idle; touches there hit Telegram's UI
 * instead of the game (reported as "кнопка и стик управления в 1 месте").
 * The portrait bottom (iOS home indicator) maps to the game's right edge.
 * Uses Telegram's Bot API 8.0 inset reports when present, with a fallback
 * large enough for a notched iPhone + Telegram header.
 */
export function gameSafeInsets(): { left: number; right: number } {
  if (!rotated) return { left: 0, right: 0 };
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramInsets } }).Telegram?.WebApp;
  const sysTop = tg?.safeAreaInset?.top ?? 0;
  const headerTop = tg?.contentSafeAreaInset?.top ?? 0;
  const sysBottom = tg?.safeAreaInset?.bottom ?? 0;
  return {
    left: Math.max(110, sysTop + headerTop + 10),
    // The game-right edge is the portrait BOTTOM — the iOS home-indicator
    // swipe zone. A drag that strays into it gets eaten/cancelled by the
    // system, which reads as "the aim stick randomly stops working", so the
    // stick idles well clear of it.
    right: Math.max(60, sysBottom + 20),
  };
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
    // CSS vars so DOM UI (HUD etc.) can offset itself away from Telegram's
    // overlay without importing this module's JS values.
    const insets = gameSafeInsets();
    document.documentElement.style.setProperty('--game-safe-left', `${insets.left}px`);
    document.documentElement.style.setProperty('--game-safe-right', `${insets.right}px`);
    onChange();
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  apply();
}
