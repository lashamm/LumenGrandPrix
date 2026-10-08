import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Phaser from 'phaser';
import { AI_OPPONENT, type CarDefinition } from '../game/car/carData';
import { carFromCustomization } from '../game/car/customization';
import { LAUNCH, OPTIMAL_SHIFT_RPM, PHASER, SCENE_KEYS } from '../game/config';
import { createControlState, KEY_BINDINGS, keyLabel } from '../game/control';
import { createPhaserGame } from '../game/game';
import type { OpponentDescriptor } from '../game/opponents/RaceOpponent';
import { RaceScene, type RacePhase, type RaceSceneData } from '../game/scenes/RaceScene';
import { RACE_MODE_META, type NetworkId, type RaceResult, type UpgradeLevels } from '../game/types';
import {
  escrowFor,
  usesEntry,
  type EntryReceipt,
  type RaceEntryRequest,
  type RaceOutcome,
  type Settlement,
} from '../racing/escrow';
import type { PlayerProfile } from '../state/storage';
import type { RaceSetup } from './RaceSetupScreen';
import { useTheme } from '../theme/ThemeProvider';
import { RaceControls } from './RaceControls';
import { RaceResultPanel } from './ResultPanel';
import { NetworkBadge } from './NetworkIndicator';
import { formatTime } from './format';

/** The AI has always been run on this mid build — see scripts/simulate.ts. */
const AI_LEVELS: UpgradeLevels = { engine: 2, weight: 2, aero: 2, brakes: 2 };

/**
 * Hosts the Phaser canvas and the control overlay.
 *
 * Phaser owns the simulation, React owns navigation, the entry ledger and the
 * result card. The only things crossing the boundary are the shared
 * `ControlState` object (a plain mutable struct, so no re-renders per input)
 * and two callbacks.
 */
export function RaceScreen({
  profile,
  setup,
  onBack,
  onSetup,
  onFinish,
}: {
  profile: PlayerProfile;
  setup: RaceSetup;
  onBack: () => void;
  onSetup: () => void;
  onFinish: (result: RaceResult, settlement: Settlement | null) => void;
}): ReactNode {
  const controls = useMemo(() => createControlState(), []);
  const { palette } = useTheme();
  const [phase, setPhase] = useState<RacePhase>('countdown');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [runId, setRunId] = useState(0);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  /**
   * Snapshot the car, difficulty and stake for this race session.
   *
   * Recording a result writes a new best time into the profile, which re-renders
   * this screen. Reading the build from the live profile would therefore change
   * the scene payload mid-run and tear the race down.
   */
  const [session] = useState(() => ({
    levels: profile.car.performance,
    car: carFromCustomization(profile.car, 'LUMEN MK-I'),
    difficulty: profile.difficulty,
    bestTime: profile.bestTime,
    mode: setup.mode,
    entrySol: setup.entrySol,
    network: profile.network as NetworkId,
  }));

  const entryRequest = useMemo<RaceEntryRequest>(
    () => ({ network: session.network, mode: session.mode, amountSol: session.entrySol ?? 0 }),
    [session.mode, session.network, session.entrySol],
  );
  const wantsEntry = usesEntry(session.mode);
  const [receipt, setReceipt] = useState<EntryReceipt | null>(setup.receipt);
  const opponentLabel = AI_OPPONENT.name;

  const opponent = useMemo<OpponentDescriptor>(
    () => ({
      kind: 'ai',
      car: AI_OPPONENT,
      label: opponentLabel,
      setup: { difficulty: session.difficulty, levels: { ...AI_LEVELS }, seed: 0x51ed5eed + runId * 7919 },
    }),
    [opponentLabel, runId, session.difficulty],
  );

  const settle = useCallback(
    async (raceResult: RaceResult) => {
      if (!wantsEntry) return;
      const outcome: RaceOutcome = raceResult.win
        ? 'win'
        : raceResult.playerFinished || raceResult.aiFinished
          ? 'loss'
          : 'draw';
      try {
        const next = await escrowFor(session.network).settle(entryRequest, outcome);
        setSettlement(next);
        onFinish(raceResult, next);
      } catch (cause) {
        setEntryError(cause instanceof Error ? cause.message : 'Settlement failed.');
        onFinish(raceResult, null);
      }
    },
    [entryRequest, onFinish, session.network, wantsEntry],
  );

  const sceneData: RaceSceneData = useMemo(
    () => ({
      playerLevels: session.levels as UpgradeLevels,
      playerCar: session.car as CarDefinition,
      opponent,
      bestTime: session.bestTime,
      controls,
      palette,
      onPhaseChange: setPhase,
      onComplete: (raceResult: RaceResult) => {
        setResult(raceResult);
        void settle(raceResult);
      },
    }),
    [controls, opponent, palette, session.bestTime, session.car, session.levels, settle],
  );

  /**
   * One Phaser game per run.
   *
   * `runId` is in the dependency list on purpose: PLAY AGAIN tears the whole
   * game down and builds a fresh one, rather than trying to re-add a scene under
   * a key the previous run already registered (which Phaser treats as a
   * duplicate) or restarting a scene whose display list still holds the old cars.
   */
  useEffect(() => {
    const game = createPhaserGame();
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      game.scene.add(SCENE_KEYS.race, RaceScene, true, sceneData);
    };

    if (game.isBooted) {
      start();
    } else {
      game.events.once(Phaser.Core.Events.READY, start);
    }

    return () => {
      cancelled = true;
      game.events.removeAllListeners();
      game.destroy(true);
    };
  }, [sceneData, runId]);

  const restart = useCallback(async () => {
    controls.gas = false;
    controls.brake = false;
    controls.upshift = false;
    controls.downshift = false;
    setResult(null);
    setSettlement(null);
    setEntryError(null);
    setPhase('countdown');

    if (wantsEntry) {
      setEntering(true);
      try {
        const next = await escrowFor(session.network).enter(entryRequest);
        setReceipt(next);
      } catch (cause) {
        setEntryError(cause instanceof Error ? cause.message : 'Entry could not be locked.');
        setEntering(false);
        return;
      }
      setEntering(false);
    }

    setRunId((id) => id + 1);
  }, [controls, entryRequest, session.network, wantsEntry]);

  const meta = RACE_MODE_META[session.mode];

  return (
    <div className="screen screen--race">
      <header className="race__bar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack} disabled={entering}>
          ‹ QUIT
        </button>
        <div className="race__title">
          <span className="race__lane">{session.car.name}</span>
          <span className="race__vs">VS</span>
          <span className="race__lane race__lane--ai">{opponentLabel}</span>
        </div>
        <div className="race__meta">
          <span className="badge">{meta.label}</span>
          {session.entrySol !== null ? (
            <span className="badge badge--stake">{session.entrySol.toFixed(2)} STAKE</span>
          ) : null}
          <span className="badge">{session.difficulty.toUpperCase()}</span>
          <NetworkBadge network={session.network} />
          <span className="mono race__best">BEST {formatTime(session.bestTime)}</span>
        </div>
      </header>

      <div className="stage">
        <div
          className="stage__canvas"
          id="lumen-race-root"
          style={{ aspectRatio: `${PHASER.width} / ${PHASER.height}` }}
        />
      </div>

      <RaceControls controls={controls} phase={result ? 'finished' : phase} />

      <footer className="race__legend">
        {KEY_BINDINGS.map((binding) => (
          <span key={binding.action}>
            <kbd>{keyLabel(binding.keys[0])}</kbd> {binding.label.toLowerCase()}
          </span>
        ))}
        <span className="race__legend-note">
          Stage with GAS, release near {LAUNCH.optimalRpm.toLocaleString('en-US')} RPM, then shift on
          the teal band at {OPTIMAL_SHIFT_RPM.toLocaleString('en-US')} RPM.
        </span>
        {wantsEntry && receipt ? (
          <span className="race__legend-note">
            ENTRY <span className="mono">{receipt.reference}</span> · {receipt.onChain ? 'ON-CHAIN' : 'LOCAL LEDGER'}
          </span>
        ) : null}
      </footer>

      {entering && (
        <div className="dialog-overlay">
          <div className="dialog dialog--busy">
            <p>LOCKING ENTRY…</p>
          </div>
        </div>
      )}

      {entryError && !result && (
        <div className="result-overlay">
          <div className="result-card result-card--error">
            <p className="result-card__verdict">ENTRY FAILED</p>
            <p className="panel__error">{entryError}</p>
            <div className="result-card__actions">
              <button type="button" className="btn btn--primary" onClick={onSetup}>
                BACK TO RACE SETUP
              </button>
              <button type="button" className="btn btn--ghost" onClick={onBack}>
                MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <RaceResultPanel
          result={result}
          profile={profile}
          opponentLabel={opponentLabel}
          entrySol={session.entrySol}
          currency={session.network === 'mainnet' ? 'SOL' : 'DEVNET SOL'}
          settlement={settlement}
          onAgain={() => void restart()}
          onSetup={onSetup}
          onMenu={onBack}
        />
      )}
    </div>
  );
}
