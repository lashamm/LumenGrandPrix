/* eslint-disable no-console */
/**
 * Circuit car art verification.
 *
 * The Formula sprite is a single fixed grid; its colours come from the
 * `CarColors` the garage edits. This asserts every colour slot the garage
 * offers actually lands on the sprite, and that distinct paints render
 * distinct images — so a circuit-car paint change is never a no-op.
 *
 * Run: npx tsx scripts/verify-circuit-art.ts
 */
import { CIRCUIT_CAR_ROWS, circuitCarPalette } from '../src/game/circuit/carSprite';
import type { CarColors, ColorSlot } from '../src/game/types';

const BASE: CarColors = {
  primary: '#141824',
  secondary: '#0a0d14',
  rim: '#c9d2e6',
  window: '#16233a',
  accent: '#37e0c8',
};

const SLOTS: readonly ColorSlot[] = ['primary', 'secondary', 'rim', 'window', 'accent'];

function withSlot(slot: ColorSlot, value: string): CarColors {
  const colors: CarColors = { ...BASE };
  (colors as Record<ColorSlot, string>)[slot] = value;
  return colors;
}

/** A stable string encoding of the painted sprite for one paint. */
function render(colors: CarColors): string {
  const palette = circuitCarPalette(colors);
  const parts: string[] = [];
  for (const row of CIRCUIT_CAR_ROWS) {
    for (const symbol of row) {
      const colour = palette[symbol];
      if (colour === undefined) continue;
      parts.push(`${symbol}${colour.toString(16)}`);
    }
  }
  return parts.join('|');
}

function main(): void {
  console.log('Circuit car art — geometry and palette coverage');
  const width = CIRCUIT_CAR_ROWS[0].length;
  const height = CIRCUIT_CAR_ROWS.length;
  const square = CIRCUIT_CAR_ROWS.every((row) => row.length === width);
  console.log(`  sprite ${width}x${height} | every row is ${width} px: ${square}`);
  if (!square) throw new Error('circuit car rows are not rectangular');

  const palette = circuitCarPalette(BASE);
  const symbols = new Set<string>();
  for (const row of CIRCUIT_CAR_ROWS) for (const ch of row) if (ch !== '.') symbols.add(ch);
  const uncovered = [...symbols].filter((symbol) => palette[symbol] === undefined);
  console.log(`  ${symbols.size} symbols, ${uncovered.length} without a colour`);
  if (uncovered.length > 0) throw new Error(`symbols without colour: ${uncovered.join(', ')}`);

  console.log('\nCircuit car art — every colour slot is painted');
  for (const slot of SLOTS) {
    const a = render(withSlot(slot, '#ff00ff'));
    const b = render(withSlot(slot, '#001100'));
    const change = a !== b;
    console.log(`  ${slot.padEnd(10)} changes pixels: ${change}`);
    if (!change) throw new Error(`colour slot ${slot} does not change the sprite`);
  }

  console.log('\nCircuit car art — distinct paints render distinct images');
  const paints = SLOTS.map((slot, index) => withSlot(slot, ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][index]));
  const images = new Set([render(BASE), ...paints.map((colors) => render(colors))]);
  console.log(`  ${paints.length + 1} paints, ${images.size} unique images`);
  if (images.size !== paints.length + 1) throw new Error('distinct paints rendered identical images');

  console.log('\nCircuit car art verification passed');
}

main();
