import { Material } from './materials';
import type { World } from './world';

export type EnemyKind = 'mole' | 'beetle' | 'collapser';

export interface GeneratedLevel {
  spawnX: number;
  spawnY: number;
  enemySpawns: Array<{ x: number; y: number; kind: EnemyKind }>;
  essenceSpawns: Array<{ x: number; y: number }>;
  bossSpawn: { x: number; y: number };
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENEMY_KINDS: EnemyKind[] = ['mole', 'beetle', 'collapser'];
const SAFE_ZONE_DEPTH = 130;

/**
 * Carves a winding vertical shaft (drunkard's walk) through solid stone, with
 * occasional side rooms, wood support beams, sand pockets and water pools.
 * Deterministic per seed so a run can be reproduced/debugged.
 */
export function generateMinesLevel(world: World, seed: number): GeneratedLevel {
  const rand = mulberry32(seed);
  const w = world.width;
  const h = world.height;
  world.fillAll(Material.Stone);

  const carveCircle = (cx: number, cy: number, r: number): void => {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r2) world.set(cx + dx, cy + dy, Material.Empty);
      }
    }
  };

  const carveRect = (left: number, top: number, width: number, height: number): void => {
    for (let py = top; py < top + height; py++) {
      for (let px = left; px < left + width; px++) world.set(px, py, Material.Empty);
    }
  };

  let x = Math.floor(w / 2);
  let y = 14;
  const spawnX = x;
  const spawnY = y;
  const enemySpawns: GeneratedLevel['enemySpawns'] = [];
  const essenceSpawns: GeneratedLevel['essenceSpawns'] = [];

  carveCircle(x, y, 16);
  let stepsSinceRoom = 0;

  while (y < h - 24) {
    const drift = Math.floor((rand() - 0.5) * 6);
    x = Math.max(24, Math.min(w - 24, x + drift));
    y += 2;
    const radius = 10 + Math.floor(rand() * 6);
    carveCircle(x, y, radius);
    stepsSinceRoom++;

    if (stepsSinceRoom > 26 && rand() < 0.5) {
      const roomR = 20 + Math.floor(rand() * 12);
      const side = rand() < 0.5 ? -1 : 1;
      const roomX = Math.max(roomR + 4, Math.min(w - roomR - 4, x + side * (roomR + radius)));
      carveCircle(roomX, y, roomR);
      for (let bx = Math.min(x, roomX); bx <= Math.max(x, roomX); bx++) {
        world.set(bx, y - Math.max(radius, roomR) - 1, Material.Wood);
      }
      // No enemies in the first stretch below spawn — gives the player a
      // moment to get their bearings before the first real threat instead of
      // risking an ambush a few seconds into the run.
      if (rand() < 0.6 && y - spawnY > SAFE_ZONE_DEPTH) {
        const kind = ENEMY_KINDS[Math.floor(rand() * ENEMY_KINDS.length)];
        enemySpawns.push({ x: roomX, y: y - roomR + 6, kind });
      }
      if (rand() < 0.7) essenceSpawns.push({ x: roomX, y: y - 4 });
      stepsSinceRoom = 0;
    }

    if (rand() < 0.04) {
      for (let bx = x - radius; bx <= x + radius; bx++) world.set(bx, y - radius - 1, Material.Wood);
    }

    if (rand() < 0.03) {
      const poolR = 10 + Math.floor(rand() * 8);
      // Offset clear of the tunnel (not just barely outside it) — water is a
      // liquid once the sim starts running, so any overlap floods straight
      // down the shaft instead of staying a contained pocket.
      const poolCy = y + radius + poolR + 6;
      carveCircle(x, poolCy, poolR);
      for (let px = x - poolR; px <= x + poolR; px++) {
        for (let py = poolCy - poolR; py <= poolCy + poolR; py++) {
          if ((px - x) ** 2 + (py - poolCy) ** 2 <= poolR * poolR) world.set(px, py, Material.Water);
        }
      }
    }

    if (rand() < 0.03) {
      const sandR = 8 + Math.floor(rand() * 6);
      const side = rand() < 0.5 ? -1 : 1;
      // Same reasoning as the water pool above: sand is a powder that falls
      // once the sim runs, so a pocket placed flush against the tunnel wall
      // can slide/cascade into the path and bury it. Clear offset instead.
      const sx = x + side * (radius + sandR + 6);
      for (let px = sx - sandR; px <= sx + sandR; px++) {
        for (let py = y - sandR; py <= y + sandR; py++) {
          if ((px - sx) ** 2 + (py - y) ** 2 <= sandR * sandR && world.get(px, py) === Material.Stone) {
            world.set(px, py, Material.Sand);
          }
        }
      }
    }
  }

  // Boss arena: a flat-floored room at the bottom of the shaft.
  const arenaW = 140;
  const arenaH = 70;
  const arenaLeft = Math.max(20, Math.min(w - arenaW - 20, x - arenaW / 2));
  const arenaTop = h - arenaH - 8;
  carveRect(arenaLeft, arenaTop, arenaW, arenaH);
  for (let bx = arenaLeft - 2; bx <= arenaLeft + arenaW + 2; bx++) {
    world.set(bx, arenaTop + arenaH, Material.Stone);
  }
  // Connect the shaft's last position into the arena.
  carveCircle(x, arenaTop, 14);
  const bossSpawn = { x: arenaLeft + arenaW / 2, y: arenaTop + arenaH - 20 };

  return { spawnX, spawnY, enemySpawns, essenceSpawns, bossSpawn };
}
