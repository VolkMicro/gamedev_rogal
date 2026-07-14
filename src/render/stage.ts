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

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.app = new Application();
    this.world = new Container();
  }

  async init(canvasHost: HTMLElement): Promise<void> {
    await this.app.init({
      background: '#050505',
      resizeTo: window,
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
    window.addEventListener('resize', () => this.updateCamera(this.lastCamX, this.lastCamY));
  }

  /** Follows (camX, camY) in world/sim-pixel space with a fixed-size viewport window, clamped to the level bounds. */
  updateCamera(camX: number, camY: number, worldWidth = this.viewportWidth, worldHeight = this.viewportHeight): void {
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

    const letterboxX = (screenW - this.viewportWidth * scale) / 2;
    const letterboxY = (screenH - this.viewportHeight * scale) / 2;
    this.world.x = letterboxX - viewX * scale;
    this.world.y = letterboxY - viewY * scale;
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
