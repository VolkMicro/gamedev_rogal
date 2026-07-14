import { Graphics } from 'pixi.js';
import { initTelegram } from './telegram';
import { Stage } from './render/stage';
import { SimRenderer } from './render/simRenderer';
import { World } from './sim/world';
import { generateMinesLevel, type GeneratedLevel } from './sim/generation';
import { Material } from './sim/materials';
import { Player } from './gameplay/player';
import { Enemy, type AnyEnemyKind } from './gameplay/enemy';
import { Projectile, type CastOptions } from './gameplay/projectile';
import { Ally } from './gameplay/ally';
import { Wand } from './gameplay/wand';
import { InputController } from './gameplay/input';
import { StatsOverlay } from './perf/statsOverlay';
import { Hud } from './gameplay/hud';
import { loadSave, persistSave } from './meta/save';
import { Camp } from './meta/camp';
import { loadSprites } from './render/sprites';

const ESSENCE_STEAL_AMOUNT = 3;
/** Boss HP bar only shows once the player is actually near the arena — it exists (full HP) the whole run, so gating on distance instead of just "not dead" avoids showing a misleading full bar from floor 1 onward. */
const BOSS_ENGAGE_RANGE = 260;

const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 980;
const SIM_HZ = 60;
const SIM_DT_MS = 1000 / SIM_HZ;

/**
 * World-pixels shown along the screen's SHORTER dimension. Lower = more
 * zoomed in. The old fixed 400x240 (landscape 5:3) viewport on a portrait
 * phone screen meant Stage's letterboxing was bottlenecked by width, wasting
 * most of the screen as black bars top/bottom while the character rendered
 * tiny — this computes a viewport that always matches the current screen's
 * own aspect ratio, so there's no letterboxing and the character reads
 * clearly at typical phone sizes.
 */
const ZOOM_TARGET_PX = 170;

function computeViewportSize(): { width: number; height: number } {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const scale = Math.min(screenW, screenH) / ZOOM_TARGET_PX;
  return { width: Math.round(screenW / scale), height: Math.round(screenH / scale) };
}

interface EssencePickup {
  x: number;
  y: number;
  sprite: Graphics;
  collected: boolean;
}

async function main(): Promise<void> {
  initTelegram();

  const appEl = document.querySelector<HTMLDivElement>('#app')!;
  appEl.innerHTML = '';

  const { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } = computeViewportSize();
  const stage = new Stage(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  await stage.init(appEl);
  await loadSprites();

  const simRenderer = new SimRenderer(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  stage.world.addChild(simRenderer.sprite);

  const input = new InputController(stage.app.canvas);
  const stats = new StatsOverlay();
  const hud = new Hud();

  const save = loadSave();
  let wand = new Wand(save.wandLoadout);

  let world = new World(WORLD_WIDTH, WORLD_HEIGHT);
  const player = new Player(0, 0);
  stage.world.addChild(player.sprite);

  let enemies: Enemy[] = [];
  let boss: Enemy | null = null;
  let pickups: EssencePickup[] = [];
  let projectiles: Projectile[] = [];
  let allies: Ally[] = [];
  let runEssence = 0;
  let runSeed = 1;
  let running = false;
  let currentLevel: GeneratedLevel | null = null;

  const camp = new Camp(save, () => {
    wand = new Wand(save.wandLoadout);
    player.setPerks((save.perkLevels.maxHp ?? 0) * 10, (save.perkLevels.fireResist ?? 0) * 0.25);
    startRun(runSeed);
    camp.hide();
    running = true;
  });

  function clearRunObjects(): void {
    for (const e of enemies) stage.world.removeChild(e.sprite);
    if (boss) stage.world.removeChild(boss.sprite);
    for (const p of pickups) stage.world.removeChild(p.sprite);
    for (const p of projectiles) stage.world.removeChild(p.sprite);
    for (const a of allies) stage.world.removeChild(a.sprite);
    enemies = [];
    boss = null;
    pickups = [];
    projectiles = [];
    allies = [];
  }

  function startRun(seed: number): void {
    clearRunObjects();
    runEssence = 0;

    world = new World(WORLD_WIDTH, WORLD_HEIGHT);
    const level = generateMinesLevel(world, seed);
    currentLevel = level;
    player.respawn(level.spawnX, level.spawnY);

    for (const spawn of level.enemySpawns) {
      const enemy = new Enemy(spawn.x, spawn.y, spawn.kind);
      enemies.push(enemy);
      stage.world.addChild(enemy.sprite);
    }
    for (const spawn of level.essenceSpawns) {
      const sprite = new Graphics().circle(0, 0, 2).fill(0xffd15c);
      sprite.x = spawn.x;
      sprite.y = spawn.y;
      pickups.push({ x: spawn.x, y: spawn.y, sprite, collected: false });
      stage.world.addChild(sprite);
    }
    boss = new Enemy(level.bossSpawn.x, level.bossSpawn.y, 'boss');
    stage.world.addChild(boss.sprite);
  }

  function endRun(outcome: 'death' | 'victory'): void {
    running = false;
    save.essenceBanked += runEssence;
    if (outcome === 'death') save.deaths += 1;
    else save.runsCompleted += 1;
    persistSave(save);
    runSeed += 1;
    clearRunObjects();
    camp.show();
  }

  // Dev/test-only introspection hook — lets an external Playwright bot drive
  // and observe a run without guessing state from pixels. See tests/playthrough.
  interface WickDebug {
    state(): {
      inCamp: boolean;
      player: { x: number; y: number; hp: number; maxHp: number; dead: boolean };
      boss: { x: number; y: number; hp: number; maxHp: number; dead: boolean } | null;
      enemies: Array<{ x: number; y: number; hp: number; kind: string }>;
      worldWidth: number;
      worldHeight: number;
      essence: number;
      bossSpawn: { x: number; y: number } | null;
    };
    startRun(seed: number): void;
    /** True if (player.x+dx, player.y+dy) is open (not solid) — lets a test bot feel out terrain instead of moving blind. */
    isOpen(dx: number, dy: number): boolean;
    /** Raw material id at ABSOLUTE world coordinates (not relative to player) — for debugging the generator directly. */
    getCell(x: number, y: number): number;
    /** Test-only: spawns an enemy of any kind next to the player without waiting on the depth-based RNG spawn table. */
    spawnEnemy(kind: string, offsetX: number, offsetY: number): void;
    /** Test-only: force-unlocks and equips an exact wand loadout, bypassing the camp UI/essence economy. */
    equipWand(spellIds: string[]): void;
    input: InputController;
  }
  (window as unknown as { __wickDebug: WickDebug }).__wickDebug = {
    state: () => ({
      inCamp: !running,
      player: { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp, dead: player.dead, ...player.debugPhysics() },
      boss: boss ? { x: boss.x, y: boss.y, hp: boss.hp, maxHp: boss.maxHp, dead: boss.dead } : null,
      enemies: enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, kind: e.kind })),
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      essence: runEssence,
      bossSpawn: currentLevel?.bossSpawn ?? null,
    }),
    startRun: (seed: number) => {
      startRun(seed);
      camp.hide();
      running = true;
    },
    isOpen: (dx: number, dy: number) => !world.isSolidForPlayer(Math.floor(player.x + dx), Math.floor(player.y + dy)),
    getCell: (x: number, y: number) => world.get(x, y),
    spawnEnemy: (kind, offsetX, offsetY) => {
      const enemy = new Enemy(player.x + offsetX, player.y + offsetY, kind as AnyEnemyKind);
      enemies.push(enemy);
      stage.world.addChild(enemy.sprite);
    },
    equipWand: (spellIds) => {
      wand.setSlots(spellIds as unknown as Parameters<Wand['setSlots']>[0]);
    },
    input,
  };

  let accumulatorMs = 0;

  stage.app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    const dtSec = dtMs / 1000;
    if (!running) return;

    wand.tick(dtSec);
    player.update(dtSec, input.moveX, input.consumeJump(), world);

    if (input.aiming && !player.dead) {
      const cast = wand.tryCast();
      if (cast) {
        const mods = cast.modifiers;
        const opts: CastOptions = {
          homing: mods.includes('homing'),
          ignite: mods.includes('ignite'),
          ricochet: mods.includes('ricochet'),
          piercing: mods.includes('piercing'),
          split: mods.includes('split'),
          gravityTrail: mods.includes('gravityTrail'),
          enlarge: mods.includes('enlarge'),
        };
        if (cast.spell === 'bloodSpear') opts.damageOverride = Math.max(1, Math.round(player.hp * 0.35));

        const angle = Math.atan2(input.aimY, input.aimX);
        const spreadAngles = mods.includes('triple') ? [-0.28, 0, 0.28] : [0];
        for (const spread of spreadAngles) {
          const a = angle + spread;
          const proj = new Projectile(player.x, player.y, Math.cos(a), Math.sin(a), cast.spell, opts);
          projectiles.push(proj);
          stage.world.addChild(proj.sprite);
        }
        if (mods.includes('summon')) {
          const ally = new Ally(player.x, player.y);
          allies.push(ally);
          stage.world.addChild(ally.sprite);
        }
      }
    }

    const allEnemies = boss ? [...enemies, boss] : enemies;
    for (const enemy of allEnemies) enemy.update(dtSec, world, player);
    for (const enemy of allEnemies) {
      if (enemy.justDied) {
        enemy.justDied = false;
        if (enemy.kind === 'beetle') {
          const cx = Math.floor(enemy.x);
          const cy = Math.floor(enemy.y);
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              if (dx * dx + dy * dy <= 9 && world.get(cx + dx, cy + dy) === Material.Empty) {
                world.set(cx + dx, cy + dy, Material.Fire, 20);
              }
            }
          }
        }
      }
      if (enemy.pendingAttack) {
        const { dx, dy } = enemy.pendingAttack;
        enemy.pendingAttack = null;
        const spell = enemy.kind === 'fireImp' ? 'fireball' : 'spark';
        const proj = new Projectile(enemy.x, enemy.y, dx, dy, spell, { hostile: true });
        projectiles.push(proj);
        stage.world.addChild(proj.sprite);
      }
      if (enemy.essenceStolen) {
        enemy.essenceStolen = false;
        runEssence = Math.max(0, runEssence - ESSENCE_STEAL_AMOUNT);
      }
    }

    for (const ally of allies) ally.update(dtSec, allEnemies);
    if (allies.some((a) => a.dead)) {
      allies = allies.filter((a) => {
        if (a.dead) stage.world.removeChild(a.sprite);
        return !a.dead;
      });
    }
    if (enemies.some((e) => e.dead)) {
      enemies = enemies.filter((e) => {
        if (e.dead) stage.world.removeChild(e.sprite);
        return !e.dead;
      });
    }

    for (const proj of projectiles) proj.update(dtSec, world, allEnemies, player);
    const projectileCountBeforeSplits = projectiles.length;
    for (let i = 0; i < projectileCountBeforeSplits; i++) {
      const proj = projectiles[i];
      if (proj.splitSpawns) {
        for (const spawn of proj.splitSpawns) {
          const child = new Projectile(spawn.x, spawn.y, spawn.dirX, spawn.dirY, 'spark', {});
          projectiles.push(child);
          stage.world.addChild(child.sprite);
        }
        proj.splitSpawns = null;
      }
    }
    if (projectiles.some((p) => p.dead)) {
      projectiles = projectiles.filter((p) => {
        if (p.dead) stage.world.removeChild(p.sprite);
        return !p.dead;
      });
    }

    for (const pickup of pickups) {
      if (pickup.collected) continue;
      if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < 10) {
        pickup.collected = true;
        runEssence += 1;
        stage.world.removeChild(pickup.sprite);
      }
    }
    if (pickups.some((p) => p.collected)) pickups = pickups.filter((p) => !p.collected);

    accumulatorMs += dtMs;
    while (accumulatorMs >= SIM_DT_MS) {
      world.step();
      accumulatorMs -= SIM_DT_MS;
    }

    stage.updateCamera(player.x, player.y, WORLD_WIDTH, WORLD_HEIGHT);
    for (const enemy of enemies) enemy.sprite.visible = stage.isInView(enemy.x, enemy.y);
    if (boss) boss.sprite.visible = stage.isInView(boss.x, boss.y);
    for (const pickup of pickups) pickup.sprite.visible = stage.isInView(pickup.x, pickup.y);
    for (const proj of projectiles) proj.sprite.visible = stage.isInView(proj.x, proj.y);
    for (const ally of allies) ally.sprite.visible = stage.isInView(ally.x, ally.y);
    const viewOrigin = stage.getViewOriginWorld();
    simRenderer.render(world, viewOrigin.x, viewOrigin.y);
    const bossEngaged = boss && !boss.dead && Math.hypot(boss.x - player.x, boss.y - player.y) < BOSS_ENGAGE_RANGE;
    hud.update(player.hp, player.maxHp, runEssence, bossEngaged ? { hp: boss!.hp, maxHp: boss!.maxHp } : null);
    stats.frame(dtMs, world.activeChunkCount(), world.totalChunkCount());

    if (player.dead) {
      endRun('death');
    } else if (boss && boss.dead) {
      runEssence += 25; // boss kill bonus
      endRun('victory');
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${String(err)}`;
});
