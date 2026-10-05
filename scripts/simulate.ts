/* eslint-disable no-console */
/**
 * Headless tuning harness. Run with:  npx tsx scripts/simulate.ts
 * (or `node --experimental-strip-types`) to check that race times land in the
 * 10-15s target and that upgrades matter less than driving skill.
 */
import { DRIVETRAIN, RACE_DISTANCE_M } from '../src/game/config';
import { deriveStats } from '../src/game/physics/carStats';
import { Drivetrain, type CarInput } from '../src/game/physics/drivetrain';
import { AiDriver } from '../src/game/ai/aiDriver';
import type { AiDifficulty, UpgradeLevels } from '../src/game/types';

const DT = 1 / 60;

interface RunResult {
  time: number;
  topSpeedKph: number;
  shifts: number;
  launch: string;
}

function runPlayer(levels: UpgradeLevels, launchRpm: number, shiftRpm: number): RunResult {
  const car = new Drivetrain({ stats: deriveStats(levels) });
  car.beginRace(launchRpm);
  let t = 0;
  let top = 0;
  while (!car.finished && t < 40) {
    const input: CarInput = { throttle: true, upshift: false, downshift: false };
    if (car.gear < 5 && car.rpm >= shiftRpm && !car.shifting) input.upshift = true;
    car.setInput(input);
    car.update(DT);
    t += DT;
    top = Math.max(top, car.speedKph);
    if (car.distance >= RACE_DISTANCE_M) car.markFinished(t);
  }
  return { time: car.finishTime || t, topSpeedKph: top, shifts: car.shiftHistory.length, launch: car.launch!.quality };
}

function runAi(difficulty: AiDifficulty, seed: number, levels: UpgradeLevels): RunResult {
  const ai = new AiDriver({ difficulty, levels, seed });
  ai.stagingRevs(0, true, DRIVETRAIN.idleRpm);
  let revs = DRIVETRAIN.idleRpm;
  for (let i = 0; i < 240; i += 1) revs = ai.stagingRevs(DT, true, revs);
  ai.car.beginRace(revs);
  let t = 0;
  let top = 0;
  while (!ai.car.finished && t < 40) {
    ai.car.setInput(ai.update(DT));
    ai.car.update(DT);
    t += DT;
    top = Math.max(top, ai.car.speedKph);
    if (ai.car.distance >= RACE_DISTANCE_M) ai.car.markFinished(t);
  }
  return { time: ai.car.finishTime || t, topSpeedKph: top, shifts: ai.car.shiftHistory.length, launch: ai.car.launch!.quality };
}

const L1: UpgradeLevels = { engine: 1, weight: 1, aero: 1, brakes: 1 };
const L2: UpgradeLevels = { engine: 2, weight: 2, aero: 2, brakes: 2 };
const L3: UpgradeLevels = { engine: 3, weight: 3, aero: 3, brakes: 3 };

console.log(`Strip: ${RACE_DISTANCE_M}m  redline ${DRIVETRAIN.redlineRpm}rpm  shift point ${DRIVETRAIN.shiftUpRpm}rpm`);
console.log('\n--- Best-case driving (shift exactly on the money) ---');
for (const [name, build] of [
  ['L1', L1],
  ['L2', L2],
  ['L3', L3],
] as const) {
  const best = runPlayer(build, 4200, 6000);
  console.log(`${name}: ${best.time.toFixed(3)}s  top ${best.topSpeedKph.toFixed(0)}kph  launch ${best.launch}`);
}

console.log('\n--- Skill spread on the SAME L1 car ---');
for (const [label, launch, shift] of [
  ['perfect everything', 4200, 6000],
  ['good shifts', 4200, 5600],
  ['early shifts', 4200, 5000],
  ['late shifts', 4200, 6900],
  ['bad launch + early', 1500, 5000],
  ['limiter launch', 7700, 6000],
  ['bogged launch', 2500, 6000],
] as const) {
  const r = runPlayer(L1, launch, shift);
  console.log(`${label.padEnd(20)} ${r.time.toFixed(3)}s  (launch ${r.launch}, ${r.shifts} shifts)`);
}

console.log('\n--- AI (L2 build) over 8 seeds ---');
for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  const times: number[] = [];
  for (let seed = 0; seed < 8; seed += 1) times.push(runAi(difficulty, 1000 + seed * 7919, L2).time);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const best = Math.min(...times);
  const worst = Math.max(...times);
  console.log(`${difficulty.padEnd(7)} avg ${avg.toFixed(3)}s  range ${best.toFixed(3)}-${worst.toFixed(3)}`);
}

console.log('\n--- Head to head: L1 perfect vs AI medium ---');
let wins = 0;
for (let seed = 0; seed < 12; seed += 1) {
  const player = runPlayer(L1, 4200, 6000);
  const ai = runAi('medium', 500 + seed * 104729, L2);
  if (player.time < ai.time) wins += 1;
}
console.log(`skillful L1 beats medium L2: ${wins}/12`);