import type { ReactNode } from 'react';
import { LAUNCH, DRIVETRAIN, RACE_DISTANCE_M } from '../game/config';
import { STARTER_CAR, totalUpgradeScore } from '../game/car/carData';
import { deriveStats } from '../game/physics/carStats';
import { UPGRADE_CATEGORIES, type AiDifficulty, type UpgradeCategory } from '../game/types';
import type { PlayerProfile } from '../state/storage';
import { CarPreview, StatBars, UpgradeRow } from './carParts';
import { WalletPanel } from './WalletPanel';
import { AI_PROFILES } from '../game/config';

const DIFFICULTY_COPY: Record<AiDifficulty, string> = {
  easy: 'Fumbles shifts and launches off the optimum. Good place to learn the rev window.',
  medium: 'Occasional mistakes. Beatable with clean launches and tidy shifts.',
  hard: 'Almost no mistakes. You will need a well-built car to keep up.',
};

export function CustomizeScreen({
  profile,
  onUpgrade,
  onDifficulty,
  onPlay,
  onBack,
}: {
  profile: PlayerProfile;
  onUpgrade: (category: UpgradeCategory, level: number) => void;
  onDifficulty: (difficulty: AiDifficulty) => void;
  onPlay: () => void;
  onBack: () => void;
}): ReactNode {
  const stats = deriveStats(profile.upgrades);
  const powerToWeight = stats.peakTorqueNm / stats.massKg;

  return (
    <div className="screen screen--split">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">CUSTOMIZE</h2>
            <p className="sheet__sub">
              {STARTER_CAR.name} · build {totalUpgradeScore(profile.upgrades)}/8
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={onPlay}>
            RACE ›
          </button>
        </header>

        <section className="panel panel--callout">
          <p>
            <strong>Your car gives you potential. Your skill decides whether you can use it.</strong> A
            fully built Level 3 car is faster, but it loses to a well-driven Level 1 car far more often
            than the raw numbers suggest. Every upgrade below is a free test upgrade — nothing is
            purchased and nothing is stored on chain.
          </p>
        </section>

        <div className="upgrade-grid">
          {UPGRADE_CATEGORIES.map((category) => (
            <UpgradeRow
              key={category}
              category={category}
              level={profile.upgrades[category]}
              onChange={(level) => onUpgrade(category, level)}
            />
          ))}
        </div>

        <section className="panel">
          <h3 className="panel__title">OPPONENT DIFFICULTY</h3>
          <div className="segmented" role="group" aria-label="Opponent difficulty">
            {(Object.keys(AI_PROFILES) as AiDifficulty[]).map((difficulty) => (
              <button
                type="button"
                key={difficulty}
                className={`segmented__option${profile.difficulty === difficulty ? ' is-active' : ''}`}
                onClick={() => onDifficulty(difficulty)}
              >
                {AI_PROFILES[difficulty].label.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="panel__note">{DIFFICULTY_COPY[profile.difficulty]}</p>
          <p className="panel__note panel__note--muted">
            The AI uses the identical physics engine as you. Difficulty only changes how accurately it
            hits its shift points and launch revs.
          </p>
        </section>
      </main>

      <aside className="sidebar">
        <section className="panel">
          <h3 className="panel__title">GARAGE</h3>
          <CarPreview />
          <div className="panel__row">
            <span>{STARTER_CAR.name}</span>
            <span className="mono">{STARTER_CAR.codename.toUpperCase()}</span>
          </div>
          <StatBars levels={profile.upgrades} />
        </section>

        <section className="panel">
          <h3 className="panel__title">MEASURED SPEC</h3>
          <dl className="spec-list">
            <div>
              <dt>PEAK TORQUE</dt>
              <dd className="mono">{stats.peakTorqueNm.toFixed(0)} Nm</dd>
            </div>
            <div>
              <dt>MASS</dt>
              <dd className="mono">{stats.massKg.toFixed(0)} kg</dd>
            </div>
            <div>
              <dt>POWER / WEIGHT</dt>
              <dd className="mono">{powerToWeight.toFixed(3)} Nm/kg</dd>
            </div>
            <div>
              <dt>BRAKE FORCE</dt>
              <dd className="mono">{(stats.brakeForceN / 1000).toFixed(1)} kN</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h3 className="panel__title">HOW THE RACE WORKS</h3>
          <ul className="tick-list">
            <li>
              Stage on the line and <strong>hold GAS</strong> to build revs. Aim for{' '}
              <strong className="mono">{LAUNCH.optimalRpm} RPM</strong>, then release.
            </li>
            <li>
              Hold GAS through the run. <strong>Upshift</strong> as the needle reaches{' '}
              <strong className="mono">{DRIVETRAIN.shiftUpRpm.toLocaleString('en-US')} RPM</strong> — the
              teal band on the tacho.
            </li>
            <li>
              Shift inside the band and you keep your acceleration. Shift early and the next gear bogs.
              Bang the limiter and you lose far more.
            </li>
            <li>
              <strong>Downshift</strong> is there for recovery, but upshifting is what wins races.
            </li>
            <li>First car over {RACE_DISTANCE_M} m takes the run.</li>
          </ul>
        </section>

        <WalletPanel compact />
      </aside>
    </div>
  );
}

export function GarageScreen({ profile, onBack }: { profile: PlayerProfile; onBack: () => void }): ReactNode {
  const stats = deriveStats(profile.upgrades);
  return (
    <div className="screen screen--split">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">GARAGE</h2>
            <p className="sheet__sub">One starter car. Everything else comes later.</p>
          </div>
          <span className="badge badge--devnet">DEVNET</span>
        </header>

        <CarPreview />

        <section className="panel">
          <h3 className="panel__title">{STARTER_CAR.name}</h3>
          <p className="panel__note">{STARTER_CAR.description}</p>
          <StatBars levels={profile.upgrades} />
        </section>

        <section className="panel">
          <h3 className="panel__title">BUILD</h3>
          <dl className="spec-list">
            {(Object.keys(profile.upgrades) as UpgradeCategory[]).map((category) => (
              <div key={category}>
                <dt>{category.toUpperCase()}</dt>
                <dd className="mono">LEVEL {profile.upgrades[category]}</dd>
              </div>
            ))}
          </dl>
          <p className="panel__note">
            {stats.peakTorqueNm.toFixed(0)} Nm · {stats.massKg.toFixed(0)} kg ·{' '}
            {(stats.brakeForceN / 1000).toFixed(1)} kN brakes
          </p>
        </section>
      </main>

      <aside className="sidebar">
        <WalletPanel compact />
      </aside>
    </div>
  );
}