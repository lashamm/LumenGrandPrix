/* eslint-disable no-console */
/** Per-gear breakdown so tuning is based on data, not guesses. */
import { RACE_DISTANCE_M } from '../src/game/config';
import { deriveStats } from '../src/game/physics/carStats';
import { Drivetrain, type CarInput } from '../src/game/physics/drivetrain';
import type { UpgradeLevels } from '../src/game/types';

const DT = 1 / 60;
const L1: UpgradeLevels = { engine: 1, weight: 1, aero: 1, brakes: 1 };

function breakdown(launchRpm: number, shiftRpm: number) {
  const car = new Drivetrain({ stats: deriveStats(L1) });
  car.beginRace(launchRpm);
  let t = 0;
  const perGear = new Map<number, { time: number; startDist: number; endDist: number; entryKph: number }>();
  let entryKph = 0;
  while (!car.finished && t < 60) {
    const input: CarInput = { throttle: true, upshift: false, downshift: false };
    if (car.gear < 5 && car.rpm >= shiftRpm && !car.shifting) input.upshift = true;
    const gear = car.gear;
    if (!perGear.has(gear)) {
      perGear.set(gear, { time: 0, startDist: car.distance, endDist: car.distance, entryKph: car.speedKph });
    }
    car.setInput(input);
    car.update(DT);
    t += DT;
    const rec = perGear.get(gear)!;
    rec.time += DT;
    rec.endDist = car.distance;
    if (car.distance >= RACE_DISTANCE_M) car.markFinished(t);
    if (car.gearChanged) entryKph = car.speedKph;
  }
  return { total: car.finishTime, perGear, finalGear: car.gear, finalKph: car.speedKph, finalRpm: car.rpm };
}

for (const shiftRpm of [5600, 6000, 6500, 7000, 7500]) {
  const r = breakdown(4200, shiftRpm);
  const parts = [...r.perGear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gear, v]) => `G${gear + 1} ${v.time.toFixed(2)}s ${v.startDist.toFixed(0)}-${v.endDist.toFixed(0)}m@${v.entryKph.toFixed(0)}`)
    .join(' | ');
  console.log(`shift@${shiftRpm}  total ${r.total.toFixed(2)}s  end ${r.finalKph.toFixed(0)}kph gear ${r.finalGear + 1} @${r.finalRpm.toFixed(0)}rpm`);
  console.log(`   ${parts}\n`);
}