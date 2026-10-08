import type { ReactNode } from 'react';
import type { RaceResult } from '../game/types';
import type { Settlement } from '../racing/escrow';
import type { PlayerProfile } from '../state/storage';
import { formatSol, formatTime } from './format';

/**
 * End-of-race card.
 *
 * When the mode carried a stake, the settlement block prints every number the
 * ledger moved plus its method, so a practice result can never read as an
 * on-chain payout.
 */
export function RaceResultPanel({
  result,
  profile,
  opponentLabel,
  entrySol,
  currency,
  settlement,
  onAgain,
  onSetup,
  onMenu,
}: {
  result: RaceResult;
  profile: PlayerProfile;
  opponentLabel: string;
  entrySol: number | null;
  currency: string;
  settlement: Settlement | null;
  onAgain: () => void;
  onSetup: () => void;
  onMenu: () => void;
}): ReactNode {
  const playerLabel = result.playerFinished ? formatTime(result.playerTime) : 'DNF';
  const aiLabel = result.aiFinished ? formatTime(result.aiTime) : 'DNF';
  const verdict = settlement ? settlement.outcome : result.win ? 'win' : 'loss';

  return (
    <div className="result-overlay">
      <div className={`result-card result-card--${verdict}`}>
        <p className="result-card__verdict">{verdict.toUpperCase()}</p>

        <dl className="result-card__times">
          <div>
            <dt>YOU</dt>
            <dd className="mono">{playerLabel}</dd>
          </div>
          <div>
            <dt>{opponentLabel}</dt>
            <dd className="mono">{aiLabel}</dd>
          </div>
          <div>
            <dt>BEST</dt>
            <dd className="mono">{formatTime(profile.bestTime)}</dd>
          </div>
        </dl>

        <ul className="result-card__stats">
          <li>
            LAUNCH <strong className="mono">{result.launchRpm} RPM</strong> · {result.launchQuality}
          </li>
          <li>
            SHIFTS <strong className="mono">{result.shiftCount}</strong> · clean{' '}
            <strong className="mono">{result.perfectShifts}</strong> · missed{' '}
            <strong className="mono">{result.missedShifts}</strong>
          </li>
        </ul>

        {entrySol !== null && (
          <section className="settlement">
            <header className="settlement__head">
              <h4>SETTLEMENT</h4>
              <span className={`badge${settlement?.onChain ? ' badge--devnet' : ' badge--local'}`}>
                {settlement?.onChain ? 'ON-CHAIN' : 'LOCAL LEDGER · NOT ON-CHAIN'}
              </span>
            </header>

            {settlement ? (
              <>
                <dl className="spec-list spec-list--entry">
                  <div>
                    <dt>STAKE</dt>
                    <dd className="mono">{formatSol(settlement.amountSol, currency)}</dd>
                  </div>
                  <div>
                    <dt>POOL</dt>
                    <dd className="mono">{formatSol(settlement.poolSol, currency)}</dd>
                  </div>
                  <div>
                    <dt>FEE</dt>
                    <dd className="mono">{formatSol(settlement.feeSol, currency)}</dd>
                  </div>
                  <div>
                    <dt>PAYOUT</dt>
                    <dd className="mono">{formatSol(settlement.payoutSol, currency)}</dd>
                  </div>
                  <div>
                    <dt>PROFIT</dt>
                    <dd className={`mono${settlement.profitSol >= 0 ? ' is-up' : ' is-down'}`}>
                      {formatSol(settlement.profitSol, currency, true)}
                    </dd>
                  </div>
                  <div>
                    <dt>BANKROLL</dt>
                    <dd className="mono">{formatSol(settlement.bankrollAfter, currency)}</dd>
                  </div>
                </dl>
                <p className="settlement__ref">
                  REF <span className="mono">{settlement.reference}</span> · METHOD{' '}
                  <span className="mono">{settlement.method.toUpperCase()}</span>
                </p>
                <p className="panel__note panel__note--muted">
                  Devnet practice settlement recorded in this browser only. No transaction was signed,
                  broadcast or confirmed on Solana.
                </p>
              </>
            ) : (
              <p className="panel__note">Settling…</p>
            )}
          </section>
        )}

        <div className="result-card__actions">
          <button type="button" className="btn btn--primary" onClick={onAgain}>
            PLAY AGAIN
          </button>
          <button type="button" className="btn btn--ghost" onClick={onSetup}>
            CHANGE RACE
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
