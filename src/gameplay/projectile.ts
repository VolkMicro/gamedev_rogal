import { Graphics } from 'pixi.js';
import { Material, isSolidForPlayer, ACID_DEFAULT_LIFE, ICE_DEFAULT_LIFE } from '../sim/materials';
import type { World } from '../sim/world';
import type { Enemy } from './enemy';
import { DARK_ENEMY_KINDS } from './enemy';
import type { Player } from './player';

export type ProjectileSpellId =
  | 'spark'
  | 'saw'
  | 'bomb'
  | 'lightning'
  | 'acidBall'
  | 'fireball'
  | 'iceShard'
  | 'chainLightning'
  | 'blackHole'
  | 'digger'
  | 'sporeCloud'
  | 'poisonDart'
  | 'holyLight'
  | 'bloodSpear'
  | 'annihilationBomb';

export type ModifierSpellId =
  | 'triple'
  | 'homing'
  | 'ignite'
  | 'ricochet'
  | 'castSpeed'
  | 'enlarge'
  | 'piercing'
  | 'split'
  | 'gravityTrail'
  | 'summon';

export type SpellId = ProjectileSpellId | ModifierSpellId;

export const PROJECTILE_SPELLS: ProjectileSpellId[] = [
  'spark',
  'saw',
  'bomb',
  'lightning',
  'acidBall',
  'fireball',
  'iceShard',
  'chainLightning',
  'blackHole',
  'digger',
  'sporeCloud',
  'poisonDart',
  'holyLight',
  'bloodSpear',
  'annihilationBomb',
];
export const MODIFIER_SPELLS: ModifierSpellId[] = [
  'triple',
  'homing',
  'ignite',
  'ricochet',
  'castSpeed',
  'enlarge',
  'piercing',
  'split',
  'gravityTrail',
  'summon',
];

export function isModifierSpell(id: SpellId): id is ModifierSpellId {
  return (MODIFIER_SPELLS as SpellId[]).includes(id);
}

export const SPELL_LABELS: Record<SpellId, string> = {
  spark: 'Искра',
  saw: 'Пила',
  bomb: 'Бомба',
  lightning: 'Молния',
  acidBall: 'Кислотный шар',
  fireball: 'Огненный шар',
  iceShard: 'Ледяной осколок',
  chainLightning: 'Цепная молния',
  blackHole: 'Чёрная дыра',
  digger: 'Копатель',
  sporeCloud: 'Споровое облако',
  poisonDart: 'Ядовитый дротик',
  holyLight: 'Святой свет',
  bloodSpear: 'Кровавое копьё',
  annihilationBomb: 'Бомба уничтожения',
  triple: 'Тройной выстрел',
  homing: 'Самонаведение',
  ignite: 'Поджиг',
  ricochet: 'Рикошет',
  castSpeed: 'Ускорение каста',
  enlarge: 'Увеличение',
  piercing: 'Пробивной',
  split: 'Разделение',
  gravityTrail: 'Гравитационный след',
  summon: 'Призыв',
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
  /** Splashes this material in a radius on hit — acid ball leaves corrosive Acid, fireball ignites Fire. */
  onHitMaterial?: Material;
  onHitMaterialRadius?: number;
  onHitMaterialAux?: number;
  /** Freezes nearby Water into temporary Ice on hit. */
  freezeRadius?: number;
  /** Chain to additional nearby enemies after the first hit. */
  chainCount?: number;
  chainRange?: number;
  /** Pulls enemies toward the impact point instead of digging terrain. */
  isBlackHole?: boolean;
  pullRadius?: number;
  /** Poison DoT applied to struck enemies (spore cloud is AoE via poisonRadius; poison dart is single-target). */
  poisonDamagePerTick?: number;
  poisonTicks?: number;
  poisonRadius?: number;
  /** 2x damage vs dark/undead kinds, briefly blinds on hit. */
  holy?: boolean;
  /** Multiplies the wand's cast cooldown for this spell — annihilation bomb is a slow, heavy cast. */
  castTimeMultiplier?: number;
}

const SPELLS: Record<ProjectileSpellId, SpellDef> = {
  spark: { speed: 340, damage: 8, digRadius: 2, color: 0xfff2a8, radius: 1.5, lifetime: 90, explodeOnExpiry: false, explodeRadius: 0 },
  saw: { speed: 260, damage: 14, digRadius: 3, color: 0xd7d7d7, radius: 2, lifetime: 60, explodeOnExpiry: false, explodeRadius: 0 },
  bomb: { speed: 180, damage: 0, digRadius: 0, color: 0x8a8a8a, radius: 2.5, lifetime: 55, explodeOnExpiry: true, explodeRadius: 14 },
  lightning: { speed: 900, damage: 16, digRadius: 0, color: 0xd8e8ff, radius: 1.2, lifetime: 14, explodeOnExpiry: false, explodeRadius: 0 },
  acidBall: {
    speed: 220,
    damage: 3,
    digRadius: 0,
    color: 0xa3d640,
    radius: 2,
    lifetime: 70,
    explodeOnExpiry: false,
    explodeRadius: 0,
    onHitMaterial: Material.Acid,
    onHitMaterialRadius: 4,
    onHitMaterialAux: ACID_DEFAULT_LIFE,
  },
  fireball: {
    speed: 240,
    damage: 10,
    digRadius: 1,
    color: 0xff8a3a,
    radius: 2.2,
    lifetime: 70,
    explodeOnExpiry: false,
    explodeRadius: 0,
    onHitMaterial: Material.Fire,
    onHitMaterialRadius: 4,
    onHitMaterialAux: 50,
  },
  iceShard: {
    speed: 300,
    damage: 9,
    digRadius: 1,
    color: 0xbdeeff,
    radius: 1.8,
    lifetime: 65,
    explodeOnExpiry: false,
    explodeRadius: 0,
    freezeRadius: 8,
  },
  chainLightning: {
    speed: 700,
    damage: 10,
    digRadius: 0,
    color: 0xbfe0ff,
    radius: 1.3,
    lifetime: 16,
    explodeOnExpiry: false,
    explodeRadius: 0,
    chainCount: 2,
    chainRange: 60,
  },
  blackHole: {
    speed: 130,
    damage: 6,
    digRadius: 0,
    color: 0x3a1a4a,
    radius: 3,
    lifetime: 45,
    explodeOnExpiry: true,
    explodeRadius: 0,
    isBlackHole: true,
    pullRadius: 55,
  },
  digger: { speed: 260, damage: 0, digRadius: 5, color: 0xb0977a, radius: 2, lifetime: 80, explodeOnExpiry: false, explodeRadius: 0 },
  sporeCloud: {
    speed: 190,
    damage: 2,
    digRadius: 0,
    color: 0x8fd15c,
    radius: 2.5,
    lifetime: 60,
    explodeOnExpiry: true,
    explodeRadius: 18,
    poisonDamagePerTick: 2,
    poisonTicks: 5,
    poisonRadius: 18,
  },
  poisonDart: {
    speed: 320,
    damage: 5,
    digRadius: 0,
    color: 0x6fae3a,
    radius: 1.3,
    lifetime: 100,
    explodeOnExpiry: false,
    explodeRadius: 0,
    poisonDamagePerTick: 3,
    poisonTicks: 6,
  },
  holyLight: { speed: 320, damage: 10, digRadius: 1, color: 0xfff6c8, radius: 2, lifetime: 60, explodeOnExpiry: false, explodeRadius: 0, holy: true },
  bloodSpear: { speed: 380, damage: 0, digRadius: 1, color: 0x9c1f2e, radius: 2, lifetime: 50, explodeOnExpiry: false, explodeRadius: 0 },
  annihilationBomb: {
    speed: 140,
    damage: 0,
    digRadius: 0,
    color: 0x5a5a5a,
    radius: 3.5,
    lifetime: 75,
    explodeOnExpiry: true,
    explodeRadius: 28,
    castTimeMultiplier: 2.4,
  },
};

export function spellCastTimeMultiplier(spellId: ProjectileSpellId): number {
  return SPELLS[spellId].castTimeMultiplier ?? 1;
}

const HOMING_TURN_RATE = 4.2; // radians/sec
const HOMING_RANGE = 90;
const GRAVITY_TRAIL_RADIUS = 26;
const GRAVITY_TRAIL_PULL = 40; // world-px/sec pulled toward the projectile while inside the radius

export interface CastOptions {
  homing?: boolean;
  ignite?: boolean;
  ricochet?: boolean;
  piercing?: boolean;
  split?: boolean;
  gravityTrail?: boolean;
  enlarge?: boolean;
  /** Blood spear: damage computed at cast time from the caster's current HP, overriding the spell table's value. */
  damageOverride?: number;
  /** Enemy-fired projectiles (fireImp, whisperOfDarkness) target the player instead of the enemies array. */
  hostile?: boolean;
}

export class Projectile {
  x: number;
  y: number;
  private vx: number;
  private vy: number;
  private spellId: ProjectileSpellId;
  private spell: SpellDef;
  private damage: number;
  private age = 0;
  private embedded = false;
  private opts: CastOptions;
  private ricochetsLeft = 3;
  dead = false;
  /** Set for exactly one frame when this projectile should spawn child projectiles (the 'split' modifier). main.ts reads and clears it. */
  splitSpawns: Array<{ x: number; y: number; dirX: number; dirY: number }> | null = null;
  readonly sprite: Graphics;

  constructor(x: number, y: number, dirX: number, dirY: number, spellId: ProjectileSpellId, opts: CastOptions = {}) {
    this.x = x;
    this.y = y;
    this.spellId = spellId;
    this.spell = SPELLS[spellId];
    this.opts = opts;

    const sizeMul = opts.enlarge ? 1.5 : 1;
    const speedMul = opts.enlarge ? 0.7 : 1;
    const speed = this.spell.speed * speedMul;
    this.vx = dirX * speed;
    this.vy = dirY * speed;
    this.damage = (opts.damageOverride ?? this.spell.damage) * (opts.enlarge ? 1.5 : 1);

    const visualRadius = this.spell.radius * sizeMul;
    const color = opts.homing ? 0x8ad6ff : this.spell.color;
    this.sprite = new Graphics().circle(0, 0, visualRadius).fill(color);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  update(dt: number, world: World, enemies: Enemy[], player: Player | null = null): void {
    this.age += dt * 60;

    if (this.age > this.spell.lifetime) {
      this.detonate(world, enemies);
      this.dead = true;
      this.sprite.x = this.x;
      this.sprite.y = this.y;
      return;
    }

    if (this.embedded) return;

    if (this.opts.hostile) {
      this.updateHostile(dt, world, player);
      return;
    }

    if (this.opts.homing) this.steerTowardNearest(dt, enemies);
    if (this.opts.gravityTrail) this.pullNearbyEnemies(enemies);

    // Advance in small fixed-size steps and check collision after EACH step,
    // instead of moving the full frame distance then checking once at the
    // endpoint. At this speed a single slow/stuttery frame (common on mobile
    // WebViews) can cover more distance than a thin wall or enemy is wide,
    // so an end-of-frame-only check lets the shot visually tunnel through
    // the first thing it touches and only register a hit much further along.
    const totalDist = Math.hypot(this.vx, this.vy) * dt;
    const maxStep = 1.5;
    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const prevX = this.x;
      const prevY = this.y;
      this.x += this.vx * stepDt;
      this.y += this.vy * stepDt;

      if (!world.inBounds(this.x, this.y)) {
        this.dead = true;
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        return;
      }

      if (isSolidForPlayer(world.get(Math.floor(this.x), Math.floor(this.y)))) {
        if (this.opts.ricochet && this.ricochetsLeft > 0) {
          this.ricochetsLeft--;
          // Figure out which axis actually caused the block, so we only flip that one.
          const blockedX = isSolidForPlayer(world.get(Math.floor(this.x), Math.floor(prevY)));
          const blockedY = isSolidForPlayer(world.get(Math.floor(prevX), Math.floor(this.y)));
          if (blockedX || !blockedY) this.vx = -this.vx;
          if (blockedY || !blockedX) this.vy = -this.vy;
          this.x = prevX;
          this.y = prevY;
          continue;
        }
        this.onImpact(world, enemies, this.x, this.y);
        if (this.spell.explodeOnExpiry) {
          this.embedded = true;
        } else {
          if (this.spell.digRadius > 0) this.dig(world);
          this.dead = true;
        }
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        return;
      }

      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        if (dx * dx + dy * dy <= enemy.hitRadius * enemy.hitRadius) {
          this.hitEnemy(enemy, enemies, world);
          this.onImpact(world, enemies, this.x, this.y);
          if (this.spell.explodeOnExpiry) {
            this.detonate(world, enemies);
            this.dead = true;
          } else if (this.opts.piercing) {
            // Passes through — keeps flying, doesn't consume this step's remaining distance check again.
          } else {
            this.dead = true;
          }
          if (this.dead) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            return;
          }
        }
      }
    }

    this.sprite.x = this.x;
    this.sprite.y = this.y;
  }

  /** Simplified flight path for enemy-fired shots (fireImp, whisperOfDarkness): straight line, targets the player, no modifier support. */
  private updateHostile(dt: number, world: World, player: Player | null): void {
    const totalDist = Math.hypot(this.vx, this.vy) * dt;
    const maxStep = 1.5;
    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.x += this.vx * stepDt;
      this.y += this.vy * stepDt;

      if (!world.inBounds(this.x, this.y) || isSolidForPlayer(world.get(Math.floor(this.x), Math.floor(this.y)))) {
        this.dead = true;
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        return;
      }

      if (player && !player.dead) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        if (dx * dx + dy * dy <= 36) {
          player.takeDamage(this.damage);
          const dist = Math.hypot(dx, dy) || 1;
          player.knockback(-dx / dist, -dy / dist);
          this.dead = true;
          this.sprite.x = this.x;
          this.sprite.y = this.y;
          return;
        }
      }
    }
    this.sprite.x = this.x;
    this.sprite.y = this.y;
  }

  private hitEnemy(enemy: Enemy, enemies: Enemy[], world: World): void {
    const dmg = this.holyAdjustedDamage(enemy);
    enemy.takeDamage(dmg);
    if (this.opts.ignite) enemy.igniteFor(3, 2);
    if (this.spell.poisonDamagePerTick && !this.spell.poisonRadius) {
      enemy.poisonFor(this.spell.poisonTicks ?? 5, this.spell.poisonDamagePerTick);
    }
    if (this.spell.holy) enemy.blindFor(2.5);
    if (this.spell.chainCount) this.chainToNearby(enemy, enemies, this.spell.chainCount, this.spell.chainRange ?? 60, world);
    if (this.opts.split) {
      this.splitSpawns = this.buildSplitSpawns();
    }
  }

  private holyAdjustedDamage(enemy: Enemy): number {
    if (this.spell.holy && DARK_ENEMY_KINDS.includes(enemy.kind)) return this.damage * 2;
    return this.damage;
  }

  private isStandingInWater(entity: { x: number; y: number }, world: World): boolean {
    return world.get(Math.floor(entity.x), Math.floor(entity.y)) === Material.Water;
  }

  /**
   * Chain lightning arcs much farther from a target standing in Water — an
   * actual terrain-aware payoff for Ice Shard's freeze/thaw cycle and the
   * acidSlime/drowned kinds that linger near water, not just "nearest enemy
   * by straight-line distance" regardless of what's underfoot. Previously
   * this was fully terrain-blind, which was flagged (correctly, verified
   * against this exact code) as the one genuinely-missing physics/combat
   * link during the design council pass.
   */
  private chainToNearby(from: Enemy, enemies: Enemy[], hopsLeft: number, range: number, world: World): void {
    if (hopsLeft <= 0) return;
    const effectiveRange = this.isStandingInWater(from, world) ? range * 3 : range;
    let nearest: Enemy | null = null;
    let nearestDist = effectiveRange;
    for (const enemy of enemies) {
      if (enemy.dead || enemy === from) continue;
      const dist = Math.hypot(enemy.x - from.x, enemy.y - from.y);
      if (dist < nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    if (!nearest) return;
    nearest.takeDamage(this.damage);
    this.chainToNearby(nearest, enemies, hopsLeft - 1, range, world);
  }

  private buildSplitSpawns(): Array<{ x: number; y: number; dirX: number; dirY: number }> {
    const baseAngle = Math.atan2(this.vy, this.vx);
    const spreads = [-0.5, 0.5];
    return spreads.map((offset) => {
      const a = baseAngle + offset;
      return { x: this.x, y: this.y, dirX: Math.cos(a), dirY: Math.sin(a) };
    });
  }

  private onImpact(world: World, enemies: Enemy[], x: number, y: number): void {
    if (this.spell.onHitMaterial !== undefined) {
      const r = this.spell.onHitMaterialRadius ?? 3;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (this.spell.onHitMaterial === Material.Fire) {
            const existing = world.get(px, py);
            if (existing === Material.Empty || existing === Material.Wood) {
              world.set(px, py, Material.Fire, this.spell.onHitMaterialAux ?? 45);
            }
          } else if (world.get(px, py) === Material.Empty) {
            world.set(px, py, this.spell.onHitMaterial, this.spell.onHitMaterialAux ?? 0);
          }
        }
      }
    }

    if (this.spell.freezeRadius) {
      const r = this.spell.freezeRadius;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (world.get(px, py) === Material.Water) world.set(px, py, Material.Ice, ICE_DEFAULT_LIFE);
        }
      }
    }

    if (this.spell.poisonRadius) {
      const r = this.spell.poisonRadius;
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        if (dx * dx + dy * dy <= r * r) enemy.poisonFor(this.spell.poisonTicks ?? 5, this.spell.poisonDamagePerTick ?? 2);
      }
    }
  }

  private pullNearbyEnemies(enemies: Enemy[]): void {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = this.x - enemy.x;
      const dy = this.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5 && dist < GRAVITY_TRAIL_RADIUS) {
        const pull = (GRAVITY_TRAIL_PULL / 60) * (1 - dist / GRAVITY_TRAIL_RADIUS);
        enemy.x += (dx / dist) * pull;
        enemy.y += (dy / dist) * pull;
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
    const r = this.spell.digRadius * (this.opts.enlarge ? 1.5 : 1);
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const mat = world.get(cx + dx, cy + dy);
        if (mat === Material.Stone || mat === Material.Wood || mat === Material.Sand) world.set(cx + dx, cy + dy, Material.Empty);
      }
    }
  }

  private detonate(world: World, enemies: Enemy[]): void {
    if (!this.spell.explodeOnExpiry) return;
    const r = this.spell.explodeRadius;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);

    if (this.spell.isBlackHole) {
      const pullR = this.spell.pullRadius ?? 50;
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= pullR && dist > 0.5) {
          enemy.x -= (dx / dist) * Math.min(dist * 0.6, 22);
          enemy.y -= (dy / dist) * Math.min(dist * 0.6, 22);
          enemy.takeDamage(this.damage);
        }
      }
      return;
    }

    if (r > 0) {
      const innerR2 = r * r * 0.55;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r * r) continue;
          const mat = world.get(cx + dx, cy + dy);
          if (mat === Material.Stone || mat === Material.Wood || mat === Material.Sand) {
            // Wood near the crater's EDGE ignites instead of vaporizing —
            // explosions start real fires that spread through wooden
            // structures (beams, ledges), an emergent-chaos payoff for the
            // sim instead of a sterile circular hole.
            if (mat === Material.Wood && d2 > innerR2) {
              world.set(cx + dx, cy + dy, Material.Fire, 70);
            } else {
              world.set(cx + dx, cy + dy, Material.Empty);
            }
          }
        }
      }
    }
    const explosionDamage = this.spellId === 'annihilationBomb' ? 70 : this.spellId === 'sporeCloud' ? 0 : 40;
    if (explosionDamage > 0) {
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        if (dx * dx + dy * dy <= r * r) enemy.takeDamage(explosionDamage);
      }
    }
    if (this.spell.poisonRadius) this.onImpact(world, enemies, this.x, this.y);
  }
}
