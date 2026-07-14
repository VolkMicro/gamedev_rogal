import { Container, Graphics } from 'pixi.js';

interface Particle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/**
 * Lightweight impact/kill particle bursts — plain Graphics circles flung
 * outward and faded over a fraction of a second, not a full particle system.
 * Updated with REAL (hit-stop-unaffected) delta time so the burst still
 * visibly flies apart during a frozen hit-stop beat instead of also
 * freezing — that combination (world holds, particles snap outward) is what
 * actually sells the impact.
 */
export class FxLayer {
  private particles: Particle[] = [];
  private readonly container: Container;

  constructor(container: Container) {
    this.container = container;
  }

  burst(x: number, y: number, color: number, count: number, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random() * 0.5);
      const gfx = new Graphics().circle(0, 0, 0.8 + Math.random() * 1.4).fill(color);
      gfx.x = x;
      gfx.y = y;
      this.container.addChild(gfx);
      this.particles.push({ gfx, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life, maxLife: life });
    }
  }

  update(realDt: number): void {
    if (!this.particles.length) return;
    this.particles = this.particles.filter((p) => {
      p.life -= realDt;
      if (p.life <= 0) {
        this.container.removeChild(p.gfx);
        return false;
      }
      p.gfx.x += p.vx * realDt;
      p.gfx.y += p.vy * realDt;
      p.gfx.alpha = Math.max(0, p.life / p.maxLife);
      return true;
    });
  }
}
