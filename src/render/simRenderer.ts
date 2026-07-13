import { Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import { MATERIAL_COLOR_RGBA } from '../sim/materials';

/**
 * Owns an offscreen canvas matching the sim's internal resolution, blits the
 * material grid into it every frame, and exposes it as a nearest-neighbor
 * Pixi sprite so it can be scaled up to fill the screen without blur.
 */
export class SimRenderer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private texture: Texture;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.imageData = ctx.createImageData(width, height);
    this.imageData.data.fill(255);

    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
  }

  render(world: World): void {
    const src = world.material;
    const dst = this.imageData.data;
    const lut = MATERIAL_COLOR_RGBA;
    for (let i = 0; i < src.length; i++) {
      const o = src[i] * 4;
      const d = i * 4;
      dst[d] = lut[o];
      dst[d + 1] = lut[o + 1];
      dst[d + 2] = lut[o + 2];
      dst[d + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }
}
