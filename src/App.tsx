import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { MainMenu } from './ui/MainMenu';
import { CustomizeScreen, GarageScreen } from './ui/CustomizeScreen';
import { RaceSetupScreen, type RaceSetup } from './ui/RaceSetupScreen';
import { WalletPanel } from './ui/WalletPanel';
import { SettingsScreen } from './ui/SettingsScreen';
import { NetworkProvider, useNetwork } from './network/NetworkProvider';
import { NetworkBadge, NetworkDialog } from './ui/NetworkIndicator';
import { loadProfile, saveProfile, type PlayerProfile } from './state/storage';
import { BODY_TYPE_LABEL } from './game/car/cosmetics';
import {
  type AiDifficulty,
  type CarCustomization,
  type NetworkId,
  type RaceMode,
  type RaceResult,
} from './game/types';
import type { Settlement } from './racing/escrow';

/**
 * The Race screen (and with it the ~1.5 MB Phaser engine) is only loaded when
 * the player actually races, so the menu paints without paying for the engine.
 */
const RaceScreen = lazy(() => import('./ui/RaceScreen').then((m) => ({ default: m.RaceScreen })));

/**
 * Screens.
 *
 * `garage`, `wallet` and `setup` are routes rather than menu entries so each
 * gets a full page. The selected network lives in the profile and is published
 * through `NetworkProvider`, so every screen reads the same single source.
 */
type Screen = 'menu' | 'setup' | 'customize' | 'garage' | 'wallet' | 'settings' | 'race';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [setup, setSetup] = useState<RaceSetup | null>(null);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  /**
   * The only write path into the stored car.
   *
   * The garage edits a draft and calls this once, on Apply — so a half-finished
   * session can never be persisted by accident.
   */
  const setCar = useCallback((car: CarCustomization) => {
    setProfile((previous) => ({ ...previous, car }));
  }, []);

  const setDifficulty = useCallback((difficulty: AiDifficulty) => {
    setProfile((previous) => ({ ...previous, difficulty }));
  }, []);

  const setMode = useCallback((mode: RaceMode) => {
    setProfile((previous) => ({ ...previous, mode }));
  }, []);

  const setNetwork = useCallback((network: NetworkId) => {
    setProfile((previous) => ({ ...previous, network }));
  }, []);

  const recordResult = useCallback((result: RaceResult, settlement: Settlement | null) => {
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
        lastEntrySol: settlement ? settlement.amountSol : previous.lastEntrySol,
      };
    });
  }, []);

  return (
    <NetworkProvider network={profile.network} onChange={setNetwork}>
      <AppBody
        screen={screen}
        setScreen={setScreen}
        profile={profile}
        setup={setup}
        setSetup={setSetup}
        setCar={setCar}
        setDifficulty={setDifficulty}
        setMode={setMode}
        recordResult={recordResult}
      />
    </NetworkProvider>
  );
}

function AppBody({
  screen,
  setScreen,
  profile,
  setup,
  setSetup,
  setCar,
  setDifficulty,
  setMode,
  recordResult,
}: {
  screen: Screen;
  setScreen: (next: Screen) => void;
  profile: PlayerProfile;
  setup: RaceSetup | null;
  setSetup: (next: RaceSetup | null) => void;
  setCar: (car: CarCustomization) => void;
  setDifficulty: (difficulty: AiDifficulty) => void;
  setMode: (mode: RaceMode) => void;
  recordResult: (result: RaceResult, settlement: Settlement | null) => void;
}) {
  const { network, config, select } = useNetwork();
  const [showNetwork, setShowNetwork] = useState(false);

  switch (screen) {
    case 'setup':
      return (
        <RaceSetupScreen
          profile={profile}
          onBack={() => setScreen('menu')}
          onModeChange={setMode}
          onStart={(next) => {
            setSetup(next);
            setScreen('race');
          }}
        />
      );

    case 'customize':
      return (
        <CustomizeScreen
          profile={profile}
          onApply={setCar}
          onDifficulty={setDifficulty}
          onPlay={() => setScreen('setup')}
          onBack={() => setScreen('menu')}
        />
      );

    case 'garage':
      return (
        <GarageScreen
          profile={profile}
          onBack={() => setScreen('menu')}
          onCustomize={() => setScreen('customize')}
        />
      );

    case 'wallet':
      return (
        <div className="screen screen--wallet">
          <header className="sheet__head">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScreen('menu')}>
              ‹ MENU
            </button>
            <div>
              <h2 className="sheet__title">WALLET</h2>
              <p className="sheet__sub">Phantom · {config.label} · read-only.</p>
            </div>
            <div className="race__meta">
              <NetworkBadge network={network} onSwitch={() => setShowNetwork(true)} />
              <button type="button" className="btn btn--ghost" onClick={() => setScreen('customize')}>
                CUSTOMIZE ›
              </button>
            </div>
          </header>
          <WalletPanel />
          <GarageSummary profile={profile} />
          {showNetwork && (
            <NetworkDialog
              current={network}
              onSelect={(next) => select(next)}
              onClose={() => setShowNetwork(false)}
            />
          )}
        </div>
      );

    case 'settings':
      return <SettingsScreen onBack={() => setScreen('menu')} />;

    case 'race':
      if (!setup) return <div className="screen screen--loading">NO RACE SELECTED</div>;
      return (
        <Suspense fallback={<div className="screen screen--loading">LOADING RACE…</div>}>
          <RaceScreen
            profile={profile}
            setup={setup}
            onBack={() => {
              setSetup(null);
              setScreen('menu');
            }}
            onSetup={() => setScreen('setup')}
            onFinish={recordResult}
          />
        </Suspense>
      );

    case 'menu':
    default:
      return (
        <MainMenu
          profile={profile}
          onNavigate={(next) => {
            setScreen(next);
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
          <dd className="mono">{BODY_TYPE_LABEL[profile.car.body.type]} · MK-I</dd>
        </div>
        <div>
          <dt>BUILD</dt>
          <dd className="mono">
            E{profile.car.performance.engine} W{profile.car.performance.weight} A{profile.car.performance.aero} B
            {profile.car.performance.brakes}
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
