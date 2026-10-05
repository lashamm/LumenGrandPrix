/* eslint-disable no-console */
/**
 * Diagnostic: for a set of road speeds, print the drive force available in each
 * gear and the RPM each gear implies. Confirms which gear is actually best.
 */
import { AIR_DENSITY, DRIVETRAIN, PHYSICS } from '../src/game/config';
import { deriveStats, engineOutputFactorAt } from '../src/game/physics/carStats';
import type { UpgradeLevels } from '../src/game/types';

const L1: UpgradeLevels = { engine: 1, weight: 1, aero: 1, brakes: 1 };
const stats = deriveStats(L1);
const RPM_PER_MPS_PER_RATIO = 60 / (2 * Math.PI * DRIVETRAIN.wheelRadiusM);

function rpmIn(v: number, gear: number): number {
  return v * DRIVETRAIN.gearRatios[gear] * DRIVETRAIN.finalDrive * RPM_PER_MPS_PER_RATIO;
}

function force(v: number, gear: number): number {
  const total = DRIVETRAIN.gearRatios[gear] * DRIVETRAIN.finalDrive;
  const rpm = Math.min(rpmIn(v, gear), DRIVETRAIN.redlineRpm);
  const torque = stats.peakTorqueNm * engineOutputFactorAt(rpm);
  return (torque * total * DRIVETRAIN.driveEfficiency) / DRIVETRAIN.wheelRadiusM;
}

function drag(v: number): number {
  return (
    0.5 * AIR_DENSITY * stats.dragArea * v * v +
    PHYSICS.rollingResistanceCoefficient * stats.massKg * PHYSICS.gravity
  );
}

console.log('kph   ' + Array.from({ length: 6 }, (_, g) => `    G${g + 1}`).join(' ') + '   best  netAccel');
for (const kph of [10, 20, 30, 40, 45, 50, 55, 60, 80, 100, 120, 140, 160, 180, 200]) {
  const v = kph / 3.6;
  const cells: string[] = [];
  let best = 0;
  let bestF = -1;
  for (let g = 0; g < 6; g += 1) {
    const rpm = rpmIn(v, g);
    const f = force(v, g);
    const usable = rpm <= DRIVETRAIN.redlineRpm;
    if (usable && f > bestF) {
      bestF = f;
      best = g;
    }
    cells.push(`${usable ? ' ' : 'x'}${rpm.toFixed(0).padStart(4)}`);
  }
  const netA = (bestF - drag(v)) / stats.massKg;
  console.log(`${String(kph).padStart(4)}  ${cells.join(' ')}   G${best + 1}    ${netA.toFixed(2)} m/s^2`);
}

console.log('\nNormalised power (torque x rpm) — flat plateau should end at 6000:');
for (let rpm = 3000; rpm <= 8000; rpm += 250) {
  const bar = '#'.repeat(Math.round((engineOutputFactorAt(rpm) * rpm) / 100));
  console.log(`  ${String(rpm).padStart(4)}: ${(engineOutputFactorAt(rpm) * rpm).toFixed(0).padStart(4)} ${bar}`);
}