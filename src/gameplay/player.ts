import { Sprite } from 'pixi.js';
import { Material } from '../sim/materials';
import type { World } from '../sim/world';
import { playerTexture } from '../render/sprites';

const WALK_FRAME_INTERVAL = 0.18;

const MOVE_ACCEL = 260;
const MAX_MOVE_SPEED = 55;
const FRICTION = 420;
const GRAVITY = 340;
const MAX_FALL_SPEED = 220;
const JUMP_VELOCITY = -125;

export const PLAYER_HALF_WIDTH = 4;
export const PLAYER_HALF_HEIGHT = 7;

const MAX_HP = 100;
const FIRE_DPS = 18;
const INVULN_AFTER_HIT = 0.8;
const KNOCKBACK_SPEED = 90;
const KNOCKBACK_POP = 40;
const KNOCKBACK_DURATION = 0.22;

/** Placeholder box character (real sprite arrives with art in a later stage). */
export class Player {
  x: number;
  y: number;
  hp = MAX_HP;
  maxHp = MAX_HP;
  dead = false;
  private vx = 0;
  private vy = 0;
  private grounded = false;
  private invulnTimer = 0;
  private fireResist = 0;
  private walkTimer = 0;
  private legsApart = false;
  private facing = 1;
  private knockbackTimer = 0;
  private squashTimer = 0;
  /** Set for exactly one frame whenever damage actually lands (not absorbed by invuln). main.ts reads and clears it to drive hit-feedback (shake/flash). */
  justHit = false;
  readonly sprite: Sprite;

  constructor(spawnX: number, spawnY: number) {
    this.x = spawnX;
    this.y = spawnY;
    this.sprite = new Sprite(playerTexture(false));
    this.sprite.anchor.set(0.5, 0.5);
  }

  debugPhysics(): { vx: number; vy: number; grounded: boolean; knockbackTimer: number } {
    return { vx: this.vx, vy: this.vy, grounded: this.grounded, knockbackTimer: this.knockbackTimer };
  }

  /** Applies camp perk levels (GDD §2 perk branch) before a run starts. fireResist: 0..1 damage multiplier reduction. */
  setPerks(bonusMaxHp: number, fireResist: number): void {
    this.maxHp = MAX_HP + bonusMaxHp;
    this.fireResist = Math.max(0, Math.min(0.9, fireResist));
  }

  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.invulnTimer = 0;
    this.knockbackTimer = 0;
  }

  takeDamage(amount: number): void {
    if (this.invulnTimer > 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = INVULN_AFTER_HIT;
    this.justHit = true;
    if (this.hp <= 0) this.dead = true;
  }

  /** Shoves the player away from a hit source so contact damage can't glue them in place. */
  knockback(dirX: number, dirY: number): void {
    this.vx = dirX * KNOCKBACK_SPEED;
    this.vy = dirY * KNOCKBACK_SPEED - KNOCKBACK_POP;
    // Without this, the very next frame's moveX-driven acceleration/clamp
    // (max speed 55 < knockback speed 90) instantly overrides the shove
    // whenever any movement key is held — which is most of the time — so
    // the "escape" never actually happened. This briefly locks out normal
    // movement control so the shove has time to create real separation.
    this.knockbackTimer = KNOCKBACK_DURATION;
  }

  update(dt: number, moveX: number, jumpPressed: boolean, world: World): void {
    if (this.dead) return;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= dt;
    } else if (moveX !== 0) {
      this.vx += moveX * MOVE_ACCEL * dt;
      this.vx = Math.max(-MAX_MOVE_SPEED, Math.min(MAX_MOVE_SPEED, this.vx));
    } else if (this.vx !== 0) {
      const decel = FRICTION * dt;
      this.vx = Math.abs(this.vx) <= decel ? 0 : this.vx - Math.sign(this.vx) * decel;
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
    if (jumpPressed && this.grounded) {
      this.vy = JUMP_VELOCITY;
    }

    const fallSpeedBefore = this.vy;
    this.moveAxis(dt * this.vx, 0, world);
    const landed = this.moveAxis(0, dt * this.vy, world);
    const wasAirborne = !this.grounded;
    this.grounded = landed && this.vy >= 0;
    if (this.grounded) this.vy = 0;
    // Landing squash — only from a real fall, not every grounded frame.
    if (this.grounded && wasAirborne && fallSpeedBefore > 100) this.squashTimer = 0.14;

    if (Math.abs(this.vx) > 2) {
      this.walkTimer += dt;
      if (this.walkTimer >= WALK_FRAME_INTERVAL) {
        this.walkTimer = 0;
        this.legsApart = !this.legsApart;
        this.sprite.texture = playerTexture(this.legsApart);
      }
      this.facing = this.vx > 0 ? 1 : -1;
    } else if (this.legsApart) {
      this.legsApart = false;
      this.sprite.texture = playerTexture(false);
    }
    // Squash-and-stretch on landing: wide+short easing back to normal. Pure
    // scale trickery on the existing sprite — no extra art needed for the
    // character to stop feeling like a sliding cardboard cutout.
    if (this.squashTimer > 0) this.squashTimer = Math.max(0, this.squashTimer - dt);
    const squash = this.squashTimer / 0.14;
    this.sprite.scale.set(this.facing * (1 + squash * 0.25), 1 - squash * 0.25);
    this.sprite.x = this.x;
    this.sprite.y = this.y;

    if (world.get(Math.floor(this.x), Math.floor(this.y)) === Material.Fire) {
      this.hp = Math.max(0, this.hp - FIRE_DPS * (1 - this.fireResist) * dt);
      if (this.hp <= 0) this.dead = true;
    }
  }

  /** Moves one axis at a time and resolves collision against solid cells; returns true if blocked. */
  private moveAxis(dx: number, dy: number, world: World): boolean {
    if (dx === 0 && dy === 0) return false;
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (this.collidesAt(nx, ny, world)) {
      // Step-up assist: a horizontal move blocked only by a low snag (a few
      // px of rubble, a thin ledge edge) walks over it instead of stopping
      // dead. Digging constantly produces this kind of micro-debris, and
      // without the assist the player "sticks" on every 1-3px leftover.
      if (dx !== 0 && dy === 0) {
        for (let lift = 1; lift <= 4; lift++) {
          if (!this.collidesAt(nx, this.y - lift, world)) {
            this.x = nx;
            this.y -= lift;
            return false;
          }
        }
      }
      if (dx !== 0) this.vx = 0;
      if (dy !== 0) this.vy = dy > 0 ? 0 : this.vy;
      return true;
    }
    this.x = nx;
    this.y = ny;
    return false;
  }

  private collidesAt(cx: number, cy: number, world: World): boolean {
    const left = Math.floor(cx - PLAYER_HALF_WIDTH);
    const right = Math.floor(cx + PLAYER_HALF_WIDTH - 1);
    const top = Math.floor(cy - PLAYER_HALF_HEIGHT);
    const bottom = Math.floor(cy + PLAYER_HALF_HEIGHT - 1);
    return (
      world.isSolidForPlayer(left, top) ||
      world.isSolidForPlayer(right, top) ||
      world.isSolidForPlayer(left, bottom) ||
      world.isSolidForPlayer(right, bottom)
    );
  }
}
