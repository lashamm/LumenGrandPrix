/* eslint-disable no-console */
/**
 * Throwaway tuner: sweeps the player's upshift point to confirm 6,000 RPM is the
 * fastest line, then reports the time spread across builds and skill levels.
 *
 * Run: npx tsx scripts/sweep.ts
 */
import { RACE_DISTANCE_M } from '../src/game/config';
import { deriveStats } from '../src/game/physics/carStats';
import { Drivetrain, type CarInput } from '../src/game/physics/drivetrain';
import type { UpgradeLevels } from '../src/game/types';

const DT = 1 / 60;
const L1: UpgradeLevels = { engine: 1, weight: 1, aero: 1, brakes: 1 };

export function run(levels: UpgradeLevels, launchRpm: number, shiftRpm: number): number {
  const car = new Drivetrain({ stats: deriveStats(levels) });
  car.beginRace(launchRpm);
  let t = 0;
  while (!car.finished && t < 60) {
    const input: CarInput = { throttle: true, upshift: false, downshift: false };
    if (car.gear < 5 && car.rpm >= shiftRpm && !car.shifting) input.upshift = true;
    car.setInput(input);
    car.update(DT);
    t += DT;
    if (car.distance >= RACE_DISTANCE_M) car.markFinished(t);
  }
  return car.finishTime || t;
}

console.log('shift point curve (L1, perfect launch):');
const rows: Array<{ rpm: number; time: number }> = [];
for (let rpm = 4200; rpm <= 7600; rpm += 100) {
  rows.push({ rpm, time: run(L1, 4200, rpm) });
}
const best = Math.min(...rows.map((row) => row.time));
const bestRpm = rows.find((row) => row.time === best)?.rpm ?? 0;
for (const row of rows) {
  const marker = row.time === best ? '<-- best' : `+${(row.time - best).toFixed(3)}`;
  console.log(`  ${row.rpm}  ${row.time.toFixed(3)}s  ${marker}`);
}
console.log(`\noptimum: ${bestRpm} rpm -> ${best.toFixed(3)}s`);