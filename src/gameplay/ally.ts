import { Graphics } from 'pixi.js';
import type { Enemy } from './enemy';

const DURATION = 8;
const FIRE_INTERVAL = 0.9;
const RANGE = 100;
const DAMAGE = 6;

/**
 * The "Призыв" (Summon) modifier's payload — per the GDD it "adds a friendly
 * flying turret to the cast chain". Simplified from a fully autonomous
 * entity with its own movement/targeting AI to a stationary orb that zaps
 * the nearest enemy in range on a timer, for a limited duration. Spawns
 * one-off small bolts (plain Graphics, not a full Projectile) since the
 * bolts are hitscan-instant and don't need terrain collision.
 */
export class Ally {
  x: number;
  y: number;
  dead = false;
  private timeLeft = DURATION;
  private fireTimer = 0;
  readonly sprite: Graphics;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite = new Graphics().circle(0, 0, 3).fill(0xffe08a).circle(0, 0, 1.4).fill(0xffffff);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  /** Returns the enemy it zapped this frame (for a caller to spawn a visual bolt), or null. */
  update(dt: number, enemies: Enemy[]): Enemy | null {
    if (this.dead) return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.dead = true;
      return null;
    }
    this.sprite.alpha = Math.min(1, this.timeLeft);

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return null;

    let nearest: Enemy | null = null;
    let nearestDist = RANGE;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    if (!nearest) return null;
    this.fireTimer = FIRE_INTERVAL;
    nearest.takeDamage(DAMAGE);
    return nearest;
  }
}
