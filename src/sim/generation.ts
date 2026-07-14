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
 * Soft difficulty curve by depth: only one biome/terrain-set exists so far
 * (the GDD's other three biomes are a separate, later content pass), but the
 * enemy roster is complete — so variety and danger still ramp up the deeper
 * you go, just within the same Mines shaft rather than distinct biomes.
 * essenceKeeper is a mini-boss per the GDD and stays rare even at max depth.
 */
const DEPTH_BANDS: Array<{ minDepth: number; kinds: EnemyKind[] }> = [
  { minDepth: SAFE_ZONE_DEPTH, kinds: ['mole', 'beetle', 'collapser'] },
  { minDepth: 280, kinds: ['mole', 'beetle', 'collapser', 'sulfurTick', 'acidSlime'] },
  { minDepth: 430, kinds: ['acidSlime', 'leech', 'drowned', 'fireImp', 'heatedGuardian', 'sulfurTick'] },
  { minDepth: 560, kinds: ['drowned', 'fireImp', 'heatedGuardian', 'whisperOfDarkness', 'ashHound', 'ashHound', 'essenceKeeper'] },
];

function pickEnemyKind(rand: () => number, depth: number): EnemyKind {
  let pool = DEPTH_BANDS[0].kinds;
  for (const band of DEPTH_BANDS) {
    if (depth >= band.minDepth) pool = band.kinds;
  }
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
  carveRect(spawnX - startW / 2, spawnY - 8, startW, startH);

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

    if (rand() < 0.3 && roomH > 22) {
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
      hline(ledgeLeft, ledgeLeft + ledgeW, ledgeY, Material.Wood);
    }

    const floorY = roomTop + roomH - 8;
    const spotX = roomLeft + roomW * (0.25 + rand() * 0.5);

    if (rand() < enemyChance && depth > SAFE_ZONE_DEPTH) {
      const kind = pickEnemyKind(rand, depth);
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

    carveRect(leftRoomLeft, roomTop, leftRoomW, floorH);
    carveRect(rightRoomLeft, roomTop, rightRoomW, floorH);

    // Horizontal hallway joining the two rooms, at floor level — this is the
    // traversal the player is actually required to make most floors (see
    // exitSide bias below), replacing pure vertical descent with a real
    // left/right choice.
    const hallH = randRange(rand, 14, 22);
    const hallTop = roomTop + floorH - hallH - 4;
    const hallLeft = leftRoomLeft + leftRoomW;
    const hallW = rightRoomLeft - hallLeft;
    carveRect(hallLeft, hallTop, hallW, hallH);

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
    if (floorIndex > 0 && rand() < 0.32 && hallW > 40) {
      const gapW = randRange(rand, 12, 16);
      const pitDepth = randRange(rand, 20, 30);
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
        carveRect(spurX - vaultW / 2, vaultTop, vaultW, vaultH);
        essenceSpawns.push({ x: spurX, y: vaultTop + vaultH - 6 });
        essenceSpawns.push({ x: spurX - 8, y: vaultTop + vaultH - 6 });
        if (rand() < 0.45 && depth > SAFE_ZONE_DEPTH) {
          enemySpawns.push({ x: spurX, y: vaultTop + vaultH - 6, kind: pickEnemyKind(rand, depth) });
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
  const bossSpawn = { x: arenaLeft + arenaW / 2, y: arenaTop + arenaH - 20 };

  return { spawnX, spawnY, enemySpawns, essenceSpawns, bossSpawn };
}
