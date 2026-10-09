import type { CarColors } from '../types';

/**
 * Top-down, Formula-style circuit car.
 *
 * A 24x12 pixel sprite: open wheels, a wide front and rear
 * wing, a halo'd cockpit and a helmet, so every car reads
 * as a single-seater from above. The sprite faces +x.
 *
 * Phaser-free, like the drag renderer: the rows and the
 * palette live here, the scene paints them into a texture.
 */

export const CIRCUIT_CAR_SPRITE = { width: 24, height: 12 } as const;

/** World size of the car, metres. */
export const CIRCUIT_CAR_LENGTH_M = 5.2;
export const CIRCUIT_CAR_WIDTH_M = 2.4;

/**
 * The sprite grid.
 *
 * `o` outline · `b` primary body · `s` secondary sidepods ·
 * `H` helmet · `w` cockpit · `d` tire · `r` nose tip
 */
export const CIRCUIT_CAR_ROWS: ReadonlyArray<string> = [
  'ooo..................ooo',
  'oooddd...........ddd.ooo',
  'obbddd...........dddbb.o',
  'osssssssssss.........ooo',
  'obbbbbbbbbbbbbbb.....ooo',
  'obbbbbbbbbbbHHHwbbbbbr.o',
  'obbbbbbbbbbbHHHwbbbbbr.o',
  'obbbbbbbbbbbbbbb.....ooo',
  'osssssssssss.........ooo',
  'obbddd...........dddbb.o',
  'oooddd...........ddd.ooo',
  'ooo..................ooo',
];

const OUTLINE_COLOUR = 0x07080d;
const TIRE_COLOUR = 0x0a0c12;
const COCKPIT_COLOUR = 0x12161f;

/** Symbol → colour for a circuit car, resolved from its paint. */
export function circuitCarPalette(colors: CarColors): Record<string, number> {
  const parse = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value.replace('#', ''), 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    o: OUTLINE_COLOUR,
    b: parse(colors.primary, 0x37e0c8),
    s: parse(colors.secondary, 0x0e2f3a),
    H: parse(colors.accent, 0x0b0d14),
    w: COCKPIT_COLOUR,
    d: TIRE_COLOUR,
    r: parse(colors.rim, 0xc9d2e6),
  };
}
