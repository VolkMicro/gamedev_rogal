import { Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import { Material, MATERIAL_COLOR_RGBA } from '../sim/materials';
import { FLOODED_START_FRACTION } from '../sim/generation';

const NOISE_TILE_SIZE = 32;
const NOISE_TILE_MASK = NOISE_TILE_SIZE - 1;

/** Deterministic cheap hash — same shape as sim/world.ts's hash2, kept local since this is a rendering-only concern. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Precomputed tileable brightness-jitter pattern (one lookup per pixel
 * instead of hashing every pixel every frame) so flat material fills read
 * as roughed-up stone/wood grain instead of a solid color blob.
 */
const NOISE_TILE = new Int8Array(NOISE_TILE_SIZE * NOISE_TILE_SIZE);
for (let y = 0; y < NOISE_TILE_SIZE; y++) {
  for (let x = 0; x < NOISE_TILE_SIZE; x++) {
    NOISE_TILE[y * NOISE_TILE_SIZE + x] = (hash2(x, y) % 16) - 8;
  }
}

const STONE_BRICK_W = 8; // power of two — cheap `& (w-1)` instead of `%`
const STONE_BRICK_H = 4;
const WOOD_PLANK_W = 3;
const MORTAR_DARKEN = 26;
const GRAIN_DARKEN = 20;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

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
    const floodedStartY = world.height * FLOODED_START_FRACTION;
    if (copyW < vw || copyH < vh) dst.fill(0);
    for (let row = 0; row < copyH; row++) {
      const worldY = oy + row;
      // Flooded Caverns palette: stone below the biome line shifts cold and
      // damp (teal-ish) so crossing into biome #2 is VISIBLE, not just a
      // different spawn table.
      const flooded = worldY > floodedStartY;
      let srcIdx = worldY * world.width + ox;
      let dstIdx = row * vw * 4;
      const brickRowOffset = (worldY >> 2) & 1 ? STONE_BRICK_W >> 1 : 0;
      const brickLocalY = worldY & (STONE_BRICK_H - 1);
      const noiseRow = (worldY & NOISE_TILE_MASK) * NOISE_TILE_SIZE;
      for (let col = 0; col < copyW; col++) {
        const matId = src[srcIdx];
        const o = matId * 4;
        let r = lut[o];
        let g = lut[o + 1];
        let b = lut[o + 2];

        if (matId === Material.Stone) {
          const worldX = ox + col;
          if (flooded) {
            r -= 18;
            g += 2;
            b += 18;
          }
          const isMortar = ((worldX + brickRowOffset) & (STONE_BRICK_W - 1)) === 0 || brickLocalY === 0;
          if (isMortar) {
            r -= MORTAR_DARKEN;
            g -= MORTAR_DARKEN;
            b -= MORTAR_DARKEN;
          } else {
            const n = NOISE_TILE[noiseRow + (worldX & NOISE_TILE_MASK)];
            r += n;
            g += n;
            b += n;
          }
        } else if (matId === Material.Wood) {
          const worldX = ox + col;
          const isGrainLine = worldX % WOOD_PLANK_W === 0;
          if (isGrainLine) {
            r -= GRAIN_DARKEN;
            g -= GRAIN_DARKEN;
            b -= GRAIN_DARKEN;
          } else {
            const n = NOISE_TILE[noiseRow + (worldX & NOISE_TILE_MASK)];
            r += n >> 1;
            g += n >> 1;
            b += n >> 1;
          }
        }

        dst[dstIdx] = clamp255(r);
        dst[dstIdx + 1] = clamp255(g);
        dst[dstIdx + 2] = clamp255(b);
        dst[dstIdx + 3] = 255;
        srcIdx++;
        dstIdx += 4;
      }
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }
}
