import { CIRCUIT_AI_PROFILES, type CircuitAiProfile, type CircuitInput, type Circuit, type CircuitStats } from './types';
import { Rng } from '../ai/aiDriver';
import {
  circuitPointAt,
  downforceAt,
  safeCornerSpeed,
  circuitStats,
  type CircuitCar,
} from './vehiclePhysics';
import { CIRCUIT, PHYSICS } from '../config';
import { clamp } from './mathUtils';
import type { AiDifficulty, UpgradeLevels } from '../types';

/**
 * Fraction of the theoretical braking deceleration the AI plans around.
 *
 * The estimate must be conservative: while cornering, the tires can
 * only spare a share of their grip for braking, and the AI cannot see
 * the exact ideal line. Planning with the full straight-line decel is
 * what makes an AI arrive at a corner far too hot, so this deliberately
 * undershoots.
 */
const BRAKE_SAFETY = 0.7;

/**
 * Offline AI opponent for circuit practice.
 *
 * The AI drives with the same physics as the player: it
 * scans the road ahead for the slowest corner, brakes to
 * its own target speed, and lifts off if it is marginally
 * over. Skill only changes the target speed, the reaction
 * time and how often the braking point is missed — never
 * the physics, so a beatable AI is a fair AI.
 *
 * Every random choice comes from a seeded `Rng`, so the
 * same seed produces the same race.
 */
export class CircuitAiDriver {
  readonly profile: CircuitAiProfile;
  readonly stats: CircuitStats;
  /** This car's personal speed multiplier (per-car variety). */
  readonly paceFactor: number;

  private rng: Rng;
  /** Base racing line, metres of lateral offset. */
  private baseLine: number;
  private phase = 0;
  /** Extra braking delay for the current corner, seconds. */
  private reactionError = 0;
  private cornerActive = false;
  private time = 0;

  constructor(setup: {
    difficulty: AiDifficulty;
    levels: UpgradeLevels;
    seed: number;
    baseLine: number;
  }) {
    this.profile = CIRCUIT_AI_PROFILES[setup.difficulty];
    this.stats = circuitStats(setup.levels, this.profile.upgradeBonus);
    this.baseLine = setup.baseLine;
    this.rng = new Rng(setup.seed || 0x51ed5eed);
    // Per-car pace jitter: deterministic, and never faster than
    // the difficulty allows.
    this.paceFactor = this.profile.speedFactor * (0.975 + this.rng.next() * 0.05);
    this.phase = this.rng.next() * Math.PI * 2;
  }

  /** Racing line for this car at distance `s` along the track. */
  lineOffsetAt(s: number): number {
    const limit = CIRCUIT.trackHalfWidthM - 2.5;
    const wave = Math.sin(s * 0.0035 + this.phase) * 1.4;
    return clamp(this.baseLine + wave, -limit, limit);
  }

  /** Inputs for the next physics frame. */
  update(dt: number, car: CircuitCar, circuit: Circuit): CircuitInput {
    void dt;
    this.time += dt;
    const st = car.state;
    const stats = this.stats;

    // Conservative braking deceleration: the lesser of what the tires
    // can hold (using the *current* downforce, which the AI can feel)
    // and what the service brakes can deliver, trimmed by a safety
    // margin. This accounts for the grip the car is already spending
    // on cornering instead of assuming the full straight-line figure.
    const downforce = downforceAt(stats, st.v);
    const gripDecel = stats.tireGrip * PHYSICS.gravity * (1 + downforce);
    const mechanicalDecel = (stats.brakeForceN * 2.2) / stats.massKg;
    const brakeDecel = Math.max(2.5, Math.min(gripDecel, mechanicalDecel) * BRAKE_SAFETY);

    // Reaction delay (longer on a mistake) eats into the distance the
    // AI can actually use for braking: a late reaction brakes later.
    const reaction = Math.max(0.15, this.profile.reactionS - this.reactionError);
    const horizon = (st.v * st.v) / (2 * brakeDecel) + st.v * reaction + 30;

    // For every point ahead, the fastest the AI may be *now* and still
    // shed down to that point's safe speed by the time it arrives:
    //   vNow = sqrt(vCorner² + 2·a·d)
    // Taking the minimum over the horizon yields a braking curve that
    // hugs top speed on the straights and starts braking exactly early
    // enough for the slowest corner inside the window.
    let targetV = stats.topSpeedMps * this.paceFactor;
    const scanStep = Math.max(circuit.stepM, 2);
    for (let d = 3; d <= horizon; d += scanStep) {
      const usable = d - st.v * reaction;
      if (usable <= 0) continue;
      const point = circuitPointAt(circuit, st.s + d);
      const cornerV = safeCornerSpeed(point.curvature, stats) * this.paceFactor;
      const allowed = Math.sqrt(cornerV * cornerV + 2 * brakeDecel * usable);
      if (allowed < targetV) targetV = allowed;
    }
    targetV = Math.max(4, targetV);

    // A corner is ahead when the car has to slow meaningfully. Roll the
    // mistake once per corner so a lapse is a one-off, not a trait.
    const cornerAhead = targetV < st.v - 6;
    if (cornerAhead && !this.cornerActive) {
      this.cornerActive = true;
      this.reactionError =
        this.rng.next() < this.profile.mistakeChance
          ? this.profile.reactionS * (0.6 + this.rng.next() * 0.9)
          : 0;
    } else if (!cornerAhead) {
      this.cornerActive = false;
      this.reactionError = 0;
    }

    const input: CircuitInput = { throttle: false, brake: false };
    if (st.v < targetV - 1.5) {
      input.throttle = true;
    } else if (st.v > targetV + 1.2) {
      input.brake = true;
    }
    return input;
  }
}
