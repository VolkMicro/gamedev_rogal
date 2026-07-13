import { Graphics } from 'pixi.js';
import type { World } from '../sim/world';

const MOVE_ACCEL = 260;
const MAX_MOVE_SPEED = 55;
const FRICTION = 420;
const GRAVITY = 340;
const MAX_FALL_SPEED = 220;
const JUMP_VELOCITY = -125;

const HALF_WIDTH = 4;
const HALF_HEIGHT = 7;

/** Placeholder box character (real sprite arrives with art in a later stage). */
export class Player {
  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  private grounded = false;
  readonly sprite: Graphics;

  constructor(spawnX: number, spawnY: number) {
    this.x = spawnX;
    this.y = spawnY;
    this.sprite = new Graphics()
      .rect(-HALF_WIDTH, -HALF_HEIGHT, HALF_WIDTH * 2, HALF_HEIGHT * 2)
      .fill(0xe8d9b0);
  }

  update(dt: number, moveX: number, jumpPressed: boolean, world: World): void {
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

    this.sprite.x = this.x;
    this.sprite.y = this.y;
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
    const left = Math.floor(cx - HALF_WIDTH);
    const right = Math.floor(cx + HALF_WIDTH - 1);
    const top = Math.floor(cy - HALF_HEIGHT);
    const bottom = Math.floor(cy + HALF_HEIGHT - 1);
    return (
      world.isSolidForPlayer(left, top) ||
      world.isSolidForPlayer(right, top) ||
      world.isSolidForPlayer(left, bottom) ||
      world.isSolidForPlayer(right, bottom)
    );
  }
}
