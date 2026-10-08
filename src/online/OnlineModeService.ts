/**
 * Client-side online mode service.
 *
 * There is no backend in this prototype, so `available` is false and every
 * attempt to enter a lobby resolves to `unavailable` with a reason. That is the
 * whole point of having the service: the UI reads one session object and tells
 * the truth, instead of inventing opponents or inventing a match.
 *
 * When a server exists, implement it behind this same surface: push snapshots
 * into the `OnlineOpponentSource`, flip `serverAuthoritative` results back into
 * the race, and let matchmaking fill `playersInLobby`.
 */

export const MATCHMAKING_TIMEOUT_S = 30;

export type OnlineStatus = 'offline' | 'connecting' | 'in-lobby' | 'unavailable';

export type OnlineKind = 'practice' | 'ranked';

export interface OnlineSession {
  kind: OnlineKind;
  status: OnlineStatus;
  /** False while no server is configured for this build. */
  available: boolean;
  /** Always true: the server, never the client, decides the result. */
  serverAuthoritative: true;
  /** Set when `available` is false. */
  reason: string | null;
  /** Local ready-up flag. */
  ready: boolean;
  /** Server-reported lobby size, null when unknown. */
  playersInLobby: number | null;
  matchmakingSecondsLeft: number | null;
}

type Listener = (session: OnlineSession) => void;

export class OnlineModeService {
  private session: OnlineSession = {
    kind: 'practice',
    status: 'offline',
    available: false,
    serverAuthoritative: true,
    reason: null,
    ready: false,
    playersInLobby: null,
    matchmakingSecondsLeft: null,
  };

  private listeners = new Set<Listener>();
  private timer: number | null = null;

  snapshot(): OnlineSession {
    return this.session;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Enters the lobby. Resolves to `unavailable` while no server is configured. */
  connect(kind: OnlineKind): void {
    this.stopTimer();
    this.publish({
      ...this.session,
      kind,
      status: 'connecting',
      reason: null,
      ready: false,
      playersInLobby: null,
      matchmakingSecondsLeft: MATCHMAKING_TIMEOUT_S,
    });

    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.publish({
        ...this.session,
        status: 'unavailable',
        available: false,
        reason: 'No matchmaking server is configured for this build. Offline AI races are fully playable.',
        ready: false,
        playersInLobby: null,
        matchmakingSecondsLeft: null,
      });
    }, 600);
  }

  setReady(ready: boolean): void {
    this.publish({ ...this.session, ready });
  }

  leave(): void {
    this.stopTimer();
    this.publish({
      ...this.session,
      status: 'offline',
      ready: false,
      playersInLobby: null,
      matchmakingSecondsLeft: null,
      reason: null,
    });
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private publish(next: OnlineSession): void {
    this.session = next;
    for (const listener of this.listeners) listener(next);
  }
}

export const onlineModeService = new OnlineModeService();
