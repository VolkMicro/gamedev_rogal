import { Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import { MATERIAL_COLOR_RGBA } from '../sim/materials';

/**
 * Owns an offscreen canvas fixed at the sim's internal resolution
 * (viewportWidth x viewportHeight — see Stage) and blits only that
 * camera-following slice of the world's material grid into it each frame.
 * The level can be many screens tall without per-frame cost growing, since
 * we only ever touch viewportW*viewportH pixels regardless of device screen
 * size (Stage letterboxes rather than showing more world on generous
 * aspect ratios). Exposed as a nearest-neighbor Pixi sprite positioned at
 * the crop's world-space origin so it lines up with entities in the same
 * (camera-panned) container.
 */
export class SimRenderer {
  readonly sprite: Sprite;
  private viewportWidth: number;
  private viewportHeight: number;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private texture: Texture;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    const canvas = document.createElement('canvas');
    canvas.width = viewportWidth;
    canvas.height = viewportHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.imageData = ctx.createImageData(viewportWidth, viewportHeight);
    this.imageData.data.fill(255);

    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
  }

  /** originX/originY: world-space top-left of the fixed viewport window (Stage.getViewOriginWorld()). */
  render(world: World, originX: number, originY: number): void {
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    const ox = Math.max(0, Math.min(Math.max(0, world.width - vw), Math.floor(originX)));
    const oy = Math.max(0, Math.min(Math.max(0, world.height - vh), Math.floor(originY)));
    this.sprite.x = ox;
    this.sprite.y = oy;

    const src = world.material;
    const dst = this.imageData.data;
    const lut = MATERIAL_COLOR_RGBA;
    const copyW = Math.min(vw, world.width - ox);
    const copyH = Math.min(vh, world.height - oy);
    if (copyW < vw || copyH < vh) dst.fill(0);
    for (let row = 0; row < copyH; row++) {
      const worldY = oy + row;
      let srcIdx = worldY * world.width + ox;
      let dstIdx = row * vw * 4;
      for (let col = 0; col < copyW; col++) {
        const o = src[srcIdx] * 4;
        dst[dstIdx] = lut[o];
        dst[dstIdx + 1] = lut[o + 1];
        dst[dstIdx + 2] = lut[o + 2];
        dst[dstIdx + 3] = 255;
        srcIdx++;
        dstIdx += 4;
      }
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }
}
