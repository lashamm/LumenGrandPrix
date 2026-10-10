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
 * `H` helmet · `w` cockpit · `d` tire · `r` rim / nose tip
 */
export const CIRCUIT_CAR_ROWS: ReadonlyArray<string> = [
  'ooo..................ooo',
  'ooodrd...........drd.ooo',
  'obbddd...........dddbb.o',
  'osssssssssss.........ooo',
  'obbbbbbbbbbbbbbb.....ooo',
  'obbbbbbbbbbbHHHwbbbbbr.o',
  'obbbbbbbbbbbHHHwbbbbbr.o',
  'obbbbbbbbbbbbbbb.....ooo',
  'osssssssssss.........ooo',
  'obbddd...........dddbb.o',
  'ooodrd...........drd.ooo',
  'ooo..................ooo',
];

const OUTLINE_COLOUR = 0x07080d;
const TIRE_COLOUR = 0x0a0c12;

/**
 * Symbol → colour for a circuit car, resolved from its paint.
 *
 * Every colour slot the garage edits lands on the sprite: `primary` the body,
 * `secondary` the sidepods, `accent` the helmet, `window` the cockpit and
 * `rim` the nose tip and the wheel rims — so switching a paint visibly
 * changes the Formula car, not just the road car.
 */
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
    w: parse(colors.window, 0x12161f),
    d: TIRE_COLOUR,
    r: parse(colors.rim, 0xc9d2e6),
  };
}
