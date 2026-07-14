import { Assets, Rectangle, Texture } from 'pixi.js';

/**
 * Character art comes from DawnLike (CC-BY 4.0, credit DragonDePlatino/
 * DawnBringer — see public/dawnlike/DAWNLIKE_LICENSE.txt and CREDITS.md),
 * a 16x16 dark-fantasy roguelike tileset with 2-frame animation per
 * creature. Each entry below is a hand-picked (col,row) cell in the
 * relevant sheet — chosen by rendering a coordinate-labeled grid overlay
 * over each sheet and visually inspecting it, not guessed — sheets ending
 * in 0/1 are the two animation frames.
 */
// import.meta.env.BASE_URL matches Vite's `base` config ('/' in dev, '/gamedev_rogal/' in
// the GitHub Pages build) — plain '/dawnlike/...' strings aren't rewritten by Vite the way
// HTML/CSS asset references are, so this has to be applied by hand or the built site 404s.
const BASE = import.meta.env.BASE_URL;
const SHEET_PATHS = {
  player0: `${BASE}dawnlike/Characters/Player0.png`,
  player1: `${BASE}dawnlike/Characters/Player1.png`,
  rodent0: `${BASE}dawnlike/Characters/Rodent0.png`,
  rodent1: `${BASE}dawnlike/Characters/Rodent1.png`,
  pest0: `${BASE}dawnlike/Characters/Pest0.png`,
  pest1: `${BASE}dawnlike/Characters/Pest1.png`,
  undead0: `${BASE}dawnlike/Characters/Undead0.png`,
  undead1: `${BASE}dawnlike/Characters/Undead1.png`,
  demon0: `${BASE}dawnlike/Characters/Demon0.png`,
  demon1: `${BASE}dawnlike/Characters/Demon1.png`,
  aquatic0: `${BASE}dawnlike/Characters/Aquatic0.png`,
  aquatic1: `${BASE}dawnlike/Characters/Aquatic1.png`,
  slime0: `${BASE}dawnlike/Characters/Slime0.png`,
  slime1: `${BASE}dawnlike/Characters/Slime1.png`,
  dog0: `${BASE}dawnlike/Characters/Dog0.png`,
  dog1: `${BASE}dawnlike/Characters/Dog1.png`,
  elemental0: `${BASE}dawnlike/Characters/Elemental0.png`,
  elemental1: `${BASE}dawnlike/Characters/Elemental1.png`,
} as const;
type SheetKey = keyof typeof SHEET_PATHS;

const TILE = 16;

export type EnemySpriteKind =
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
  | 'essenceKeeper'
  | 'boss';

const PLAYER_CELL: [number, number] = [2, 4];
const ENEMY_CELLS: Record<EnemySpriteKind, [number, number]> = {
  mole: [2, 2],
  beetle: [0, 10],
  collapser: [1, 8],
  leech: [2, 2],
  acidSlime: [0, 4],
  drowned: [4, 2],
  fireImp: [2, 5],
  sulfurTick: [4, 3],
  heatedGuardian: [0, 1],
  whisperOfDarkness: [3, 4],
  ashHound: [0, 4],
  essenceKeeper: [7, 1],
  boss: [0, 1],
};
const ENEMY_SHEET_PREFIX: Record<EnemySpriteKind, 'rodent' | 'pest' | 'undead' | 'demon' | 'aquatic' | 'slime' | 'dog' | 'elemental'> = {
  mole: 'rodent',
  beetle: 'pest',
  collapser: 'undead',
  leech: 'aquatic',
  acidSlime: 'slime',
  drowned: 'undead',
  fireImp: 'elemental',
  sulfurTick: 'pest',
  heatedGuardian: 'elemental',
  whisperOfDarkness: 'undead',
  ashHound: 'dog',
  essenceKeeper: 'demon',
  boss: 'demon',
};

let sheets: Record<SheetKey, Texture> | null = null;
const cropCache = new Map<string, Texture>();

export async function loadSprites(): Promise<void> {
  const loaded = await Promise.all(
    (Object.entries(SHEET_PATHS) as [SheetKey, string][]).map(async ([key, path]) => {
      const tex = await Assets.load<Texture>(path);
      tex.source.scaleMode = 'nearest';
      return [key, tex] as const;
    }),
  );
  sheets = Object.fromEntries(loaded) as Record<SheetKey, Texture>;
}

function crop(sheetKey: SheetKey, col: number, row: number): Texture {
  if (!sheets) throw new Error('loadSprites() must resolve before requesting sprite textures');
  const key = `${sheetKey}:${col},${row}`;
  let tex = cropCache.get(key);
  if (!tex) {
    const sheet = sheets[sheetKey];
    tex = new Texture({ source: sheet.source, frame: new Rectangle(col * TILE, row * TILE, TILE, TILE) });
    cropCache.set(key, tex);
  }
  return tex;
}

export function playerTexture(walkFrame: boolean): Texture {
  const [col, row] = PLAYER_CELL;
  return crop(walkFrame ? 'player1' : 'player0', col, row);
}

export function enemyTexture(kind: EnemySpriteKind, frame: 0 | 1 = 0): Texture {
  const [col, row] = ENEMY_CELLS[kind];
  const sheetKey = `${ENEMY_SHEET_PREFIX[kind]}${frame}` as SheetKey;
  return crop(sheetKey, col, row);
}
