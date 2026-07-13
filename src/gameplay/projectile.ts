import { Graphics } from 'pixi.js';
import { Material, isSolidForPlayer } from '../sim/materials';
import type { World } from '../sim/world';
import type { Enemy } from './enemy';

export type SpellId = 'spark' | 'saw' | 'bomb';

interface SpellDef {
  speed: number;
  damage: number;
  digRadius: number;
  color: number;
  radius: number;
  /** Ticks before the projectile expires even without hitting anything. */
  lifetime: number;
  /** Bomb-style: explode-on-expiry instead of on first solid hit. */
  explodeOnExpiry: boolean;
  explodeRadius: number;
}

const SPELLS: Record<SpellId, SpellDef> = {
  spark: { speed: 340, damage: 8, digRadius: 2, color: 0xfff2a8, radius: 1.5, lifetime: 90, explodeOnExpiry: false, explodeRadius: 0 },
  saw: { speed: 260, damage: 14, digRadius: 3, color: 0xd7d7d7, radius: 2, lifetime: 60, explodeOnExpiry: false, explodeRadius: 0 },
  bomb: { speed: 180, damage: 0, digRadius: 0, color: 0x8a8a8a, radius: 2.5, lifetime: 55, explodeOnExpiry: true, explodeRadius: 14 },
};

export class Projectile {
  x: number;
  y: number;
  private vx: number;
  private vy: number;
  private spell: SpellDef;
  private age = 0;
  private embedded = false;
  dead = false;
  readonly sprite: Graphics;

  constructor(x: number, y: number, dirX: number, dirY: number, spellId: SpellId) {
    this.x = x;
    this.y = y;
    this.spell = SPELLS[spellId];
    this.vx = dirX * this.spell.speed;
    this.vy = dirY * this.spell.speed;
    this.sprite = new Graphics().circle(0, 0, this.spell.radius).fill(this.spell.color);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  update(dt: number, world: World, enemies: Enemy[]): void {
    this.age += dt * 60;
    if (!this.embedded) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    this.sprite.x = this.x;
    this.sprite.y = this.y;

    if (!world.inBounds(this.x, this.y)) {
      this.dead = true;
      return;
    }

    if (this.age > this.spell.lifetime) {
      this.detonate(world, enemies);
      this.dead = true;
      return;
    }

    if (!this.embedded && isSolidForPlayer(world.get(Math.floor(this.x), Math.floor(this.y)))) {
      if (this.spell.explodeOnExpiry) {
        // Bomb: stick in place and wait out its fuse instead of exploding on contact.
        this.embedded = true;
      } else {
        if (this.spell.digRadius > 0) this.dig(world);
        this.dead = true;
      }
      return;
    }

    if (this.embedded) return;

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      if (dx * dx + dy * dy <= enemy.hitRadius * enemy.hitRadius) {
        if (this.spell.explodeOnExpiry) {
          this.detonate(world, enemies);
        } else {
          enemy.takeDamage(this.spell.damage);
        }
        this.dead = true;
        return;
      }
    }
  }

  private dig(world: World): void {
    const r = this.spell.digRadius;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const mat = world.get(cx + dx, cy + dy);
        if (mat === Material.Stone || mat === Material.Wood) world.set(cx + dx, cy + dy, Material.Empty);
      }
    }
  }

  private detonate(world: World, enemies: Enemy[]): void {
    if (!this.spell.explodeOnExpiry) return;
    const r = this.spell.explodeRadius;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const mat = world.get(cx + dx, cy + dy);
        if (mat === Material.Stone || mat === Material.Wood || mat === Material.Sand) {
          world.set(cx + dx, cy + dy, Material.Empty);
        }
      }
    }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      if (dx * dx + dy * dy <= r * r) enemy.takeDamage(40);
    }
  }
}
