import type { SpellId } from '../gameplay/projectile';

const STORAGE_KEY = 'wick.save.v1';
const WAND_SLOTS = 4;

export interface SaveState {
  essenceBanked: number;
  unlockedSpells: SpellId[];
  unlockedWandSlots: number;
  perkLevels: Record<string, number>;
  /** Currently-equipped wand loadout, indices into unlockedSpells (or the spell id directly). */
  wandLoadout: SpellId[];
  runsCompleted: number;
  deaths: number;
}

function defaultSave(): SaveState {
  return {
    essenceBanked: 0,
    unlockedSpells: ['spark'],
    unlockedWandSlots: 2,
    perkLevels: {},
    wandLoadout: ['spark', 'spark'],
    runsCompleted: 0,
    deaths: 0,
  };
}

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function persistSave(save: SaveState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private mode, quota) — the run still works, just won't persist.
  }
}

export const ALL_SPELLS: SpellId[] = ['spark', 'saw', 'bomb', 'triple', 'homing'];
export const MAX_WAND_SLOTS = WAND_SLOTS;

interface SpellUnlockCost {
  spell: SpellId;
  cost: number;
}

/** Spells not yet unlocked, in the fixed offer order, with their essence cost (50 * 1.35^n per GDD §2). */
export function nextSpellUnlocks(save: SaveState): SpellUnlockCost[] {
  const locked = ALL_SPELLS.filter((s) => !save.unlockedSpells.includes(s));
  return locked.map((spell, i) => ({ spell, cost: Math.round(50 * Math.pow(1.35, save.unlockedSpells.length - 1 + i)) }));
}

export function nextWandSlotCost(save: SaveState): number | null {
  if (save.unlockedWandSlots >= MAX_WAND_SLOTS) return null;
  return Math.round(50 * Math.pow(1.35, save.unlockedWandSlots - 1));
}

export const PERKS = {
  maxHp: { label: '+10 макс. HP', maxLevel: 5 },
  fireResist: { label: '+сопротивление огню', maxLevel: 3 },
} as const;
export type PerkId = keyof typeof PERKS;

export function nextPerkCost(save: SaveState, perk: PerkId): number | null {
  const level = save.perkLevels[perk] ?? 0;
  if (level >= PERKS[perk].maxLevel) return null;
  return 80 * (level + 1);
}
