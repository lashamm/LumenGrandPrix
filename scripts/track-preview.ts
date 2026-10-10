/* eslint-disable no-console */
/**
 * Track layout preview — a headless design aid.
 *
 * Prints each handcrafted circuit as an ASCII silhouette plus the numbers
 * that matter (length, tightest corner radius, bounds) and any validation
 * problems, so layouts can be iterated without a browser.
 *
 * Run: npx tsx scripts/track-preview.ts [trackId ...]
 */
import { CIRCUIT } from '../src/game/config';
import { buildCircuitFromPath, isValidCircuit } from '../src/game/circuit/circuitGenerator';
import { HANDCRAFTED_TRACKS } from '../src/game/circuit/handcraftedTracks';
import type { Circuit } from '../src/game/circuit/types';

const COLS = 104;
const ROWS = 42;

function render(circuit: Circuit): string {
  const { minX, minY, maxX, maxY } = circuit.bounds;
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const scale = Math.min((COLS - 2) / w, (ROWS - 2) / h);
  const ox = (COLS - w * scale) / 2;
  const oy = (ROWS - h * scale) / 2;

  const grid: string[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ' '));
  const px = (x: number, y: number) => ({
    cx: Math.round((x - minX) * scale + ox),
    cy: Math.round((y - minY) * scale + oy),
  });

  for (let i = 0; i < circuit.samples.length; i += 1) {
    const s = circuit.samples[i];
    const { cx, cy } = px(s.x, s.y);
    if (cy < 0 || cy >= ROWS || cx < 0 || cx >= COLS) continue;
    if (Math.abs(s.curvature) > 1 / CIRCUIT.minRadiusM) grid[cy][cx] = '!';
    else if (grid[cy][cx] === ' ') grid[cy][cx] = '#';
  }

  const start = px(circuit.samples[0].x, circuit.samples[0].y);
  if (start.cy >= 0 && start.cy < ROWS && start.cx >= 0 && start.cx < COLS) {
    grid[start.cy][start.cx] = 'S';
  }
  return grid.map((row) => `|${row.join('')}|`).join('\n');
}

function report(name: string, points: ReadonlyArray<readonly [number, number]>): void {
  const circuit = buildCircuitFromPath(points, name);
  console.log(`\n=== ${name} (${points.length} control points) ===`);
  if (!circuit) {
    console.log('  BUILT NULL — layout too short');
    return;
  }
  let maxCurv = 0;
  let tightIndex = 0;
  circuit.samples.forEach((s, i) => {
    if (Math.abs(s.curvature) > maxCurv) {
      maxCurv = Math.abs(s.curvature);
      tightIndex = i;
    }
  });
  const minRadius = maxCurv > 0 ? 1 / maxCurv : Infinity;
  const boundW = circuit.bounds.maxX - circuit.bounds.minX;
  const boundH = circuit.bounds.maxY - circuit.bounds.minY;
  const tight = circuit.samples[tightIndex];
  console.log(
    `  length ${circuit.length.toFixed(0)}m | tightest radius ${minRadius.toFixed(1)}m ` +
      `(curv ${maxCurv.toFixed(4)}) @ (${tight.x.toFixed(0)}, ${tight.y.toFixed(0)})`,
  );
  console.log(
    `  bounds ${boundW.toFixed(0)} x ${boundH.toFixed(0)}m | valid ${isValidCircuit(circuit)}`,
  );
  console.log(render(circuit));
}

const wanted = process.argv.slice(2);
const tracks = wanted.length
  ? HANDCRAFTED_TRACKS.filter((track) => wanted.includes(track.id))
  : HANDCRAFTED_TRACKS;

for (const track of tracks) {
  report(track.name, track.points);
}
