import { initTelegram } from './telegram';
import { Stage } from './render/stage';
import { SimRenderer } from './render/simRenderer';
import { World } from './sim/world';
import { Player } from './gameplay/player';
import { InputController } from './gameplay/input';
import { StatsOverlay } from './perf/statsOverlay';
import { buildTestScene, createEmitters } from './scene';

const SIM_WIDTH = 400;
const SIM_HEIGHT = 240;
const SIM_HZ = 60;
const SIM_DT_MS = 1000 / SIM_HZ;

async function main(): Promise<void> {
  initTelegram();

  const appEl = document.querySelector<HTMLDivElement>('#app')!;
  appEl.innerHTML = '';

  const stage = new Stage(SIM_WIDTH, SIM_HEIGHT);
  await stage.init(appEl);

  const world = new World(SIM_WIDTH, SIM_HEIGHT);
  buildTestScene(world);
  const emitters = createEmitters();

  const simRenderer = new SimRenderer(SIM_WIDTH, SIM_HEIGHT);
  stage.world.addChild(simRenderer.sprite);

  const player = new Player(30, SIM_HEIGHT - 40);
  stage.world.addChild(player.sprite);

  const input = new InputController(stage.app.canvas);
  const stats = new StatsOverlay();

  const stressButton = document.createElement('button');
  stressButton.textContent = 'Stress test: off';
  Object.assign(stressButton.style, {
    position: 'fixed',
    top: '4px',
    right: '4px',
    zIndex: '10',
    font: '12px monospace',
  } satisfies Partial<CSSStyleDeclaration>);
  let stress = false;
  stressButton.addEventListener('click', () => {
    stress = !stress;
    stressButton.textContent = `Stress test: ${stress ? 'on' : 'off'}`;
  });
  document.body.appendChild(stressButton);

  let simTick = 0;
  let accumulatorMs = 0;

  stage.app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    const dtSec = dtMs / 1000;

    player.update(dtSec, input.moveX, input.consumeJump(), world);

    accumulatorMs += dtMs;
    while (accumulatorMs >= SIM_DT_MS) {
      emitters.step(world, simTick, stress);
      world.step();
      simTick++;
      accumulatorMs -= SIM_DT_MS;
    }

    simRenderer.render(world);
    stats.frame(dtMs, world.activeChunkCount(), world.totalChunkCount());
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${String(err)}`;
});
