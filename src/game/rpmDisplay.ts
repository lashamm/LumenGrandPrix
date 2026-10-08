import { DRIVETRAIN, MAX_RPM, RPM_GAUGE } from './config';

/**
 * The tachometer's *visual* RPM, kept deliberately separate from the engine's
 * real RPM.
 *
 * The simulation derives RPM from road speed and the active gear, so a shift
 * makes the true value jump by thousands of RPM in a single frame. Showing that
 * raw number makes the needle teleport; cutting it into the gauge instead
 * interpolates from wherever the needle currently is toward the newest target.
 *
 * Two rules keep this honest:
 *  - Nothing in the physics reads this class. Gear, torque, launch and AI all
 *    work from `Drivetrain.rpm`, which never waits for a needle.
 *  - Every frame the target is re-stated from the live engine value, so a
 *    rapid E→E→E chain re-aims mid-flight instead of queueing finished tweens:
 *    the needle simply redirects from where it is to where the engine is now.
 *
 * A first-order (exponential) follow rather than a fixed-duration tween because
 * the target itself keeps moving during acceleration — a tween would have to be
 * restarted on every frame of a chase, which is the same thing done worse.
 */
export class RpmDisplay {
  private current: number;
  private goal: number;

  constructor(initial: number = DRIVETRAIN.idleRpm) {
    this.current = clampRpm(initial);
    this.goal = this.current;
  }

  /** The value the needle should render this frame. */
  get rpm(): number {
    return this.current;
  }

  /** The engine's real RPM, for debugging and assertions. */
  get target(): number {
    return this.goal;
  }

  /** True once the needle has effectively settled on the target. */
  get settled(): boolean {
    return Math.abs(this.goal - this.current) <= RPM_GAUGE.snapThresholdRpm;
  }

  /**
   * Re-aims the needle. Called every frame with the live engine RPM, which is
   * what makes retargeting automatic: there is no animation to cancel.
   */
  setTarget(rpm: number): void {
    this.goal = clampRpm(rpm);
  }

  /** Jumps straight to a value with no transition (phase changes, restart). */
  snapTo(rpm: number): void {
    this.current = clampRpm(rpm);
    this.goal = this.current;
  }

  /**
   * Advances one frame.
   *
   * Frame-rate independent: the same `dt` progression yields the same curve
   * whether the renderer runs at 60 or 144 Hz, so the gauge feels identical
   * across machines.
   */
  update(dt: number): void {
    if (dt <= 0) return;
    const gap = this.goal - this.current;
    if (Math.abs(gap) <= RPM_GAUGE.snapThresholdRpm) {
      this.current = this.goal;
      return;
    }
    const step = 1 - Math.exp(-dt / RPM_GAUGE.timeConstant);
    this.current += gap * step;
  }
}

function clampRpm(rpm: number): number {
  if (!Number.isFinite(rpm)) return 0;
  return Math.min(MAX_RPM, Math.max(0, rpm));
}
