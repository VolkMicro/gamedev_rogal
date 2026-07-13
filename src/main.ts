import { Graphics } from 'pixi.js';
import { initTelegram } from './telegram';
import { Stage } from './render/stage';
import { SimRenderer } from './render/simRenderer';
import { World } from './sim/world';
import { generateMinesLevel } from './sim/generation';
import { Material } from './sim/materials';
import { Player } from './gameplay/player';
import { Enemy } from './gameplay/enemy';
import { Projectile } from './gameplay/projectile';
import { Wand } from './gameplay/wand';
import { InputController } from './gameplay/input';
import { StatsOverlay } from './perf/statsOverlay';
import { Hud } from './gameplay/hud';
import { loadSave, persistSave } from './meta/save';
import { Camp } from './meta/camp';
import { loadSprites } from './render/sprites';

const VIEWPORT_WIDTH = 400;
const VIEWPORT_HEIGHT = 240;
const WORLD_WIDTH = 400;
const WORLD_HEIGHT = 720;
const SIM_HZ = 60;
const SIM_DT_MS = 1000 / SIM_HZ;

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

  const stage = new Stage(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  await stage.init(appEl);
  await loadSprites();

  const simRenderer = new SimRenderer(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  stage.world.addChild(simRenderer.sprite);

  const jumpButton = document.createElement('button');
  jumpButton.textContent = 'Прыжок';
  jumpButton.className = 'kenney-btn';
  Object.assign(jumpButton.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '10',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(jumpButton);

  const input = new InputController(stage.app.canvas, jumpButton);
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
  let runEssence = 0;
  let runSeed = 1;
  let running = false;

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
    enemies = [];
    boss = null;
    pickups = [];
    projectiles = [];
  }

  function startRun(seed: number): void {
    clearRunObjects();
    runEssence = 0;

    world = new World(WORLD_WIDTH, WORLD_HEIGHT);
    const level = generateMinesLevel(world, seed);
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
        const homing = cast.modifiers.includes('homing');
        const angle = Math.atan2(input.aimY, input.aimX);
        const spreadAngles = cast.modifiers.includes('triple') ? [-0.28, 0, 0.28] : [0];
        for (const spread of spreadAngles) {
          const a = angle + spread;
          const proj = new Projectile(player.x, player.y, Math.cos(a), Math.sin(a), cast.spell, homing);
          projectiles.push(proj);
          stage.world.addChild(proj.sprite);
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
    }
    if (enemies.some((e) => e.dead)) {
      enemies = enemies.filter((e) => {
        if (e.dead) stage.world.removeChild(e.sprite);
        return !e.dead;
      });
    }

    for (const proj of projectiles) proj.update(dtSec, world, allEnemies);
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
    const viewOrigin = stage.getViewOriginWorld();
    simRenderer.render(world, viewOrigin.x, viewOrigin.y);
    hud.update(player.hp, player.maxHp, runEssence);
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
