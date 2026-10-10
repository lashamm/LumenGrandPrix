import { useMemo, useState, type ReactNode } from 'react';
import { CIRCUIT } from '../game/config';
import {
  buildHandcraftedCircuit,
  HANDCRAFTED_TRACKS,
  resolveCircuit,
} from '../game/circuit/handcraftedTracks';
import type { Circuit, CircuitRaceSetup } from '../game/circuit/types';
import { buildCode } from '../game/car/customization';
import type { AiDifficulty } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { CarPreview, Segmented } from './carParts';
import { formatTime } from './format';

const OPPONENT_OPTIONS = [1, 2, 3, 4, 5].map((count) => ({
  id: count,
  text: String(count),
  note: count === 1 ? 'rival' : 'rivals',
}));

const LAP_OPTIONS = [
  { id: 1, text: '1', note: 'sprint' },
  { id: 3, text: '3', note: 'race' },
  { id: 5, text: '5', note: 'endurance' },
];

const DIFFICULTY_OPTIONS: ReadonlyArray<{
  id: AiDifficulty;
  text: string;
  note: string;
}> = [
  { id: 'easy', text: 'ROOKIE', note: 'forgiving' },
  { id: 'medium', text: 'CONTENDER', note: 'fair' },
  { id: 'hard', text: 'FACTORY', note: 'fast' },
];

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'GENTLE',
  2: 'CLUB',
  3: 'HARD',
};

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Circuit race setup.
 *
 * The track pack is the headline: four handcrafted layouts, each a
 * fixed, validated closed loop shown as a real preview. A fifth
 * "surprise me" card still runs the seeded generator for a fresh
 * circuit every time. Whatever is picked here is resolved by the exact
 * same `resolveCircuit` the race uses, so the preview is never a lie.
 * No wallet, no entry: circuit racing is offline practice.
 */
export function CircuitSetupScreen({
  profile,
  onBack,
  onCustomize,
  onStart,
}: {
  profile: PlayerProfile;
  onBack: () => void;
  onCustomize: () => void;
  onStart: (setup: CircuitRaceSetup) => void;
}): ReactNode {
  const [opponentCount, setOpponentCount] = useState<number>(3);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(profile.difficulty);
  const [totalLaps, setTotalLaps] = useState<number>(CIRCUIT.totalLapsDefault);
  const [seed, setSeed] = useState(() => randomSeed());
  const [trackId, setTrackId] = useState<string | null>(HANDCRAFTED_TRACKS[0].id);

  const handcrafted = useMemo(
    () =>
      HANDCRAFTED_TRACKS.map((track) => ({
        meta: track,
        circuit: buildHandcraftedCircuit(track.id),
      })),
    [],
  );

  const circuit = useMemo(() => resolveCircuit(trackId, seed), [trackId, seed]);

  const isRandom = trackId === null;

  const start = () => {
    onStart({ trackId, seed, totalLaps, opponentCount, difficulty });
  };

  return (
    <div className="screen screen--split">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">CIRCUIT RACING</h2>
            <p className="sheet__sub">
              Slot-car physics: you manage throttle and brake, the tires do the rest.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setSeed(randomSeed())}
            disabled={!isRandom}
            title={isRandom ? 'Generate another random circuit' : 'Pick “SURPRISE ME” to reroll'}
          >
            ⟳ REROLL
          </button>
        </header>

        <section className="panel">
          <h3 className="panel__title">SELECT TRACK</h3>
          <div className="track-grid">
            {handcrafted.map(({ meta, circuit: trackCircuit }) => (
              <button
                type="button"
                key={meta.id}
                className={`track-card${trackId === meta.id ? ' is-active' : ''}`}
                onClick={() => setTrackId(meta.id)}
              >
                {trackCircuit && (
                  <CircuitPreview circuit={trackCircuit} width={150} height={108} pad={8} />
                )}
                <span className="track-card__name">{meta.name}</span>
                <span className="track-card__tag">{meta.tagline}</span>
                <span className="track-card__meta">
                  <DifficultyDots level={meta.difficulty} />
                  <span className="mono">
                    {trackCircuit ? `${Math.round(trackCircuit.length)} M` : '—'}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className={`track-card track-card--random${isRandom ? ' is-active' : ''}`}
              onClick={() => setTrackId(null)}
            >
              <span className="track-card__dice" aria-hidden="true">
                ✦
              </span>
              <span className="track-card__name">SURPRISE ME</span>
              <span className="track-card__tag">A fresh generated circuit every race.</span>
              <span className="track-card__meta">
                <span className="track-card__tag">SEED</span>
                <span className="mono">{isRandom ? seed.toString(16).toUpperCase() : 'RANDOM'}</span>
              </span>
            </button>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">
            {isRandom ? (
              <>
                TRACK · SEED <span className="mono">{seed.toString(16).toUpperCase()}</span>
              </>
            ) : (
              'TRACK · PREVIEW'
            )}
          </h3>
          <CircuitPreview circuit={circuit} />
          <dl className="spec-list">
            <div>
              <dt>NAME</dt>
              <dd className="mono">{circuit.name}</dd>
            </div>
            <div>
              <dt>LENGTH</dt>
              <dd className="mono">
                {Math.round(circuit.length).toLocaleString('en-US')} M
              </dd>
            </div>
            <div>
              <dt>WIDTH</dt>
              <dd className="mono">{circuit.halfWidth * 2} M</dd>
            </div>
          </dl>
          <p className="panel__note panel__note--muted">
            {isRandom
              ? 'Every seed is a real closed circuit — straights, sweeps, hairpins, S-bends and chicanes, validated for width and safe cornering before it ever reaches the track.'
              : HANDCRAFTED_TRACKS.find((track) => track.id === trackId)?.description}
          </p>
        </section>

        <Segmented
          label="OPPONENTS"
          value={opponentCount}
          options={OPPONENT_OPTIONS}
          onChange={setOpponentCount}
        />
        <Segmented
          label="AI SKILL"
          value={difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={setDifficulty}
        />
        <Segmented
          label="RACE DISTANCE"
          value={totalLaps}
          options={LAP_OPTIONS}
          onChange={setTotalLaps}
        />
      </main>

      <aside className="sidebar">
        <section className="panel">
          <h3 className="panel__title">YOUR RIDE</h3>
          <CarPreview car={profile.circuitCar} category="circuit" compact />
          <div className="panel__row">
            <span>BUILD</span>
            <span className="mono">{buildCode(profile.circuitCar)}</span>
          </div>
          <div className="panel__row">
            <span>BEST CIRCUIT LAP</span>
            <span className="mono">{formatTime(profile.circuitBestLap)}</span>
          </div>
          <button type="button" className="btn btn--ghost btn--block" onClick={onCustomize}>
            TUNE CAR
          </button>
        </section>

        <section className="panel panel--muted">
          <h3 className="panel__title">HOW IT WORKS</h3>
          <ul className="tick-list">
            <li>
              No steering. Hold <strong>THROTTLE</strong> (W / ↑) and{' '}
              <strong>BRAKE</strong> (S / ↓ / SPACE).
            </li>
            <li>
              The tires corner for you — carry too much speed into a turn and you slide,
              lock up or spin.
            </li>
            <li>
              Watch the <strong>GRIP</strong> bar: green is safe, yellow is the limit, red
              is a slide.
            </li>
            <li>
              Upgrades matter — <strong>TIRES</strong> raise the cornering budget,{' '}
              <strong>BRAKES</strong> raise the braking one.
            </li>
          </ul>
        </section>

        <button type="button" className="btn btn--primary btn--block" onClick={start}>
          START RACE
        </button>
      </aside>
    </div>
  );
}

/** Small difficulty indicator: filled dots for the hard end. */
function DifficultyDots({ level }: { level: 1 | 2 | 3 }): ReactNode {
  return (
    <span className="track-card__diff" title={DIFFICULTY_LABEL[level]}>
      {[1, 2, 3].map((step) => (
        <span key={step} className={step <= level ? 'is-on' : ''}>
          ●
        </span>
      ))}
    </span>
  );
}

/**
 * Top-down SVG of a circuit's centreline and start/finish line.
 *
 * Drawn straight from the same `Circuit` the race consumes, so the
 * card thumbnails and the big preview are the actual track.
 */
function CircuitPreview({
  circuit,
  width = 260,
  height = 190,
  pad = 14,
}: {
  circuit: Circuit;
  width?: number;
  height?: number;
  pad?: number;
}): ReactNode {
  const boundsWidth = circuit.bounds.maxX - circuit.bounds.minX;
  const boundsHeight = circuit.bounds.maxY - circuit.bounds.minY;
  const scale = Math.min((width - pad * 2) / boundsWidth, (height - pad * 2) / boundsHeight);
  const offsetX =
    pad + ((width - pad * 2) - boundsWidth * scale) / 2 - circuit.bounds.minX * scale;
  const offsetY =
    pad + ((height - pad * 2) - boundsHeight * scale) / 2 - circuit.bounds.minY * scale;
  const points = circuit.samples
    .filter((_, index) => index % 3 === 0)
    .map(
      (sample) =>
        `${(sample.x * scale + offsetX).toFixed(1)},${(sample.y * scale + offsetY).toFixed(1)}`,
    )
    .join(' ');
  const start = circuit.samples[0];
  const strokeWidth = Math.max(2, circuit.halfWidth * 2 * scale * 0.7);
  const startX = start.x * scale + offsetX;
  const startY = start.y * scale + offsetY;

  return (
    <svg
      className="circuit-preview"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Preview of ${circuit.name}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={strokeWidth + 3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--text-dim)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1={startX - start.nx * circuit.halfWidth * scale}
        y1={startY - start.ny * circuit.halfWidth * scale}
        x2={startX + start.nx * circuit.halfWidth * scale}
        y2={startY + start.ny * circuit.halfWidth * scale}
        stroke="var(--accent)"
        strokeWidth={2}
      />
    </svg>
  );
}
