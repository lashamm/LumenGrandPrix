import { TORQUE_CURVE } from '../config';
import { LEVEL_TABLE } from '../car/carData';
import type { UpgradeCategory, UpgradeLevels } from '../types';

export interface CarStats {
  /** Engine peak torque in Nm. */
  peakTorqueNm: number;
  /** Kerb mass in kg. */
  massKg: number;
  /** Cd * A in m^2. Lower is less drag. */
  dragArea: number;
  /** Longitudinal brake force in N. */
  brakeForceN: number;
  /** Traction budget in N — caps how hard we can put power down. */
  tractionLimitN: number;
}

/** Human-readable percentage contribution of each upgrade level, for the UI. */
export function categoryEffectPercent(category: UpgradeCategory, level: number): number {
  const table = LEVEL_TABLE[category];
  const base = table[0];
  const current = table[Math.min(level, table.length) - 1];
  if (category === 'weight') {
    return ((base - current) / base) * 100;
  }
  return ((current - base) / base) * 100;
}

/**
 * Turn upgrade levels into physical numbers.
 * `bonus` nudges every stat slightly and is used to give the AI its own build.
 */
export function deriveStats(levels: UpgradeLevels, bonus = 0): CarStats {
  const engineLevel = levels.engine;
  const weightLevel = levels.weight;
  const aeroLevel = levels.aero;
  const brakeLevel = levels.brakes;

  const peakTorqueNm = LEVEL_TABLE.engine[engineLevel - 1] * (1 + bonus);
  const massKg = LEVEL_TABLE.weight[weightLevel - 1] * (1 - bonus * 0.5);
  const dragArea = LEVEL_TABLE.aero[aeroLevel - 1] * (1 - bonus * 0.5);
  const brakeForceN = LEVEL_TABLE.brakes[brakeLevel - 1] * (1 + bonus);

  // Traction budget: more aero downforce + lighter car = more grip before spin.
  const weightFactor = LEVEL_TABLE.weight[0] / massKg;
  const aeroFactor = LEVEL_TABLE.aero[0] / dragArea;
  const tractionLimitN = massKg * 9.81 * (1.25 + 0.16 * (weightFactor - 1) + 0.16 * (aeroFactor - 1));

  return { peakTorqueNm, massKg, dragArea, brakeForceN, tractionLimitN };
}

/**
 * What the engine actually delivers at a given RPM.
 *
 * Keeping this as a single curve (rather than a torque curve plus a separate
 * "efficiency window") is deliberate: the curve is already shaped so that power
 * plateaus across the rev range a correct driver uses, which is what gives the
 * 6,000 RPM shift point its meaning.
 */
export function engineOutputFactorAt(rpm: number): number {
  if (rpm <= TORQUE_CURVE[0][0]) return TORQUE_CURVE[0][1];
  const last = TORQUE_CURVE[TORQUE_CURVE.length - 1];
  if (rpm >= last[0]) return last[1];
  for (let i = 0; i < TORQUE_CURVE.length - 1; i += 1) {
    const [rpmA, factorA] = TORQUE_CURVE[i];
    const [rpmB, factorB] = TORQUE_CURVE[i + 1];
    if (rpm >= rpmA && rpm <= rpmB) {
      const t = (rpm - rpmA) / (rpmB - rpmA);
      return factorA + (factorB - factorA) * t;
    }
  }
  return last[1];
}

/**
 * Coarse normalised stats used by the Garage bars.
 * Each dimension is normalised so 100 === a fully built Level 3 car.
 */
export function normalisedBars(stats: CarStats) {
  const best = deriveStats({ engine: 3, weight: 3, aero: 3, brakes: 3 });
  return {
    POWER: (stats.peakTorqueNm / best.peakTorqueNm) * 100,
    LAUNCH: (best.massKg / stats.massKg) * 100,
    AERO: (best.dragArea / stats.dragArea) * 100,
    BRAKES: (stats.brakeForceN / best.brakeForceN) * 100,
  };
}