import { DRIVETRAIN, MAX_RPM, PHYSICS, AIR_DENSITY, TORQUE_CURVE, WHEEL_CIRCUMFERENCE_M } from '../config';
import { LEVEL_TABLE } from '../car/carData';
import { GEAR_COUNT, type CarCustomization, type UpgradeCategory, type UpgradeLevels } from '../types';

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
  /**
   * Tire friction coefficient (µ). Only the circuit physics reads it;
   * drag racing is unaffected by the tires upgrade.
   */
  tireGrip: number;
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
  const tireLevel = levels.tires;

  const peakTorqueNm = LEVEL_TABLE.engine[engineLevel - 1] * (1 + bonus);
  const massKg = LEVEL_TABLE.weight[weightLevel - 1] * (1 - bonus * 0.5);
  const dragArea = LEVEL_TABLE.aero[aeroLevel - 1] * (1 - bonus * 0.5);
  const brakeForceN = LEVEL_TABLE.brakes[brakeLevel - 1] * (1 + bonus);
  const tireGrip = LEVEL_TABLE.tires[tireLevel - 1] * (1 + bonus * 0.5);

  // Traction budget: more aero downforce + lighter car = more grip before spin.
  const weightFactor = LEVEL_TABLE.weight[0] / massKg;
  const aeroFactor = LEVEL_TABLE.aero[0] / dragArea;
  const tractionLimitN = massKg * 9.81 * (1.25 + 0.16 * (weightFactor - 1) + 0.16 * (aeroFactor - 1));

  return { peakTorqueNm, massKg, dragArea, brakeForceN, tractionLimitN, tireGrip };
}

/**
 * Stats straight from the player's car configuration.
 *
 * The garage and the race both call this, so the numbers shown before the run
 * are exactly the numbers the run uses. There is no second stat table.
 */
export function calculateCarStats(car: CarCustomization): CarStats {
  return deriveStats(car.performance);
}

/** Everything the garage prints about a car, in one call. */
export interface CarReport {
  stats: CarStats;
  /** Peak power in kW. */
  powerKw: number;
  torqueNm: number;
  massKg: number;
  topSpeedKph: number;
  brakeKn: number;
  /** Nm per kg, the garage's headline ratio. */
  powerToWeight: number;
  /** 0..100 bars, 100 === a fully built Level 3 car. */
  bars: ReturnType<typeof normalisedBars>;
}

export function calculateCarReport(car: CarCustomization): CarReport {
  const stats = calculateCarStats(car);
  return {
    stats,
    powerKw: peakPowerKw(stats),
    torqueNm: stats.peakTorqueNm,
    massKg: stats.massKg,
    topSpeedKph: estimateTopSpeedKph(stats),
    brakeKn: stats.brakeForceN / 1000,
    powerToWeight: stats.peakTorqueNm / stats.massKg,
    bars: normalisedBars(stats),
  };
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

/** Peak engine power in kW: the highest point of torque × revs on the curve. */
export function peakPowerKw(stats: CarStats): number {
  let best = 0;
  for (const [rpm, factor] of TORQUE_CURVE) {
    if (rpm <= 0) continue;
    const watts = stats.peakTorqueNm * factor * ((rpm * 2 * Math.PI) / 60);
    if (watts > best) best = watts;
  }
  return best / 1000;
}

/**
 * Steady-state speed reached in top gear, km/h — where drive force finally
 * equals aero drag plus rolling resistance. This is a theoretical ceiling the
 * 300 m strip never reaches; it exists so the garage can show a real number.
 */
export function estimateTopSpeedKph(stats: CarStats): number {
  const topRatio = DRIVETRAIN.gearRatios[GEAR_COUNT - 1] * DRIVETRAIN.finalDrive;
  const rolling = PHYSICS.rollingResistanceCoefficient * stats.massKg * PHYSICS.gravity;

  const netForce = (vMps: number): number => {
    const rpm = Math.min(Math.max((vMps * topRatio * 60) / WHEEL_CIRCUMFERENCE_M, 0), MAX_RPM);
    const torque = stats.peakTorqueNm * engineOutputFactorAt(rpm);
    const drive = (torque * topRatio * DRIVETRAIN.driveEfficiency) / DRIVETRAIN.wheelRadiusM;
    const drag = 0.5 * AIR_DENSITY * stats.dragArea * vMps * vMps;
    return drive - drag - rolling;
  };

  const hi = 120;
  if (netForce(4) <= 0) return 0;
  if (netForce(hi) > 0) return hi * 3.6;
  let lo = 4;
  let high = hi;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + high) / 2;
    if (netForce(mid) > 0) lo = mid;
    else high = mid;
  }
  return lo * 3.6;
}

/**
 * Six garage bars, each normalised so 100 === a fully built Level 3 car.
 * WEIGHT, AERO and the resistance terms are inverted (lower raw value is better).
 */
export function normalisedBars(stats: CarStats) {
  const best = deriveStats({ engine: 3, weight: 3, aero: 3, brakes: 3, tires: 3 });
  const power = peakPowerKw(stats);
  const bestPower = peakPowerKw(best);
  const bestTopSpeed = estimateTopSpeedKph(best) || 1;
  return {
    POWER: (power / bestPower) * 100,
    WEIGHT: (best.massKg / stats.massKg) * 100,
    AERO: (best.dragArea / stats.dragArea) * 100,
    BRAKING: (stats.brakeForceN / best.brakeForceN) * 100,
    ACCELERATION: (power / stats.massKg / (bestPower / best.massKg)) * 100,
    TOP_SPEED: (estimateTopSpeedKph(stats) / bestTopSpeed) * 100,
    GRIP: (stats.tireGrip / best.tireGrip) * 100,
  };
}