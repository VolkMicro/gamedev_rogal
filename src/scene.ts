import { Material } from './sim/materials';
import type { World } from './sim/world';

/** Builds the stage-1 perf-gate test arena: ground, a wood pillar, and material emitters. */
export function buildTestScene(world: World): void {
  const w = world.width;
  const h = world.height;
  const groundY = h - 24;

  for (let x = 0; x < w; x++) {
    for (let y = groundY; y < h; y++) {
      world.set(x, y, Material.Stone);
    }
  }

  // A couple of stone platforms to jump on / block falling material.
  const platforms: Array<[number, number, number]> = [
    [40, groundY - 40, 60],
    [160, groundY - 70, 70],
    [280, groundY - 35, 50],
  ];
  for (const [px, py, len] of platforms) {
    for (let x = px; x < px + len; x++) {
      world.set(x, py, Material.Stone);
      world.set(x, py + 1, Material.Stone);
    }
  }

  // Wood pillar for the fire-spread demo.
  const pillarX = 340;
  for (let y = groundY - 1; y > groundY - 45; y--) {
    world.set(pillarX, y, Material.Wood);
    world.set(pillarX + 1, y, Material.Wood);
  }

  // Standing water pool.
  for (let x = 180; x < 260; x++) {
    for (let y = groundY - 1; y > groundY - 20; y--) {
      world.set(x, y, Material.Water);
    }
  }
}

export interface Emitters {
  /** Call every tick to keep a steady trickle of sand + periodic ignition running. */
  step(world: World, tick: number, stress: boolean): void;
}

export function createEmitters(): Emitters {
  return {
    step(world: World, tick: number, stress: boolean) {
      const rate = stress ? 1 : 4;
      if (tick % rate === 0) {
        world.set(20 + (tick % 15), 2, Material.Sand);
        world.set(300 - (tick % 15), 2, Material.Sand);
      }
      if (stress && tick % 2 === 0) {
        world.set(120 + (tick % 40), 2, Material.Water);
      }
      // Re-ignite the wood pillar's base periodically so the fire/burn-out
      // cycle keeps demonstrating spread under the perf gate's steady state.
      if (tick % 240 === 0) {
        world.set(340, world.height - 25, Material.Fire, 45);
      }
    },
  };
}
