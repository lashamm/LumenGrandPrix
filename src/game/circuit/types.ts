import type { AiDifficulty, UpgradeLevels } from '../types';

/**
 * Circuit Racing — shared types.
 *
 * Everything in this folder is engine-agnostic and deterministic, the
 * same way `Drivetrain` is: the Phaser scene renders a model that
 * lives here, so the physics, the AI and the circuit generator are all
 * testable headless and reproducible from a seed.
 */

// ---------------------------------------------------------------- circuit --

/** One evenly spaced sample of the circuit centreline. */
export interface CircuitSample {
  /** World position, metres. Canvas-space (y down). */
  x: number;
  y: number;
  /** Unit tangent of travel. */
  tx: number;
  ty: number;
  /** Left-of-travel unit normal: `(ty, -tx)` in canvas space. */
  nx: number;
  ny: number;
  /** Signed curvature, 1/m. Positive turns clockwise on screen. */
  curvature: number;
}

export interface CircuitBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Circuit {
  name: string;
  /** Closed loop, evenly spaced `stepM` apart. */
  samples: CircuitSample[];
  /** Total length in metres. */
  length: number;
  /** Sample spacing in metres. */
  stepM: number;
  /** Half the drivable width in metres. */
  halfWidth: number;
  bounds: CircuitBounds;
  /** Seed this circuit was generated from (0 = predefined fallback). */
  seed: number;
}

/** Sampled point at an arbitrary distance along the loop. */
export interface CircuitPoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  curvature: number;
}

/** One control node of a circuit layout: angle in degrees, radius in metres. */
export interface LayoutNode {
  angle: number;
  radius: number;
}

// ------------------------------------------------------------------ stats --

/** Circuit-car physical numbers, derived from the upgrade levels. */
export interface CircuitStats {
  massKg: number;
  /** Peak power in kW. */
  powerKw: number;
  /** Speed where aero drag balances peak power, m/s. */
  topSpeedMps: number;
  /** Low-speed engine acceleration, m/s^2 at v=0. */
  accelBase: number;
  /** Requested service-brake force in N (before grip is applied). */
  brakeForceN: number;
  /** Tire friction coefficient µ. */
  tireGrip: number;
  /** Drag area (CdA), m^2. Formula cars run slipperier than drag cars. */
  dragArea: number;
  /** Downforce coefficient: `aeroC * (v / vTop)^2` multiplies µ·m·g. */
  aeroDownforce: number;
  /** Braking grip multiplier from the brakes upgrade. */
  brakeGripBonus: number;
}

// ------------------------------------------------------------------ input --

export interface CircuitInput {
  throttle: boolean;
  brake: boolean;
}

/**
 * Shared control state for circuit racing.
 *
 * The React control overlay writes to this object and the
 * Phaser scene reads it, exactly like the drag race's
 * `ControlState`: a mutable struct, so the simulation
 * never waits on React re-renders.
 */
export interface CircuitControlState {
  throttle: boolean;
  brake: boolean;
}

export function createCircuitControlState(): CircuitControlState {
  return { throttle: false, brake: false };
}

export type GripState = 'green' | 'yellow' | 'red';

/** Continuous state of one car on the circuit. */
export interface CircuitCarState {
  /** Distance along the centreline, metres. Negative behind the line. */
  s: number;
  /** Lateral offset from the centreline, metres. Positive = left. */
  lat: number;
  latVel: number;
  /** Road speed, m/s. */
  v: number;
  /** Slide intensity 0..~2. Drives scrub, drift and spin risk. */
  slide: number;
  /** Time spent over the spin threshold while sliding, seconds. */
  spinAccum: number;
  /** Remaining spin time, seconds. */
  spinTimer: number;
  /** Visual spin rotation while spun, radians. */
  spinAngle: number;
  /** Brake lock-up intensity 0..1. */
  lockup: number;
  offTrack: boolean;
  /** Brief invulnerability after a spin so recoveries cannot chain. */
  invuln: number;
  lap: number;
  finished: boolean;
  finishTime: number;
  lapTimes: number[];
  lastLapStart: number;
  /** Visual heading in radians, canvas space. */
  heading: number;
  /** Cornering demand as a fraction of the available grip budget. */
  cornerRatio: number;
  /** Brake demand as a fraction of the available braking grip. */
  brakeRatio: number;
  gripRatio: number;
  gripState: GripState;
}

// -------------------------------------------------------------------- AI --

export interface CircuitAiProfile {
  label: string;
  /** Multiplier on the AI's own target speed. */
  speedFactor: number;
  /** Seconds of reaction delay before braking. */
  reactionS: number;
  /** Chance per corner of missing the braking point. */
  mistakeChance: number;
  /** Upgrade bonus applied to the AI build, like the drag AI. */
  upgradeBonus: number;
}

export const CIRCUIT_AI_PROFILES: Record<AiDifficulty, CircuitAiProfile> = {
  easy: {
    label: 'Rookie',
    speedFactor: 0.87,
    reactionS: 0.5,
    mistakeChance: 0.24,
    upgradeBonus: -0.15,
  },
  medium: {
    label: 'Contender',
    speedFactor: 0.93,
    reactionS: 0.3,
    mistakeChance: 0.12,
    upgradeBonus: 0,
  },
  hard: {
    label: 'Factory',
    speedFactor: 0.985,
    reactionS: 0.17,
    mistakeChance: 0.05,
    upgradeBonus: 0.08,
  },
};

// --------------------------------------------------------------- race flow --

export type CircuitPhase = 'countdown' | 'racing' | 'finished';

export interface CarSpec {
  label: string;
  /** Hex colour used on the minimap and result card. */
  color: string;
  levels: UpgradeLevels;
  isPlayer: boolean;
  /** Preferred racing line, metres of lateral offset. */
  lineOffset: number;
}

export interface CircuitRaceSetup {
  seed: number;
  totalLaps: number;
  opponentCount: number;
  difficulty: AiDifficulty;
}

export interface Standing {
  position: number;
  label: string;
  color: string;
  isPlayer: boolean;
  finished: boolean;
  totalTime: number | null;
  bestLap: number | null;
  lapTimes: number[];
}

export interface CircuitRaceResult {
  standings: Standing[];
  playerPosition: number;
  playerTotalTime: number | null;
  playerBestLap: number | null;
  playerLapTimes: number[];
  totalLaps: number;
  circuitName: string;
  circuitSeed: number;
  circuitLength: number;
}

/** Names for the AI grid, in grid order. */export const AI_ROSTER: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'RIVAL VX', color: '#ff7a5c' },
  { label: 'KEIRO', color: '#5aa9ff' },
  { label: 'MIRA', color: '#ffd166' },
  { label: 'SOL', color: '#48d17a' },
  { label: 'VEX', color: '#b98cff' },
];
