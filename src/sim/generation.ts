import { Material } from './materials';
import type { World } from './world';
import type { EnemyKind } from '../gameplay/enemy';

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

const SAFE_ZONE_DEPTH = 130;

/**
 * Fraction of world height where the Mines give way to the Flooded Caverns
 * (GDD biome #2). Exported for the renderer, which shifts the stone palette
 * below this line so the biome change is visible, not just statistical.
 */
export const FLOODED_START_FRACTION = 0.45;
/** Below this fraction the Flooded Caverns give way to the Molten Depths (GDD biome #3) — lava instead of water, fire-flavored enemies, warm stone. */
export const MOLTEN_START_FRACTION = 0.72;
/** The Heart of the Mountain (GDD biome #4) — the final arena zone, violet crystal-veined stone. */
export const HEART_START_FRACTION = 0.85;

/**
 * Per-biome enemy pools (GDD §5): the Mines get the burrowers/vermin, the
 * Flooded Caverns get the swimmers/drowned — plus a "near boss" band at the
 * very bottom that mixes in fire-flavored kinds as a teaser of the Molten
 * Depths biome below (not built yet). essenceKeeper is a mini-boss per the
 * GDD and stays rare even where it appears.
 */
const MINES_POOL: EnemyKind[] = ['mole', 'beetle', 'collapser', 'sulfurTick'];
const MINES_DEEP_POOL: EnemyKind[] = ['mole', 'beetle', 'collapser', 'sulfurTick', 'acidSlime'];
const FLOODED_POOL: EnemyKind[] = ['leech', 'leech', 'drowned', 'acidSlime', 'whisperOfDarkness', 'essenceKeeper'];
const MOLTEN_POOL: EnemyKind[] = ['fireImp', 'fireImp', 'heatedGuardian', 'ashHound', 'ashHound', 'sulfurTick', 'essenceKeeper'];

function pickEnemyKind(rand: () => number, depth: number, worldH: number): EnemyKind {
  let pool: EnemyKind[];
  if (depth > worldH * MOLTEN_START_FRACTION) pool = MOLTEN_POOL;
  else if (depth > worldH * FLOODED_START_FRACTION) pool = FLOODED_POOL;
  else if (depth > 280) pool = MINES_DEEP_POOL;
  else pool = MINES_POOL;
  return pool[Math.floor(rand() * pool.length)];
}

const CONNECTOR_W_MIN = 14;
const CONNECTOR_W_MAX = 22;
const CONNECTOR_H_MIN = 40;
const CONNECTOR_H_MAX = 90;
const ROOM_W_MIN = 80;
const ROOM_W_MAX = 130;
const ROOM_H_MIN = 34;
const ROOM_H_MAX = 56;
const MARGIN_X = 20;
const VAULT_W_MIN = 30;
const VAULT_W_MAX = 46;
const VAULT_H_MIN = 20;
const VAULT_H_MAX = 30;
const BOSS_RESERVE = 170;

type Side = 'left' | 'right';

function randRange(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min));
}

/**
 * Level-design methodology applied here (per explicit ask to research and
 * apply modern practice, not just tweak numbers): rooms are laid out as a
 * small GRAPH, not a single descending line — the same shape Spelunky's
 * room-template grid and Dead Cells' branching cell-graph both use. Every
 * floor has TWO rooms side by side (left/right, always anchored to their own
 * margin so their span never depends on the other room's width) joined by a
 * horizontal hallway. The vertical shaft that brought the player onto this
 * floor lands in one room (the "entry" side); the shaft continuing down to
 * the next floor usually starts from the OTHER room (the "exit" side) —
 * chosen with a strong bias toward switching sides — so reaching the next
 * shaft down REQUIRES walking the hallway, not just falling. Occasional
 * optional "vault" side-rooms (a short spur up into a small loot nook) add
 * Metroidvania-style off-critical-path detours without needing full
 * pathfinding. This directly replaces the old generator, which was a single
 * vertical column with only a small ±26px drift per step — the source of
 * the "I just fall straight down" complaint.
 */
export function generateMinesLevel(world: World, seed: number): GeneratedLevel {
  const rand = mulberry32(seed);
  const w = world.width;
  const h = world.height;
  world.fillAll(Material.Stone);

  const carveRect = (left: number, top: number, width: number, height: number): void => {
    const l = Math.floor(left);
    const t = Math.floor(top);
    const ww = Math.max(1, Math.floor(width));
    const hh = Math.max(1, Math.floor(height));
    for (let py = t; py < t + hh; py++) {
      for (let px = l; px < l + ww; px++) world.set(px, py, Material.Empty);
    }
  };
  const fillRect = (left: number, top: number, width: number, height: number, mat: Material): void => {
    const l = Math.floor(left);
    const t = Math.floor(top);
    const ww = Math.max(1, Math.floor(width));
    const hh = Math.max(1, Math.floor(height));
    for (let py = t; py < t + hh; py++) {
      for (let px = l; px < l + ww; px++) world.set(px, py, mat);
    }
  };
  const hline = (left: number, right: number, py: number, mat: Material): void => {
    const l = Math.floor(left);
    const r = Math.floor(right);
    const y = Math.floor(py);
    for (let px = l; px <= r; px++) world.set(px, y, mat);
  };

  /**
   * Smooth 1D value noise: random lattice every `wavelength` px, cosine
   * interpolation between — organic waves, not per-pixel fuzz. Each call
   * gets its own lattice so no two surfaces share the same wobble.
   */
  const makeWave = (amp: number, wavelength: number): ((t: number) => number) => {
    const pts: number[] = [];
    return (t: number) => {
      const i = Math.max(0, Math.floor(t / wavelength));
      while (pts.length <= i + 1) pts.push(rand() * 2 - 1);
      const f = t / wavelength - i;
      const u = (1 - Math.cos(f * Math.PI)) / 2;
      return Math.round((pts[i] * (1 - u) + pts[i + 1] * u) * amp);
    };
  };

  /**
   * Organic cave carve — the answer to "не бывает рафинированных таких
   * полов и стен": instead of a clean rectangle, every surface is displaced
   * by smooth value noise (wavy ceiling ±5, undulating floor ±3 — small
   * enough that the player's 4px step-up assist walks it — and bowed walls
   * ±3), then dressed with stalactites, floor-bump stalagmites, and rubble
   * piles. Two carve passes (column-wise + row-wise) union into a blob that
   * always CONTAINS the rectangle shrunk by the wave amplitude, so the
   * connectivity reasoning about rects still holds with a small margin.
   */
  const carveCave = (left: number, top: number, width: number, height: number, dress = true): void => {
    const l = Math.floor(left);
    const t = Math.floor(top);
    const ww = Math.max(1, Math.floor(width));
    const hh = Math.max(1, Math.floor(height));
    // Wave amplitude scales down with cave height so a wavy ceiling+floor
    // can never pinch a passage below ~17px (the 14px-tall player + jump
    // headroom). Full ±5/±3 on proper rooms, near-zero on tight halls.
    const available = Math.max(0, hh - 17);
    const ceilAmp = Math.min(5, available);
    const floorAmp = Math.min(3, Math.max(0, available - ceilAmp));
    const ceil = makeWave(ceilAmp, 13);
    const floor = makeWave(floorAmp, 9);
    const walls = makeWave(3, 11);
    for (let px = l; px < l + ww; px++) {
      const cTop = t + Math.abs(ceil(px - l));
      const fBot = t + hh - Math.abs(floor(px - l));
      for (let py = cTop; py < fBot; py++) world.set(px, py, Material.Empty);
    }
    for (let py = t; py < t + hh; py++) {
      const shift = walls(py - t);
      const rowL = l + Math.abs(Math.min(0, shift));
      const rowR = l + ww - Math.abs(Math.max(0, shift));
      for (let px = rowL; px < rowR; px++) world.set(px, py, Material.Empty);
    }
    if (!dress || hh < 26 || ww < 40) return;
    // Stalactites: stone teeth hanging from the ceiling, bottoms kept well
    // above the floor so they read as dressing, never blockers.
    const stalactites = 1 + Math.floor(ww / 45);
    for (let i = 0; i < stalactites; i++) {
      const sx = l + 8 + Math.floor(rand() * Math.max(1, ww - 16));
      const sLen = 4 + Math.floor(rand() * Math.min(9, hh - 20));
      for (let dy = 0; dy < sLen; dy++) {
        const half = Math.max(0, Math.floor(((sLen - dy) / sLen) * 1.6));
        for (let dx = -half; dx <= half; dx++) world.set(sx + dx, t + 6 + dy, Material.Stone);
      }
    }
    // Stalagmite bumps + a rubble pile on the floor (bump height ≤ 4 so the
    // step-up assist walks straight over them).
    const bumps = 1 + Math.floor(ww / 50);
    for (let i = 0; i < bumps; i++) {
      const bx = l + 6 + Math.floor(rand() * Math.max(1, ww - 12));
      const bh = 2 + Math.floor(rand() * 3);
      for (let dy = 0; dy < bh; dy++) {
        const half = bh - dy - 1;
        for (let dx = -half; dx <= half; dx++) world.set(bx + dx, t + hh - 1 - dy, Material.Stone);
      }
    }
    if (rand() < 0.5) {
      const rx = l + 6 + Math.floor(rand() * Math.max(1, ww - 16));
      fillRect(rx, t + hh - 2, 4 + Math.floor(rand() * 5), 2, Material.Sand);
    }
  };

  /** Dogleg vertical→horizontal→vertical connector: handles both a same-side small drift and (in principle) a full side switch without ever needing a diagonal carve. */
  const connect = (x1: number, y1: number, x2: number, y2: number, width: number): void => {
    const midY = y1 + Math.floor((y2 - y1) / 2);
    carveRect(x1 - width / 2, y1, width, Math.max(1, midY - y1));
    const left = Math.min(x1, x2) - width / 2;
    const right = Math.max(x1, x2) + width / 2;
    carveRect(left, midY, right - left, width);
    carveRect(x2 - width / 2, midY, width, Math.max(1, y2 - midY));
  };

  const spawnX = Math.floor(w / 2);
  const spawnY = 14;
  const enemySpawns: GeneratedLevel['enemySpawns'] = [];
  const essenceSpawns: GeneratedLevel['essenceSpawns'] = [];

  // Starting chamber.
  const startW = 44;
  const startH = 26;
  carveCave(spawnX - startW / 2, spawnY - 8, startW, startH, false);

  let prevExitX = spawnX;
  let prevExitY = spawnY - 8 + startH;
  let entrySide: Side = rand() < 0.5 ? 'left' : 'right';

  const populateRoom = (roomLeft: number, roomTop: number, roomW: number, roomH: number, depth: number, enemyChance: number): void => {
    // Ceiling beam flavor — offset a few rows below roomTop, never ON it.
    // The connector shaft from above AND any vault spur both open into the
    // room at exactly row roomTop, so a full-width beam drawn on that row
    // silently reseals the entrance (the same class of bug a full-width
    // beam caused in the previous single-shaft generator).
    if (rand() < 0.4 && roomH > 12) hline(roomLeft + 2, roomLeft + roomW - 3, roomTop + 4, Material.Wood);

    const molten = roomTop > h * MOLTEN_START_FRACTION;
    const flooded = !molten && roomTop > h * FLOODED_START_FRACTION;
    if (molten && roomH > 24) {
      // Molten Depths identity: lava pools sunk into the room floor —
      // deadly to stand in (existing Lava sim: ignites, flows), and the
      // water-vs-lava interaction (lava + water → stone) turns any water
      // brought down from the caverns above into a bridge-making tool.
      if (rand() < 0.6) {
        const lavaW = Math.floor(roomW * (0.18 + rand() * 0.2));
        const lavaLeft = roomLeft + 8 + Math.floor(rand() * Math.max(1, roomW - lavaW - 16));
        fillRect(lavaLeft, roomTop + roomH - 5, lavaW, 5, Material.Lava);
      }
    } else if (flooded && roomH > 24) {
      // Flooded Caverns identity: most rooms are partially UNDER WATER — a
      // real waterline filling the room's lower half, not a decorative
      // puddle. This is what makes the water-based combat interactions
      // (chain lightning arcing through pools, Ice Shard bridging) the
      // biome's core tools rather than occasional curiosities.
      const waterH = Math.floor(roomH * (0.3 + rand() * 0.2));
      fillRect(roomLeft, roomTop + roomH - waterH, roomW, waterH, Material.Water);
      // Acid fungus pockets (GDD: "кислотные грибницы") — small corrosive
      // pools sitting on the room floor, eating slowly into it.
      if (rand() < 0.35) {
        const acidW = randRange(rand, 6, 12);
        const acidLeft = roomLeft + 6 + Math.floor(rand() * Math.max(1, roomW - acidW - 12));
        fillRect(acidLeft, roomTop + roomH - waterH - 3, acidW, 3, Material.Acid);
      }
    } else if (rand() < 0.3 && roomH > 22) {
      const poolW = Math.floor(roomW * (0.22 + rand() * 0.22));
      const poolH = randRange(rand, 5, 9);
      const poolLeft = roomLeft + 6 + Math.floor(rand() * Math.max(1, roomW - poolW - 12));
      const poolTop = roomTop + roomH - poolH;
      fillRect(poolLeft, poolTop, poolW, poolH, rand() < 0.5 ? Material.Water : Material.Sand);
    }

    if (rand() < 0.3 && roomH > 26) {
      const ledgeW = Math.floor(roomW * (0.3 + rand() * 0.25));
      const ledgeLeft = roomLeft + 6 + Math.floor(rand() * Math.max(1, roomW - ledgeW - 12));
      const ledgeY = roomTop + Math.floor(roomH * (0.35 + rand() * 0.25));
      // 2px thick — standing on a 1px line read as "hanging in mid-air on
      // nothing" on real screens; two rows reads as an actual plank.
      hline(ledgeLeft, ledgeLeft + ledgeW, ledgeY, Material.Wood);
      hline(ledgeLeft, ledgeLeft + ledgeW, ledgeY + 1, Material.Wood);
    }

    const floorY = roomTop + roomH - 8;
    const spotX = roomLeft + roomW * (0.25 + rand() * 0.5);

    if (rand() < enemyChance && depth > SAFE_ZONE_DEPTH) {
      const kind = pickEnemyKind(rand, depth, h);
      enemySpawns.push({ x: spotX, y: floorY, kind });
      // Ash hounds hunt in packs per the GDD — a second one spawns nearby.
      if (kind === 'ashHound' && rand() < 0.7) {
        enemySpawns.push({ x: spotX + (rand() < 0.5 ? -10 : 10), y: floorY, kind });
      }
    }
    if (rand() < 0.5) essenceSpawns.push({ x: roomLeft + roomW * (rand() < 0.5 ? 0.2 : 0.8), y: floorY });
  };

  let floorIndex = 0;
  while (prevExitY < h - BOSS_RESERVE) {
    const leftRoomW = randRange(rand, ROOM_W_MIN, ROOM_W_MAX);
    const rightRoomW = randRange(rand, ROOM_W_MIN, ROOM_W_MAX);
    const leftRoomLeft = MARGIN_X;
    const rightRoomLeft = w - MARGIN_X - rightRoomW;
    const floorH = randRange(rand, ROOM_H_MIN, ROOM_H_MAX);

    const connectorW = randRange(rand, CONNECTOR_W_MIN, CONNECTOR_W_MAX);
    const connectorH = randRange(rand, CONNECTOR_H_MIN, CONNECTOR_H_MAX);
    const roomTop = prevExitY + connectorH;

    const entryCenterX = entrySide === 'left' ? leftRoomLeft + leftRoomW / 2 : rightRoomLeft + rightRoomW / 2;
    connect(prevExitX, prevExitY, entryCenterX, roomTop, connectorW);

    // First-floor-only "physics matters" opening beat: every run starts with
    // a sand plug sealing the only way down, and a puddle sitting right
    // above it. There is no way to make progress without digging (any
    // starting spell clears Sand per the dig() fix) — and once the plug is
    // cleared, the puddle visibly drains down through the freshly opened
    // shaft on the next few sim ticks. This guarantees every player sees the
    // falling-sand sim actually DO something, tied to their own action,
    // within the first few seconds — before the first enemy, not after.
    if (floorIndex === 0) {
      const plugTop = prevExitY + 2;
      const plugH = 14;
      fillRect(prevExitX - connectorW / 2, plugTop, connectorW, plugH, Material.Sand);
      const poolW = Math.min(18, startW - 10);
      fillRect(spawnX - poolW / 2, spawnY - 8 + 5, poolW, 5, Material.Water);
    }

    carveCave(leftRoomLeft, roomTop, leftRoomW, floorH);
    carveCave(rightRoomLeft, roomTop, rightRoomW, floorH);

    // Horizontal hallway joining the two rooms, at floor level — this is the
    // traversal the player is actually required to make most floors (see
    // exitSide bias below), replacing pure vertical descent with a real
    // left/right choice.
    const hallH = randRange(rand, 14, 22);
    const hallTop = roomTop + floorH - hallH - 4;
    const hallLeft = leftRoomLeft + leftRoomW;
    const hallW = rightRoomLeft - hallLeft;
    carveCave(hallLeft, hallTop, hallW, hallH, false);

    // Water-gap crossing: the hallway floor drops away into a water pit for
    // a short stretch, sized to fit inside one Ice Shard's freeze radius.
    // Walking in un-frozen means falling into the pit and climbing back out
    // — a real cost, not a hard gate (no run should ever REQUIRE a spell
    // that a given wand loadout might not have equipped) — while freezing it
    // with Ice Shard bridges straight across at normal floor level. This is
    // the "make an existing interaction load-bearing" pass: Ice Shard
    // already freezes Water (see World's ice/water handling); it just never
    // mattered in an actual encounter before. Skipped on floor 0, which
    // already has its own dedicated sand-dig/water-drain opening beat.
    const moltenHall = roomTop > h * MOLTEN_START_FRACTION;
    const floodedHall = !moltenHall && roomTop > h * FLOODED_START_FRACTION;
    if (floorIndex > 0 && moltenHall && rand() < 0.5 && hallW > 50) {
      // Lava gap: narrow enough to clear with a committed running jump, but
      // falling in HURTS (fire damage) — unlike water pits, the cost of a
      // failed crossing is real. Kept narrower than water gaps for that
      // reason, and always jumpable so no loadout is hard-gated.
      const gapW = randRange(rand, 14, 19);
      const pitDepth = randRange(rand, 10, 16);
      const gapLeft = hallLeft + 16 + Math.floor(rand() * Math.max(1, hallW - gapW - 32));
      carveRect(gapLeft, hallTop, gapW, hallH + pitDepth);
      fillRect(gapLeft, hallTop + hallH + pitDepth - 4, gapW, 4, Material.Lava);
    } else if (floorIndex > 0 && rand() < (floodedHall ? 0.65 : 0.32) && hallW > 40) {
      const gapW = floodedHall ? randRange(rand, 16, 24) : randRange(rand, 12, 16);
      const pitDepth = floodedHall ? randRange(rand, 28, 40) : randRange(rand, 20, 30);
      const gapLeft = hallLeft + 14 + Math.floor(rand() * Math.max(1, hallW - gapW - 28));
      carveRect(gapLeft, hallTop, gapW, hallH + pitDepth);
      fillRect(gapLeft, hallTop + hallH, gapW, pitDepth, Material.Water);
    }

    const depth = roomTop - spawnY;
    populateRoom(leftRoomLeft, roomTop, leftRoomW, floorH, depth, 0.4);
    populateRoom(rightRoomLeft, roomTop, rightRoomW, floorH, depth, 0.4);

    // Optional vault: a small loot nook up a short spur off one room's
    // ceiling — pure off-path detour, skippable, rewarding exploration.
    if (rand() < 0.4) {
      const vaultSide: Side = rand() < 0.5 ? 'left' : 'right';
      const hostLeft = vaultSide === 'left' ? leftRoomLeft : rightRoomLeft;
      const hostW = vaultSide === 'left' ? leftRoomW : rightRoomW;
      const vaultW = randRange(rand, VAULT_W_MIN, VAULT_W_MAX);
      const vaultH = randRange(rand, VAULT_H_MIN, VAULT_H_MAX);
      const spurX = hostLeft + 10 + Math.floor(rand() * Math.max(1, hostW - 20));
      const spurH = randRange(rand, 16, 28);
      const vaultTop = roomTop - spurH - vaultH;
      if (vaultTop > 20) {
        carveRect(spurX - 5, vaultTop + vaultH, 10, spurH);
        carveCave(spurX - vaultW / 2, vaultTop, vaultW, vaultH, false);
        essenceSpawns.push({ x: spurX, y: vaultTop + vaultH - 6 });
        essenceSpawns.push({ x: spurX - 8, y: vaultTop + vaultH - 6 });
        if (rand() < 0.45 && depth > SAFE_ZONE_DEPTH) {
          enemySpawns.push({ x: spurX, y: vaultTop + vaultH - 6, kind: pickEnemyKind(rand, depth, h) });
        }
      }
    }

    // Exit side for the shaft continuing down: strongly biased to switch,
    // so most floors force an actual hallway crossing instead of a free
    // straight-down drop; occasionally stays put for pacing variety.
    const exitSide: Side = rand() < 0.7 ? (entrySide === 'left' ? 'right' : 'left') : entrySide;
    const exitCenterX = exitSide === 'left' ? leftRoomLeft + leftRoomW / 2 : rightRoomLeft + rightRoomW / 2;

    // Force-clear the exit shaft's mouth in the room's own floor, regardless
    // of whatever populateRoom already placed there — a hazard pool (or,
    // less often, a ledge) can otherwise land exactly under the exit point
    // and reseal it, the same class of bug the roomTop+4 beam offset fixed
    // for room ENTRANCES, but here on the room's floor instead of its
    // ceiling. Discovered via BFS-connectivity testing across seeds: several
    // floors dead-ended at the room/shaft boundary even though the shaft
    // below was fully carved.
    carveRect(exitCenterX - 12, roomTop + floorH - 10, 24, 10);

    prevExitX = exitCenterX;
    prevExitY = roomTop + floorH;
    entrySide = exitSide;
    floorIndex++;
  }

  // Boss arena: a flat-floored room at a FIXED position near the bottom of
  // the world, connected from wherever the last floor's exit shaft ended up
  // via the same dogleg connector — never placed relative to an
  // overshoot-prone cursor, so it can't end up partly outside world bounds.
  const arenaW = 170;
  const arenaH = 80;
  const arenaTop = h - arenaH - 8;
  const connectorW = randRange(rand, CONNECTOR_W_MIN, CONNECTOR_W_MAX);
  const arenaCenterX = Math.max(MARGIN_X + arenaW / 2, Math.min(w - MARGIN_X - arenaW / 2, prevExitX));
  connect(prevExitX, prevExitY, arenaCenterX, arenaTop, connectorW);

  const arenaLeft = arenaCenterX - arenaW / 2;
  carveRect(arenaLeft, arenaTop, arenaW, arenaH);
  hline(arenaLeft - 2, arenaLeft + arenaW + 2, arenaTop + arenaH, Material.Stone);

  // Heart of the Mountain dressing (GDD biome #4): two stone pillars give
  // the boss fight actual cover play (duck behind one during the slam
  // telegraph; the boss paces around them instead of beelining), lava
  // pockets burn at the arena's edges, and essence crystals reward poking
  // the corners. Pillars stop 26px short of the ceiling so the room stays
  // fully traversable over the top (BFS-verified like everything else).
  const pillarH = arenaH - 26;
  for (const fx of [0.3, 0.7]) {
    const px = Math.floor(arenaLeft + arenaW * fx);
    fillRect(px - 3, arenaTop + arenaH - pillarH, 6, pillarH, Material.Stone);
  }
  fillRect(arenaLeft + 3, arenaTop + arenaH - 4, 10, 4, Material.Lava);
  fillRect(arenaLeft + arenaW - 13, arenaTop + arenaH - 4, 10, 4, Material.Lava);
  essenceSpawns.push({ x: arenaLeft + 18, y: arenaTop + arenaH - 10 });
  essenceSpawns.push({ x: arenaLeft + arenaW - 18, y: arenaTop + arenaH - 10 });
  essenceSpawns.push({ x: arenaLeft + arenaW / 2, y: arenaTop + 14 });

  const bossSpawn = { x: arenaLeft + arenaW / 2, y: arenaTop + arenaH - 20 };

  return { spawnX, spawnY, enemySpawns, essenceSpawns, bossSpawn };
}
