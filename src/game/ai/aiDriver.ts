import { AI_PROFILES, DRIVETRAIN, LAUNCH, type AiProfile } from '../config';
import { GEAR_COUNT, type AiDifficulty, type UpgradeLevels } from '../types';
import { deriveStats, type CarStats } from '../physics/carStats';
import { Drivetrain, IDLE_INPUT, type CarInput } from '../physics/drivetrain';

/** Small xorshift so the AI is varied but still deterministic per seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x2f6e2b1;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 0xffffffff;
  }

  /** Approximately normal, mean 0, std-dev 1. */
  gaussian(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export interface AiSetup {
  difficulty: AiDifficulty;
  /** AI upgrade levels, normally a mid build. */
  levels: UpgradeLevels;
  seed?: number;
}

/**
 * The opponent. Plays with the exact same physics as the player, just with
 * scripted-but-humanlike inputs: a launch RPM guess and shift points that
 * scatter around 6000 RPM. Difficulty only changes the scatter, never the
 * physics, so the race stays beatable.
 */
export class AiDriver {
  readonly car: Drivetrain;
  readonly profile: AiProfile;
  readonly levels: UpgradeLevels;
  readonly stats: CarStats;

  /** Revs the AI revs to on the line. */
  readonly targetLaunchRpm: number;
  /** RPM the AI actually aims for on each upshift, per gear. */
  private shiftTargets: number[] = [];

  private rng: Rng;
  private fumbledThisShift = false;
  private time = 0;

  constructor(setup: AiSetup) {
    this.profile = AI_PROFILES[setup.difficulty];
    this.levels = setup.levels;
    this.stats = deriveStats(setup.levels, this.profile.aiUpgradeBonus);
    this.car = new Drivetrain({ stats: this.stats });
    this.rng = new Rng(setup.seed ?? 0x51ed5eed);

    this.targetLaunchRpm = clamp(
      LAUNCH.optimalRpm + this.rng.gaussian() * this.profile.launchErrorMax * 0.55,
      LAUNCH.optimalRpm - this.profile.launchErrorMax,
      LAUNCH.optimalRpm + this.profile.launchErrorMax,
    );

    for (let gear = 0; gear < GEAR_COUNT - 1; gear += 1) {
      this.shiftTargets.push(
        clamp(
          DRIVETRAIN.shiftUpRpm + this.rng.gaussian() * this.profile.shiftSigma,
          DRIVETRAIN.shiftUpRpm - this.profile.shiftSigma * 3,
          DRIVETRAIN.redlineRpm - 250,
        ),
      );
    }
  }

  /** RPM the AI builds on the line during staging. */
  stagingRevs(dt: number, holding: boolean, currentRevs: number): number {
    if (!holding) return currentRevs;
    // The AI is a little lazy about stabbing the gas: it revs at a steady rate
    // and tops out near its target rather than sitting on the limiter.
    const rate = LAUNCH.stagingRevRate * this.rng.range(0.72, 1.02);
    const next = Math.min(currentRevs + rate * dt, this.targetLaunchRpm + this.rng.range(0, 260));
    return next;
  }

  update(dt: number): CarInput {
    this.time += dt;
    const car = this.car;
    const input: CarInput = { ...IDLE_INPUT, throttle: true };

    if (car.gear >= GEAR_COUNT - 1) {
      input.upshift = false;
      return input;
    }

    const target = this.shiftTargets[car.gear];
    const fumbleChance = this.profile.fumbleChance;
    const headroom = fumbleChance > 0 && !this.fumbledThisShift ? this.rng.next() : 1;
    if (fumbleChance > 0 && !this.fumbledThisShift && headroom < fumbleChance) {
      // Mistake: hold the gear far too long and bang the limiter.
      this.fumbledThisShift = true;
      if (car.rpm >= DRIVETRAIN.revLimitRpm - 40) {
        input.upshift = true;
        return input;
      }
    }

    if (car.rpm >= target && !car.shifting) {
      input.upshift = true;
      this.fumbledThisShift = false;
    }
    return input;
  }

  get elapsed(): number {
    return this.time;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}