const STICK_RADIUS = 40;

/**
 * Left-half virtual stick for horizontal movement, tap-anywhere for jump.
 * The full left-stick/right-aim scheme from the GDD lands with the wand in
 * stage 2; this stage only needs run + jump.
 */
export class InputController {
  moveX = 0;
  private jumpQueued = false;
  private stickPointerId: number | null = null;
  private stickOriginX = 0;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    el.addEventListener('pointermove', this.onPointerMove, { passive: true });
    el.addEventListener('pointerup', this.onPointerUp, { passive: true });
    el.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Call once per frame; clears the one-shot jump flag. */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  private keys = new Set<string>();

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.jumpQueued = true;
    this.updateKeyboardMove();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.updateKeyboardMove();
  };

  private updateKeyboardMove(): void {
    if (this.stickPointerId !== null) return;
    let x = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    this.moveX = x;
  }

  private onPointerDown = (e: PointerEvent) => {
    const isLeftHalf = e.clientX < window.innerWidth / 2;
    if (isLeftHalf && this.stickPointerId === null) {
      this.stickPointerId = e.pointerId;
      this.stickOriginX = e.clientX;
    } else if (!isLeftHalf) {
      this.jumpQueued = true;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointerId) return;
    const dx = e.clientX - this.stickOriginX;
    const clamped = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dx));
    this.moveX = clamped / STICK_RADIUS;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    this.moveX = 0;
    this.updateKeyboardMove();
  };
}
