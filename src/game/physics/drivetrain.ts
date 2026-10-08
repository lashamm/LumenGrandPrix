import { AIR_DENSITY, DRIVETRAIN, LAUNCH, PHYSICS } from '../config';
import { GEAR_COUNT, type ShiftQuality } from '../types';
import { engineOutputFactorAt, type CarStats } from './carStats';
import {
  clampGear,
  clampRpm,
  gradeLaunch,
  gradeShift,
  rpmAfterDownshift,
  rpmAfterShift,
  rpmFromSpeed,
} from './gearbox';

export interface CarInput {
  throttle: boolean;
  /** Service brakes, applied as `stats.brakeForceN` while held. */
  brake: boolean;
  upshift: boolean;
  downshift: boolean;
}

export const IDLE_INPUT: CarInput = { throttle: false, brake: false, upshift: false, downshift: false };

export interface ShiftEvent {
  quality: ShiftQuality;
  fromGear: number;
  toGear: number;
  errorRpm: number;
}

export interface LaunchEvent {
  rpm: number;
  quality: ShiftQuality;
  accelMultiplier: number;
}

export interface DrivetrainOptions {
  stats: CarStats;
  startGear?: number;
}

const CLUTCH_SLIP_TIME = 0.7;
const LAUNCH_EFFECT_TIME = 2.0;
const SHIFT_BONUS_DECAY = 2.5;
/** Below this road speed a throttle stab from rest still slips the clutch. */
const BOG_SPEED_MPS = 6;

/**
 * One drag-race car.
 *
 * Deterministic and engine-agnostic: no Phaser, no React. Both the player's
 * car and the AI opponent are instances of this class, which keeps the race
 * provably fair (identical physics) and makes the sim testable headless.
 *
 * Gearbox model: RPM is *derived* from road speed and the active gear, which
 * is what makes "shift at 6000 RPM" a real, teachable skill. Staging revs are
 * faked through a clutch-slip term for the first moments of the run.
 */
export class Drivetrain {
  readonly stats: CarStats;

  gear: number;
  /** Distance along the strip, metres. */
  distance = 0;
  /** Road speed, m/s. */
  speed = 0;
  /** Engine speed, used by the HUD and the torque lookup. */
  rpm: number = DRIVETRAIN.idleRpm;
  throttle = false;

  finished = false;
  finishTime = 0;
  /** Distance travelled after the finish line (brake showcase). */
  rolloutDistance = 0;

  launchMultiplier = 1;
  launchTimer = 0;

  lastShift: ShiftEvent | null = null;
  shiftHistory: ShiftQuality[] = [];
  launch: LaunchEvent | null = null;
  /** True on frames where the gear changed, so the HUD can flash. */
  gearChanged = false;

  private launchRpm: number = DRIVETRAIN.idleRpm;
  private clutchSlip = 0;
  private shiftTimer = 0;
  private shiftTorqueBonus = 1;
  private input: CarInput = IDLE_INPUT;
  private prevUpshift = false;
  private prevDownshift = false;

  constructor(options: DrivetrainOptions) {
    this.stats = options.stats;
    this.gear = options.startGear ?? 0;
  }

  get totalRatio(): number {
    return DRIVETRAIN.gearRatios[clampGear(this.gear)] * DRIVETRAIN.finalDrive;
  }

  get speedKph(): number {
    return this.speed * 3.6;
  }

  get redlined(): boolean {
    return this.rpm >= DRIVETRAIN.revLimitRpm;
  }

  get shifting(): boolean {
    return this.shiftTimer > 0;
  }

  // ---------------------------------------------------------------- staging --

  /** Engine RPM while the car sits on the transbrake and the player holds GAS. */
  stagingRpm(revs: number, dt: number, holding: boolean): number {
    if (!holding) {
      return Math.max(revs - PHYSICS.engineBrakeRpm * 0.35 * dt, DRIVETRAIN.idleRpm);
    }
    const next = revs + LAUNCH.stagingRevRate * dt;
    if (next <= DRIVETRAIN.revLimitRpm) return next;
    // Bounce off the limiter — launching on the limiter is a bad launch.
    return DRIVETRAIN.revLimitRpm - (next - DRIVETRAIN.revLimitRpm) * 0.6;
  }

  /** Release the staging revs. Returns the launch grade. */
  beginRace(stagingRpm: number): LaunchEvent {
    const grade = gradeLaunch(stagingRpm);
    this.launch = { rpm: stagingRpm, quality: grade.quality, accelMultiplier: grade.accelMultiplier };
    this.launchMultiplier = grade.accelMultiplier;
    this.launchTimer = LAUNCH_EFFECT_TIME;
    this.launchRpm = clampRpm(stagingRpm);
    this.clutchSlip = CLUTCH_SLIP_TIME;
    this.rpm = this.launchRpm;
    return this.launch;
  }

  // ------------------------------------------------------------------ input --

  /**
   * Feed inputs for the next frame.
   *
   * `upshift` / `downshift` are treated as button presses and consumed on the
   * rising edge only, so holding them down does not skip through the gearbox no
   * matter how many physics sub-steps a frame contains.
   */
  setInput(input: CarInput): void {
    this.input = input;
  }

  /** True if there is a gear left to shift into. */
  get canUpshift(): boolean {
    return this.gear < GEAR_COUNT - 1;
  }

  /** True if there is a gear below to shift into. */
  get canDownshift(): boolean {
    return this.gear > 0;
  }

  // ------------------------------------------------------------------- loop --

  update(dt: number): void {
    this.gearChanged = false;
    let remaining = Math.min(dt, 1 / 30);
    while (remaining > 1e-6) {
      const sub = Math.min(remaining, 1 / 120);
      this.step(sub);
      remaining -= sub;
    }
  }

  private step(dt: number): void {
    const wasThrottle = this.throttle;
    this.throttle = this.input.throttle && !this.finished;

    // Gear requests are edge-triggered: one press, one gear.
    const upshiftEdge = this.input.upshift && !this.prevUpshift;
    const downshiftEdge = this.input.downshift && !this.prevDownshift;
    this.prevUpshift = this.input.upshift;
    this.prevDownshift = this.input.downshift;
    if (upshiftEdge) this.applyUpshift();
    if (downshiftEdge) this.applyDownshift();

    if (this.launchTimer > 0) {
      this.launchTimer = Math.max(0, this.launchTimer - dt);
      if (this.launchTimer === 0) this.launchMultiplier = 1;
    }
    if (this.clutchSlip > 0) this.clutchSlip = Math.max(0, this.clutchSlip - dt);
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.shiftTorqueBonus !== 1) {
      this.shiftTorqueBonus = approach(this.shiftTorqueBonus, 1, dt / SHIFT_BONUS_DECAY);
    }

    const engagedRpm = clampRpm(rpmFromSpeed(this.speed, this.gear));
    const slipRpm =
      this.clutchSlip > 0
        ? DRIVETRAIN.idleRpm + (this.launchRpm - DRIVETRAIN.idleRpm) * (this.clutchSlip / CLUTCH_SLIP_TIME)
        : 0;
    this.rpm = clampRpm(Math.max(engagedRpm, slipRpm));

    // --- Longitudinal forces -------------------------------------------------
    const shiftingCut = this.shiftTimer > 0 ? 0 : 1;
    const limiterCut = this.rpm >= DRIVETRAIN.revLimitRpm ? 0.12 : 1;

    let driveForce = 0;
    if (this.throttle) {
      const engineTorque =
        this.stats.peakTorqueNm * engineOutputFactorAt(this.rpm) * shiftingCut * limiterCut * this.shiftTorqueBonus;
      driveForce = (engineTorque * this.totalRatio * DRIVETRAIN.driveEfficiency) / DRIVETRAIN.wheelRadiusM;
      driveForce *= this.launchMultiplier;
      if (this.clutchSlip > 0) {
        driveForce *= 0.72 + 0.28 * (1 - this.clutchSlip / CLUTCH_SLIP_TIME);
      }
      driveForce = Math.min(driveForce, this.gripLimit());
    }

    const aeroDrag = 0.5 * AIR_DENSITY * this.stats.dragArea * this.speed * this.speed;
    const rollingDrag = PHYSICS.rollingResistanceCoefficient * this.stats.massKg * PHYSICS.gravity;
    const resistForce = aeroDrag + rollingDrag;

    // Off-throttle engine braking makes lifting off the gas visibly drop revs.
    const engineBrake = this.throttle ? 0 : Math.min(rollingDrag * 0.6 + this.stats.massKg * 0.4, resistForce + 400);
    // Held service brakes. Zero while untouched, so an idle run is untouched by it.
    const pedalBrake = this.input.brake ? this.stats.brakeForceN : 0;
    const rolloutBrake = this.finished ? this.stats.brakeForceN * 0.5 : 0;

    const netForce = driveForce - resistForce - engineBrake - pedalBrake - rolloutBrake;
    // `Math.max(0, ...)` keeps a held brake at a standstill from running backwards.
    this.speed = Math.max(0, this.speed + (netForce / this.stats.massKg) * dt);
    this.distance += this.speed * dt;

    if (this.finished) this.rolloutDistance += this.speed * dt;

    if (!wasThrottle && this.throttle && this.speed < BOG_SPEED_MPS) {
      // Stabbing the throttle from a standstill slips the clutch a little.
      this.clutchSlip = Math.max(this.clutchSlip, 0.16);
    }
  }

  /** Grip budget: static weight plus a speed-dependent downforce bonus. */
  private gripLimit(): number {
    const downforce = 0.5 * AIR_DENSITY * this.stats.dragArea * this.speed * this.speed * 1.4;
    return this.stats.tractionLimitN + downforce;
  }

  private applyUpshift(): void {
    if (this.gear >= GEAR_COUNT - 1) return;
    const fromGear = this.gear;
    const rpmBefore = this.rpm;
    const grade = gradeShift(rpmBefore);
    this.gear = clampGear(fromGear + 1);
    this.rpm = rpmAfterShift(rpmBefore, fromGear, grade);
    this.shiftTimer = grade.shiftTime;
    this.shiftTorqueBonus = grade.torqueMultiplier;
    this.lastShift = { quality: grade.quality, fromGear, toGear: this.gear, errorRpm: grade.errorRpm };
    this.shiftHistory.push(grade.quality);
    this.gearChanged = true;
  }

  private applyDownshift(): void {
    if (this.gear <= 0) return;
    const fromGear = this.gear;
    const rpmBefore = this.rpm;
    this.gear = clampGear(fromGear - 1);
    this.rpm = rpmAfterDownshift(rpmBefore, fromGear);
    this.shiftTimer = 0.16;
    this.shiftTorqueBonus = 0.94;
    this.lastShift = { quality: 'GOOD', fromGear, toGear: this.gear, errorRpm: this.rpm - DRIVETRAIN.shiftUpRpm };
    this.gearChanged = true;
  }

  markFinished(elapsedTime: number): void {
    if (this.finished) return;
    this.finished = true;
    this.finishTime = elapsedTime;
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}
