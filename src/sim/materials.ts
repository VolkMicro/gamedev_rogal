export const Material = {
  Empty: 0,
  Stone: 1,
  Wood: 2,
  Sand: 3,
  Water: 4,
  Fire: 5,
} as const;
export type Material = (typeof Material)[keyof typeof Material];

export const MaterialState = {
  Static: 'static',
  Powder: 'powder',
  Liquid: 'liquid',
  Fire: 'fire',
} as const;
export type MaterialState = (typeof MaterialState)[keyof typeof MaterialState];

interface MaterialDef {
  id: Material;
  name: string;
  state: MaterialState;
  color: [number, number, number];
  /** Higher sinks through lower. Only meaningful for powder/liquid. */
  density: number;
  flammable: boolean;
  /** Ticks a fresh Fire cell of this origin should burn for (only used when igniting). */
  burnTime?: number;
  /** Blocks player movement. */
  solidForPlayer: boolean;
}

export const MATERIALS: Record<Material, MaterialDef> = {
  [Material.Empty]: {
    id: Material.Empty,
    name: 'empty',
    state: MaterialState.Static,
    color: [0, 0, 0],
    density: 0,
    flammable: false,
    solidForPlayer: false,
  },
  [Material.Stone]: {
    id: Material.Stone,
    name: 'stone',
    state: MaterialState.Static,
    color: [90, 88, 92],
    density: 100,
    flammable: false,
    solidForPlayer: true,
  },
  [Material.Wood]: {
    id: Material.Wood,
    name: 'wood',
    state: MaterialState.Static,
    color: [110, 74, 44],
    density: 90,
    flammable: true,
    burnTime: 70,
    solidForPlayer: true,
  },
  [Material.Sand]: {
    id: Material.Sand,
    name: 'sand',
    state: MaterialState.Powder,
    color: [214, 186, 121],
    density: 3,
    flammable: false,
    solidForPlayer: true,
  },
  [Material.Water]: {
    id: Material.Water,
    name: 'water',
    state: MaterialState.Liquid,
    color: [64, 110, 196],
    density: 2,
    flammable: false,
    solidForPlayer: false,
  },
  [Material.Fire]: {
    id: Material.Fire,
    name: 'fire',
    state: MaterialState.Fire,
    color: [237, 132, 44],
    density: 1,
    flammable: false,
    burnTime: 45,
    solidForPlayer: false,
  },
};

/** Flat RGBA lookup table indexed by material id * 4, for fast pixel writes. */
export const MATERIAL_COLOR_RGBA = new Uint8Array(Object.keys(MATERIALS).length * 4);
for (const key of Object.keys(MATERIALS)) {
  const mat = MATERIALS[Number(key) as Material];
  const o = mat.id * 4;
  MATERIAL_COLOR_RGBA[o] = mat.color[0];
  MATERIAL_COLOR_RGBA[o + 1] = mat.color[1];
  MATERIAL_COLOR_RGBA[o + 2] = mat.color[2];
  MATERIAL_COLOR_RGBA[o + 3] = mat.id === Material.Empty ? 0 : 255;
}

export function isSolidForPlayer(mat: Material): boolean {
  return MATERIALS[mat].solidForPlayer;
}
