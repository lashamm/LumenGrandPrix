import { useMemo, useState, type ReactNode } from 'react';
import { useNetwork } from '../network/NetworkProvider';
import { describeEntry, escrowFor, practiceBalance, usesEntry, type EntryReceipt } from '../racing/escrow';
import { LAUNCH, OPTIMAL_SHIFT_RPM, RACE_LENGTH } from '../game/config';
import { RACE_MODE_META, RACE_MODE_ORDER, type RaceMode } from '../game/types';
import { useOnlineMode } from '../online/useOnlineMode';
import type { PlayerProfile } from '../state/storage';
import { CarPreview } from './carParts';
import { NetworkBadge, NetworkDialog } from './NetworkIndicator';
import { formatSol } from './format';

/** Stake presets in DEVNET SOL. */
const ENTRY_PRESETS: readonly number[] = [0.01, 0.05, 0.1, 0.25];

export interface RaceSetup {
  mode: RaceMode;
  /** null when the mode has no stake. */
  entrySol: number | null;
  receipt: EntryReceipt | null;
}

export function RaceSetupScreen({
  profile,
  onBack,
  onStart,
  onModeChange,
}: {
  profile: PlayerProfile;
  onBack: () => void;
  onStart: (setup: RaceSetup) => void;
  onModeChange: (mode: RaceMode) => void;
}): ReactNode {
  const { network, config, select } = useNetwork();
  const online = useOnlineMode();
  const [entrySol, setEntrySol] = useState<number>(
    () => profile.lastEntrySol ?? ENTRY_PRESETS[1],
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNetwork, setShowNetwork] = useState(false);
  const [balance, setBalance] = useState<number>(() => practiceBalance());

  const mode = profile.mode;
  const meta = RACE_MODE_META[mode];
  const wantsEntry = usesEntry(mode);
  const escrow = escrowFor(network);
  const breakdown = useMemo(() => describeEntry({ network, mode, amountSol: wantsEntry ? entrySol : 0 }), [
    entrySol,
    mode,
    network,
    wantsEntry,
  ]);

  // No matchmaking server exists in this build, so an online race never starts.
  const onlineBlocked = meta.online;
  const cannotAfford = wantsEntry && balance < entrySol;
  const startDisabled = onlineBlocked || cannotAfford || busy;

  const begin = () => {
    setError(null);
    if (!wantsEntry) {
      onStart({ mode, entrySol: null, receipt: null });
      return;
    }
    setConfirming(true);
  };

  const confirmEntry = async () => {
    setBusy(true);
    setError(null);
    try {
      const receipt = await escrow.enter({ network, mode, amountSol: entrySol });
      setBalance(practiceBalance());
      setConfirming(false);
      onStart({ mode, entrySol: receipt.amountSol, receipt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Entry could not be locked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen screen--split">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">CHOOSE RACE</h2>
            <p className="sheet__sub">Pick a mode, then an entry if the mode stakes anything.</p>
          </div>
          <NetworkBadge network={network} onSwitch={() => setShowNetwork(true)} />
        </header>

        <section className="mode-grid" aria-label="Race modes">
          {RACE_MODE_ORDER.map((id) => {
            const card = RACE_MODE_META[id];
            const active = id === mode;
            const locked = card.requiresNetwork !== null && card.requiresNetwork !== network;
            return (
              <button
                type="button"
                key={id}
                className={`mode-card${active ? ' is-active' : ''}${card.online ? ' mode-card--online' : ''}`}
                onClick={() => onModeChange(id)}
                disabled={busy || locked}
              >
                <span className="mode-card__label">{card.label}</span>
                <span className="mode-card__blurb">{card.blurb}</span>
                <span className="mode-card__tags">
                  <span className={`badge${card.online ? ' badge--online' : ''}`}>
                    {card.online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <span className={`badge${card.entry ? ' badge--stake' : ''}`}>
                    {card.entry ? 'ENTRY' : 'FREE'}
                  </span>
                  {card.requiresNetwork ? (
                    <span className={`badge${locked ? ' badge--soon' : ' badge--devnet'}`}>
                      {card.requiresNetwork.toUpperCase()}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </section>

        {meta.online && (
          <section className="panel">
            <h3 className="panel__title">LOBBY</h3>
            <div className="panel__row">
              <span>STATUS</span>
              <span className={`mono lobby-status lobby-status--${online.status}`}>
                {online.status.toUpperCase()}
              </span>
            </div>

            {online.status === 'offline' ? (
              <div className="lobby__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => online.connect(mode === 'online-ranked' || meta.entry ? 'ranked' : 'practice')}
                >
                  FIND MATCH
                </button>
              </div>
            ) : (
              <div className="lobby__actions">
                <button type="button" className="btn btn--ghost" onClick={() => online.leave()}>
                  LEAVE LOBBY
                </button>
              </div>
            )}

            {online.status === 'connecting' && (
              <p className="panel__note">
                Looking for an opponent…{' '}
                {online.matchmakingSecondsLeft !== null ? `${online.matchmakingSecondsLeft}s left` : ''}
              </p>
            )}

            {online.status === 'in-lobby' && (
              <p className="panel__note">
                {online.playersInLobby !== null ? `${online.playersInLobby} in lobby · ` : ''}waiting for
                the server to name an opponent.
              </p>
            )}

            {online.status === 'unavailable' && (
              <p className="panel__error">
                {online.reason || 'No matchmaking server is available.'} Starting a race in this mode is
                disabled — LumenGP never invents an opponent or a result.
              </p>
            )}
          </section>
        )}

        {wantsEntry && (
          <section className="panel">
            <h3 className="panel__title">CHOOSE ENTRY</h3>
            <div className="entry-presets">
              {ENTRY_PRESETS.map((amount) => (
                <button
                  type="button"
                  key={amount}
                  className={`entry-preset${amount === entrySol ? ' is-active' : ''}`}
                  onClick={() => setEntrySol(amount)}
                  disabled={busy}
                >
                  {amount.toFixed(2)}
                </button>
              ))}
            </div>

            <dl className="spec-list spec-list--entry">
              <div>
                <dt>YOU STAKE</dt>
                <dd className="mono">{formatSol(breakdown.amountSol, config.currency)}</dd>
              </div>
              <div>
                <dt>PRIZE POOL</dt>
                <dd className="mono">{formatSol(breakdown.poolSol, config.currency)}</dd>
              </div>
              <div>
                <dt>PLATFORM FEE</dt>
                <dd className="mono">{formatSol(breakdown.feeSol, config.currency)}</dd>
              </div>
              <div>
                <dt>WIN PAYS</dt>
                <dd className="mono">{formatSol(breakdown.payoutSol, config.currency)}</dd>
              </div>
            </dl>

            <div className="panel__row">
              <span>PRACTICE BANKROLL</span>
              <span className="mono">{formatSol(balance, config.currency)}</span>
            </div>

            <p className="panel__note panel__note--muted">
              {escrow.label} · settled locally, marked{' '}
              <span className="mono">{escrow.onChain ? 'ON-CHAIN' : 'NOT ON-CHAIN'}</span>. This is a
              Devnet practice ledger, not a smart contract.
            </p>

            {cannotAfford && <p className="panel__error">Practice bankroll is too low for that entry.</p>}
          </section>
        )}
      </main>

      <aside className="sidebar">
        <section className="panel">
          <h3 className="panel__title">YOUR RIDE</h3>
          <CarPreview car={profile.car} compact />
          <div className="panel__row">
            <span>{meta.label}</span>
            <span className="badge">{profile.difficulty.toUpperCase()}</span>
          </div>
        </section>

        <section className="panel panel--muted">
          <h3 className="panel__title">BEFORE YOU START</h3>
          <ul className="tick-list">
            <li>
              Stage on the line and hold <strong>GAS</strong>. Release near{' '}
              <strong className="mono">{LAUNCH.optimalRpm.toLocaleString('en-US')} RPM</strong> for a perfect launch.
            </li>
            <li>
              Upshift as the needle hits the teal band at{' '}
              <strong className="mono">{OPTIMAL_SHIFT_RPM.toLocaleString('en-US')} RPM</strong>.
            </li>
            <li>First over {RACE_LENGTH} m wins. Shifts and launch decide it.</li>
          </ul>
        </section>

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={begin}
          disabled={startDisabled}
        >
          {meta.entry ? `LOCK ENTRY · ${entrySol.toFixed(2)} ${config.currency}` : 'START RACE'}
        </button>

        {startDisabled && !busy && (
          <p className="panel__note panel__note--muted">
            {onlineBlocked
              ? 'Online racing is disabled until a matchmaking server is connected.'
              : cannotAfford
                ? 'Lower the entry or refill the practice bankroll.'
                : ''}
          </p>
        )}

        <button type="button" className="btn btn--ghost" onClick={() => setShowNetwork(true)}>
          NETWORK · {config.label}
        </button>
      </aside>

      {confirming && (
        <div className="dialog-overlay" role="presentation" onClick={() => !busy && setConfirming(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm entry"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="dialog__head">
              <h3>CONFIRM ENTRY</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)} disabled={busy}>
                ✕
              </button>
            </header>

            <p className="dialog__note">{escrow.label}</p>

            <dl className="spec-list spec-list--entry">
              <div>
                <dt>STAKE</dt>
                <dd className="mono">{formatSol(breakdown.amountSol, config.currency)}</dd>
              </div>
              <div>
                <dt>WIN PAYS</dt>
                <dd className="mono">{formatSol(breakdown.payoutSol, config.currency)}</dd>
              </div>
              <div>
                <dt>BANKROLL AFTER ENTRY</dt>
                <dd className="mono">{formatSol(balance - breakdown.amountSol, config.currency)}</dd>
              </div>
            </dl>

            <p className="panel__note panel__note--muted">
              No transaction is signed here. The stake moves on the local practice ledger and is
              labelled accordingly.
            </p>

            {error && <p className="panel__error">{error}</p>}

            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
                CANCEL
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void confirmEntry()} disabled={busy}>
                {busy ? 'LOCKING…' : 'CONFIRM & RACE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNetwork && (
        <NetworkDialog current={network} onSelect={(next) => select(next)} onClose={() => setShowNetwork(false)} />
      )}
    </div>
  );
}
