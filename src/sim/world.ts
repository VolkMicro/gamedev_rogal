import { Material, MaterialState, MATERIALS } from './materials';

export const CHUNK_SIZE = 64;

/** Simple xorshift-based hash for cheap per-cell pseudo-randomness without allocating a PRNG object per call. */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export class World {
  readonly width: number;
  readonly height: number;
  readonly chunksX: number;
  readonly chunksY: number;

  material: Uint8Array;
  /** Scratch byte per cell: remaining burn ticks for Fire, unused otherwise. */
  aux: Uint8Array;

  private activeCurrent: Uint8Array;
  private activeNext: Uint8Array;
  private tick = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    this.material = new Uint8Array(width * height);
    this.aux = new Uint8Array(width * height);
    const chunkCount = this.chunksX * this.chunksY;
    this.activeCurrent = new Uint8Array(chunkCount).fill(1);
    this.activeNext = new Uint8Array(chunkCount);
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): Material {
    return this.material[this.idx(x | 0, y | 0)] as Material;
  }

  /** Bulk-fills the whole grid without per-cell chunk bookkeeping. Only for level generation, before the first step(). */
  fillAll(mat: Material): void {
    this.material.fill(mat);
    this.aux.fill(0);
  }

  /**
   * Sets a cell directly and wakes its chunk (+ neighbor chunks if on a
   * border). Use for scene setup / spawners.
   *
   * Floors x/y first: `material` is a Uint8Array, and per the JS spec a
   * TypedArray write with a non-integer numeric index is a silent no-op
   * (not an error, not a warning) — anything computed via division-by-2
   * centering math (extremely common here: `left = center - width / 2`)
   * can land on a `.5` coordinate, which would otherwise carve nothing at
   * all with zero indication anything went wrong. Cost this once here
   * rather than trusting every call site to remember to floor.
   */
  set(x: number, y: number, mat: Material, aux = 0): void {
    const fx = x | 0;
    const fy = y | 0;
    if (!this.inBounds(fx, fy)) return;
    const i = this.idx(fx, fy);
    this.material[i] = mat;
    this.aux[i] = aux;
    this.wake(fx, fy);
  }

  isEmpty(x: number, y: number): boolean {
    const fx = x | 0;
    const fy = y | 0;
    return this.inBounds(fx, fy) && this.material[this.idx(fx, fy)] === Material.Empty;
  }

  isSolidForPlayer(x: number, y: number): boolean {
    const fx = x | 0;
    const fy = y | 0;
    if (!this.inBounds(fx, fy)) return true;
    return MATERIALS[this.material[this.idx(fx, fy)] as Material].solidForPlayer;
  }

  private chunkIndex(cx: number, cy: number): number {
    return cy * this.chunksX + cx;
  }

  private wake(x: number, y: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    this.activeNext[this.chunkIndex(cx, cy)] = 1;
    // Wake neighbor chunks when the write happens on a chunk border, since the
    // neighbor's edge cells now border a possibly-changed cell.
    const localX = x - cx * CHUNK_SIZE;
    const localY = y - cy * CHUNK_SIZE;
    if (localX === 0 && cx > 0) this.activeNext[this.chunkIndex(cx - 1, cy)] = 1;
    if (localX === CHUNK_SIZE - 1 && cx < this.chunksX - 1) this.activeNext[this.chunkIndex(cx + 1, cy)] = 1;
    if (localY === 0 && cy > 0) this.activeNext[this.chunkIndex(cx, cy - 1)] = 1;
    if (localY === CHUNK_SIZE - 1 && cy < this.chunksY - 1) this.activeNext[this.chunkIndex(cx, cy + 1)] = 1;
  }

  private swap(x1: number, y1: number, x2: number, y2: number): void {
    const i1 = this.idx(x1, y1);
    const i2 = this.idx(x2, y2);
    const tm = this.material[i1];
    const ta = this.aux[i1];
    this.material[i1] = this.material[i2];
    this.aux[i1] = this.aux[i2];
    this.material[i2] = tm;
    this.aux[i2] = ta;
    this.wake(x1, y1);
    this.wake(x2, y2);
  }

  activeChunkCount(): number {
    let n = 0;
    for (let i = 0; i < this.activeCurrent.length; i++) n += this.activeCurrent[i];
    return n;
  }

  totalChunkCount(): number {
    return this.activeCurrent.length;
  }

  step(): void {
    this.activeNext.fill(0);
    // Bottom-to-top chunk rows so a multi-row fall resolves in a single pass.
    for (let cy = this.chunksY - 1; cy >= 0; cy--) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        if (!this.activeCurrent[this.chunkIndex(cx, cy)]) continue;
        this.stepChunk(cx, cy);
      }
    }
    const swapTmp = this.activeCurrent;
    this.activeCurrent = this.activeNext;
    this.activeNext = swapTmp;
    this.tick++;
  }

  private stepChunk(cx: number, cy: number): void {
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(x0 + CHUNK_SIZE, this.width);
    const y1 = Math.min(y0 + CHUNK_SIZE, this.height);
    for (let y = y1 - 1; y >= y0; y--) {
      const leftToRight = ((this.tick + y) & 1) === 0;
      if (leftToRight) {
        for (let x = x0; x < x1; x++) this.updateCell(x, y);
      } else {
        for (let x = x1 - 1; x >= x0; x--) this.updateCell(x, y);
      }
    }
  }

  private updateCell(x: number, y: number): void {
    const mat = this.material[this.idx(x, y)] as Material;
    if (mat === Material.Ice) {
      this.updateIce(x, y);
      return;
    }
    const state = MATERIALS[mat].state;
    if (state === MaterialState.Powder) this.updatePowder(x, y, mat);
    else if (state === MaterialState.Liquid) {
      // Run neighbor-affecting effects BEFORE movement — updateLiquid can
      // swap this cell's contents elsewhere, so touching (x,y) afterward
      // could act on whatever material got swapped in, not the Lava/Acid
      // that was actually here this tick.
      if (mat === Material.Lava) this.updateLavaEffects(x, y);
      else if (mat === Material.Acid) this.updateAcidEffects(x, y);
      this.updateLiquid(x, y, mat);
    } else if (state === MaterialState.Fire) this.updateFire(x, y);
  }

  private igniteFlammableNeighbor(nx: number, ny: number, chancePercent: number): void {
    if (!this.inBounds(nx, ny)) return;
    const nMat = this.material[this.idx(nx, ny)] as Material;
    const def = MATERIALS[nMat];
    if (def.flammable && hash2(nx, ny, this.tick) % 100 < chancePercent) {
      this.set(nx, ny, Material.Fire, def.burnTime ?? 45);
    }
  }

  /** Lava ignites nearby flammables like Fire does, and extinguishes into Stone on contact with Water (steam). */
  private updateLavaEffects(x: number, y: number): void {
    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!this.inBounds(nx, ny)) continue;
      if ((this.material[this.idx(nx, ny)] as Material) === Material.Water) {
        this.set(nx, ny, Material.Stone);
        this.set(x, y, Material.Stone);
        return;
      }
    }
    for (const [nx, ny] of neighbors) this.igniteFlammableNeighbor(nx, ny, 8);
  }

  /** Acid dissolves one adjacent solid cell per tick, consuming its own potency (aux) until spent. */
  private updateAcidEffects(x: number, y: number): void {
    const i = this.idx(x, y);
    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!this.inBounds(nx, ny)) continue;
      const nMat = this.material[this.idx(nx, ny)] as Material;
      if (
        (nMat === Material.Stone || nMat === Material.Wood || nMat === Material.Sand) &&
        hash2(nx, ny, this.tick) % 100 < 10
      ) {
        this.set(nx, ny, Material.Empty);
        const life = this.aux[i] - 1;
        if (life <= 0) {
          this.set(x, y, Material.Empty);
        } else {
          this.aux[i] = life;
          this.wake(x, y);
        }
        return;
      }
    }
  }

  /** Ice is a temporary platform (Ice Shard spell freezing Water) that melts back to Water once its aux countdown runs out. */
  private updateIce(x: number, y: number): void {
    const i = this.idx(x, y);
    const life = this.aux[i] - 1;
    if (life <= 0) {
      this.set(x, y, Material.Water);
      return;
    }
    this.aux[i] = life;
    this.wake(x, y);
  }

  private canPowderEnter(mat: Material, target: Material): boolean {
    if (target === Material.Empty) return true;
    return MATERIALS[target].state === MaterialState.Liquid && MATERIALS[mat].density > MATERIALS[target].density;
  }

  private updatePowder(x: number, y: number, mat: Material): void {
    if (this.inBounds(x, y + 1) && this.canPowderEnter(mat, this.material[this.idx(x, y + 1)] as Material)) {
      this.swap(x, y, x, y + 1);
      return;
    }
    const preferLeft = (hash2(x, y, this.tick) & 1) === 0;
    const dx1 = preferLeft ? -1 : 1;
    const dx2 = -dx1;
    if (this.inBounds(x + dx1, y + 1) && this.canPowderEnter(mat, this.material[this.idx(x + dx1, y + 1)] as Material)) {
      this.swap(x, y, x + dx1, y + 1);
      return;
    }
    if (this.inBounds(x + dx2, y + 1) && this.canPowderEnter(mat, this.material[this.idx(x + dx2, y + 1)] as Material)) {
      this.swap(x, y, x + dx2, y + 1);
    }
  }

  private updateLiquid(x: number, y: number, _mat: Material): void {
    if (this.isEmpty(x, y + 1)) {
      this.swap(x, y, x, y + 1);
      return;
    }
    const preferLeft = (hash2(x, y, this.tick) & 1) === 0;
    const dx1 = preferLeft ? -1 : 1;
    const dx2 = -dx1;
    if (this.isEmpty(x + dx1, y + 1)) {
      this.swap(x, y, x + dx1, y + 1);
      return;
    }
    if (this.isEmpty(x + dx2, y + 1)) {
      this.swap(x, y, x + dx2, y + 1);
      return;
    }
    if (this.isEmpty(x + dx1, y)) {
      this.swap(x, y, x + dx1, y);
      return;
    }
    if (this.isEmpty(x + dx2, y)) {
      this.swap(x, y, x + dx2, y);
    }
  }

  private updateFire(x: number, y: number): void {
    const i = this.idx(x, y);
    const life = this.aux[i] - 1;
    if (life <= 0) {
      this.material[i] = Material.Empty;
      this.aux[i] = 0;
      this.wake(x, y);
      return;
    }
    this.aux[i] = life;

    this.igniteFlammableNeighbor(x + 1, y, 6);
    this.igniteFlammableNeighbor(x - 1, y, 6);
    this.igniteFlammableNeighbor(x, y + 1, 6);
    this.igniteFlammableNeighbor(x, y - 1, 6);

    if (this.isEmpty(x, y - 1) && hash2(x, y, this.tick + 1) % 100 < 40) {
      this.swap(x, y, x, y - 1);
    } else {
      this.wake(x, y);
    }
  }
}
