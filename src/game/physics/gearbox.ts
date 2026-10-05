import { DRIVETRAIN, LAUNCH, SHIFT } from '../config';
import { GEAR_COUNT, type ShiftQuality } from '../types';

const { wheelRadiusM, finalDrive, gearRatios, idleRpm, redlineRpm, revLimitRpm } = DRIVETRAIN;

export function clampGear(gear: number): number {
  return Math.min(Math.max(gear, 0), GEAR_COUNT - 1);
}

/** Total (transmission) ratio for a gear index, 0-based. */
export function totalRatio(gear: number): number {
  return gearRatios[clampGear(gear)] * finalDrive;
}

/** Road speed (m/s) -> engine RPM for the given gear. */
export function rpmFromSpeed(speedMps: number, gear: number): number {
  const wheelRpm = (speedMps / (2 * Math.PI * wheelRadiusM)) * 60;
  return wheelRpm * totalRatio(gear);
}

/** Engine RPM -> road speed (m/s) for the given gear. */
export function speedFromRpm(rpm: number, gear: number): number {
  const wheelRpm = rpm / totalRatio(gear);
  return (wheelRpm * (2 * Math.PI * wheelRadiusM)) / 60;
}

export function clampRpm(rpm: number): number {
  return Math.min(Math.max(rpm, idleRpm), redlineRpm);
}

/** Speed (m/s) the car is doing at redline in a given gear. */
export function redlineSpeed(gear: number): number {
  return speedFromRpm(redlineRpm, gear);
}

export function gearName(gear: number): string {
  return String(clampGear(gear) + 1);
}

/** True when the engine is bouncing off the limiter. */
export function atRevLimit(rpm: number): boolean {
  return rpm >= revLimitRpm;
}

export interface ShiftGrade {
  quality: ShiftQuality;
  shiftTime: number;
  torqueMultiplier: number;
  /** Signed RPM error, positive = shifted late. */
  errorRpm: number;
}

/**
 * Grade an upshift. Skill-based but forgiving: ~±380 RPM still lands GOOD,
 * so nobody needs frame-perfect inputs.
 */
export function gradeShift(rpmAtShift: number): ShiftGrade {
  const errorRpm = rpmAtShift - DRIVETRAIN.shiftUpRpm;
  const magnitude = Math.abs(errorRpm);
  const band = SHIFT.bands.find((candidate) => magnitude <= candidate.tolerance)!;
  return {
    quality: band.quality,
    shiftTime: band.shiftTime,
    torqueMultiplier: band.torqueMultiplier,
    errorRpm,
  };
}

export interface LaunchGrade {
  quality: ShiftQuality;
  accelMultiplier: number;
  errorRpm: number;
}

/** Grade the launch RPM the player released at. */
export function gradeLaunch(rpmAtLaunch: number): LaunchGrade {
  const errorRpm = rpmAtLaunch - LAUNCH.optimalRpm;
  const magnitude = Math.abs(errorRpm);
  const band = LAUNCH.bands.find((candidate) => magnitude <= candidate.tolerance)!;
  return {
    quality: band.quality,
    accelMultiplier: band.accelMultiplier,
    errorRpm,
  };
}

/** RPM after a gear change. Revs drop by the gear ratio, with a quality kick. */
export function rpmAfterShift(rpmAtShift: number, fromGear: number, grade: ShiftGrade): number {
  const nextGear = clampGear(fromGear + 1);
  if (nextGear === fromGear) return clampRpm(rpmAtShift);
  const raw = rpmAtShift / (totalRatio(fromGear) / totalRatio(nextGear));
  // A sloppy shift either bogs (early) or revs out (late).
  const penalty = grade.quality === 'PERFECT' || grade.quality === 'GREAT' ? 1 : 0.94;
  return clampRpm(raw * penalty);
}

/** RPM after a downshift — with a rev-limiter bounce if we over-rev. */
export function rpmAfterDownshift(rpmAtShift: number, fromGear: number): number {
  const nextGear = clampGear(fromGear - 1);
  if (nextGear === fromGear) return clampRpm(rpmAtShift);
  return Math.min(rpmAfterShift(rpmAtShift, fromGear, {
    quality: 'GREAT',
    shiftTime: SHIFT.bands[1].shiftTime,
    torqueMultiplier: 1,
    errorRpm: 0,
  }) * 1.08, redlineRpm);
}

export const GEAR_TOP_SPEEDS = gearRatios.map((_, gear) => redlineSpeed(gear));