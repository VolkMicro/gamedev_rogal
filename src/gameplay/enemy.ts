import { Sprite } from 'pixi.js';
import { Material } from '../sim/materials';
import type { World } from '../sim/world';
import type { Player } from './player';
import { enemyTexture } from '../render/sprites';

export type EnemyKind =
  | 'mole'
  | 'beetle'
  | 'collapser'
  | 'leech'
  | 'acidSlime'
  | 'drowned'
  | 'fireImp'
  | 'sulfurTick'
  | 'heatedGuardian'
  | 'whisperOfDarkness'
  | 'ashHound'
  | 'essenceKeeper';
export type AnyEnemyKind = EnemyKind | 'boss';

/** Holy Light deals 2x damage to these and they're the ones "Шёпот тьмы"-flavored spells care about. */
export const DARK_ENEMY_KINDS: AnyEnemyKind[] = ['collapser', 'whisperOfDarkness', 'drowned'];

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
  leech: { hp: 14, contactDamage: 4, speed: 44, radius: 3.5 },
  acidSlime: { hp: 18, contactDamage: 3, speed: 16, radius: 4 },
  drowned: { hp: 30, contactDamage: 7, speed: 12, radius: 4.5 },
  fireImp: { hp: 16, contactDamage: 5, speed: 30, radius: 3.5 },
  sulfurTick: { hp: 8, contactDamage: 2, speed: 20, radius: 3 },
  heatedGuardian: { hp: 46, contactDamage: 9, speed: 14, radius: 5.5 },
  whisperOfDarkness: { hp: 20, contactDamage: 6, speed: 0, radius: 4 },
  ashHound: { hp: 10, contactDamage: 5, speed: 52, radius: 3.5 },
  essenceKeeper: { hp: 60, contactDamage: 6, speed: 26, radius: 5 },
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
  /** Set for exactly one frame when this enemy wants to fire a projectile at the player (fireImp, whisperOfDarkness). main.ts reads {dx,dy} and clears it. */
  pendingAttack: { dx: number; dy: number } | null = null;
  /** Set for exactly one frame when this enemy's contact hit should also drain the run's essence (essenceKeeper). main.ts reads and clears it. */
  essenceStolen = false;

  private vy = 0;
  private facing = 1;
  private contactCooldown = 0;
  private collapserTimer = 1.5 + Math.random() * 1.5;
  private bossSlamTimer = BOSS_SLAM_INTERVAL;
  private animFrame: 0 | 1 = 0;
  private animTimer = Math.random() * ANIM_INTERVAL;

  private poisonTicksLeft = 0;
  private poisonDamagePerTick = 0;
  private poisonTickTimer = 0;
  private burnTicksLeft = 0;
  private burnDamagePerTick = 0;
  private burnTickTimer = 0;
  private blindTimer = 0;

  private attackTimer = 1 + Math.random() * 1.5;
  private teleportTimer = 2 + Math.random() * 2;
  private acidTrailTimer = 0;

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

  poisonFor(ticks: number, damagePerTick: number): void {
    this.poisonTicksLeft = Math.max(this.poisonTicksLeft, ticks);
    this.poisonDamagePerTick = damagePerTick;
  }

  igniteFor(ticks: number, damagePerTick: number): void {
    this.burnTicksLeft = Math.max(this.burnTicksLeft, ticks);
    this.burnDamagePerTick = damagePerTick;
  }

  blindFor(seconds: number): void {
    this.blindTimer = Math.max(this.blindTimer, seconds);
  }

  update(dt: number, world: World, player: Player): void {
    if (this.dead) return;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;
    this.updateStatusEffects(dt);
    if (this.dead) return; // status DoT can finish it off

    const dxToPlayer = player.x - this.x;
    const dyToPlayer = player.y - this.y;
    const distToPlayer = Math.hypot(dxToPlayer, dyToPlayer);
    const blinded = this.blindTimer > 0;

    if (!blinded) {
      if (this.kind === 'mole') this.updateMole(dt, world, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'beetle') this.updateBeetle(dt, world);
      else if (this.kind === 'collapser') this.updateCollapser(dt, world, player, dxToPlayer, distToPlayer);
      else if (this.kind === 'leech') this.updateLeech(dt, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'acidSlime') this.updateAcidSlime(dt, world);
      else if (this.kind === 'drowned') this.updateDrowned(dt, world, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'fireImp') this.updateFireImp(dt, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'sulfurTick') this.updateSulfurTick(dt, world, distToPlayer);
      else if (this.kind === 'heatedGuardian') this.updateHeatedGuardian(dt, world);
      else if (this.kind === 'whisperOfDarkness') this.updateWhisper(dt, world, player, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'ashHound') this.updateAshHound(dt, world, dxToPlayer, dyToPlayer, distToPlayer);
      else if (this.kind === 'essenceKeeper') this.updateEssenceKeeper(dt, world, dxToPlayer, dyToPlayer, distToPlayer);
      else this.updateBoss(dt, world, player, dxToPlayer, distToPlayer);
    }

    this.animTimer += dt;
    if (this.animTimer >= ANIM_INTERVAL) {
      this.animTimer = 0;
      this.animFrame = this.animFrame === 0 ? 1 : 0;
      this.sprite.texture = enemyTexture(this.kind, this.animFrame);
    }
    this.sprite.scale.x = this.facing;
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    this.sprite.tint = this.poisonTicksLeft > 0 ? 0x9fe870 : this.burnTicksLeft > 0 ? 0xff9a5a : 0xffffff;

    const contactRadius = this.kind === 'sulfurTick' ? this.hitRadius + 12 : this.hitRadius + 6;
    if (!player.dead && this.contactCooldown <= 0 && distToPlayer <= contactRadius) {
      player.takeDamage(STATS[this.kind].contactDamage);
      if (this.kind === 'essenceKeeper') this.essenceStolen = true;
      if (this.kind === 'sulfurTick') this.takeDamage(this.hp); // detonates itself on contact
      const kx = distToPlayer > 0.01 ? dxToPlayer / distToPlayer : this.facing;
      const ky = distToPlayer > 0.01 ? dyToPlayer / distToPlayer : -0.3;
      player.knockback(kx, ky);
      this.contactCooldown = CONTACT_COOLDOWN;
    }
  }

  private updateStatusEffects(dt: number): void {
    if (this.poisonTicksLeft > 0) {
      this.poisonTickTimer += dt;
      if (this.poisonTickTimer >= 1) {
        this.poisonTickTimer -= 1;
        this.poisonTicksLeft--;
        this.takeDamage(this.poisonDamagePerTick);
      }
    }
    if (this.burnTicksLeft > 0) {
      this.burnTickTimer += dt;
      if (this.burnTickTimer >= 1) {
        this.burnTickTimer -= 1;
        this.burnTicksLeft--;
        this.takeDamage(this.burnDamagePerTick);
      }
    }
    if (this.blindTimer > 0) this.blindTimer -= dt;
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

  /** Free-swims straight at the player, ignoring gravity/terrain — a fast erratic pursuer once it's aggroed. */
  private updateLeech(dt: number, dx: number, dy: number, dist: number): void {
    if (dist < AGGRO_RANGE && dist > 1) {
      const stats = STATS.leech;
      this.x += (dx / dist) * stats.speed * dt;
      this.y += (dy / dist) * stats.speed * dt;
      this.facing = dx >= 0 ? 1 : -1;
    }
  }

  /** Ground-bound like the beetle, but leaves a corrosive Acid trail behind it as it walks. */
  private updateAcidSlime(dt: number, world: World): void {
    const stats = STATS.acidSlime;
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
    if (!groundAhead || wallAhead) this.facing *= -1;
    else this.x = nextX;

    this.acidTrailTimer -= dt;
    if (this.acidTrailTimer <= 0) {
      this.acidTrailTimer = 0.4;
      const cx = Math.floor(this.x);
      const cy = Math.floor(this.y + this.hitRadius);
      if (world.get(cx, cy) === Material.Empty) world.set(cx, cy, Material.Acid, 20);
    }
  }

  /** Slow, tanky ground melee bruiser — no gimmick, just a hard-hitting wall of a corpse. */
  private updateDrowned(dt: number, world: World, dx: number, dy: number, dist: number): void {
    const stats = STATS.drowned;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }
    const stopDist = this.hitRadius + CHASE_STOP_MARGIN;
    if (dist < AGGRO_RANGE && dist > stopDist) {
      this.facing = dx >= 0 ? 1 : -1;
      const nextX = this.x + this.facing * stats.speed * dt;
      const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
      const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
      if (groundAhead && !wallAhead) this.x = nextX;
    }
    void dy;
  }

  /** Flies (ignores gravity), hovers near the player, periodically lobs a fireball. */
  private updateFireImp(dt: number, dx: number, dy: number, dist: number): void {
    const stats = STATS.fireImp;
    if (dist > 70) {
      this.x += (dx / dist || 0) * stats.speed * dt;
      this.y += (dy / dist || 0) * stats.speed * dt;
    } else if (dist < 45 && dist > 0.1) {
      this.x -= (dx / dist) * stats.speed * dt * 0.6;
      this.y -= (dy / dist) * stats.speed * dt * 0.6;
    }
    this.facing = dx >= 0 ? 1 : -1;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && dist > 1) {
      this.attackTimer = 2.2 + Math.random() * 1;
      this.pendingAttack = { dx: dx / dist, dy: dy / dist };
    }
  }

  /** Mostly stationary; detonates on contact (handled generically in update()) — the "chase" here is a light wobble toward the player so it isn't a sitting duck. */
  private updateSulfurTick(dt: number, world: World, distToPlayer: number): void {
    if (distToPlayer > AGGRO_RANGE) return;
    const stats = STATS.sulfurTick;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) this.vy = 0;
    else this.y = nextY;
    const nextX = this.x + this.facing * stats.speed * dt;
    const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
    const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
    if (!groundAhead || wallAhead) this.facing *= -1;
    else this.x = nextX;
  }

  /** Tanky, slow ground chaser that periodically ignites the floor beneath itself. */
  private updateHeatedGuardian(dt: number, world: World): void {
    const stats = STATS.heatedGuardian;
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
    if (!groundAhead || wallAhead) this.facing *= -1;
    else this.x = nextX;

    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = 1.5;
      const cx = Math.floor(this.x);
      const cy = Math.floor(this.y + this.hitRadius + 1);
      if (world.get(cx, cy) === Material.Empty) world.set(cx, cy, Material.Fire, 30);
    }
  }

  /** Ranged teleporter: blinks to a random spot near the player, then lobs a bolt. */
  private updateWhisper(dt: number, world: World, player: Player, dx: number, dy: number, dist: number): void {
    this.teleportTimer -= dt;
    if (this.teleportTimer <= 0) {
      this.teleportTimer = 3 + Math.random() * 1.5;
      const angle = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 40;
      const tx = player.x + Math.cos(angle) * r;
      const ty = player.y + Math.sin(angle) * r;
      if (!world.isSolidForPlayer(Math.floor(tx), Math.floor(ty))) {
        this.x = tx;
        this.y = ty;
      }
    }
    this.facing = dx >= 0 ? 1 : -1;
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && dist > 1 && dist < 200) {
      this.attackTimer = 1.8 + Math.random() * 0.8;
      this.pendingAttack = { dx: dx / dist, dy: dy / dist };
    }
  }

  /** Fast ground chaser — spawns in small packs (a generation.ts detail, not special AI here). */
  private updateAshHound(dt: number, world: World, dx: number, dy: number, dist: number): void {
    const stats = STATS.ashHound;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }
    const stopDist = this.hitRadius + CHASE_STOP_MARGIN;
    if (dist < AGGRO_RANGE * 1.4 && dist > stopDist) {
      this.facing = dx >= 0 ? 1 : -1;
      const nextX = this.x + this.facing * stats.speed * dt;
      const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
      const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
      if (groundAhead && !wallAhead) this.x = nextX;
    }
    void dy;
  }

  /** Mini-boss: ground chaser like drowned, but contact hits also steal essence (handled generically in update()). */
  private updateEssenceKeeper(dt: number, world: World, dx: number, dy: number, dist: number): void {
    const stats = STATS.essenceKeeper;
    this.vy = Math.min(this.vy + 340 * dt, 220);
    const nextY = this.y + this.vy * dt;
    if (world.isSolidForPlayer(Math.floor(this.x), Math.floor(nextY + this.hitRadius))) {
      this.vy = 0;
    } else {
      this.y = nextY;
    }
    const stopDist = this.hitRadius + CHASE_STOP_MARGIN;
    if (dist < AGGRO_RANGE && dist > stopDist) {
      this.facing = dx >= 0 ? 1 : -1;
      const nextX = this.x + this.facing * stats.speed * dt;
      const groundAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y + this.hitRadius + 1));
      const wallAhead = world.isSolidForPlayer(Math.floor(nextX + this.facing * this.hitRadius), Math.floor(this.y));
      if (groundAhead && !wallAhead) this.x = nextX;
    }
    void dy;
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
