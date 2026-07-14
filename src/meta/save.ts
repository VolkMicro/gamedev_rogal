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
  /** How many lore fragments have been read — notes found in the world reveal LORE_FRAGMENTS in order, so the story drips across runs. */
  loreSeen: number;
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
    loreSeen: 0,
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

/** Full 25-spell roster from GDD §4 — 15 projectiles then 10 modifiers, in the order they're offered for unlock. */
export const ALL_SPELLS: SpellId[] = [
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
export const MAX_WAND_SLOTS = WAND_SLOTS;

interface SpellUnlockCost {
  spell: SpellId;
  cost: number;
}

/**
 * Spells not yet unlocked, in the fixed offer order, with their essence
 * cost. GDD §2 specifies 50*1.35^n for a 5-item pool (full completion in
 * ~15-20 runs); with the full 25-item roster that exponent would make the
 * last few unlocks absurd (1.35^24 ≈ 1400x), so the growth rate is gentler
 * here (1.15^n) to land full completion in the same "many runs, not
 * hundreds" ballpark the GDD intended.
 */
export function nextSpellUnlocks(save: SaveState): SpellUnlockCost[] {
  const locked = ALL_SPELLS.filter((s) => !save.unlockedSpells.includes(s));
  return locked.map((spell, i) => ({ spell, cost: Math.round(50 * Math.pow(1.15, save.unlockedSpells.length - 1 + i)) }));
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
