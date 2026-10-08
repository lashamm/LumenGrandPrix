import type { CarDefinition } from './carData';
import type { BodyType, CarColors, CosmeticOptions } from '../types';

/**
 * Procedural pixel-art car renderer — no Phaser, no DOM.
 *
 * This module is the single place a car is turned into pixels. Both consumers
 * call it: the Phaser scene paints the rows into a texture, and the garage
 * paints the same rows into a canvas. That is why the preview and the race car
 * can never disagree — there is literally one implementation.
 */

// ------------------------------------------------------------- geometry ----

/** Sprite size in grid cells. The scene draws it at `CAR_SCALE`. */
export const CAR_SPRITE = { width: 44, height: 20 } as const;
export const CAR_SCALE = 2;
/** Wheel centres in grid cells, relative to the sprite's top-left corner. */
export const CAR_WHEELS = { rearX: 12, frontX: 32, y: 16 } as const;
/** Wheel sprite is 7x7, so its top-left corner sits at the centre minus 3. */
const WHEEL_SIZE = 7;
const WHEEL_HALF = 3;

/** 7x7 wheels: outline ring, tyre, then a per-style rim pattern. */
export const WHEEL_SPRITES: Record<1 | 2 | 3, ReadonlyArray<string>> = {
  // Steelies: solid dish with a small hub.
  1: ['.ooooo.', 'ottttto', 'otrrrto', 'otrhrto', 'otrrrto', 'ottttto', '.ooooo.'],
  // 5-spoke: open slots above and below the hub.
  2: ['.ooooo.', 'ottttto', 'otdddto', 'otrhrto', 'otdddto', 'ottttto', '.ooooo.'],
  // Mesh: cross pattern.
  3: ['.ooooo.', 'ottttto', 'otdtdto', 'odrhrdo', 'otdtdto', 'ottttto', '.ooooo.'],
};

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

// ------------------------------------------------------------- silhouettes --

type Fill = 'b' | 's';
type Span = readonly [y: number, x0: number, x1: number, fill: Fill];

interface BodySpec {
  /** Horizontal spans of the shell, drawn top to bottom. */
  rows: readonly Span[];
  /** Window aperture: rows y0..y1, columns x0..x1. */
  glass: readonly [y0: number, y1: number, x0: number, x1: number];
  /** B-pillar column drawn back over the glass. */
  pillarX: number;
  /** Column of the roof highlight, or null for a car without one. */
  roofX: readonly [number, number] | null;
}

/**
 * Three genuinely different two-box/three-box shapes.
 *
 * The differences are structural, not cosmetic: coupe is a low fastback with a
 * short deck, sedan is a tall three-box with a separate boot, hatchback cuts
 * away behind the rear axle.
 */
const BODIES: Record<BodyType, BodySpec> = {
  coupe: {
    rows: [
      [3, 13, 26, 'b'],
      [4, 12, 27, 'b'],
      [5, 12, 27, 'b'],
      [6, 12, 27, 'b'],
      [7, 12, 27, 'b'],
      [8, 4, 41, 'b'],
      [9, 3, 42, 'b'],
      [10, 2, 42, 'b'],
      [11, 2, 42, 'b'],
      [12, 2, 42, 'b'],
      [13, 2, 42, 'b'],
      [14, 2, 42, 's'],
      [15, 3, 41, 's'],
    ],
    glass: [4, 6, 13, 26],
    pillarX: 20,
    roofX: [14, 25],
  },
  sedan: {
    rows: [
      [3, 11, 28, 'b'],
      [4, 10, 29, 'b'],
      [5, 10, 29, 'b'],
      [6, 10, 29, 'b'],
      [7, 10, 29, 'b'],
      [8, 10, 29, 'b'],
      [9, 10, 29, 'b'],
      [10, 3, 31, 'b'],
      [11, 3, 42, 'b'],
      [12, 2, 42, 'b'],
      [13, 2, 42, 'b'],
      [14, 2, 42, 's'],
      [15, 3, 41, 's'],
    ],
    glass: [4, 8, 11, 28],
    pillarX: 19,
    roofX: [12, 27],
  },
  hatchback: {
    rows: [
      [3, 8, 26, 'b'],
      [4, 7, 27, 'b'],
      [5, 6, 27, 'b'],
      [6, 6, 27, 'b'],
      [7, 6, 27, 'b'],
      [8, 6, 27, 'b'],
      [9, 5, 27, 'b'],
      [10, 3, 41, 'b'],
      [11, 2, 42, 'b'],
      [12, 2, 42, 'b'],
      [13, 2, 42, 'b'],
      [14, 2, 42, 's'],
      [15, 3, 41, 's'],
    ],
    glass: [4, 8, 7, 26],
    pillarX: 17,
    roofX: [9, 25],
  },
};

/** Leftmost column of the shell — where exhausts and bumpers attach. */
const REAR_X = 2;
/** Column whose top surface is the rear deck (outside every cabin). */
const DECK_X = 4;
/** Column used to find the hood's top surface. */
const HOOD_X = 36;

const OUTLINE = 'o';
const DARK = 'd';
const ACCENT = 'a';
const LIGHT = 'H';
const TAIL = 'T';
const WHITE = 'W';
const ROOF = 'l';

class Silhouette {
  private readonly grid: string[][];

  constructor() {
    this.grid = Array.from({ length: CAR_SPRITE.height }, () =>
      Array.from<string>({ length: CAR_SPRITE.width }).fill('.'),
    );
  }

  private at(y: number, x: number): string | undefined {
    if (y < 0 || y >= CAR_SPRITE.height || x < 0 || x >= CAR_SPRITE.width) return undefined;
    return this.grid[y][x];
  }

  private set(y: number, x: number, fill: string): void {
    if (y < 0 || y >= CAR_SPRITE.height || x < 0 || x >= CAR_SPRITE.width) return;
    this.grid[y][x] = fill;
  }

  span(y: number, x0: number, x1: number, fill: string): void {
    for (let x = x0; x <= x1; x += 1) this.set(y, x, fill);
  }

  /** Paints only where the shell already exists, so overlays never spill. */
  inset(y: number, x0: number, x1: number, fill: string): void {
    for (let x = x0; x <= x1; x += 1) if (this.at(y, x) !== '.' && this.at(y, x) !== OUTLINE) this.set(y, x, fill);
  }

  rect(y0: number, y1: number, x0: number, x1: number, fill: string, inset = true): void {
    for (let y = y0; y <= y1; y += 1) {
      if (inset) this.inset(y, x0, x1, fill);
      else this.span(y, x0, x1, fill);
    }
  }

  /** Topmost filled row for a column, or the bottom of the sprite if empty. */
  topAt(x: number): number {
    for (let y = 0; y < CAR_SPRITE.height; y += 1) {
      if (this.at(y, x) !== '.') return y;
    }
    return CAR_SPRITE.height - 1;
  }

  /** 8-connected outline drawn behind the shell. */
  outlinePass(): void {
    const marks: Array<[number, number]> = [];
    for (let y = 0; y < CAR_SPRITE.height; y += 1) {
      for (let x = 0; x < CAR_SPRITE.width; x += 1) {
        if (this.at(y, x) !== '.') continue;
        let touchesShell = false;
        for (let dy = -1; dy <= 1 && !touchesShell; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const neighbour = this.at(y + dy, x + dx);
            if (neighbour !== undefined && neighbour !== '.' && neighbour !== OUTLINE) {
              touchesShell = true;
              break;
            }
          }
        }
        if (touchesShell) marks.push([y, x]);
      }
    }
    for (const [y, x] of marks) this.set(y, x, OUTLINE);
  }

  rows(): string[] {
    return this.grid.map((row) => row.join(''));
  }
}

function applyBody(grid: Silhouette, type: BodyType): void {
  const spec = BODIES[type];
  for (const [y, x0, x1, fill] of spec.rows) grid.span(y, x0, x1, fill);

  const [gy0, gy1, gx0, gx1] = spec.glass;
  for (let y = gy0; y <= gy1; y += 1) grid.inset(y, gx0, gx1, 'g');
  for (let y = gy0; y <= gy1; y += 1) grid.inset(y, spec.pillarX, spec.pillarX, 'b');

  if (spec.roofX) {
    const [x0, x1] = spec.roofX;
    grid.inset(gy0 - 1 < 0 ? gy0 : gy0 - 1, x0, x1, ROOF);
  }

  // Wing mirror, painted in the accent colour so that slot always has visible
  // feedback on a stock car instead of only mattering once a spoiler is fitted.
  grid.span(gy1 + 1, gx0 - 2, gx0 - 1, ACCENT);
}

/** Lamps, grille and vents. Painted after stripes so they always read. */
function applyDetails(grid: Silhouette, options: CosmeticOptions): void {
  // Grille first: the rally bar at level 3 sits over it.
  grid.inset(13, 39, 42, DARK);

  // Headlights: one lamp, two lamps, then a full rally bar.
  if (options.headlights === 1) {
    grid.rect(11, 12, 40, 42, LIGHT);
  } else if (options.headlights === 2) {
    grid.rect(11, 12, 38, 42, LIGHT);
    grid.inset(10, 40, 42, LIGHT);
  } else {
    grid.rect(11, 12, 38, 42, LIGHT);
    grid.inset(10, 39, 42, LIGHT);
    grid.inset(13, 34, 42, WHITE);
  }

  grid.inset(11, REAR_X, 4, TAIL);
  grid.inset(12, REAR_X, 4, TAIL);
  grid.inset(15, 35, 41, DARK);
  grid.inset(13, REAR_X, REAR_X + 2, DARK);
}

function applyOptions(grid: Silhouette, options: CosmeticOptions): void {
  const deckTop = grid.topAt(DECK_X);
  const hoodTop = grid.topAt(HOOD_X);

  if (options.spoiler === 2) {
    grid.span(deckTop - 1, REAR_X, REAR_X + 8, 'b');
    grid.span(deckTop - 2, REAR_X + 6, REAR_X + 8, 'b');
  } else if (options.spoiler === 3) {
    grid.span(deckTop - 3, REAR_X - 1, REAR_X + 9, ACCENT);
    for (const column of [REAR_X + 2, REAR_X + 6]) {
      grid.span(deckTop - 2, column, column, DARK);
      grid.span(deckTop - 1, column, column, DARK);
    }
  }

  if (options.hood === 2) {
    grid.inset(hoodTop + 1, 33, 39, DARK);
  } else if (options.hood === 3) {
    grid.span(hoodTop, 33, 39, DARK);
    grid.inset(hoodTop + 1, 33, 39, DARK);
  }

  if (options.stripes === 2) {
    grid.inset(11, REAR_X, 42, ACCENT);
  } else if (options.stripes === 3) {
    grid.inset(10, REAR_X, 42, ACCENT);
    grid.inset(11, REAR_X, 42, ACCENT);
  }

  if (options.decal === 2) {
    grid.rect(10, 12, 17, 22, WHITE);
    grid.inset(11, 18, 21, 'b');
  } else if (options.decal === 3) {
    grid.rect(11, 12, 15, 25, WHITE);
    grid.inset(13, 15, 25, ACCENT);
    grid.inset(12, 16, 24, DARK);
  }

  if (options.frontBumper === 2) {
    grid.span(16, 34, 43, DARK);
  } else if (options.frontBumper === 3) {
    grid.span(16, 34, 43, DARK);
    grid.span(17, 39, 43, DARK);
  }

  if (options.rearBumper === 2) {
    grid.span(16, 1, 10, DARK);
  } else if (options.rearBumper === 3) {
    grid.span(16, 0, 10, DARK);
    grid.span(17, 2, 7, DARK);
  }

  if (options.exhaust === 2) {
    grid.span(14, 0, 2, DARK);
  } else if (options.exhaust === 3) {
    grid.span(14, 0, 3, DARK);
    grid.span(15, 0, 2, ACCENT);
  }
}

/** Body shell only — the scene composites wheels as separate spinning sprites. */
export function buildCarRows(car: CarDefinition): string[] {
  const grid = new Silhouette();
  applyBody(grid, car.bodyType);
  applyOptions(grid, car.options);
  applyDetails(grid, car.options);
  grid.outlinePass();
  return grid.rows();
}

/**
 * One flat image: body first, wheels stamped on top.
 *
 * Matches the scene's depth order exactly (car depth 10, wheels depth 11), so
 * the garage shows the same overlap the race renders.
 */
export function buildCarImage(car: CarDefinition): { width: number; height: number; rows: string[] } {
  const rows = buildCarRows(car);
  const sprite = WHEEL_SPRITES[car.options.wheels];

  for (const wheelX of [CAR_WHEELS.rearX, CAR_WHEELS.frontX]) {
    const originX = wheelX - WHEEL_HALF;
    const originY = CAR_WHEELS.y - WHEEL_HALF;
    for (let dy = 0; dy < WHEEL_SIZE; dy += 1) {
      for (let dx = 0; dx < WHEEL_SIZE; dx += 1) {
        const cell = sprite[dy][dx];
        // Transparent wheel corners let the body show through, exactly as the
        // separate sprite does in the scene.
        if (cell === '.') continue;
        const y = originY + dy;
        const x = originX + dx;
        if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) continue;
        const line = rows[y];
        rows[y] = line.slice(0, x) + cell + line.slice(x + 1);
      }
    }
  }

  return { width: CAR_SPRITE.width, height: CAR_SPRITE.height, rows };
}

// --------------------------------------------------------------- painting --

const OUTLINE_COLOUR = 0x07080d;
const DARK_COLOUR = 0x12161f;
const LAMP_COLOUR = 0xfff3c4;
const TAIL_COLOUR = 0xff4033;
const WHITE_COLOUR = 0xf2f5ff;
const TYRE_COLOUR = 0x0a0c12;

/** Pure black-mix helper so the roof highlight reads without a second paint. */
function mixTowardWhite(rgb: number, amount: number): number {
  const r = Math.round(((rgb >> 16) & 0xff) + (255 - ((rgb >> 16) & 0xff)) * amount);
  const g = Math.round(((rgb >> 8) & 0xff) + (255 - ((rgb >> 8) & 0xff)) * amount);
  const b = Math.round((rgb & 0xff) + (255 - (rgb & 0xff)) * amount);
  return (r << 16) | (g << 8) | b;
}

function parseHex(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Symbol → colour for one car. Shared by the body texture, the wheel texture
 * and the preview, so a colour picked in the garage lands identically in all
 * three.
 */
export function carPalette(car: { colors: CarColors }): Record<string, number> {
  const colours: CarColors = car.colors;
  const primary = parseHex(colours.primary, 0x37e0c8);
  return {
    o: OUTLINE_COLOUR,
    b: primary,
    s: parseHex(colours.secondary, 0x0e2f3a),
    g: parseHex(colours.window, 0x16233a),
    a: parseHex(colours.accent, 0x0b0d14),
    l: mixTowardWhite(primary, 0.28),
    d: DARK_COLOUR,
    H: LAMP_COLOUR,
    T: TAIL_COLOUR,
    W: WHITE_COLOUR,
    t: TYRE_COLOUR,
    r: parseHex(colours.rim, 0xc9d2e6),
    h: parseHex(colours.rim, 0xc9d2e6),
  };
}

/** Wheel-only palette. Same symbols, no body paint. */
export function wheelPalette(car: { colors: CarColors }): Record<string, number> {
  const palette = carPalette(car);
  return { o: palette.o, t: palette.t, r: palette.r, h: palette.h, d: palette.d };
}

export const LIGHT_TREE_ROWS = LIGHT_TREE_SPRITE;

export function lightTreePalette(): Record<string, number> {
  return { o: 0x1a1f2e, b: DARK_COLOUR };
}

export function bulbPalette(colour: number): Record<string, number> {
  return { o: 0x0b0d14, b: colour, h: 0xffffff };
}

export const BULB_ROWS: ReadonlyArray<string> = ['.ooo.', 'obbbo', 'obhbo', 'obbbo', '.ooo.'];

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

// ------------------------------------------------------------ DOM preview --

const previewCache = new Map<string, string>();
const PREVIEW_CACHE_LIMIT = 96;

/**
 * PNG data URL of the composed car, at `scale`×, nearest-neighbour.
 *
 * Cached by the car's actual configuration so dragging a colour slider does
 * not rebuild an identical bitmap on every keystroke.
 */
export function carPreviewUrl(car: CarDefinition, scale = 4): string {
  if (typeof document === 'undefined') return '';
  const key = `${scale}|${car.bodyType}|${JSON.stringify(car.colors)}|${JSON.stringify(car.options)}`;
  const cached = previewCache.get(key);
  if (cached) return cached;

  const { width, height, rows } = buildCarImage(car);
  const palette = carPalette(car);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = palette[rows[y][x]];
      if (colour === undefined) continue;
      ctx.fillStyle = hex(colour);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  const url = canvas.toDataURL();
  if (previewCache.size >= PREVIEW_CACHE_LIMIT) previewCache.clear();
  previewCache.set(key, url);
  return url;
}
