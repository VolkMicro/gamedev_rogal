import { TouchControls } from './touchControls';
import { mapPointer, effectiveSize } from '../orientation';

const STICK_RADIUS = 40;
const AIM_DEADZONE = 8;
/** Move stick: dragging up past this (screen px, negative = up) queues a jump. */
const JUMP_TRIGGER_DY = -26;
/** Must drag back below this (closer to center) before another flick-up can jump again — avoids one long upward hold spamming jumps. */
const JUMP_REARM_DY = -12;

/**
 * Left half: virtual stick for horizontal movement; dragging it up past a
 * threshold queues a jump (flick up, no dedicated button — matches how
 * players actually reach for a single left-thumb stick on mobile).
 * Right half: aim stick — hold and drag to aim, direction + magnitude expose
 * as aimX/aimY/aiming for the wand to read every frame.
 * Visual feedback for both sticks lives in TouchControls — this class stays
 * focused on input state/logic.
 */
export class InputController {
  moveX = 0;
  aimX = 0;
  aimY = 0;
  aiming = false;

  private jumpQueued = false;
  private jumpArmed = true;
  private movePointerId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private aimPointerId: number | null = null;
  private aimOriginX = 0;
  private aimOriginY = 0;
  private keys = new Set<string>();
  private el: HTMLElement;
  private touchControls: TouchControls;

  constructor(el: HTMLElement) {
    this.el = el;
    this.touchControls = new TouchControls();
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
    this.jumpArmed = true;
    this.aiming = false;
    this.keys.clear();
    this.touchControls.moveRelease();
    this.touchControls.aimRelease();
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
    // Game-space coords — under fake-landscape (see src/orientation.ts) the
    // raw client coords are in the un-rotated screen frame and would swap
    // the stick axes.
    const p = mapPointer(e.clientX, e.clientY);
    const isLeftHalf = p.x < effectiveSize().width / 2;
    if (isLeftHalf) {
      if (this.movePointerId !== null) return;
      this.movePointerId = e.pointerId;
      this.moveOriginX = p.x;
      this.moveOriginY = p.y;
      this.jumpArmed = true;
      this.touchControls.moveActivate(p.x, p.y);
    } else {
      if (this.aimPointerId !== null) return;
      this.aimPointerId = e.pointerId;
      this.aimOriginX = p.x;
      this.aimOriginY = p.y;
      this.touchControls.aimActivate(p.x, p.y);
    }
    // Guarantees this pointer's move/up events keep targeting `el` even if
    // it strays outside the element's bounds mid-drag — without this a fast
    // drag can "escape" and stop delivering events, leaving the stick stuck.
    this.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = mapPointer(e.clientX, e.clientY);
    if (e.pointerId === this.movePointerId) {
      const dx = p.x - this.moveOriginX;
      const dy = p.y - this.moveOriginY;
      const clamped = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dx));
      this.moveX = clamped / STICK_RADIUS;

      if (dy <= JUMP_TRIGGER_DY && this.jumpArmed) {
        this.jumpQueued = true;
        this.jumpArmed = false;
      } else if (dy > JUMP_REARM_DY) {
        this.jumpArmed = true;
      }

      const visualY = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dy)) / STICK_RADIUS;
      this.touchControls.moveUpdate(this.moveX, visualY);
      e.preventDefault();
    } else if (e.pointerId === this.aimPointerId) {
      const dx = p.x - this.aimOriginX;
      const dy = p.y - this.aimOriginY;
      const dist = Math.hypot(dx, dy);
      if (dist >= AIM_DEADZONE) {
        this.aiming = true;
        this.aimX = dx / dist;
        this.aimY = dy / dist;
      } else {
        this.aiming = false;
      }
      const visualMag = Math.min(dist, STICK_RADIUS) / STICK_RADIUS;
      this.touchControls.aimUpdate(dist > 0 ? (dx / dist) * visualMag : 0, dist > 0 ? (dy / dist) * visualMag : 0);
      e.preventDefault();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveX = 0;
      this.jumpArmed = true;
      this.updateKeyboardMove();
      this.touchControls.moveRelease();
    } else if (e.pointerId === this.aimPointerId) {
      this.aimPointerId = null;
      this.aiming = false;
      this.updateKeyboardAim();
      this.touchControls.aimRelease();
    }
  };
}
