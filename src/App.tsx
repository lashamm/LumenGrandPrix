import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { MainMenu } from './ui/MainMenu';
import { CustomizeScreen, GarageScreen } from './ui/CustomizeScreen';
import { RaceSetupScreen, type RaceSetup } from './ui/RaceSetupScreen';
import { CircuitSetupScreen } from './ui/CircuitSetupScreen';
import { WalletPanel } from './ui/WalletPanel';
import { SettingsScreen } from './ui/SettingsScreen';
import { NetworkProvider, useNetwork } from './network/NetworkProvider';
import { NetworkBadge, NetworkDialog } from './ui/NetworkIndicator';
import { loadProfile, saveProfile, type GarageCategory, type PlayerProfile } from './state/storage';
import { BODY_TYPE_LABEL } from './game/car/cosmetics';
import {
  type AiDifficulty,
  type CarCustomization,
  type NetworkId,
  type RaceMode,
  type RaceResult,
} from './game/types';
import type { CircuitRaceResult, CircuitRaceSetup } from './game/circuit/types';
import type { Settlement } from './racing/escrow';

/**
 * The Race screen (and with it the ~1.5 MB Phaser engine) is only loaded when
 * the player actually races, so the menu paints without paying for the engine.
 */
const RaceScreen = lazy(() => import('./ui/RaceScreen').then((m) => ({ default: m.RaceScreen })));
const CircuitRaceScreen = lazy(() =>
  import('./ui/CircuitRaceScreen').then((m) => ({ default: m.CircuitRaceScreen })),
);

/**
 * Screens.
 *
 * `garage`, `wallet` and `setup` are routes rather than menu entries so each
 * gets a full page. The selected network lives in the profile and is published
 * through `NetworkProvider`, so every screen reads the same single source.
 */
type Screen =
  | 'menu'
  | 'setup'
  | 'customize'
  | 'garage'
  | 'wallet'
  | 'settings'
  | 'race'
  | 'circuit-setup'
  | 'circuit-race';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [setup, setSetup] = useState<RaceSetup | null>(null);
  const [circuitSetup, setCircuitSetup] = useState<CircuitRaceSetup | null>(null);
  const [garageCategory, setGarageCategory] = useState<GarageCategory>('drag');
  const [garageReturn, setGarageReturn] = useState<Screen>('menu');

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  /**
   * The only write path into a stored car.
   *
   * The garage edits a draft and calls this once, on Apply — so a half-finished
   * session can never be persisted by accident. The write lands in whichever
   * bay (drag or circuit) the player is currently editing.
   */
  const setCar = useCallback(
    (category: GarageCategory, car: CarCustomization) => {
      setProfile((previous) =>
        category === 'drag' ? { ...previous, car } : { ...previous, circuitCar: car },
      );
    },
    [],
  );

  /**
   * Opens the garage on a chosen bay and remembers where to come back to,
   * so tuning the circuit car from track select returns there afterwards.
   */
  const openGarage = useCallback((category: GarageCategory, next: Screen, returnTo: Screen = 'menu') => {
    setGarageCategory(category);
    setGarageReturn(returnTo);
    setScreen(next);
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

  /**
   * Circuit results are offline practice figures: they only ever
   * touch the local best lap and the race counter — no stake, no
   * settlement, nothing signed.
   */
  const recordCircuitResult = useCallback((result: CircuitRaceResult) => {
    setProfile((previous) => {
      const circuitBestLap =
        result.playerBestLap !== null &&
        (previous.circuitBestLap === null || result.playerBestLap < previous.circuitBestLap)
          ? result.playerBestLap
          : previous.circuitBestLap;
      return {
        ...previous,
        circuitBestLap,
        races: previous.races + 1,
        wins: previous.wins + (result.playerPosition === 1 ? 1 : 0),
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
        circuitSetup={circuitSetup}
        setCircuitSetup={setCircuitSetup}
        garageCategory={garageCategory}
        setGarageCategory={setGarageCategory}
        garageReturn={garageReturn}
        setCar={setCar}
        openGarage={openGarage}
        setDifficulty={setDifficulty}
        setMode={setMode}
        recordResult={recordResult}
        recordCircuitResult={recordCircuitResult}
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
  circuitSetup,
  setCircuitSetup,
  garageCategory,
  setGarageCategory,
  garageReturn,
  setCar,
  openGarage,
  setDifficulty,
  setMode,
  recordResult,
  recordCircuitResult,
}: {
  screen: Screen;
  setScreen: (next: Screen) => void;
  profile: PlayerProfile;
  setup: RaceSetup | null;
  setSetup: (next: RaceSetup | null) => void;
  circuitSetup: CircuitRaceSetup | null;
  setCircuitSetup: (next: CircuitRaceSetup | null) => void;
  garageCategory: GarageCategory;
  setGarageCategory: (category: GarageCategory) => void;
  garageReturn: Screen;
  setCar: (category: GarageCategory, car: CarCustomization) => void;
  openGarage: (category: GarageCategory, next: Screen, returnTo?: Screen) => void;
  setDifficulty: (difficulty: AiDifficulty) => void;
  setMode: (mode: RaceMode) => void;
  recordResult: (result: RaceResult, settlement: Settlement | null) => void;
  recordCircuitResult: (result: CircuitRaceResult) => void;
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
          key={garageCategory}
          profile={profile}
          category={garageCategory}
          onCategoryChange={setGarageCategory}
          onApply={setCar}
          onDifficulty={setDifficulty}
          onPlay={() => setScreen(garageCategory === 'drag' ? 'setup' : 'circuit-setup')}
          onBack={() => setScreen(garageReturn)}
        />
      );

    case 'garage':
      return (
        <GarageScreen
          key={garageCategory}
          profile={profile}
          category={garageCategory}
          onCategoryChange={setGarageCategory}
          onBack={() => setScreen(garageReturn)}
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

    case 'circuit-setup':
      return (
        <CircuitSetupScreen
          profile={profile}
          onBack={() => setScreen('menu')}
          onCustomize={() => openGarage('circuit', 'customize', 'circuit-setup')}
          onStart={(next) => {
            setCircuitSetup(next);
            setScreen('circuit-race');
          }}
        />
      );

    case 'circuit-race':
      if (!circuitSetup)
        return <div className="screen screen--loading">NO CIRCUIT SELECTED</div>;
      return (
        <Suspense fallback={<div className="screen screen--loading">LOADING CIRCUIT…</div>}>
          <CircuitRaceScreen
            profile={profile}
            setup={circuitSetup}
            onBack={() => {
              setCircuitSetup(null);
              setScreen('menu');
            }}
            onSetup={() => setScreen('circuit-setup')}
            onFinish={recordCircuitResult}
          />
        </Suspense>
      );

    case 'menu':
    default:
      return (
        <MainMenu
          profile={profile}
          onNavigate={(next) => {
            if (next === 'customize' || next === 'garage') {
              openGarage('drag', next, 'menu');
            } else {
              setScreen(next);
            }
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
