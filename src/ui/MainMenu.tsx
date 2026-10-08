import { useState, type ReactNode } from 'react';
import type { AiDifficulty } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { CarPreview, StatBars } from './carParts';
import { WalletBadge } from './WalletPanel';
import { NetworkBadge, NetworkDialog } from './NetworkIndicator';
import { buildScore } from '../game/car/customization';
import { BODY_TYPE_LABEL } from '../game/car/cosmetics';
import { practiceBalance } from '../racing/escrow';
import { useNetwork } from '../network/NetworkProvider';
import { RACE_LENGTH } from '../game/config';
import { RACE_MODE_META } from '../game/types';
import { formatSol, formatTime } from './format';

type Screen = 'setup' | 'customize' | 'garage' | 'wallet';

const MENU_ITEMS: ReadonlyArray<{ id: string; label: string; blurb: string; target: Screen }> = [
  {
    id: 'play',
    label: 'RACE',
    blurb: `Pick a mode, an entry, then stage on the ${RACE_LENGTH} m strip.`,
    target: 'setup',
  },
  {
    id: 'customize',
    label: 'CUSTOMIZE',
    blurb: 'Body, paint, parts and free performance upgrades.',
    target: 'customize',
  },
  {
    id: 'garage',
    label: 'GARAGE',
    blurb: 'Your build, its measured spec and current record.',
    target: 'garage',
  },
  {
    id: 'wallet',
    label: 'WALLET / BALANCE',
    blurb: 'Connect Phantom and view your current balance.',
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
  const { network, config, select } = useNetwork();
  const [showNetwork, setShowNetwork] = useState(false);
  const [balance] = useState<number>(() => practiceBalance());
  const meta = RACE_MODE_META[profile.mode];

  return (
    <div className="screen screen--menu">
      <header className="menu__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ▚
          </span>
          <div>
            <h1 className="brand__title">LUMEN GP</h1>
            <p className="brand__tag">Solana prototype · {RACE_LENGTH} m drag</p>
          </div>
        </div>
        <div className="menu__wallet">
          <NetworkBadge network={network} onSwitch={() => setShowNetwork(true)} />
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
            <CarPreview car={profile.car} compact />
            <div className="panel__row">
              <span>{BODY_TYPE_LABEL[profile.car.body.type]}</span>
              <span className="mono">BUILD {buildScore(profile.car)}/8</span>
            </div>
            <StatBars car={profile.car} />
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
            <div className="panel__row">
              <span>PRACTICE BANKROLL</span>
              <span className="mono">{formatSol(balance, config.currency)}</span>
            </div>
          </section>

          <section className="panel panel--muted">
            <h3 className="panel__title">LAST RACE</h3>
            <div className="panel__row">
              <span>{meta.label}</span>
              <span className="badge">{difficultyLabel(profile.difficulty)}</span>
            </div>
            <p className="panel__note">
              {meta.entry
                ? 'Wager races stake DEVNET SOL on a local practice ledger. Nothing is signed on chain.'
                : 'No entry on this mode. Times are recorded locally in this browser.'}
            </p>
          </section>
        </aside>
      </div>

      <footer className="menu__footer">
        <span className="badge badge--devnet">{config.badge}</span>
        <span className="menu__footer-text">
          Prototype build · no NFT, no mainnet, no on-chain state. Wallet is read-only. Settlements are
          local-ledger practice figures.
        </span>
      </footer>

      {showNetwork && (
        <NetworkDialog current={network} onSelect={(next) => select(next)} onClose={() => setShowNetwork(false)} />
      )}
    </div>
  );
}

export function difficultyLabel(difficulty: AiDifficulty): string {
  return difficulty.toUpperCase();
}
