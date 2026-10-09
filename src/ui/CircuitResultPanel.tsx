import type { ReactNode } from 'react';
import type { CircuitRaceResult } from '../game/circuit/types';
import type { PlayerProfile } from '../state/storage';
import { formatTime } from './format';

/**
 * End-of-race card for circuit practice.
 *
 * The full standing, every lap of the player's race, and the
 * session's best lap. Nothing here touches the network: circuit
 * racing is offline practice, so the card only records local
 * figures.
 */
export function CircuitResultPanel({
  result,
  profile,
  onAgain,
  onSetup,
  onMenu,
}: {
  result: CircuitRaceResult;
  profile: PlayerProfile;
  onAgain: () => void;
  onSetup: () => void;
  onMenu: () => void;
}): ReactNode {
  const playerStanding = result.standings.find((standing) => standing.isPlayer);
  const verdict =
    result.playerPosition === 1
      ? 'win'
      : result.playerPosition <= Math.ceil(result.standings.length / 2)
        ? 'draw'
        : 'loss';
  const newBest =
    result.playerBestLap !== null &&
    (profile.circuitBestLap === null || result.playerBestLap < profile.circuitBestLap);

  return (
    <div className="result-overlay">
      <div className={`result-card result-card--${verdict}`}>
        <p className="result-card__verdict">
          {verdict === 'win' ? 'VICTORY' : verdict === 'draw' ? 'PODIUM' : 'FINISHED'} · P
          {result.playerPosition}
        </p>

        <dl className="result-card__times">
          <div>
            <dt>TOTAL</dt>
            <dd className="mono">
              {playerStanding?.finished ? formatTime(playerStanding.totalTime) : 'DNF'}
            </dd>
          </div>
          <div>
            <dt>BEST LAP</dt>
            <dd className="mono">{formatTime(result.playerBestLap)}</dd>
          </div>
          <div>
            <dt>SESSION BEST</dt>
            <dd className="mono">{formatTime(profile.circuitBestLap)}</dd>
          </div>
        </dl>

        {newBest && (
          <p className="panel__note" style={{ color: 'var(--accent)' }}>
            NEW BEST LAP
          </p>
        )}

        <section className="standings">
          <header className="standings__head">
            <h4>STANDINGS</h4>
            <span className="badge">
              {result.circuitName.toUpperCase()} · {result.totalLaps} LAPS
            </span>
          </header>
          <table className="standings__table">
            <thead>
              <tr>
                <th>POS</th>
                <th>DRIVER</th>
                <th>TOTAL</th>
                <th>BEST</th>
              </tr>
            </thead>
            <tbody>
              {result.standings.map((standing) => (
                <tr
                  key={standing.label}
                  className={standing.isPlayer ? 'standings__row--player' : ''}
                >
                  <td className="mono">{standing.position}</td>
                  <td>
                    <span className="standings__driver">
                      <span
                        className="standings__dot"
                        style={{ background: standing.color }}
                      />
                      {standing.label}
                    </span>
                  </td>
                  <td className="mono">
                    {standing.finished ? formatTime(standing.totalTime) : '—'}
                  </td>
                  <td className="mono">{formatTime(standing.bestLap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {result.playerLapTimes.length > 0 && (
          <section className="lap-times">
            <header className="standings__head">
              <h4>YOUR LAPS</h4>
              <span className="badge">
                {result.circuitLength.toLocaleString('en-US')} M
              </span>
            </header>
            <ol className="lap-times__list">
              {result.playerLapTimes.map((lap, index) => {
                const isBest = lap === result.playerBestLap;
                return (
                  <li key={index} className={isBest ? 'lap-times__row--best' : ''}>
                    <span>LAP {index + 1}</span>
                    <span className="mono">
                      {formatTime(lap)}
                      {isBest ? ' ★' : ''}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <p className="panel__note panel__note--muted">
          SEED <span className="mono">{result.circuitSeed.toString(16).toUpperCase()}</span> ·
          offline practice, recorded in this browser only.
        </p>

        <div className="result-card__actions">
          <button type="button" className="btn btn--primary" onClick={onAgain}>
            RACE AGAIN
          </button>
          <button type="button" className="btn btn--ghost" onClick={onSetup}>
            CHANGE TRACK
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
