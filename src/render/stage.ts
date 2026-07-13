import { Application, Container } from 'pixi.js';

/**
 * Sets up the Pixi application and a `world` container that all sim + entity
 * sprites live in. The container is scaled uniformly (nearest-neighbor,
 * letterboxed) so `simWidth x simHeight` sim-pixels always map to whole
 * screen pixels, keeping pixel art crisp on any screen/orientation.
 */
export class Stage {
  readonly app: Application;
  readonly world: Container;
  private simWidth: number;
  private simHeight: number;

  constructor(simWidth: number, simHeight: number) {
    this.simWidth = simWidth;
    this.simHeight = simHeight;
    this.app = new Application();
    this.world = new Container();
  }

  async init(canvasHost: HTMLElement): Promise<void> {
    await this.app.init({
      background: '#050505',
      resizeTo: window,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    canvasHost.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const scale = Math.min(screenW / this.simWidth, screenH / this.simHeight);
    this.world.scale.set(scale);
    this.world.x = (screenW - this.simWidth * scale) / 2;
    this.world.y = (screenH - this.simHeight * scale) / 2;
  }
}
