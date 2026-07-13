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

  const simRenderer = new SimRenderer(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  stage.world.addChild(simRenderer.sprite);

  const jumpButton = document.createElement('button');
  jumpButton.textContent = 'Прыжок';
  Object.assign(jumpButton.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '10',
    padding: '10px 16px',
    font: '13px monospace',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(jumpButton);

  const input = new InputController(stage.app.canvas, jumpButton);
  const stats = new StatsOverlay();
  const hud = new Hud();
  const wand = new Wand();

  let world = new World(WORLD_WIDTH, WORLD_HEIGHT);
  const player = new Player(0, 0);
  stage.world.addChild(player.sprite);

  let enemies: Enemy[] = [];
  let pickups: EssencePickup[] = [];
  let projectiles: Projectile[] = [];
  let essence = 0;
  let runSeed = 1;

  function startRun(seed: number): void {
    for (const e of enemies) stage.world.removeChild(e.sprite);
    for (const p of pickups) stage.world.removeChild(p.sprite);
    for (const p of projectiles) stage.world.removeChild(p.sprite);
    enemies = [];
    pickups = [];
    projectiles = [];

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
  }

  startRun(runSeed);

  let accumulatorMs = 0;

  stage.app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    const dtSec = dtMs / 1000;

    wand.tick(dtSec);
    player.update(dtSec, input.moveX, input.consumeJump(), world);

    if (input.aiming && !player.dead) {
      const spell = wand.tryCast();
      if (spell) {
        const proj = new Projectile(player.x, player.y, input.aimX, input.aimY, spell);
        projectiles.push(proj);
        stage.world.addChild(proj.sprite);
      }
    }

    for (const enemy of enemies) enemy.update(dtSec, world, player);
    for (const enemy of enemies) {
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

    for (const proj of projectiles) proj.update(dtSec, world, enemies);
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
        essence += 1;
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
    for (const pickup of pickups) pickup.sprite.visible = stage.isInView(pickup.x, pickup.y);
    for (const proj of projectiles) proj.sprite.visible = stage.isInView(proj.x, proj.y);
    const viewOrigin = stage.getViewOriginWorld();
    simRenderer.render(world, viewOrigin.x, viewOrigin.y);
    hud.update(player.hp, player.maxHp, essence);
    stats.frame(dtMs, world.activeChunkCount(), world.totalChunkCount());

    if (player.dead) {
      runSeed += 1;
      startRun(runSeed);
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${String(err)}`;
});
