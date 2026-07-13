import type { SpellId } from './projectile';

const CAST_COOLDOWN = 0.35;

/**
 * Minimal stand-in for the Noita-style wand: a fixed slot sequence cast
 * round-robin. Full crafting (modifiers, player-assembled slots) is stage 3.
 */
export class Wand {
  private slots: SpellId[];
  private nextSlot = 0;
  private cooldown = 0;

  constructor(slots: SpellId[] = ['spark', 'spark', 'saw', 'bomb']) {
    this.slots = slots;
  }

  get currentSpell(): SpellId {
    return this.slots[this.nextSlot];
  }

  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  tryCast(): SpellId | null {
    if (this.cooldown > 0) return null;
    const spell = this.slots[this.nextSlot];
    this.nextSlot = (this.nextSlot + 1) % this.slots.length;
    this.cooldown = CAST_COOLDOWN;
    return spell;
  }
}
