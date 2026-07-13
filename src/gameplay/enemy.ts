import { Sprite } from 'pixi.js';
import { Material } from '../sim/materials';
import type { World } from '../sim/world';
import type { EnemyKind } from '../sim/generation';
import type { Player } from './player';
import { enemyTexture } from '../render/sprites';

export type AnyEnemyKind = EnemyKind | 'boss';

interface EnemyStats {
  hp: number;
  contactDamage: number;
  speed: number;
  radius: number;
}

const STATS: Record<AnyEnemyKind, EnemyStats> = {
  mole: { hp: 20, contactDamage: 3, speed: 34, radius: 4 },
  beetle: { hp: 16, contactDamage: 5, speed: 24, radius: 3.5 },
  collapser: { hp: 12, contactDamage: 4, speed: 0, radius: 4 },
  boss: { hp: 150, contactDamage: 10, speed: 46, radius: 9 },
};

const CONTACT_COOLDOWN = 1.0;
const AGGRO_RANGE = 130;
const BOSS_AGGRO_RANGE = 220;
const BOSS_SLAM_INTERVAL = 3;
const ANIM_INTERVAL = 0.4;
/** Chasers stop closing the gap once this close, so they don't overlap-glue the player with no way to break contact. */
const CHASE_STOP_MARGIN = 3;

export class Enemy {
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  dead = false;
  readonly kind: AnyEnemyKind;
  readonly hitRadius: number;
  readonly sprite: Sprite;
  /** Set true once dead so main.ts can trigger one-shot death effects (fire burst, victory, ...). */
  justDied = false;

  private vy = 0;
  private facing = 1;
  private contactCooldown = 0;
  private collapserTimer = 1.5 + Math.random() * 1.5;
  private bossSlamTimer = BOSS_SLAM_INTERVAL;
  private animFrame: 0 | 1 = 0;
  private animTimer = Math.random() * ANIM_INTERVAL;

  constructor(x: number, y: number, kind: AnyEnemyKind) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    const stats = STATS[kind];
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.hitRadius = stats.radius;
    this.sprite = new Sprite(enemyTexture(kind));
    this.sprite.anchor.set(0.5, 0.5);
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
    else if (this.kind === 'collapser') this.updateCollapser(dt, world, player, dxToPlayer, distToPlayer);
    else this.updateBoss(dt, world, player, dxToPlayer, distToPlayer);

    this.animTimer += dt;
    if (this.animTimer >= ANIM_INTERVAL) {
      this.animTimer = 0;
      this.animFrame = this.animFrame === 0 ? 1 : 0;
      this.sprite.texture = enemyTexture(this.kind, this.animFrame);
    }
    this.sprite.scale.x = this.facing;
    this.sprite.x = this.x;
    this.sprite.y = this.y;

    if (!player.dead && this.contactCooldown <= 0 && distToPlayer <= this.hitRadius + 6) {
      player.takeDamage(STATS[this.kind].contactDamage);
      const kx = distToPlayer > 0.01 ? dxToPlayer / distToPlayer : this.facing;
      const ky = distToPlayer > 0.01 ? dyToPlayer / distToPlayer : -0.3;
      player.knockback(kx, ky);
      this.contactCooldown = CONTACT_COOLDOWN;
    }
  }

  private updateMole(dt: number, world: World, dx: number, dy: number, dist: number): void {
    const stats = STATS.mole;
    const stopDist = this.hitRadius + CHASE_STOP_MARGIN;
    if (dist < AGGRO_RANGE && dist > stopDist) {
      const nx = dx / dist;
      const ny = dy / dist;
      const stepX = this.x + nx * stats.speed * dt;
      const stepY = this.y + ny * stats.speed * dt;
      // Burrows through diggable terrain toward the player — its signature
      // gimmick per the GDD ("роет землю, выныривает под ногами"), but it
      // stops short of the player instead of tunneling into their exact
      // square so contact damage can't glue them in place.
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
        this.dropDebris(world, player, 3, 6);
      }
    }
  }

  /** Ground-bound charger: ordinary wall/gravity collision like the player has (no digging — it's meant to be out-platformed, not tunneled through), plus a periodic ground-slam AoE. */
  private updateBoss(dt: number, world: World, player: Player, dxToPlayer: number, distToPlayer: number): void {
    const stats = STATS.boss;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }

    this.bossSlamTimer -= dt;
    if (this.bossSlamTimer <= 0) {
      this.bossSlamTimer = BOSS_SLAM_INTERVAL;
      // dropDebris centers on the PLAYER's own position, not the boss's — it's a
      // "rocks fall near you" telegraphed AoE, not a projectile from the boss's
      // location. Gate it on range or the boss could "hit" the player from
      // anywhere in the level, including before they've even met it.
      if (distToPlayer < BOSS_AGGRO_RANGE) this.dropDebris(world, player, 6, 14);
      return;
    }

    const stopDist = this.hitRadius + CHASE_STOP_MARGIN;
    if (distToPlayer < BOSS_AGGRO_RANGE && distToPlayer > stopDist) {
      this.facing = dxToPlayer >= 0 ? 1 : -1;
      const nextX = this.x + this.facing * stats.speed * dt;
      const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
      const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
      if (groundAhead && !wallAhead) this.x = nextX;
    }
  }

  private dropDebris(world: World, player: Player, radius: number, damage: number): void {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y) - 20;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (world.get(cx + dx, cy + dy) === Material.Stone) world.set(cx + dx, cy + dy, Material.Sand);
      }
    }
    if (Math.hypot(player.x - cx, player.y - cy) < radius * 4) player.takeDamage(damage);
  }
}
