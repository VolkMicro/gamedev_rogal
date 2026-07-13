interface TelegramWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setBackgroundColor?(color: string): void;
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
}

export function haptic(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
  window.Telegram?.WebApp.HapticFeedback?.impactOccurred(style);
}
