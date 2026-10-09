import { CIRCUIT_AI_PROFILES, type CircuitAiProfile, type CircuitInput, type Circuit, type CircuitStats } from './types';
import { Rng } from '../ai/aiDriver';
import { circuitPointAt, safeCornerSpeed, circuitStats, type CircuitCar } from './vehiclePhysics';
import { CIRCUIT } from '../config';
import { clamp } from './mathUtils';
import type { AiDifficulty, UpgradeLevels } from '../types';

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

    // Distance needed to brake from the current speed, plus the
    // reaction buffer. A missed braking point shortens the
    // buffer, which is how the AI arrives late to a corner.
    const brakeDecel = (stats.brakeForceN * 2.2) / stats.massKg;
    const brakeDistance = (st.v * st.v) / (2 * brakeDecel * 0.85);
    const reaction = Math.max(
      0.15,
      this.profile.reactionS - this.reactionError,
    );
    const lookahead = brakeDistance + st.v * reaction + 12;

    // Scan ahead for the slowest safe corner.
    let targetV = stats.topSpeedMps;
    const scanStep = circuit.stepM * 2;
    for (let d = 4; d <= lookahead; d += scanStep) {
      const point = circuitPointAt(circuit, st.s + d);
      const safe = safeCornerSpeed(point.curvature, stats) * 0.995;
      if (safe < targetV) targetV = safe;
    }
    targetV *= this.paceFactor;

    // A corner is ahead when the target speed is well below the
    // current speed. Roll the mistake once per corner.
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
