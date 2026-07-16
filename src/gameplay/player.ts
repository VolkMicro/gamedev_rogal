import { Sprite } from 'pixi.js';
import { Material } from '../sim/materials';
import type { World } from '../sim/world';
import { playerAnimTexture, PLAYER_ANIM_FRAMES, type PlayerAnim } from '../render/sprites';

/** Rogue sheet frames are 32px; the character reads right at ~16px world size next to the 8x14 hitbox. */
const PLAYER_SPRITE_SCALE = 0.5;
const IDLE_FPS = 8;
const WALK_FPS = 14;
const DEATH_FPS = 11;
const ATTACK_FLASH = 0.12;

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
  private facing = 1;
  private knockbackTimer = 0;
  private squashTimer = 0;
  private recoilTimer = 0;
  private recoilDir = 1;
  private attackFlashTimer = 0;
  private anim: PlayerAnim = 'idle';
  private animFrame = 0;
  private animTimer = 0;
  /** Set for exactly one frame whenever damage actually lands (not absorbed by invuln). main.ts reads and clears it to drive hit-feedback (shake/flash). */
  justHit = false;
  readonly sprite: Sprite;

  constructor(spawnX: number, spawnY: number) {
    this.x = spawnX;
    this.y = spawnY;
    this.sprite = new Sprite(playerAnimTexture('idle', 0));
    // Feet-anchored: the rogue's soles sit at row ~30 of the 32px cell, so
    // anchoring there and positioning at hitbox-bottom keeps the feet ON
    // the ground instead of hovering half a body above it.
    this.sprite.anchor.set(0.5, 30 / 32);
  }

  debugPhysics(): { vx: number; vy: number; grounded: boolean; knockbackTimer: number; facing: number } {
    return { vx: this.vx, vy: this.vy, grounded: this.grounded, knockbackTimer: this.knockbackTimer, facing: this.facing };
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
    this.setAnim('idle');
  }

  takeDamage(amount: number): void {
    if (this.invulnTimer > 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = INVULN_AFTER_HIT;
    this.justHit = true;
    if (this.hp <= 0) this.dead = true;
  }

  /** Brief visual kickback + attack-frame flash opposite the cast direction — called by main.ts on every successful cast. */
  castKick(dirX: number): void {
    this.recoilTimer = 0.08;
    this.recoilDir = dirX >= 0 ? 1 : -1;
    this.attackFlashTimer = ATTACK_FLASH;
  }

  /** Switches the animation row, resetting frame progress only on a real change so cycles don't stutter. */
  private setAnim(anim: PlayerAnim): void {
    if (this.anim === anim) return;
    this.anim = anim;
    this.animFrame = 0;
    this.animTimer = 0;
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

  update(dt: number, moveX: number, jumpPressed: boolean, world: World, aimX: number | null = null): void {
    if (this.dead) {
      // Death is animated, not a freeze-frame: the rogue visibly crumples
      // during main.ts's slow-motion ending beat (holds the final heap frame).
      this.setAnim('death');
      this.animTimer += dt;
      if (this.animTimer >= 1 / DEATH_FPS && this.animFrame < PLAYER_ANIM_FRAMES - 1) {
        this.animTimer = 0;
        this.animFrame++;
      }
      this.sprite.texture = playerAnimTexture('death', this.animFrame);
      this.sprite.scale.set(this.facing * PLAYER_SPRITE_SCALE, PLAYER_SPRITE_SCALE);
      this.sprite.x = this.x;
      this.sprite.y = this.y + PLAYER_HALF_HEIGHT;
      return;
    }
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    // Swimming: submerged movement is floaty — weak gravity, hard sink-speed
    // cap, and the jump input becomes a swim stroke usable ANY time (not
    // just grounded), so water is traversable up as well as down. The
    // Flooded Caverns biome is built around this.
    const inWater = world.get(Math.floor(this.x), Math.floor(this.y)) === Material.Water;

    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= dt;
    } else if (moveX !== 0) {
      this.vx += moveX * MOVE_ACCEL * (inWater ? 0.7 : 1) * dt;
      const cap = inWater ? MAX_MOVE_SPEED * 0.75 : MAX_MOVE_SPEED;
      this.vx = Math.max(-cap, Math.min(cap, this.vx));
    } else if (this.vx !== 0) {
      const decel = FRICTION * dt;
      this.vx = Math.abs(this.vx) <= decel ? 0 : this.vx - Math.sign(this.vx) * decel;
    }

    if (inWater) {
      this.vy = Math.min(this.vy + GRAVITY * 0.3 * dt, MAX_FALL_SPEED * 0.22);
      if (jumpPressed) this.vy = JUMP_VELOCITY * 0.55;
    } else {
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
      if (jumpPressed && this.grounded) {
        this.vy = JUMP_VELOCITY;
      }
    }

    const fallSpeedBefore = this.vy;
    this.moveAxis(dt * this.vx, 0, world);
    const landed = this.moveAxis(0, dt * this.vy, world);
    const wasAirborne = !this.grounded;
    this.grounded = landed && this.vy >= 0;
    if (this.grounded) this.vy = 0;
    // Landing squash — only from a real fall, not every grounded frame.
    if (this.grounded && wasAirborne && fallSpeedBefore > 100) this.squashTimer = 0.14;

    // Facing: aim direction wins while shooting (twin-stick standard — you
    // can strafe backwards), then the HELD movement input. Never derived
    // from velocity: knockback shoves set vx away from the enemy, and
    // velocity-based facing visibly spun the sprite "жопой вперёд" (walking
    // butt-first) after every hit and on slope slides.
    if (aimX !== null && Math.abs(aimX) > 0.15) {
      this.facing = aimX > 0 ? 1 : -1;
    } else if (moveX !== 0 && this.knockbackTimer <= 0) {
      this.facing = moveX > 0 ? 1 : -1;
    }

    // Animation state machine on the rogue sheet's real frame rows — walk
    // cycle only under actual player input (a knockback slide with pumping
    // legs read as broken); attack flash overrides briefly on each cast;
    // airborne freezes a mid-stride walk frame as the jump pose.
    const walking = this.grounded && moveX !== 0 && this.knockbackTimer <= 0;
    if (this.attackFlashTimer > 0) {
      this.attackFlashTimer = Math.max(0, this.attackFlashTimer - dt);
      this.setAnim('attack');
      this.animFrame = 4;
    } else if (!this.grounded) {
      this.setAnim('walk');
      this.animFrame = 3;
    } else if (walking) {
      this.setAnim('walk');
      this.animTimer += dt;
      if (this.animTimer >= 1 / WALK_FPS) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % PLAYER_ANIM_FRAMES;
      }
    } else {
      this.setAnim('idle');
      this.animTimer += dt;
      if (this.animTimer >= 1 / IDLE_FPS) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % PLAYER_ANIM_FRAMES;
      }
    }
    this.sprite.texture = playerAnimTexture(this.anim, this.animFrame);

    // Pose layer on top of the frame animation: landing squash, airborne
    // stretch (rising) / lean (falling), and a cast-recoil kick.
    if (this.squashTimer > 0) this.squashTimer = Math.max(0, this.squashTimer - dt);
    if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt);
    const squash = this.squashTimer / 0.14;
    let sx = 1 + squash * 0.25;
    let sy = 1 - squash * 0.25;
    if (!this.grounded) {
      if (this.vy < -20) {
        sy *= 1.1;
        sx *= 0.92;
      } else if (this.vy > 80) {
        sy *= 1.05;
        sx *= 0.95;
      }
    }
    this.sprite.scale.set(this.facing * sx * PLAYER_SPRITE_SCALE, sy * PLAYER_SPRITE_SCALE);
    this.sprite.x = this.x + (this.recoilTimer > 0 ? -this.recoilDir * 1.5 : 0);
    // Feet-anchored sprite sits at the hitbox's bottom edge.
    this.sprite.y = this.y + PLAYER_HALF_HEIGHT;

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
