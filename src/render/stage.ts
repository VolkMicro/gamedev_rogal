import { Application, Container } from 'pixi.js';

/**
 * Sets up the Pixi application and a `world` container that all sim +
 * entity sprites live in. The camera always shows a FIXED `viewportWidth x
 * viewportHeight` window of the world (the sim's internal resolution),
 * uniformly scaled to fit the screen and letterboxed (black bars) on any
 * aspect-ratio mismatch — never more, never less. This keeps per-frame
 * render cost constant regardless of device screen size/orientation: a tall
 * phone gets bigger letterbox bars, not a bigger slice of the world to draw.
 * Entities outside the current view rect must be hidden by the caller (see
 * `isInView`) — a Pixi mask would clip them for free, but a real scissor
 * mask measured far more expensive than manual visibility culling here.
 */
export class Stage {
  readonly app: Application;
  readonly world: Container;
  private viewportWidth: number;
  private viewportHeight: number;
  private lastCamX = 0;
  private lastCamY = 0;
  private lastViewX = 0;
  private lastViewY = 0;
  private shakeTime = 0;
  private shakeMag = 0;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.app = new Application();
    this.world = new Container();
  }

  async init(canvasHost: HTMLElement, screenW: number, screenH: number): Promise<void> {
    await this.app.init({
      background: '#050505',
      // Manual sizing (not resizeTo: window): under fake-landscape (see
      // src/orientation.ts) the game's effective width/height are the
      // WINDOW'S SWAPPED dims, so the renderer must be sized by the caller
      // through resize(), never directly from window.inner*.
      width: screenW,
      height: screenH,
      antialias: false,
      // Fixed at 1 regardless of devicePixelRatio: everything drawn on this
      // canvas is deliberately blocky nearest-neighbor pixel art (no text or
      // vector content lives here — HUD/Camp/joystick UI are separate DOM
      // elements). A higher backing-store resolution buys zero visual
      // improvement for that content while costing real fragment-shader
      // fill-rate on high-DPI phones (2-3x devicePixelRatio is typical) —
      // `image-rendering: pixelated` on the canvas (index.html) keeps the
      // browser's own CSS upscale crisp instead of blurring it.
      resolution: 1,
      autoDensity: true,
    });
    canvasHost.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
  }

  /** Resizes the renderer to new effective screen dims (fake-landscape/orientation changes) and re-fits the camera. */
  resize(screenW: number, screenH: number): void {
    this.app.renderer.resize(screenW, screenH);
    this.updateCamera(this.lastCamX, this.lastCamY);
  }

  /** Queues a brief camera shake — magnitude in world-px, duration in seconds. Repeated calls take the stronger/longer of the two rather than stacking, so overlapping hits don't fling the camera off wildly. */
  addShake(magnitude: number, duration: number): void {
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /** Follows (camX, camY) in world/sim-pixel space with a fixed-size viewport window, clamped to the level bounds. `dt` (seconds) decays any active shake — omit it for callers that don't need shake (e.g. camp/menu screens). */
  updateCamera(camX: number, camY: number, worldWidth = this.viewportWidth, worldHeight = this.viewportHeight, dt = 0): void {
    this.lastCamX = camX;
    this.lastCamY = camY;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const scale = Math.min(screenW / this.viewportWidth, screenH / this.viewportHeight);
    this.world.scale.set(scale);

    let viewX = camX - this.viewportWidth / 2;
    let viewY = camY - this.viewportHeight / 2;
    viewX =
      worldWidth <= this.viewportWidth ? 0 : Math.max(0, Math.min(worldWidth - this.viewportWidth, viewX));
    viewY =
      worldHeight <= this.viewportHeight ? 0 : Math.max(0, Math.min(worldHeight - this.viewportHeight, viewY));
    this.lastViewX = viewX;
    this.lastViewY = viewY;

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }
    const shakeX = this.shakeMag > 0 ? (Math.random() * 2 - 1) * this.shakeMag : 0;
    const shakeY = this.shakeMag > 0 ? (Math.random() * 2 - 1) * this.shakeMag : 0;

    const letterboxX = (screenW - this.viewportWidth * scale) / 2;
    const letterboxY = (screenH - this.viewportHeight * scale) / 2;
    this.world.x = letterboxX - viewX * scale + shakeX * scale;
    this.world.y = letterboxY - viewY * scale + shakeY * scale;
  }

  /** World-space top-left corner of the fixed viewport window, for cropped rendering. */
  getViewOriginWorld(): { x: number; y: number } {
    return { x: this.lastViewX, y: this.lastViewY };
  }

  /** True if a world-space point (+margin) falls within the currently visible viewport window. */
  isInView(x: number, y: number, margin = 8): boolean {
    return (
      x >= this.lastViewX - margin &&
      x <= this.lastViewX + this.viewportWidth + margin &&
      y >= this.lastViewY - margin &&
      y <= this.lastViewY + this.viewportHeight + margin
    );
  }
}
