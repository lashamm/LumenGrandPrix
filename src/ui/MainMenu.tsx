import type { ReactNode } from 'react';
import type { AiDifficulty, RaceResult } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { CarPreview, StatBars } from './carParts';
import { WalletBadge } from './WalletPanel';
import { AI_OPPONENT, STARTER_CAR, totalUpgradeScore } from '../game/car/carData';
import { formatTime } from './format';

type Screen = 'customize' | 'garage' | 'race' | 'wallet';

const MENU_ITEMS: ReadonlyArray<{ id: string; label: string; blurb: string; target: Screen }> = [
  { id: 'play', label: 'PLAY', blurb: 'Line up against the Rival VX over 300 m.', target: 'race' },
  {
    id: 'customize',
    label: 'CUSTOMIZE',
    blurb: 'Tune engine, weight, aero and brakes. Free test upgrades.',
    target: 'customize',
  },
  {
    id: 'wallet',
    label: 'WALLET / BALANCE',
    blurb: 'Connect Phantom and view your Devnet SOL.',
    target: 'wallet',
  },
];

export function MainMenu({
  profile,
  onNavigate,
}: {
  profile: PlayerProfile;
  onNavigate: (screen: Screen) => void;
}): ReactNode {
  return (
    <div className="screen screen--menu">
      <header className="menu__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ▚
          </span>
          <div>
            <h1 className="brand__title">LUMEN GP</h1>
            <p className="brand__tag">Solana Devnet prototype · 300 m drag</p>
          </div>
        </div>
        <div className="menu__wallet">
          <WalletBadge onOpen={() => onNavigate('wallet')} />
        </div>
      </header>

      <div className="menu__body">
        <nav className="menu__list" aria-label="Main menu">
          {MENU_ITEMS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`menu-item${item.id === 'play' ? ' menu-item--primary' : ''}`}
              onClick={() => onNavigate(item.target)}
            >
              <span className="menu-item__index mono">{String(index + 1).padStart(2, '0')}</span>
              <span className="menu-item__body">
                <span className="menu-item__label">{item.label}</span>
                <span className="menu-item__blurb">{item.blurb}</span>
              </span>
              <span className="menu-item__arrow" aria-hidden="true">
                ▶
              </span>
            </button>
          ))}
        </nav>

        <aside className="menu__side">
          <section className="panel">
            <h3 className="panel__title">YOUR RIDE</h3>
            <CarPreview />
            <div className="panel__row">
              <span>{STARTER_CAR.name}</span>
              <span className="mono">BUILD {totalUpgradeScore(profile.upgrades)}/8</span>
            </div>
            <StatBars levels={profile.upgrades} />
          </section>

          <section className="panel">
            <h3 className="panel__title">RECORD</h3>
            <div className="panel__row">
              <span>BEST TIME</span>
              <span className="mono">{formatTime(profile.bestTime)}</span>
            </div>
            <div className="panel__row">
              <span>RACES / WINS</span>
              <span className="mono">
                {profile.races} / {profile.wins}
              </span>
            </div>
          </section>

          <section className="panel panel--muted">
            <h3 className="panel__title">NEXT OPPONENT</h3>
            <div className="panel__row">
              <span>{AI_OPPONENT.name}</span>
              <span className="badge">{difficultyLabel(profile.difficulty)}</span>
            </div>
            <p className="panel__note">Difficulty is adjustable in Customize. No money, no wagers — just lap times.</p>
          </section>
        </aside>
      </div>

      <footer className="menu__footer">
        <span className="badge badge--devnet">DEVNET</span>
        <span className="menu__footer-text">
          Prototype build · no NFT, no wagering, no on-chain state. Wallet is read-only.
        </span>
      </footer>
    </div>
  );
}

export function difficultyLabel(difficulty: AiDifficulty): string {
  return difficulty.toUpperCase();
}

export function RaceResultPanel({
  result,
  profile,
  onAgain,
  onMenu,
}: {
  result: RaceResult;
  profile: PlayerProfile;
  onAgain: () => void;
  onMenu: () => void;
}): ReactNode {
  const playerLabel = result.playerFinished ? formatTime(result.playerTime) : 'DNF';
  const aiLabel = result.aiFinished ? formatTime(result.aiTime) : 'DNF';

  return (
    <div className="result-overlay">
      <div className={`result-card result-card--${result.win ? 'win' : 'loss'}`}>
        <p className="result-card__verdict">{result.win ? 'WIN' : 'LOSS'}</p>

        <dl className="result-card__times">
          <div>
            <dt>YOU</dt>
            <dd className="mono">{playerLabel}</dd>
          </div>
          <div>
            <dt>{AI_OPPONENT.name}</dt>
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

        <div className="result-card__actions">
          <button type="button" className="btn btn--primary" onClick={onAgain}>
            PLAY AGAIN
          </button>
          <button type="button" className="btn btn--ghost" onClick={onMenu}>
            BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  );
}