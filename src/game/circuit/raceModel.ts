import { CIRCUIT } from '../config';
import { CircuitAiDriver } from './circuitAi';
import { CircuitCar, circuitStats } from './vehiclePhysics';
import type {
  CarSpec,
  Circuit,
  CircuitInput,
  CircuitPhase,
  CircuitRaceResult,
  Standing,
} from './types';

/**
 * Race orchestration: grid, countdown, laps, positions and
 * results.
 *
 * Like the drag-race `Drivetrain`, the model owns no
 * rendering and no wall-clock time — it advances in fixed
 * steps fed by the scene, so a race is fully reproducible
 * from its seed and the player's inputs.
 */

/** Seconds after the player finishes before the race ends. */
const FINISH_GRACE_S = 3.0;
/** Hard ceiling so a stuck car can never hang a race. */
const RACE_LIMIT_S = 240;

export class CircuitRaceModel {
  readonly circuit: Circuit;
  readonly totalLaps: number;
  /** Cars in grid order; the player starts at the back. */
  readonly cars: CircuitCar[];
  readonly specs: CarSpec[];
  readonly playerIndex: number;
  phase: CircuitPhase = 'countdown';
  countdownT = 0;
  raceTime = 0;

  private ai: Array<CircuitAiDriver | null> = [];

  constructor(config: {
    circuit: Circuit;
    specs: CarSpec[];
    totalLaps: number;
    seed: number;
    difficulty: 'easy' | 'medium' | 'hard';
  }) {
    this.circuit = config.circuit;
    this.specs = config.specs;
    this.totalLaps = config.totalLaps;
    this.playerIndex = config.specs.findIndex((spec) => spec.isPlayer);

    this.cars = config.specs.map((spec, index) => {
      const stats = circuitStats(spec.levels);
      const car = new CircuitCar(stats, spec.lineOffset);
      const row = Math.floor(index / 2);
      const column = index % 2;
      car.reset(
        this.circuit,
        -10 - row * 8,
        column === 0 ? -3.4 : 3.4,
      );
      return car;
    });

    this.ai = config.specs.map((spec, index) => {
      if (spec.isPlayer) return null;
      return new CircuitAiDriver({
        difficulty: config.difficulty,
        levels: spec.levels,
        seed: (config.seed >>> 0) + index * 104729 + 7919,
        baseLine: spec.lineOffset,
      });
    });
  }

  /** 0..3 during the countdown (3, 2, 1, GO), -1 once racing. */
  get countdownStep(): number {
    if (this.phase !== 'countdown') return -1;
    return Math.min(
      CIRCUIT.countdownSteps,
      Math.floor(this.countdownT / CIRCUIT.countdownStepS),
    );
  }

  /** Total countdown length in seconds. */
  get countdownLength(): number {
    return (CIRCUIT.countdownSteps + 1) * CIRCUIT.countdownStepS;
  }

  update(dt: number, playerInput: CircuitInput): void {
    if (this.phase === 'countdown') {
      this.countdownT += dt;
      if (this.countdownT >= this.countdownLength) {
        this.phase = 'racing';
        this.raceTime = 0;
      }
      return;
    }
    if (this.phase !== 'racing') return;

    this.raceTime += dt;

    for (let index = 0; index < this.cars.length; index += 1) {
      const car = this.cars[index];
      const driver = this.ai[index];
      const input =
        index === this.playerIndex
          ? playerInput
          : driver!.update(dt, car, this.circuit);
      if (driver) car.lineOffset = driver.lineOffsetAt(car.state.s);
      const prevS = car.state.s;
      car.update(dt, input, this.circuit);
      this.trackLap(car, prevS);
    }

    const player = this.cars[this.playerIndex];
    if (player.state.finished) {
      const allFinished = this.cars.every((car) => car.state.finished);
      if (allFinished || this.raceTime - player.state.finishTime > FINISH_GRACE_S) {
        this.phase = 'finished';
      }
    }
    if (this.raceTime > RACE_LIMIT_S) this.phase = 'finished';
  }

  /** Detects start/finish crossings and records lap times. */
  private trackLap(car: CircuitCar, prevS: number): void {
    const st = car.state;
    const length = this.circuit.length;
    const prevCount = Math.floor(prevS / length);
    const newCount = Math.floor(st.s / length);
    if (newCount <= prevCount) return;

    if (st.lap === 0) {
      // Crossing the line for the first time starts lap 1.
      st.lap = 1;
      st.lastLapStart = this.raceTime;
    } else {
      st.lapTimes.push(this.raceTime - st.lastLapStart);
      st.lastLapStart = this.raceTime;
      st.lap += 1;
    }
    if (st.lap > this.totalLaps && !st.finished) {
      st.finished = true;
      st.finishTime = this.raceTime;
    }
  }

  /** Progress comparison: finished cars by time, then by distance. */
  private compareProgress(a: CircuitCar, b: CircuitCar): number {
    const sa = a.state;
    const sb = b.state;
    if (sa.finished && sb.finished) return sa.finishTime - sb.finishTime;
    if (sa.finished) return -1;
    if (sb.finished) return 1;
    const pa = sa.lap * this.circuit.length + sa.s;
    const pb = sb.lap * this.circuit.length + sb.s;
    return pb - pa;
  }

  /** Live standings, position 1 first. */
  standings(): Standing[] {
    const order = this.cars
      .map((car, index) => ({ car, spec: this.specs[index] }))
      .sort((a, b) => this.compareProgress(a.car, b.car));
    return order.map((entry, index) =>
      this.standingFor(entry.car, entry.spec, index + 1),
    );
  }

  private standingFor(car: CircuitCar, spec: CarSpec, position: number): Standing {
    const st = car.state;
    const bestLap =
      st.lapTimes.length > 0 ? Math.min(...st.lapTimes) : null;
    return {
      position,
      label: spec.label,
      color: spec.color,
      isPlayer: spec.isPlayer,
      finished: st.finished,
      totalTime: st.finished ? st.finishTime : null,
      bestLap,
      lapTimes: [...st.lapTimes],
    };
  }

  /** Final result, computed once the race is finished. */
  result(): CircuitRaceResult {
    const standings = this.standings();
    const playerStanding = standings.find((standing) => standing.isPlayer);
    const player = this.cars[this.playerIndex].state;
    return {
      standings,
      playerPosition: playerStanding?.position ?? standings.length,
      playerTotalTime: player.finished ? player.finishTime : null,
      playerBestLap:
        player.lapTimes.length > 0 ? Math.min(...player.lapTimes) : null,
      playerLapTimes: [...player.lapTimes],
      totalLaps: this.totalLaps,
      circuitName: this.circuit.name,
      circuitSeed: this.circuit.seed,
      circuitLength: Math.round(this.circuit.length),
    };
  }
}
