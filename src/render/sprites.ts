import { Assets, Rectangle, Texture } from 'pixi.js';

/**
 * Character art comes from DawnLike (CC-BY 4.0, credit DragonDePlatino/
 * DawnBringer — see public/dawnlike/DAWNLIKE_LICENSE.txt and CREDITS.md),
 * a 16x16 dark-fantasy roguelike tileset with 2-frame animation per
 * creature. Each entry below is a hand-picked (col,row) cell in the
 * relevant sheet; sheets ending in 0/1 are the two animation frames.
 */
const SHEET_PATHS = {
  player0: '/dawnlike/Characters/Player0.png',
  player1: '/dawnlike/Characters/Player1.png',
  rodent0: '/dawnlike/Characters/Rodent0.png',
  rodent1: '/dawnlike/Characters/Rodent1.png',
  pest0: '/dawnlike/Characters/Pest0.png',
  pest1: '/dawnlike/Characters/Pest1.png',
  undead0: '/dawnlike/Characters/Undead0.png',
  undead1: '/dawnlike/Characters/Undead1.png',
  demon0: '/dawnlike/Characters/Demon0.png',
  demon1: '/dawnlike/Characters/Demon1.png',
} as const;
type SheetKey = keyof typeof SHEET_PATHS;

const TILE = 16;

const PLAYER_CELL: [number, number] = [2, 4];
const ENEMY_CELLS: Record<'mole' | 'beetle' | 'collapser' | 'boss', [number, number]> = {
  mole: [2, 2],
  beetle: [0, 10],
  collapser: [1, 8],
  boss: [0, 1],
};
const ENEMY_SHEET_PREFIX: Record<'mole' | 'beetle' | 'collapser' | 'boss', 'rodent' | 'pest' | 'undead' | 'demon'> = {
  mole: 'rodent',
  beetle: 'pest',
  collapser: 'undead',
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

export type EnemySpriteKind = 'mole' | 'beetle' | 'collapser' | 'boss';

export function enemyTexture(kind: EnemySpriteKind, frame: 0 | 1 = 0): Texture {
  const [col, row] = ENEMY_CELLS[kind];
  const sheetKey = `${ENEMY_SHEET_PREFIX[kind]}${frame}` as SheetKey;
  return crop(sheetKey, col, row);
}
