interface TelegramWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setBackgroundColor?(color: string): void;
  /** Bot API 8.0+. Older Telegram clients don't have this — always optional-chained. */
  lockOrientation?(orientation: 'portrait' | 'landscape'): void;
  /** Bot API 8.0+. In fullscreen the WebView can actually rotate, making lockOrientation effective. */
  requestFullscreen?(): void;
  isVersionAtLeast?(version: string): boolean;
  openTelegramLink?(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  };
  themeParams?: Record<string, string>;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

/**
 * Thin wrapper around the Telegram WebApp bridge. All calls are no-ops when
 * running outside Telegram (plain browser dev/testing), so the rest of the
 * game never needs to branch on "am I in Telegram?".
 */
export function initTelegram(): void {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    console.info('[telegram] not running inside Telegram, skipping WebApp init');
    return;
  }
  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  webApp.setBackgroundColor?.('#050505');
  // Best-effort native landscape — only Bot API 8.0+ clients support these,
  // and lockOrientation only takes effect in fullscreen. For everyone else
  // (and whenever this fails) the real fix is src/orientation.ts's
  // fake-landscape: the page rotates ITSELF, since Telegram's phone clients
  // never rotate their own UI no matter what the player does.
  try {
    // Version-gated (not just optional-chained): the telegram-web-app.js shim
    // DEFINES these methods on every client but logs a console error when the
    // underlying client is older than 8.0, so presence-checking isn't enough.
    if (webApp.isVersionAtLeast?.('8.0')) {
      webApp.requestFullscreen?.();
      webApp.lockOrientation?.('landscape');
    }
  } catch {
    // Some Telegram builds throw instead of no-op'ing — ignore either way.
  }
}

export function haptic(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
  window.Telegram?.WebApp.HapticFeedback?.impactOccurred(style);
}

const GAME_LINK = 'https://t.me/WickGameBot_bot';

/**
 * Opens Telegram's share sheet pre-filled with `text` + the game link — the
 * shareable-moment hook from the design council plan. Static-hosting
 * friendly: a t.me/share link needs no bot server, unlike shareMessage()
 * (which requires server-side prepared messages). Falls back to a plain
 * window.open outside Telegram.
 */
export function shareText(text: string): void {
  const url = `https://t.me/share/url?url=${encodeURIComponent(GAME_LINK)}&text=${encodeURIComponent(text)}`;
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openTelegramLink) webApp.openTelegramLink(url);
  else window.open(url, '_blank');
}
