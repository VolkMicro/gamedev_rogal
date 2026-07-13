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
const INVULN_AFTER_HIT = 0.6;

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
  readonly sprite: Sprite;

  constructor(spawnX: number, spawnY: number) {
    this.x = spawnX;
    this.y = spawnY;
    this.sprite = new Sprite(playerTexture(false));
    this.sprite.anchor.set(0.5, 0.5);
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
  }

  takeDamage(amount: number): void {
    if (this.invulnTimer > 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = INVULN_AFTER_HIT;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt: number, moveX: number, jumpPressed: boolean, world: World): void {
    if (this.dead) return;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    if (moveX !== 0) {
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

    this.moveAxis(dt * this.vx, 0, world);
    const landed = this.moveAxis(0, dt * this.vy, world);
    this.grounded = landed && this.vy >= 0;
    if (this.grounded) this.vy = 0;

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
    this.sprite.scale.x = this.facing;
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
