import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { MainMenu } from './ui/MainMenu';
import { CustomizeScreen, GarageScreen } from './ui/CustomizeScreen';
import { WalletPanel } from './ui/WalletPanel';
import { loadProfile, saveProfile, type PlayerProfile } from './state/storage';
import { MAX_LEVEL, MIN_LEVEL, type AiDifficulty, type RaceResult, type UpgradeCategory } from './game/types';

/**
 * The Race screen (and with it the ~1.5 MB Phaser engine) is only loaded when
 * the player actually races, so the menu paints without paying for the engine.
 */
const RaceScreen = lazy(() => import('./ui/RaceScreen').then((m) => ({ default: m.RaceScreen })));

/**
 * Screens. `garage` and `wallet` are separate routes rather than menu entries so
 * the car build and the wallet details each get a full page without crowding
 * CUSTOMIZE — the menu links straight to wallet, and CUSTOMIZE embeds it.
 */
type Screen = 'menu' | 'customize' | 'garage' | 'wallet' | 'race';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const setUpgrade = useCallback((category: UpgradeCategory, level: number) => {
    const clamped = Math.min(Math.max(Math.round(level), MIN_LEVEL), MAX_LEVEL);
    setProfile((previous) => ({ ...previous, upgrades: { ...previous.upgrades, [category]: clamped } }));
  }, []);

  const setDifficulty = useCallback((difficulty: AiDifficulty) => {
    setProfile((previous) => ({ ...previous, difficulty }));
  }, []);

  const recordResult = useCallback((result: RaceResult) => {
    setProfile((previous) => {
      const bestTime =
        result.playerFinished && (previous.bestTime === null || result.playerTime < previous.bestTime)
          ? result.playerTime
          : previous.bestTime;
      return {
        ...previous,
        bestTime,
        races: previous.races + 1,
        wins: previous.wins + (result.win ? 1 : 0),
      };
    });
  }, []);

  switch (screen) {
    case 'customize':
      return (
        <CustomizeScreen
          profile={profile}
          onUpgrade={setUpgrade}
          onDifficulty={setDifficulty}
          onPlay={() => setScreen('race')}
          onBack={() => setScreen('menu')}
        />
      );

    case 'garage':
      return <GarageScreen profile={profile} onBack={() => setScreen('menu')} />;

    case 'wallet':
      return (
        <div className="screen screen--wallet">
          <header className="sheet__head">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScreen('menu')}>
              ‹ MENU
            </button>
            <div>
              <h2 className="sheet__title">WALLET</h2>
              <p className="sheet__sub">Phantom on Solana Devnet. Read-only.</p>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setScreen('customize')}>
              CUSTOMIZE ›
            </button>
          </header>
          <WalletPanel />
          <GarageSummary profile={profile} />
        </div>
      );

    case 'race':
      return (
        <Suspense fallback={<div className="screen screen--loading">LOADING RACE…</div>}>
          <RaceScreen profile={profile} onBack={() => setScreen('menu')} onFinish={recordResult} />
        </Suspense>
      );

    case 'menu':
    default:
      return (
        <MainMenu
          profile={profile}
          onNavigate={(next) => {
            if (next === 'race') setScreen('race');
            else setScreen(next);
          }}
        />
      );
  }
}

function GarageSummary({ profile }: { profile: PlayerProfile }) {
  return (
    <section className="panel">
      <h3 className="panel__title">LINKED BUILD</h3>
      <p className="panel__note">
        Connecting a wallet does not change your car in this prototype. It only proves the Devnet
        connection works. Persistent builds, cars on chain and trading are all later milestones.
      </p>
      <dl className="spec-list">
        <div>
          <dt>CAR</dt>
          <dd className="mono">LUMEN MK-I</dd>
        </div>
        <div>
          <dt>BUILD</dt>
          <dd className="mono">
            E{profile.upgrades.engine} W{profile.upgrades.weight} A{profile.upgrades.aero} B
            {profile.upgrades.brakes}
          </dd>
        </div>
        <div>
          <dt>BEST</dt>
          <dd className="mono">{profile.bestTime ? `${profile.bestTime.toFixed(2)}s` : '—'}</dd>
        </div>
      </dl>
    </section>
  );
}