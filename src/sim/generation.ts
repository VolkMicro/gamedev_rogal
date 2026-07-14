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

const CORRIDOR_W_MIN = 14;
const CORRIDOR_W_MAX = 22;
const CORRIDOR_H_MIN = 26;
const CORRIDOR_H_MAX = 60;
const ROOM_W_MIN = 70;
const ROOM_W_MAX = 130;
const ROOM_H_MIN = 34;
const ROOM_H_MAX = 56;
const MARGIN_X = 16;

function randRange(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min));
}

/**
 * Builds a stacked sequence of rectangular rooms connected by straight
 * vertical corridors — blocky, architectural "carved-out mine gallery"
 * levels in the vein of classic side-view platformers (Castlevania-style
 * rooms/halls), instead of the amorphous circle-carved cave blobs the
 * previous generator produced. Deterministic per seed so a run can be
 * reproduced/debugged.
 *
 * Connectivity guarantee: each corridor's X-range is always fully inside
 * the room above/below it (the room is centered on the corridor's X, and
 * ROOM_W_MIN > CORRIDOR_W_MAX), so there's never a gap between a shaft and
 * the chamber it leads into.
 */
export function generateMinesLevel(world: World, seed: number): GeneratedLevel {
  const rand = mulberry32(seed);
  const w = world.width;
  const h = world.height;
  world.fillAll(Material.Stone);

  const carveRect = (left: number, top: number, width: number, height: number): void => {
    for (let py = top; py < top + height; py++) {
      for (let px = left; px < left + width; px++) world.set(px, py, Material.Empty);
    }
  };
  const fillRect = (left: number, top: number, width: number, height: number, mat: Material): void => {
    for (let py = top; py < top + height; py++) {
      for (let px = left; px < left + width; px++) world.set(px, py, mat);
    }
  };
  const hline = (left: number, right: number, py: number, mat: Material): void => {
    for (let px = left; px <= right; px++) world.set(px, py, mat);
  };

  const spawnX = Math.floor(w / 2);
  const spawnY = 14;
  const enemySpawns: GeneratedLevel['enemySpawns'] = [];
  const essenceSpawns: GeneratedLevel['essenceSpawns'] = [];

  // Starting chamber.
  const startW = 44;
  const startH = 26;
  carveRect(spawnX - startW / 2, spawnY - 8, startW, startH);

  let corridorX = spawnX;
  let cursorY = spawnY - 8 + startH;

  while (cursorY < h - 110) {
    const corridorW = randRange(rand, CORRIDOR_W_MIN, CORRIDOR_W_MAX);
    const corridorH = randRange(rand, CORRIDOR_H_MIN, CORRIDOR_H_MAX);
    const roomW = randRange(rand, ROOM_W_MIN, ROOM_W_MAX);
    const roomH = randRange(rand, ROOM_H_MIN, ROOM_H_MAX);

    const drift = Math.floor((rand() - 0.5) * 26);
    corridorX = Math.max(MARGIN_X + roomW / 2, Math.min(w - MARGIN_X - roomW / 2, corridorX + drift));

    // Shaft down to the next room.
    carveRect(corridorX - corridorW / 2, cursorY, corridorW, corridorH);
    if (rand() < 0.45 && corridorH > 26) {
      const ledgeW = Math.floor(corridorW * 0.65);
      const ledgeLeft = rand() < 0.5 ? corridorX - corridorW / 2 : corridorX + corridorW / 2 - ledgeW;
      const ledgeY = cursorY + randRange(rand, Math.floor(corridorH * 0.35), Math.floor(corridorH * 0.7));
      hline(ledgeLeft, ledgeLeft + ledgeW, ledgeY, Material.Wood);
    }
    cursorY += corridorH;

    // Room the shaft opens into.
    const roomLeft = corridorX - roomW / 2;
    carveRect(roomLeft, cursorY, roomW, roomH);

    // Support beam ceiling, mine-gallery flavor — split into two segments
    // either side of the shaft opening so the beam can never plug the exact
    // doorway the corridor just carved into this room (a full-width beam at
    // the boundary row silently sealed ~half of all rooms off from their
    // own entrance).
    if (rand() < 0.5) {
      const gapLeft = corridorX - corridorW / 2 - 2;
      const gapRight = corridorX + corridorW / 2 + 2;
      if (gapLeft > roomLeft + 2) hline(roomLeft + 2, gapLeft, cursorY, Material.Wood);
      if (gapRight < roomLeft + roomW - 3) hline(gapRight, roomLeft + roomW - 3, cursorY, Material.Wood);
    }

    // Occasional hazard pool sitting on the room floor (part of the room's
    // own already-empty interior, so it can't cascade/flood anywhere else).
    if (rand() < 0.3 && roomH > 22) {
      const poolW = Math.floor(roomW * (0.22 + rand() * 0.22));
      const poolH = randRange(rand, 5, 9);
      const poolLeft = roomLeft + 6 + Math.floor(rand() * Math.max(1, roomW - poolW - 12));
      const poolTop = cursorY + roomH - poolH;
      fillRect(poolLeft, poolTop, poolW, poolH, rand() < 0.5 ? Material.Water : Material.Sand);
    }

    // Side ledge inside the room for vertical traversal variety.
    if (rand() < 0.35 && roomH > 26) {
      const ledgeW = Math.floor(roomW * (0.25 + rand() * 0.2));
      const ledgeLeft = roomLeft + 6 + Math.floor(rand() * Math.max(1, roomW - ledgeW - 12));
      const ledgeY = cursorY + Math.floor(roomH * (0.35 + rand() * 0.25));
      hline(ledgeLeft, ledgeLeft + ledgeW, ledgeY, Material.Wood);
    }

    const floorY = cursorY + roomH - 8;
    const leftSpotX = roomLeft + roomW * (0.15 + rand() * 0.2);
    const rightSpotX = roomLeft + roomW * (0.65 + rand() * 0.2);

    // No enemies in the first stretch below spawn — gives the player a
    // moment to get their bearings before the first real threat instead of
    // risking an ambush a few seconds into the run.
    if (rand() < 0.55 && cursorY - spawnY > SAFE_ZONE_DEPTH) {
      const kind = ENEMY_KINDS[Math.floor(rand() * ENEMY_KINDS.length)];
      enemySpawns.push({ x: rand() < 0.5 ? leftSpotX : rightSpotX, y: floorY, kind });
    }
    if (rand() < 0.6) essenceSpawns.push({ x: rand() < 0.5 ? rightSpotX : leftSpotX, y: floorY });

    cursorY += roomH;
  }

  // Boss arena: a flat-floored room at a FIXED position near the bottom of
  // the world — a big room+corridor step in the loop above can overshoot by
  // more than the old per-step-2px drunkard's-walk ever could, so the arena
  // must not be placed relative to that overshoot-prone cursorY or it could
  // end up partly/fully outside world bounds (unreachable boss). The
  // connector's height is instead derived FROM the fixed arena position,
  // clamped to a sane minimum so it still carves something even if cursorY
  // already overshot past the arena's top.
  const arenaW = 140;
  const arenaH = 70;
  const arenaTop = h - arenaH - 8;
  const connectorW = randRange(rand, CORRIDOR_W_MIN, CORRIDOR_W_MAX);
  const connectorH = Math.max(10, arenaTop - cursorY);
  carveRect(corridorX - connectorW / 2, cursorY, connectorW, connectorH);

  const arenaLeft = Math.max(20, Math.min(w - arenaW - 20, corridorX - arenaW / 2));
  carveRect(arenaLeft, arenaTop, arenaW, arenaH);
  hline(arenaLeft - 2, arenaLeft + arenaW + 2, arenaTop + arenaH, Material.Stone);
  const bossSpawn = { x: arenaLeft + arenaW / 2, y: arenaTop + arenaH - 20 };

  return { spawnX, spawnY, enemySpawns, essenceSpawns, bossSpawn };
}
