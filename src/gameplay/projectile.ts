import { Graphics } from 'pixi.js';
import { Material, isSolidForPlayer } from '../sim/materials';
import type { World } from '../sim/world';
import type { Enemy } from './enemy';

export type ProjectileSpellId = 'spark' | 'saw' | 'bomb';
export type ModifierSpellId = 'triple' | 'homing';
export type SpellId = ProjectileSpellId | ModifierSpellId;

export const PROJECTILE_SPELLS: ProjectileSpellId[] = ['spark', 'saw', 'bomb'];
export const MODIFIER_SPELLS: ModifierSpellId[] = ['triple', 'homing'];

export function isModifierSpell(id: SpellId): id is ModifierSpellId {
  return (MODIFIER_SPELLS as SpellId[]).includes(id);
}

export const SPELL_LABELS: Record<SpellId, string> = {
  spark: 'Искра',
  saw: 'Пила',
  bomb: 'Бомба',
  triple: 'Тройной выстрел',
  homing: 'Самонаведение',
};

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

const SPELLS: Record<ProjectileSpellId, SpellDef> = {
  spark: { speed: 340, damage: 8, digRadius: 2, color: 0xfff2a8, radius: 1.5, lifetime: 90, explodeOnExpiry: false, explodeRadius: 0 },
  saw: { speed: 260, damage: 14, digRadius: 3, color: 0xd7d7d7, radius: 2, lifetime: 60, explodeOnExpiry: false, explodeRadius: 0 },
  bomb: { speed: 180, damage: 0, digRadius: 0, color: 0x8a8a8a, radius: 2.5, lifetime: 55, explodeOnExpiry: true, explodeRadius: 14 },
};

const HOMING_TURN_RATE = 4.2; // radians/sec
const HOMING_RANGE = 90;

export class Projectile {
  x: number;
  y: number;
  private vx: number;
  private vy: number;
  private spell: SpellDef;
  private age = 0;
  private embedded = false;
  private homing: boolean;
  dead = false;
  readonly sprite: Graphics;

  constructor(x: number, y: number, dirX: number, dirY: number, spellId: ProjectileSpellId, homing = false) {
    this.x = x;
    this.y = y;
    this.spell = SPELLS[spellId];
    this.vx = dirX * this.spell.speed;
    this.vy = dirY * this.spell.speed;
    this.homing = homing;
    this.sprite = new Graphics().circle(0, 0, this.spell.radius).fill(homing ? 0x8ad6ff : this.spell.color);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  update(dt: number, world: World, enemies: Enemy[]): void {
    this.age += dt * 60;
    if (!this.embedded) {
      if (this.homing) this.steerTowardNearest(dt, enemies);
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

  private steerTowardNearest(dt: number, enemies: Enemy[]): void {
    let nearest: Enemy | null = null;
    let nearestDist = HOMING_RANGE;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    if (!nearest) return;

    const speed = Math.hypot(this.vx, this.vy);
    const currentAngle = Math.atan2(this.vy, this.vx);
    const targetAngle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
    let diff = targetAngle - currentAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = HOMING_TURN_RATE * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const newAngle = currentAngle + turn;
    this.vx = Math.cos(newAngle) * speed;
    this.vy = Math.sin(newAngle) * speed;
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
