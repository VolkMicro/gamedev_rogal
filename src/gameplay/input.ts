const STICK_RADIUS = 40;
const AIM_DEADZONE = 8;

/**
 * Left half: virtual stick for horizontal movement (up-hold levitation lands
 * later, once its resource cost is balanced — see GDD open questions).
 * Right half: aim stick — hold and drag to aim, direction + magnitude expose
 * as aimX/aimY/aiming for the wand to read every frame.
 * Jump has its own corner button since the final control scheme (GDD §6)
 * doesn't reserve a gesture for it.
 */
export class InputController {
  moveX = 0;
  aimX = 0;
  aimY = 0;
  aiming = false;

  private jumpQueued = false;
  private movePointerId: number | null = null;
  private moveOriginX = 0;
  private aimPointerId: number | null = null;
  private aimOriginX = 0;
  private aimOriginY = 0;
  private keys = new Set<string>();
  private el: HTMLElement;

  constructor(el: HTMLElement, jumpButton: HTMLElement) {
    this.el = el;
    // Not passive: a drag can otherwise trigger the browser's native
    // image/canvas drag gesture or text selection, which silently steals
    // the rest of the pointer sequence (looks like "aiming randomly stops
    // working" on real devices/desktop mice even though the state machine
    // itself is correct — reproduced this cleanly with synthetic events).
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    jumpButton.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.jumpQueued = true;
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // If the window/webview loses focus mid-drag (alt-tab, Telegram
    // backgrounding the app, OS gesture, ...) no pointerup ever arrives and
    // the stick would otherwise stay stuck firing/moving forever.
    window.addEventListener('blur', this.resetAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetAll();
    });
  }

  /** Call once per frame; clears the one-shot jump flag. */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  private resetAll = (): void => {
    this.movePointerId = null;
    this.aimPointerId = null;
    this.moveX = 0;
    this.aiming = false;
    this.keys.clear();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.jumpQueued = true;
    this.updateKeyboardMove();
    this.updateKeyboardAim();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.updateKeyboardMove();
    this.updateKeyboardAim();
  };

  private updateKeyboardMove(): void {
    if (this.movePointerId !== null) return;
    let x = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    this.moveX = x;
  }

  /** IJKL aims/fires on desktop, since there's no second pointer without a touchscreen. */
  private updateKeyboardAim(): void {
    if (this.aimPointerId !== null) return;
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyJ')) x -= 1;
    if (this.keys.has('KeyL')) x += 1;
    if (this.keys.has('KeyI')) y -= 1;
    if (this.keys.has('KeyK')) y += 1;
    this.aiming = x !== 0 || y !== 0;
    if (this.aiming) {
      const len = Math.hypot(x, y);
      this.aimX = x / len;
      this.aimY = y / len;
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    const isLeftHalf = e.clientX < window.innerWidth / 2;
    if (isLeftHalf) {
      if (this.movePointerId !== null) return;
      this.movePointerId = e.pointerId;
      this.moveOriginX = e.clientX;
    } else {
      if (this.aimPointerId !== null) return;
      this.aimPointerId = e.pointerId;
      this.aimOriginX = e.clientX;
      this.aimOriginY = e.clientY;
    }
    // Guarantees this pointer's move/up events keep targeting `el` even if
    // it strays outside the element's bounds mid-drag — without this a fast
    // drag can "escape" and stop delivering events, leaving the stick stuck.
    this.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === this.movePointerId) {
      const dx = e.clientX - this.moveOriginX;
      const clamped = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dx));
      this.moveX = clamped / STICK_RADIUS;
      e.preventDefault();
    } else if (e.pointerId === this.aimPointerId) {
      const dx = e.clientX - this.aimOriginX;
      const dy = e.clientY - this.aimOriginY;
      const dist = Math.hypot(dx, dy);
      if (dist >= AIM_DEADZONE) {
        this.aiming = true;
        this.aimX = dx / dist;
        this.aimY = dy / dist;
      } else {
        this.aiming = false;
      }
      e.preventDefault();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveX = 0;
      this.updateKeyboardMove();
    } else if (e.pointerId === this.aimPointerId) {
      this.aimPointerId = null;
      this.aiming = false;
      this.updateKeyboardAim();
    }
  };
}
