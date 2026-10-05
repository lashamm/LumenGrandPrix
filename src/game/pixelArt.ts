import Phaser from 'phaser';
import type { CarDefinition } from './car/carData';

/**
 * Procedural pixel-art factory.
 *
 * Everything is drawn at runtime into Phaser textures, so the prototype ships
 * with zero binary assets and the art stays editable as data. Keep the pixel
 * grids small and blocky — that is the whole style.
 */

type PaletteKey = '.' | 'o' | 'b' | 'g' | 'h' | 'w';

const CAR_SPRITE: ReadonlyArray<string> = [
  '................................',
  '................................',
  '...........ooooooo..............',
  '..........obbbbbbbo.............',
  '.........obbbgggggbbo...........',
  '........obbbbbggggbbbbo..........',
  '.......obbbbbbggggbbbbbo.........',
  '......obbbbbbbbhhbbbbbbbo........',
  '.....obbbbbbbbbhhbbbbbbbbo.......',
  '....obbbbbbbbbbhhbbbbbbbbbo......',
  '...obbbbbbbbbbbbbbbbbbbbbbbo.....',
  '..obbbbbbbbbbbbbbbbbbbbbbbbbo....',
  '..oooooooooooooooooooooooooooo....',
  '..o..........................o....',
  '..o..........................o....',
  '................................',
];

const WHEEL_SPRITE: ReadonlyArray<string> = ['.ooo.', 'owwwo', 'owowo', 'owowo', 'owwwo', '.ooo.'];

const LIGHT_TREE_SPRITE: ReadonlyArray<string> = [
  '..o..',
  '.obo.',
  '.obo.',
  'ooooo',
  '.obo.',
  '.obo.',
  'ooooo',
  '.obo.',
  '.obo.',
  'ooooo',
  '.obo.',
  '.obo.',
  'ooooo',
];

interface Palette {
  o: number;
  b: number;
  g: number;
  h: number;
  w: number;
}

function toHex(color: number): string {
  return color.toString(16).padStart(6, '0');
}

function buildTexture(scene: Phaser.Scene, key: string, rows: ReadonlyArray<string>, palette: Palette): void {
  if (scene.textures.exists(key)) return;
  const width = rows[0].length;
  const height = rows.length;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const symbol = row[x] as PaletteKey;
      if (symbol === '.') continue;
      const color = palette[symbol];
      if (color === undefined) continue;
      ctx.fillStyle = `#${toHex(color)}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.refresh();
}

export function generateCarTexture(scene: Phaser.Scene, key: string, car: CarDefinition): void {
  buildTexture(scene, key, CAR_SPRITE, {
    o: 0x0b0d14,
    b: car.bodyColor,
    g: 0x1b2740,
    h: car.accentColor,
    w: 0x2a2f3d,
  });
}

export function generateWheelTexture(scene: Phaser.Scene, key: string): void {
  buildTexture(scene, key, WHEEL_SPRITE, { o: 0x05070c, b: 0x000000, g: 0x000000, h: 0x000000, w: 0x39404f });
}

export function generateLightTreeTexture(scene: Phaser.Scene): void {
  buildTexture(scene, 'light-tree', LIGHT_TREE_SPRITE, {
    o: 0x1a1f2e,
    b: 0x000000,
    g: 0x000000,
    h: 0x000000,
    w: 0x000000,
  });
}

export function generateBulbTexture(scene: Phaser.Scene, key: string, color: number): void {
  buildTexture(scene, key, ['.ooo.', 'obbbo', 'obhbo', 'obbbo', '.ooo.'], {
    o: 0x0b0d14,
    b: color,
    g: color,
    h: 0xffffff,
    w: color,
  });
}

/** Ground / horizon / strip colours. */
export const SCENERY = {
  skyTop: 0x0a0d18,
  skyBottom: 0x1b2136,
  farHills: 0x171c2c,
  treeline: 0x101627,
  barrier: 0x2b3350,
  barrierStripe: 0x4a5578,
  asphalt: 0x14161f,
  playerLane: 0x12141c,
  aiLane: 0x161a26,
  centreLine: 0x3a4260,
  finishGlow: 0x37e0c8,
  aiAccent: 0xff7a5c,
} as const;