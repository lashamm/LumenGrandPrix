import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Phaser from 'phaser';
import { buildCode, carFromCustomization } from '../game/car/customization';
import { PHASER, SCENE_KEYS } from '../game/config';
import {
  createCircuitControlState,
  type CircuitPhase,
  type CircuitRaceResult,
  type CircuitRaceSetup,
} from '../game/circuit/types';
import { generateCircuit } from '../game/circuit/circuitGenerator';
import { createPhaserGame } from '../game/game';
import { CircuitRaceScene, type CircuitSceneData } from '../game/scenes/CircuitRaceScene';
import type { UpgradeLevels } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { useTheme } from '../theme/ThemeProvider';
import { CircuitControls } from './CircuitControls';
import { CircuitResultPanel } from './CircuitResultPanel';
import { formatTime } from './format';

/**
 * Hosts the Phaser canvas and the control overlay.
 *
 * Same split as the drag race: Phaser owns the simulation, React
 * owns navigation and the result card. The only things crossing the
 * boundary are the shared `CircuitControlState`, the shared pause
 * flag and two callbacks.
 */
export function CircuitRaceScreen({
  profile,
  setup,
  onBack,
  onSetup,
  onFinish,
}: {
  profile: PlayerProfile;
  setup: CircuitRaceSetup;
  onBack: () => void;
  onSetup: () => void;
  onFinish: (result: CircuitRaceResult) => void;
}): ReactNode {
  const controls = useMemo(() => createCircuitControlState(), []);
  const { palette } = useTheme();
  const [phase, setPhase] = useState<CircuitPhase>('countdown');
  const [result, setResult] = useState<CircuitRaceResult | null>(null);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);

  /**
   * Shared pause flag. The scene reads `pauseState.paused` every
   * frame, so the flag must be mutable — React state alone cannot
   * reach inside the Phaser loop.
   */
  const pauseState = useMemo(() => ({ paused: false }), []);

  /**
   * Snapshot the car for this race session.
   *
   * Recording a result writes a new best lap into the profile, which
   * re-renders this screen. Reading the build from the live profile
   * would therefore change the scene payload mid-run and tear the
   * race down.
   */
  const [session] = useState(() => ({
    levels: profile.car.performance as UpgradeLevels,
    car: carFromCustomization(profile.car, 'LUMEN MK-I'),
  }));

  const togglePause = useCallback(() => {
    pauseState.paused = !pauseState.paused;
    setPaused(pauseState.paused);
  }, [pauseState]);

  const sceneData: CircuitSceneData = useMemo(
    () => ({
      setup,
      playerLevels: session.levels,
      playerCar: session.car,
      controls,
      palette,
      pauseState,
      onPhaseChange: setPhase,
      onComplete: (raceResult: CircuitRaceResult) => {
        setResult(raceResult);
        pauseState.paused = false;
        setPaused(false);
        onFinish(raceResult);
      },
    }),
    [controls, onFinish, palette, pauseState, session.car, session.levels, setup],
  );

  /**
   * One Phaser game per run.
   *
   * `runId` is in the dependency list on purpose: RACE AGAIN tears
   * the whole game down and builds a fresh one, rather than trying to
   * re-add a scene under a key the previous run already registered.
   */
  useEffect(() => {
    const game = createPhaserGame();
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      game.scene.add(SCENE_KEYS.circuit, CircuitRaceScene, true, sceneData);
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

  const restart = useCallback(() => {
    controls.throttle = false;
    controls.brake = false;
    pauseState.paused = false;
    setPaused(false);
    setResult(null);
    setPhase('countdown');
    setRunId((id) => id + 1);
  }, [controls, pauseState]);

  const circuit = useMemo(() => generateCircuit(setup.seed), [setup.seed]);

  return (
    <div className="screen screen--race">
      <header className="race__bar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          ‹ QUIT
        </button>
        <div className="race__title">
          <span className="race__lane">{session.car.name}</span>
          <span className="race__vs">·</span>
          <span className="race__lane race__lane--ai">{circuit.name}</span>
        </div>
        <div className="race__meta">
          <span className="badge">{setup.totalLaps} LAPS</span>
          <span className="badge">{setup.opponentCount + 1} CARS</span>
          <span className="badge">{setup.difficulty.toUpperCase()}</span>
          <span className="mono race__best">BEST {formatTime(profile.circuitBestLap)}</span>
        </div>
      </header>

      <div className="stage">
        <div
          className="stage__canvas"
          id="lumen-race-root"
          style={{ aspectRatio: `${PHASER.width} / ${PHASER.height}` }}
        />
      </div>

      <CircuitControls controls={controls} phase={result ? 'finished' : phase} onPause={togglePause} />

      <footer className="race__legend">
        <span>
          <kbd>W</kbd> / <kbd>↑</kbd> throttle
        </span>
        <span>
          <kbd>S</kbd> / <kbd>↓</kbd> / <kbd>SPACE</kbd> brake
        </span>
        <span>
          <kbd>ESC</kbd> pause
        </span>
        <span className="race__legend-note">
          Build {buildCode(profile.car)} · the steering servo follows the racing line — your job is
          speed. Ease off before the grip bar goes red.
        </span>
      </footer>

      {paused && !result && (
        <div className="result-overlay">
          <div className="result-card result-card--draw">
            <p className="result-card__verdict">PAUSED</p>
            <div className="result-card__actions">
              <button type="button" className="btn btn--primary" onClick={togglePause}>
                RESUME
              </button>
              <button type="button" className="btn btn--ghost" onClick={restart}>
                RESTART
              </button>
              <button type="button" className="btn btn--ghost" onClick={onSetup}>
                QUIT TO SETUP
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <CircuitResultPanel
          result={result}
          profile={profile}
          onAgain={restart}
          onSetup={onSetup}
          onMenu={onBack}
        />
      )}
    </div>
  );
}
