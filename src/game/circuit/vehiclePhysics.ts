import { AIR_DENSITY, PHYSICS } from '../config';
import { deriveStats, estimateTopSpeedKph, peakPowerKw } from '../physics/carStats';
import { clamp } from './mathUtils';
import type {
  Circuit,
  CircuitCarState,
  CircuitInput,
  CircuitPoint,
  CircuitStats,
  GripState,
} from './types';
import type { UpgradeLevels } from '../types';

/**
 * Circuit-car physics.
 *
 * The car is a slot car: a steering servo aims it at the racing
 * line, and the player only manages throttle and brake. Cornering
 * emerges from a single honest budget — the tires can rotate the
 * car at `µ·m·g·(1 + downforce) / (m·v)` radians per second.
 * When the track demands more yaw than the budget allows, the
 * car understeers, drifts to the outside, scrubs speed and can
 * spin. Braking shares the same tire budget, so braking while
 * cornering hard can lock the wheels.
 *
 * Deterministic and engine-agnostic: fixed 1/120 s sub-steps,
 * no Phaser, no React, no wall-clock time.
 */

// ------------------------------------------------------------ constants --

const G = PHYSICS.gravity;
/** Engine acceleration shape reference speed, m/s. */
const ACCEL_REF_SPEED = 8;
/** Engine force falloff exponent against top speed. */
const ACCEL_EXPONENT = 1.7;
/** Fraction of the grip budget usable for drive force. */
const TRACTION_CAP_FACTOR = 0.92;
/** Lift-off engine braking, m/s^2. */
const ENGINE_BRAKE = 1.5;

/** Service brakes request this multiple of the brake force table. */
const BRAKE_BOOST = 2.2;
/** How much cornering load steals from braking grip (0..1). */
const BRAKE_LOAD_SHARE = 0.9;
/** Seconds of sustained over-demand before lock-up is fully built. */
const BRAKE_LOCKUP_BUILD = 0.45;
/** Seconds for lock-up to fade after release. */
const BRAKE_LOCKUP_DECAY = 0.35;
/** Lock-up effectiveness floor: braking while locked. */
const LOCKUP_EFFECTIVENESS = 0.55;
/** Lock-up adds this much slide per second while active. */
const SLIDE_FROM_LOCKUP = 0.8;

const SLIDE_GAIN = 1.35;
const SLIDE_ATTACK = 4;
const SLIDE_DECAY = 2.5;
/** Speed scrub per unit of slide, m/s^2. */
const SLIDE_SCRUB = 7;

/** Slide intensity that risks a spin. */
const SPIN_SLIDE = 1.35;
/** Sustained time over the spin threshold, seconds. */
const SPIN_TIME = 0.28;
const SPIN_DURATION = 1.15;
const SPIN_RECOVER_SPEED = 7;
/** Invulnerability after a spin so recoveries cannot chain. */
const INVULN_TIME = 0.6;

/** Extra drag off-track, m/s^2 at full depth. */
const OFFTRACK_DRAG = 9;
/** Metres of runoff beyond the track edge before the wall. */
const WALL_MARGIN = 5;
/** Wall hit speed damping per second. */
const WALL_HIT = 5;
/** Wall impact speed that causes a spin, m/s. */
const WALL_SPIN_SPEED = 22;

/** Steering servo gain, 1/s. */
const STEER_RESPONSE = 6;
/** Centering bias: radians of heading per metre off the line. */
const CENTER_GAIN = 0.06;
/** Desperate centering while off-track. */
const OFFTRACK_CENTER_GAIN = 0.1;
/** Fraction of the grip budget the servo may use. */
const YAW_AUTHORITY = 0.92;
/** Speed floor for the yaw-authority calculation, m/s. */
const MIN_SPEED_YAW = 4;

// ------------------------------------------------------------- derived --

/** Turns upgrade levels into circuit-car physical numbers. */
export function circuitStats(levels: UpgradeLevels, bonus = 0): CircuitStats {
  const base = deriveStats(levels, bonus);
  const powerKw = peakPowerKw(base);
  return {
    massKg: base.massKg,
    powerKw,
    topSpeedMps: Math.max(20, estimateTopSpeedKph(base) / 3.6),
    accelBase: (powerKw * 1000) / (base.massKg * ACCEL_REF_SPEED),
    brakeForceN: base.brakeForceN,
    tireGrip: base.tireGrip,
    dragArea: base.dragArea * 0.55,
    aeroDownforce: 0.3 + 0.3 * (levels.aero - 1),
    brakeGripBonus: 1 + 0.18 * (levels.brakes - 1),
  };
}

/** Downforce multiplier at speed: `aeroC * (v / vTop)^2`. */
export function downforceAt(stats: CircuitStats, v: number): number {
  const t = stats.topSpeedMps > 0 ? v / stats.topSpeedMps : 0;
  return stats.aeroDownforce * t * t;
}

/** Total cornering grip budget in N at speed. */
export function cornerBudget(stats: CircuitStats, v: number): number {
  return stats.tireGrip * stats.massKg * G * (1 + downforceAt(stats, v));
}

/**
 * Fastest speed the car can take a corner of `curvature`
 * (signed, 1/m) without exceeding its grip budget.
 */
export function safeCornerSpeed(curvature: number, stats: CircuitStats): number {
  const absK = Math.abs(curvature);
  if (absK < 1e-5) return stats.topSpeedMps;
  const muG = stats.tireGrip * G;
  // Solve  m·v²·κ = µ·m·g·(1 + aeroC·(v/vTop)²)  for v.
  const aeroTerm = (muG * stats.aeroDownforce) / (stats.topSpeedMps * stats.topSpeedMps);
  const denom = absK - aeroTerm;
  if (denom <= 1e-7) return stats.topSpeedMps;
  return Math.min(stats.topSpeedMps, Math.sqrt(muG / denom));
}

/** Green / yellow / red from a demand-to-budget ratio. */
export function gripStateFor(ratio: number): GripState {
  if (ratio < 0.85) return 'green';
  if (ratio < 1.0) return 'yellow';
  return 'red';
}

/** Normalises an angle to [-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Interpolated centreline point at any distance along the loop. */
export function circuitPointAt(circuit: Circuit, s: number): CircuitPoint {
  const samples = circuit.samples;
  const n = samples.length;
  let norm = s % circuit.length;
  if (norm < 0) norm += circuit.length;
  const index = Math.floor(norm / circuit.stepM) % n;
  const next = (index + 1) % n;
  const frac = clamp((norm - index * circuit.stepM) / circuit.stepM, 0, 1);
  const a = samples[index];
  const b = samples[next];
  const lerp = (x: number, y: number): number => x + (y - x) * frac;
  let tx = lerp(a.tx, b.tx);
  let ty = lerp(a.ty, b.ty);
  const tlen = Math.hypot(tx, ty) || 1;
  tx /= tlen;
  ty /= tlen;
  return {
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    tx,
    ty,
    nx: ty,
    ny: -tx,
    curvature: lerp(a.curvature, b.curvature),
  };
}

/** World position of a car at `(s, lat)`. */
export function carWorldPosition(
  circuit: Circuit,
  s: number,
  lat: number,
): { x: number; y: number } {
  const point = circuitPointAt(circuit, s);
  return { x: point.x + lat * point.nx, y: point.y + lat * point.ny };
}

// --------------------------------------------------------------- car --

function freshState(): CircuitCarState {
  return {
    s: 0,
    lat: 0,
    latVel: 0,
    v: 0,
    slide: 0,
    spinAccum: 0,
    spinTimer: 0,
    spinAngle: 0,
    lockup: 0,
    offTrack: false,
    invuln: 0,
    lap: 0,
    finished: false,
    finishTime: 0,
    lapTimes: [],
    lastLapStart: 0,
    heading: 0,
    cornerRatio: 0,
    brakeRatio: 0,
    gripRatio: 0,
    gripState: 'green',
  };
}

/**
 * One circuit car.
 *
 * The player never steers: the servo keeps the car on its racing
 * line for as long as the tires allow. Every effect in the game
 * — slides, spins, lock-ups, off-track excursions — falls out of
 * the same grip budget, so outcomes are predictable from the
 * car's setup and the driver's speed choices.
 */
export class CircuitCar implements CircuitCar {
  readonly stats: CircuitStats;
  readonly state: CircuitCarState;
  /** Preferred racing line, metres of lateral offset. */
  lineOffset = 0;

  constructor(stats: CircuitStats, lineOffset = 0) {
    this.stats = stats;
    this.state = freshState();
    this.lineOffset = lineOffset;
  }

  /** Places the car on the grid, aligned to the centreline. */
  reset(circuit: Circuit, s: number, lat: number): void {
    const point = circuitPointAt(circuit, s);
    this.state.s = s;
    this.state.lat = lat;
    this.state.latVel = 0;
    this.state.v = 0;
    this.state.slide = 0;
    this.state.spinAccum = 0;
    this.state.spinTimer = 0;
    this.state.spinAngle = 0;
    this.state.lockup = 0;
    this.state.offTrack = false;
    this.state.invuln = 0;
    this.state.lap = 0;
    this.state.finished = false;
    this.state.finishTime = 0;
    this.state.lapTimes = [];
    this.state.lastLapStart = 0;
    this.state.heading = Math.atan2(point.ty, point.tx);
    this.state.cornerRatio = 0;
    this.state.brakeRatio = 0;
    this.state.gripRatio = 0;
    this.state.gripState = 'green';
  }

  /** Fixed-sub-step update, frame-rate independent. */
  update(dt: number, input: CircuitInput, circuit: Circuit): void {
    let remaining = Math.min(dt, 1 / 30);
    while (remaining > 1e-6) {
      const sub = Math.min(remaining, 1 / 120);
      this.step(sub, input, circuit);
      remaining -= sub;
    }
  }

  private step(dt: number, input: CircuitInput, circuit: Circuit): void {
    const st = this.state;
    const stats = this.stats;
    const point = circuitPointAt(circuit, st.s);
    const kappa = point.curvature;
    const tangentAngle = Math.atan2(point.ty, point.tx);

    // ------------------------------------------------ grip budgets --
    const budget = cornerBudget(stats, st.v);
    const availableYaw = budget / (stats.massKg * Math.max(st.v, MIN_SPEED_YAW));
    const trackError = wrapAngle(tangentAngle - st.heading);
    const centering = st.offTrack ? OFFTRACK_CENTER_GAIN : CENTER_GAIN;
    const demandYaw = Math.abs(
      st.v * kappa + centering * st.v * Math.sin(trackError),
    );
    const yawRatio = demandYaw / Math.max(availableYaw, 1e-6);
    const cornerRatio =
      (stats.massKg * st.v * st.v * Math.abs(kappa)) / Math.max(budget, 1);

    // ------------------------------------------------------- slide --
    const slideTarget = yawRatio > 1 ? (yawRatio - 1) * SLIDE_GAIN : 0;
    const rate = slideTarget > st.slide ? SLIDE_ATTACK : SLIDE_DECAY;
    st.slide += (slideTarget - st.slide) * Math.min(1, rate * dt);
    if (st.slide < 0.002) st.slide = 0;

    // --------------------------------------------------------- spin --
    if (st.invuln > 0) st.invuln = Math.max(0, st.invuln - dt);
    if (st.spinTimer > 0) {
      st.spinTimer -= dt;
      st.v += (SPIN_RECOVER_SPEED - st.v) * Math.min(1, 6 * dt);
      st.heading += (Math.PI * 2 * dt) / SPIN_DURATION;
      st.slide = 0;
      if (st.spinTimer <= 0) {
        st.spinTimer = 0;
        st.heading = tangentAngle;
        st.invuln = INVULN_TIME;
      }
    } else if (st.slide >= SPIN_SLIDE && st.invuln <= 0) {
      st.spinAccum += dt;
      if (st.spinAccum >= SPIN_TIME) {
        st.spinAccum = 0;
        st.spinTimer = SPIN_DURATION;
        st.slide = 0;
        st.lockup = Math.min(st.lockup, 0.3);
      }
    } else {
      st.spinAccum = Math.max(0, st.spinAccum - 2 * dt);
    }

    // --------------------------------------------------- longitudinal --
    let accel = 0;
    const downforce = downforceAt(stats, st.v);
    if (input.throttle && st.spinTimer <= 0) {
      const speedFactor = Math.max(
        0,
        1 - Math.pow(st.v / stats.topSpeedMps, ACCEL_EXPONENT),
      );
      let engineAccel = stats.accelBase * speedFactor;
      const tractionCap = stats.tireGrip * G * (1 + downforce) * TRACTION_CAP_FACTOR;
      engineAccel = Math.min(engineAccel, tractionCap);
      accel += engineAccel;
    } else {
      accel -= ENGINE_BRAKE;
    }

    // -------------------------------------------------------- brake --
    let brakeDecel = 0;
    st.brakeRatio = 0;
    if (input.brake && st.spinTimer <= 0) {
      const requested = stats.brakeForceN * BRAKE_BOOST;
      const lateralLoad = Math.min(1, yawRatio);
      const available = budget * stats.brakeGripBonus * (1 - lateralLoad * BRAKE_LOAD_SHARE);
      st.brakeRatio = requested / Math.max(available, 1);
      if (st.brakeRatio > 1.02) {
        st.lockup = Math.min(1, st.lockup + dt / BRAKE_LOCKUP_BUILD);
      } else {
        st.lockup = Math.max(0, st.lockup - dt / BRAKE_LOCKUP_DECAY);
      }
      const effectiveness =
        1 - st.lockup * (1 - LOCKUP_EFFECTIVENESS);
      brakeDecel = (Math.min(requested, available) * effectiveness) / stats.massKg;
      // Locked wheels unsettle the car a little.
      st.slide = Math.min(2, st.slide + st.lockup * SLIDE_FROM_LOCKUP * dt);
    } else {
      st.lockup = Math.max(0, st.lockup - dt / BRAKE_LOCKUP_DECAY);
    }

    // ---------------------------------------------------- off-track --
    const absLat = Math.abs(st.lat);
    st.offTrack = absLat > circuit.halfWidth;
    let offTrackDrag = 0;
    if (st.offTrack) {
      const depth = Math.min(1, (absLat - circuit.halfWidth) / 3);
      offTrackDrag = OFFTRACK_DRAG * (0.4 + 0.6 * depth);
    }

    const aeroDrag =
      (0.5 * AIR_DENSITY * stats.dragArea * st.v * st.v) / stats.massKg;
    const rolling = PHYSICS.rollingResistanceCoefficient * G;
    const slideScrub = st.slide * SLIDE_SCRUB;

    const net = accel - aeroDrag - rolling - brakeDecel - offTrackDrag - slideScrub;
    st.v = Math.max(0, st.v + net * dt);

    // ---------------------------------------------------- steering --
    const desiredHeading = tangentAngle + centering * st.lat;
    const steerError = wrapAngle(desiredHeading - st.heading);
    const maxYaw = availableYaw * YAW_AUTHORITY;
    const yaw = clamp(steerError * STEER_RESPONSE, -maxYaw, maxYaw);
    if (st.spinTimer <= 0) {
      st.heading += yaw * dt;
    }

    // ---------------------------------------------------- advance --
    if (st.spinTimer > 0) {
      // A spun car slides straight-ish while the wheels regain bite.
      st.s += st.v * dt * 0.9;
      st.lat -= st.lat * Math.min(1, 2.5 * dt);
      st.latVel = 0;
    } else {
      st.s += st.v * Math.cos(trackError) * dt;
      st.lat += st.v * Math.sin(trackError) * dt;
    }

    // -------------------------------------------------------- wall --
    const wallLimit = circuit.halfWidth + WALL_MARGIN;
    if (absLat > wallLimit) {
      st.lat = Math.sign(st.lat) * wallLimit;
      const impact = st.v;
      st.v *= Math.max(0, 1 - WALL_HIT * dt);
      if (impact > WALL_SPIN_SPEED && st.invuln <= 0 && st.spinTimer <= 0) {
        st.spinTimer = SPIN_DURATION;
        st.slide = 0;
        st.spinAccum = 0;
      }
    }

    // --------------------------------------------------- readouts --
    st.cornerRatio = cornerRatio;
    st.gripRatio = Math.max(yawRatio, st.brakeRatio);
    st.gripState = gripStateFor(st.gripRatio);
  }
}
