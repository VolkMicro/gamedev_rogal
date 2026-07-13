import { Graphics } from 'pixi.js';
import { Material } from '../sim/materials';
import type { World } from '../sim/world';
import type { EnemyKind } from '../sim/generation';
import type { Player } from './player';

interface EnemyStats {
  hp: number;
  contactDamage: number;
  speed: number;
  color: number;
  radius: number;
}

const STATS: Record<EnemyKind, EnemyStats> = {
  mole: { hp: 20, contactDamage: 6, speed: 34, color: 0x9c6b4a, radius: 4 },
  beetle: { hp: 16, contactDamage: 8, speed: 24, color: 0x4a7c3f, radius: 3.5 },
  collapser: { hp: 12, contactDamage: 5, speed: 0, color: 0x6a4a7c, radius: 4 },
};

const CONTACT_COOLDOWN = 0.8;
const AGGRO_RANGE = 130;

export class Enemy {
  x: number;
  y: number;
  hp: number;
  dead = false;
  readonly kind: EnemyKind;
  readonly hitRadius: number;
  readonly sprite: Graphics;
  /** Set true once dead so main.ts can trigger the beetle's fire-burst exactly once. */
  justDied = false;

  private vy = 0;
  private facing = 1;
  private contactCooldown = 0;
  private collapserTimer = 1.5 + Math.random() * 1.5;

  constructor(x: number, y: number, kind: EnemyKind) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    const stats = STATS[kind];
    this.hp = stats.hp;
    this.hitRadius = stats.radius;
    this.sprite = new Graphics().circle(0, 0, stats.radius).fill(stats.color);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  takeDamage(amount: number): void {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.dead = true;
      this.justDied = true;
    }
  }

  update(dt: number, world: World, player: Player): void {
    if (this.dead) return;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;

    const dxToPlayer = player.x - this.x;
    const dyToPlayer = player.y - this.y;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);

    if (this.kind === 'mole') this.updateMole(dt, world, dxToPlayer, dyToPlayer, distToPlayer);
    else if (this.kind === 'beetle') this.updateBeetle(dt, world);
    else this.updateCollapser(dt, world, player, dxToPlayer, distToPlayer);

    this.sprite.x = this.x;
    this.sprite.y = this.y;

    if (!player.dead && this.contactCooldown <= 0 && distToPlayer <= this.hitRadius + 6) {
      player.takeDamage(STATS[this.kind].contactDamage);
      this.contactCooldown = CONTACT_COOLDOWN;
    }
  }

  private updateMole(dt: number, world: World, dx: number, dy: number, dist: number): void {
    const stats = STATS.mole;
    if (dist < AGGRO_RANGE && dist > 1) {
      const nx = dx / dist;
      const ny = dy / dist;
      const stepX = this.x + nx * stats.speed * dt;
      const stepY = this.y + ny * stats.speed * dt;
      // Burrows through diggable terrain toward the player.
      const cx = Math.floor(stepX);
      const cy = Math.floor(stepY);
      const mat = world.get(cx, cy);
      if (mat === Material.Stone) world.set(cx, cy, Material.Empty);
      this.x = stepX;
      this.y = stepY;
    }
  }

  private updateBeetle(dt: number, world: World): void {
    const stats = STATS.beetle;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }

    const nextX = this.x + this.facing * stats.speed * dt;
    const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
    const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
    if (!groundAhead || wallAhead) {
      this.facing *= -1;
    } else {
      this.x = nextX;
    }
  }

  private updateCollapser(dt: number, world: World, player: Player, dxToPlayer: number, distToPlayer: number): void {
    this.collapserTimer -= dt;
    if (this.collapserTimer <= 0) {
      this.collapserTimer = 2.5 + Math.random() * 1.5;
      if (Math.abs(dxToPlayer) < 40 && distToPlayer < 100 && player.y < this.y) {
        this.dropDebris(world, player);
      }
    }
  }

  private dropDebris(world: World, player: Player): void {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y) - 20;
    const r = 3;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        if (world.get(cx + dx, cy + dy) === Material.Stone) world.set(cx + dx, cy + dy, Material.Sand);
      }
    }
    if (Math.hypot(player.x - cx, player.y - cy) < 14) player.takeDamage(10);
  }
}
