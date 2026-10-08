import type { CarDefinition } from '../car/carData';
import { AiDriver, type AiSetup } from '../ai/aiDriver';
import { Drivetrain, IDLE_INPUT, type CarInput } from '../physics/drivetrain';
import type { CarStats } from '../physics/carStats';
import type { RaceAuthority } from '../types';

/**
 * The seam between the race scene and whatever is driving the other car.
 *
 * `RaceScene` only ever talks to this interface, so swapping the scripted AI
 * for a server-driven opponent is a constructor change rather than a rewrite of
 * the loop. The scene still owns the physics: every opponent hands back inputs
 * and the same `Drivetrain` integrates them.
 */
export interface RaceOpponent {
  readonly kind: 'ai' | 'online';
  /** Display name in the race header and the result card. */
  readonly label: string;
  readonly car: CarDefinition;
  readonly drivetrain: Drivetrain;
  /** Who is allowed to decide the result. Always stated, never implied. */
  readonly authority: RaceAuthority;
  /** False until the opponent can actually be driven (e.g. no server yet). */
  readonly ready: boolean;
  /** Revs built on the line during staging. */
  stagingRevs(dt: number, holding: boolean, currentRevs: number): number;
  /** Inputs for the next physics frame. */
  readInput(dt: number): CarInput;
}

// --------------------------------------------------------------------- AI --

/** Wraps the existing scripted driver so `RaceScene` no longer knows about it. */
export class AIOpponent implements RaceOpponent {
  readonly kind = 'ai' as const;
  readonly authority: RaceAuthority = 'local-ai';
  readonly ready = true;
  readonly car: CarDefinition;
  readonly drivetrain: Drivetrain;
  readonly label: string;

  private readonly driver: AiDriver;

  constructor(car: CarDefinition, setup: AiSetup, label: string) {
    this.car = car;
    this.label = label;
    this.driver = new AiDriver(setup);
    this.drivetrain = this.driver.car;
  }

  stagingRevs(dt: number, holding: boolean, currentRevs: number): number {
    return this.driver.stagingRevs(dt, holding, currentRevs);
  }

  readInput(dt: number): CarInput {
    return this.driver.update(dt);
  }
}

// ----------------------------------------------------------------- online --

/**
 * One frame of remote car state.
 *
 * In a real match this arrives from the server; the local `Drivetrain` is then
 * either fed these inputs or overwritten wholesale by an authoritative snapshot.
 */
export interface RemoteSnapshot {
  distance: number;
  speed: number;
  rpm: number;
  gear: number;
  finished: boolean;
  finishTime: number;
  input: CarInput;
}

export interface OnlineOpponentSource {
  readonly connected: boolean;
  /** Latest snapshot, or null before the match starts. */
  latest(): RemoteSnapshot | null;
}

/**
 * Server-driven opponent.
 *
 * The scene keeps its own `Drivetrain` for the remote car so the render loop is
 * unchanged, but `authority` stays `'server'` — while `connected` is false the
 * opponent returns idle inputs and never reports a finish time, so a missing
 * server shows up as an opponent that did not move rather than as a win.
 */
export class OnlineOpponent implements RaceOpponent {
  readonly kind = 'online' as const;
  readonly authority: RaceAuthority = 'server';
  readonly car: CarDefinition;
  readonly drivetrain: Drivetrain;
  readonly label: string;

  private readonly source: OnlineOpponentSource;
  private prevUpshift = false;

  constructor(car: CarDefinition, drivetrain: Drivetrain, source: OnlineOpponentSource, label: string) {
    this.car = car;
    this.drivetrain = drivetrain;
    this.source = source;
    this.label = label;
  }

  get ready(): boolean {
    return this.source.connected && this.source.latest() !== null;
  }

  stagingRevs(_dt: number, _holding: boolean, currentRevs: number): number {
    return currentRevs;
  }

  readInput(_dt: number): CarInput {
    const snapshot = this.source.latest();
    if (!snapshot) return IDLE_INPUT;
    // Edge-trigger the remote shift so holding a stale `true` cannot spam gears.
    const upshift = snapshot.input.upshift && !this.prevUpshift;
    this.prevUpshift = snapshot.input.upshift;
    return { ...snapshot.input, upshift };
  }
}

// -------------------------------------------------------------- factory ----

/**
 * Plain-data description of the opponent, handed over by React.
 *
 * It is serialisable on purpose: the scene builds the driver in `init`, so a
 * restart always gets a freshly seeded opponent instead of one that already
 * finished the previous run.
 */
export type OpponentDescriptor =
  | {
      kind: 'ai';
      car: CarDefinition;
      label: string;
      setup: AiSetup;
    }
  | {
      kind: 'online';
      car: CarDefinition;
      label: string;
      source: OnlineOpponentSource;
      stats: CarStats;
    };

export function createOpponent(descriptor: OpponentDescriptor): RaceOpponent {
  if (descriptor.kind === 'ai') {
    return new AIOpponent(descriptor.car, descriptor.setup, descriptor.label);
  }
  return new OnlineOpponent(
    descriptor.car,
    new Drivetrain({ stats: descriptor.stats }),
    descriptor.source,
    descriptor.label,
  );
}

