/**
 * Central tuning table for the whole prototype.
 * Every magic number a designer would want to touch lives here.
 */
import type { AiDifficulty, BodyType } from './types';

// ---------------------------------------------------------------------------
// Canonical race constants. Nothing below this block should restate these.
// ---------------------------------------------------------------------------

/** Strip length in metres. */
export const RACE_LENGTH = 300;
/** Existing name for {@link RACE_LENGTH}; kept so callers do not scatter. */
export const RACE_DISTANCE_M = RACE_LENGTH;

/** Engine redline. The tachometer face and the rev limiter both derive from it. */
export const MAX_RPM = 8000;
/** The shift point the whole torque curve is shaped around. */
export const OPTIMAL_SHIFT_RPM = 6000;
/** Rev limiter sits just under redline so the limiter is reachable but not instant. */
export const REV_LIMIT_RPM = MAX_RPM - 100;

/** Platform fee taken from the pot on a settled race (0.1 === 10%). */
export const PLATFORM_FEE = 0.1;

/** Prefactor for the pot: winner receives `entry * POOL_PER_ENTRY * (1 - PLATFORM_FEE)`. */
export const POOL_PER_ENTRY = 2;

/** Engine / gearbox geometry. */
export const DRIVETRAIN = {
  wheelRadiusM: 0.33,
  finalDrive: 3.96,
  driveEfficiency: 0.86,
  /**
   * Reverse of GEAR_RATIOS[i] * finalDrive: how much faster the engine turns.
   * Spacing is 1.32 so the ratio gain on each upshift beats the torque fall-off,
   * which is what makes shifting up a genuine gain rather than a loss.
   */
  gearRatios: [5.025, 3.807, 2.884, 2.185, 1.656, 1.255],
  idleRpm: 900,
  redlineRpm: MAX_RPM,
  shiftUpRpm: OPTIMAL_SHIFT_RPM,
  revLimitRpm: REV_LIMIT_RPM,
} as const;

/** Circumference of the driven wheel, metres — converts m/s to RPM. */
export const WHEEL_CIRCUMFERENCE_M = 2 * Math.PI * DRIVETRAIN.wheelRadiusM;

/** Body silhouettes the pixel-art factory can draw. */
export const BODY_TYPES: readonly BodyType[] = ['coupe', 'sedan', 'hatchback'];

/** HUD geometry for the circular tachometer, in virtual canvas pixels. */
export const TACH = {
  centreX: 74,
  centreY: 226,
  radius: 42,
  /** Sweep of the gauge in degrees, clockwise from 12 o'clock. */
  sweepDeg: 270,
  /** Needle angle at 0 RPM, relative to 12 o'clock (degrees, clockwise). */
  startDeg: -135,
} as const;

export const PHYSICS = {
  /** Standard sea-level air density, kg/m^3. */
  rollingResistanceCoefficient: 0.014,
  gravity: 9.81,
  /** RPM decay per second when off throttle. */
  engineBrakeRpm: 2600,
} as const;

export const AIR_DENSITY = 1.225;

/**
 * Launch window. The staging phase is a mini skill check: hold GAS to build
 * revs, release inside the band for a clean launch.
 */
export const LAUNCH = {
  /** Revs climb while holding GAS during staging. */
  stagingRevRate: 1750,
  /** Perfect window centre. */
  optimalRpm: 4200,
  bands: [
    { tolerance: 140, quality: 'PERFECT' as const, accelMultiplier: 1.0 },
    { tolerance: 380, quality: 'GREAT' as const, accelMultiplier: 0.95 },
    { tolerance: 850, quality: 'GOOD' as const, accelMultiplier: 0.86 },
    { tolerance: 1500, quality: 'MISS' as const, accelMultiplier: 0.72 },
    { tolerance: Infinity, quality: 'BAD' as const, accelMultiplier: 0.6 },
  ],
} as const;

/**
 * Shift grading. `torqueMultiplier` is applied after the gear change,
 * `shiftTime` is how long torque stays cut.
 */
export const SHIFT = {
  bands: [
    { tolerance: 60, quality: 'PERFECT' as const, shiftTime: 0.1, torqueMultiplier: 1.06 },
    { tolerance: 170, quality: 'GREAT' as const, shiftTime: 0.17, torqueMultiplier: 1.0 },
    { tolerance: 380, quality: 'GOOD' as const, shiftTime: 0.3, torqueMultiplier: 0.93 },
    { tolerance: 800, quality: 'MISS' as const, shiftTime: 0.46, torqueMultiplier: 0.84 },
    { tolerance: Infinity, quality: 'BAD' as const, shiftTime: 0.62, torqueMultiplier: 0.72 },
  ],
} as const;

/**
 * Normalised torque curve, sampled at 500 RPM steps across the useful range.
 *
 * The shape is chosen so that **power peaks in a plateau that ends exactly on
 * the 6,000 RPM shift point**, which is what makes the core mechanic honest:
 *
 *   Tractive force = power / road speed, so for any given speed the fastest gear
 *   is simply the one that puts the engine nearest peak power. Power here is flat
 *   from ~4,545 to 6,000 RPM (the gear spacing is 1.32, so an upshift at 6,000
 *   lands at ~4,545) and falls away on both sides.
 *
 * That means holding a gear past 6,000 loses power, shifting early drops you
 * below the plateau, and shifting at 6,000 is genuinely the fastest line.
 */
export const TORQUE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.42],
  [500, 0.52],
  [1000, 0.62],
  [1500, 0.71],
  [2000, 0.79],
  [2500, 0.86],
  [3000, 0.92],
  [3500, 0.96],
  [4000, 0.99],
  [4500, 1.0],
  [5000, 0.93],
  [5500, 0.845],
  [6000, 0.765],
  [6500, 0.685],
  [7000, 0.6],
  [7500, 0.555],
  [8000, 0.52],
];

export interface AiProfile {
  label: string;
  /** Std-dev of AI's shift-RPM error, in RPM. */
  shiftSigma: number;
  /** Max AI error when it picks its launch RPM. */
  launchErrorMax: number;
  /** How often (0..1) the AI drops a shift entirely. */
  fumbleChance: number;
  aiUpgradeBonus: number;
}

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  easy: {
    label: 'Rookie',
    shiftSigma: 400,
    launchErrorMax: 1000,
    fumbleChance: 0.22,
    aiUpgradeBonus: -0.3,
  },
  medium: {
    label: 'Contender',
    shiftSigma: 265,
    launchErrorMax: 520,
    fumbleChance: 0.18,
    aiUpgradeBonus: -0.06,
  },
  hard: {
    label: 'Factory',
    shiftSigma: 155,
    launchErrorMax: 245,
    fumbleChance: 0.06,
    aiUpgradeBonus: 0.12,
  },
};

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'medium';

/**
 * There is no boot scene: every texture is generated procedurally inside
 * `RaceScene.create`, so the React shell can hand over the race payload directly.
 */
export const SCENE_KEYS = {
  race: 'RaceScene',
} as const;

export const PHASER = {
  /** Virtual width/height of the pixel-art race canvas. */
  width: 480,
  height: 270,
  zoom: 3,
  backgroundColor: '#08090f',
} as const;