import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Phaser from 'phaser';
import { AI_OPPONENT, STARTER_CAR } from '../game/car/carData';
import { PHASER, SCENE_KEYS } from '../game/config';
import { createControlState } from '../game/control';
import { createPhaserGame } from '../game/game';
import { RaceScene, type RacePhase, type RaceSceneData } from '../game/scenes/RaceScene';
import type { RaceResult } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { RaceControls } from './RaceControls';
import { RaceResultPanel } from './MainMenu';
import { formatTime } from './format';

/**
 * Hosts the Phaser canvas and the control overlay.
 *
 * Phaser owns the simulation, React owns navigation and the result card. The
 * only things crossing the boundary are the shared `ControlState` object (a plain
 * mutable struct, so no re-renders per input) and two callbacks.
 */
export function RaceScreen({
  profile,
  onBack,
  onFinish,
}: {
  profile: PlayerProfile;
  onBack: () => void;
  onFinish: (result: RaceResult) => void;
}): ReactNode {
  const controls = useMemo(() => createControlState(), []);
  const [phase, setPhase] = useState<RacePhase>('staging');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [runId, setRunId] = useState(0);

  /**
   * Snapshot the car and difficulty for this race session.
   *
   * Recording a result writes a new best time into the profile, which re-renders
   * this screen. Reading the build from the live profile would therefore change
   * the scene payload mid-run and tear the race down. A snapshot keeps the race
   * stable; switching difficulty means going back to the menu, which remounts.
   */
  const [session] = useState(() => ({
    levels: profile.upgrades,
    difficulty: profile.difficulty,
    bestTime: profile.bestTime,
  }));

  const sceneData: RaceSceneData = useMemo(
    () => ({
      playerLevels: session.levels,
      playerCar: STARTER_CAR,
      aiCar: AI_OPPONENT,
      difficulty: session.difficulty,
      bestTime: session.bestTime,
      controls,
      onPhaseChange: setPhase,
      onComplete: (raceResult: RaceResult) => {
        setResult(raceResult);
        onFinish(raceResult);
      },
    }),
    [controls, onFinish, session],
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

  const restart = useCallback(() => {
    controls.gas = false;
    controls.upshift = false;
    controls.downshift = false;
    setResult(null);
    setPhase('staging');
    setRunId((id) => id + 1);
  }, [controls]);

  return (
    <div className="screen screen--race">
      <header className="race__bar">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onBack}
          disabled={phase !== 'finished'}
        >
          ‹ MENU
        </button>
        <div className="race__title">
          <span className="race__lane">{STARTER_CAR.name}</span>
          <span className="race__vs">VS</span>
          <span className="race__lane race__lane--ai">{AI_OPPONENT.name}</span>
        </div>
        <div className="race__meta">
          <span className="badge">{profile.difficulty.toUpperCase()}</span>
          <span className="badge badge--devnet">DEVNET</span>
          <span className="mono race__best">BEST {formatTime(profile.bestTime)}</span>
        </div>
      </header>

      <div className="stage">
        <div className="stage__canvas" id="lumen-race-root" style={{ aspectRatio: `${PHASER.width} / ${PHASER.height}` }} />
      </div>

      <RaceControls controls={controls} phase={result ? 'finished' : phase} />

      <footer className="race__legend">
        <span>
          <kbd>SPACE</kbd> gas
        </span>
        <span>
          <kbd>SHIFT</kbd> upshift
        </span>
        <span>
          <kbd>Q</kbd> downshift
        </span>
        <span className="race__legend-note">
          Revs climb as you accelerate. Upshift when the needle reaches the teal band.
        </span>
      </footer>

      {result && (
        <RaceResultPanel result={result} profile={profile} onAgain={restart} onMenu={onBack} />
      )}
    </div>
  );
}