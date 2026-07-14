import { isModifierSpell, spellCastTimeMultiplier, type ModifierSpellId, type ProjectileSpellId, type SpellId } from './projectile';

const BASE_CAST_COOLDOWN = 0.35;
const CAST_SPEED_MULTIPLIER = 0.7; // -30% cooldown per GDD's "Ускорение каста"

export interface CastResult {
  spell: ProjectileSpellId;
  modifiers: ModifierSpellId[];
}

/**
 * Noita-style wand: slots execute left-to-right, wrapping. Modifier spells
 * don't fire on their own — they attach to the next projectile spell found
 * in the sequence. Full crafting UI (drag slots around) is a later stage;
 * for now the loadout is fixed at cast-time via the camp hub (see
 * meta/save.ts wandLoadout).
 */
export class Wand {
  private slots: SpellId[];
  private nextSlot = 0;
  private cooldown = 0;

  constructor(slots: SpellId[]) {
    this.slots = slots.length > 0 ? slots : ['spark'];
  }

  setSlots(slots: SpellId[]): void {
    this.slots = slots.length > 0 ? slots : ['spark'];
    this.nextSlot = 0;
  }

  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  tryCast(): CastResult | null {
    if (this.cooldown > 0) return null;

    const modifiers: ModifierSpellId[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      const idx = (this.nextSlot + i) % this.slots.length;
      const spell = this.slots[idx];
      if (isModifierSpell(spell)) {
        modifiers.push(spell);
        continue;
      }
      this.nextSlot = (idx + 1) % this.slots.length;
      let cooldown = BASE_CAST_COOLDOWN * spellCastTimeMultiplier(spell);
      if (modifiers.includes('castSpeed')) cooldown *= CAST_SPEED_MULTIPLIER;
      this.cooldown = cooldown;
      return { spell, modifiers };
    }
    // Wand is all modifiers with nothing to attach to — nothing happens.
    return null;
  }
}
