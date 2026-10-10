import { useCallback, useState, type ReactNode } from 'react';
import { LAUNCH, DRIVETRAIN, RACE_DISTANCE_M, AI_PROFILES } from '../game/config';
import { STARTER_CAR } from '../game/car/carData';
import { BODY_TYPE_LABEL } from '../game/car/cosmetics';
import {
  buildCode,
  buildScore,
  cloneCar,
  colorOf,
  COLOR_SLOT_ENTRIES,
  COSMETIC_SLOT_GROUPS,
  cosmeticOf,
  DEFAULT_CAR,
  describeCarDiff,
  withBody,
  withColor,
  withCosmetic,
  withPerformance,
} from '../game/car/customization';
import { calculateCarReport } from '../game/physics/carStats';
import {
  BODY_TYPE_ORDER,
  COSMETIC_META,
  UPGRADE_CATEGORIES,
  type AiDifficulty,
  type CarCustomization,
} from '../game/types';
import { carForCategory, type GarageCategory, type PlayerProfile } from '../state/storage';
import {
  BodyTypePicker,
  CarPreview,
  ColorSlotRow,
  CosmeticPicker,
  StatBars,
  UpgradeRow,
} from './carParts';
import { WalletPanel } from './WalletPanel';

const DIFFICULTY_COPY: Record<AiDifficulty, string> = {
  easy: 'Fumbles shifts and launches off the optimum. Good place to learn the rev window.',
  medium: 'Occasional mistakes. Beatable with clean launches and tidy shifts.',
  hard: 'Almost no mistakes. You will need a well-built car to keep up.',
};

type Tab = 'build' | 'paint' | 'parts';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'build', label: 'BUILD' },
  { id: 'paint', label: 'PAINT' },
  { id: 'parts', label: 'PARTS' },
];

/** Cosmetic panels, in the order the pickers appear under PARTS. */
const PART_PANELS: ReadonlyArray<{ group: 'wheels' | 'appearance' | 'parts'; title: string }> = [
  { group: 'wheels', title: 'WHEELS' },
  { group: 'appearance', title: 'FINISH' },
  { group: 'parts', title: 'BODY PARTS' },
];

type Dialog = 'apply' | 'discard' | 'reset' | null;

/**
 * The garage.
 *
 * Every control edits a **draft**. The stored car only changes when the player
 * presses APPLY and confirms the diff — so nothing half-finished is ever
 * saved, and backing out with unsaved work asks before throwing it away.
 */
export function CustomizeScreen({
  profile,
  category,
  onCategoryChange,
  onApply,
  onDifficulty,
  onPlay,
  onBack,
}: {
  profile: PlayerProfile;
  /** Which bay is being edited: the drag car or the circuit car. */
  category: GarageCategory;
  onCategoryChange: (category: GarageCategory) => void;
  /** Called once, with the whole car, when the player confirms a change. */
  onApply: (category: GarageCategory, car: CarCustomization) => void;
  onDifficulty: (difficulty: AiDifficulty) => void;
  onPlay: () => void;
  onBack: () => void;
}): ReactNode {
  const saved = carForCategory(profile, category);
  const isCircuit = category === 'circuit';
  const [tab, setTab] = useState<Tab>('build');
  const [draft, setDraft] = useState<CarCustomization>(() => cloneCar(saved));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingPlay, setPendingPlay] = useState(false);

  const changes = describeCarDiff(saved, draft);
  const dirty = changes.length > 0;
  const report = calculateCarReport(draft);

  /**
   * The circuit bay edits a Formula single-seater: its body shape and road-car
   * body parts (bumpers, hood, exhaust, headlights) do not exist on the sprite,
   * so those panels are not shown there rather than offered and ignored.
   */
  const tabs = isCircuit ? TABS.filter((entry) => entry.id !== 'parts') : TABS;

  const changeCategory = (next: GarageCategory) => {
    if (next === 'circuit' && tab === 'parts') setTab('build');
    onCategoryChange(next);
  };

  const commit = useCallback(
    (car: CarCustomization) => {
      const next = cloneCar(car);
      onApply(category, next);
      setDraft(cloneCar(next));
    },
    [onApply, category],
  );

  const requestBack = () => {
    if (dirty) setDialog('discard');
    else onBack();
  };

  const requestPlay = () => {
    if (!dirty) {
      onPlay();
      return;
    }
    setPendingPlay(true);
    setDialog('apply');
  };

  const confirmApply = () => {
    commit(draft);
    setDialog(null);
    if (pendingPlay) {
      setPendingPlay(false);
      onPlay();
    }
  };

  const confirmDiscard = () => {
    setDraft(cloneCar(saved));
    setDialog(null);
    onBack();
  };

  const confirmReset = () => {
    commit(DEFAULT_CAR);
    setDialog(null);
  };

  return (
    <div className="screen screen--garage">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={requestBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">CUSTOMIZE</h2>
            <p className="sheet__sub">
              {isCircuit ? 'FORMULA' : BODY_TYPE_LABEL[draft.body.type]} · build {buildScore(draft)}/8
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={requestPlay}>
            RACE ›
          </button>
        </header>

        <GarageBays category={category} onChange={changeCategory} />

        <div className="tabs" role="tablist" aria-label="Customize sections">
          {tabs.map((entry) => (
            <button
              type="button"
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`tab${tab === entry.id ? ' is-active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'build' && (
          <>
            <section className="panel panel--callout">
              <p>
                <strong>Your car gives you potential. Your skill decides whether you can use it.</strong>{' '}
                A fully built Level 3 car is faster, but it loses to a well-driven Level 1 car far more
                often than the raw numbers suggest. Every upgrade below is a free test upgrade — nothing
                is purchased and nothing is stored on chain.
              </p>
            </section>

            <div className="upgrade-grid">
              {UPGRADE_CATEGORIES.map((category) => (
                <UpgradeRow
                  key={category}
                  category={category}
                  level={draft.performance[category]}
                  stored={saved.performance[category]}
                  onChange={(level) => setDraft((previous) => withPerformance(previous, category, level))}
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
          </>
        )}

        {tab === 'paint' && (
          <>
            {isCircuit ? (
              <section className="panel">
                <h3 className="panel__title">LIVERY</h3>
                <p className="panel__note panel__note--muted">
                  The circuit car is a fixed Formula chassis — there is no body shape to pick. Paint it
                  below; every slot lands on the sprite: BODY paints the shell, TRIM the sidepods,
                  ACCENT the helmet, WHEELS the nose tip and rims and GLASS the cockpit.
                </p>
              </section>
            ) : (
              <section className="panel">
                <h3 className="panel__title">BODY</h3>
                <BodyTypePicker value={draft.body.type} onChange={(type) => setDraft((p) => withBody(p, type))} />
                <p className="panel__note panel__note--muted">
                  Body type is cosmetic only in this build — every shape has the same mass and drag, so the
                  numbers below never move when you switch.
                </p>
              </section>
            )}

            <section className="panel">
              <h3 className="panel__title">COLOURS</h3>
              {COLOR_SLOT_ENTRIES.map(({ slot }) => (
                <ColorSlotRow
                  key={slot}
                  slot={slot}
                  value={colorOf(draft, slot)}
                  onChange={(value) => setDraft((previous) => withColor(previous, slot, value))}
                />
              ))}
              <p className="panel__note panel__note--muted">
                Swatches are shared presets; the colour input at the end of each row lets you dial in any
                hex value.
              </p>
            </section>
          </>
        )}

        {tab === 'parts' && !isCircuit && (
          <>
            {PART_PANELS.map((panel) => (
              <section className="panel" key={panel.group}>
                <h3 className="panel__title">{panel.title}</h3>
                <div className="parts-grid">
                  {COSMETIC_SLOT_GROUPS.filter((entry) => entry.group === panel.group).map((entry) => (
                    <CosmeticPicker
                      key={entry.key}
                      category={entry.key}
                      value={cosmeticOf(draft, entry.key)}
                      onChange={(level) => setDraft((previous) => withCosmetic(previous, entry.key, level))}
                    />
                  ))}
                </div>
              </section>
            ))}
            <section className="panel panel--muted">
              <p className="panel__note panel__note--muted">
                Every option is drawn by the same pixel-art factory the race uses, so the preview is the
                car you will drive. None of these are NFTs and none are stored on chain.
              </p>
            </section>
          </>
        )}
      </main>

      <section className="garage-stage">
        <section className="panel">
          <h3 className="panel__title">
            {category === 'drag' ? 'DRAG CAR' : 'CIRCUIT CAR'} · PREVIEW{' '}
            <span className={`chip${dirty ? ' chip--warn' : ' chip--ok'}`}>
              {dirty ? 'UNAPPLIED' : 'SAVED ✓'}
            </span>
          </h3>
          <CarPreview car={draft} category={category} />
          <div className="panel__row">
            <span>{isCircuit ? 'FORMULA' : BODY_TYPE_LABEL[draft.body.type]}</span>
            <span className="mono">{buildCode(draft)}</span>
          </div>
          <StatBars car={draft} />
        </section>

        <section className="panel">
          <h3 className="panel__title">MEASURED SPEC</h3>
          <dl className="spec-list">
            <div>
              <dt>PEAK POWER</dt>
              <dd className="mono">{report.powerKw.toFixed(0)} kW</dd>
            </div>
            <div>
              <dt>PEAK TORQUE</dt>
              <dd className="mono">{report.torqueNm.toFixed(0)} Nm</dd>
            </div>
            <div>
              <dt>MASS</dt>
              <dd className="mono">{report.massKg.toFixed(0)} kg</dd>
            </div>
            <div>
              <dt>POWER / WEIGHT</dt>
              <dd className="mono">{report.powerToWeight.toFixed(3)} Nm/kg</dd>
            </div>
            <div>
              <dt>TOP SPEED</dt>
              <dd className="mono">{report.topSpeedKph.toFixed(0)} km/h</dd>
            </div>
            <div>
              <dt>BRAKE FORCE</dt>
              <dd className="mono">{report.brakeKn.toFixed(1)} kN</dd>
            </div>
          </dl>
        </section>

        {dirty && (
          <section className="panel panel--callout">
            <h3 className="panel__title">PENDING CHANGES</h3>
            <ul className="diff-list">
              {changes.map((change) => (
                <li key={`${change.label}:${change.before}`}>
                  {change.swatch ? (
                    <>
                      <span className="diff-list__label">{change.label}</span>
                      <span className="diff-list__swatches">
                        <span className="swatch-dot" style={{ background: change.swatch.before }} />
                        <span className="swatch-arrow" aria-hidden="true">
                          ›
                        </span>
                        <span className="swatch-dot" style={{ background: change.swatch.after }} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="diff-list__label">{change.label}</span>
                      <span className="diff-list__value mono">
                        {change.before} › {change.after}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="panel__note panel__note--muted">Nothing is saved until you press APPLY.</p>
          </section>
        )}
      </section>

      <aside className="sidebar">
        <section className="panel">
          <h3 className="panel__title">
            HOW THE {category === 'drag' ? 'DRAG' : 'CIRCUIT'} RACE WORKS
          </h3>
          {category === 'drag' ? (
            <ul className="tick-list">
              <li>
                Stage on the line and <strong>hold GAS</strong> to build revs. Aim for{' '}
                <strong className="mono">{LAUNCH.optimalRpm} RPM</strong>, then release. On a keyboard that is{' '}
                <strong className="mono">W</strong> or <strong className="mono">SPACE</strong>.
              </li>
              <li>
                Hold GAS through the run. <strong>Upshift</strong> as the needle reaches{' '}
                <strong className="mono">{DRIVETRAIN.shiftUpRpm.toLocaleString('en-US')} RPM</strong> — the
                teal band on the tacho. Keys: <strong className="mono">E</strong> / <strong className="mono">SHIFT</strong>.
              </li>
              <li>
                Shift inside the band and you keep your acceleration. Shift early and the next gear bogs.
                Bang the limiter and you lose far more.
              </li>
              <li>
                <strong>Brake</strong> with <strong className="mono">S</strong>, downshift with{' '}
                <strong className="mono">Q</strong> — recovery tools, not race-winners.
              </li>
              <li>First car over {RACE_DISTANCE_M} m takes the run.</li>
            </ul>
          ) : (
            <ul className="tick-list">
              <li>
                No steering. Hold <strong>THROTTLE</strong> (W / ↑) and <strong>BRAKE</strong> (S / ↓ /{' '}
                SPACE). The tires corner for you.
              </li>
              <li>
                Carry too much speed into a turn and you slide, lock up or spin. Watch the{' '}
                <strong>GRIP</strong> bar: green is safe, yellow is the limit, red is a slide.
              </li>
              <li>
                <strong>TIRES</strong> raise the cornering budget and <strong>BRAKES</strong> the braking
                one — both matter more here than on the strip.
              </li>
              <li>Lighter builds rotate faster; more aero stays planted in the fast sweepers.</li>
            </ul>
          )}
        </section>

        <WalletPanel compact />
      </aside>

      <footer className="garage-actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setDialog('reset')}
          disabled={!dirty}
        >
          RESET TO DEFAULT
        </button>
        <span className="garage-actions__status">
          {dirty ? `${changes.length} CHANGE${changes.length === 1 ? '' : 'S'} NOT APPLIED` : 'ALL CHANGES SAVED'}
        </span>
        <span className="garage-actions__spacer" />
        <button type="button" className="btn btn--ghost" onClick={() => setDraft(cloneCar(saved))} disabled={!dirty}>
          DISCARD
        </button>
        <button type="button" className="btn btn--primary" onClick={() => setDialog('apply')} disabled={!dirty}>
          APPLY CHANGES
        </button>
      </footer>

      {dialog === 'apply' && (
        <div className="dialog-overlay" role="presentation" onClick={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Apply changes">
            <header className="dialog__head">
              <h3>{pendingPlay ? 'APPLY BEFORE RACING?' : 'APPLY CHANGES?'}</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog(null)}>
                ✕
              </button>
            </header>
            <p className="dialog__note">
              {changes.length} change{changes.length === 1 ? '' : 's'} will be saved to this browser.
            </p>
            <ul className="diff-list">
              {changes.map((change) => (
                <li key={`${change.label}:${change.before}`}>
                  <span className="diff-list__label">{change.label}</span>
                  <span className="diff-list__value mono">
                    {change.before} › {change.after}
                  </span>
                </li>
              ))}
            </ul>
            <p className="dialog__note dialog__note--muted">
              Saved locally as profile version 1. Nothing is written to the blockchain.
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>
                CANCEL
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmApply}>
                {pendingPlay ? 'APPLY & RACE' : 'APPLY CHANGES'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'discard' && (
        <div className="dialog-overlay" role="presentation" onClick={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Discard changes">
            <header className="dialog__head">
              <h3>DISCARD CHANGES?</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog(null)}>
                ✕
              </button>
            </header>
            <p className="dialog__note">
              {changes.length} unsaved change{changes.length === 1 ? '' : 's'} will be lost.
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>
                KEEP EDITING
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmDiscard}>
                DISCARD
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog === 'reset' && (
        <div className="dialog-overlay" role="presentation" onClick={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Reset to default">
            <header className="dialog__head">
              <h3>RESET TO DEFAULT?</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog(null)}>
                ✕
              </button>
            </header>
            <p className="dialog__note">
              Body, colours, wheels, parts and performance all return to the stock Level 1 build. This is
              saved immediately.
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>
                CANCEL
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmReset}>
                RESET CAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Drag / circuit bay switcher, shared by the garage and customize screens. */
export function GarageBays({
  category,
  onChange,
}: {
  category: GarageCategory;
  onChange: (category: GarageCategory) => void;
}): ReactNode {
  return (
    <div className="garage-bays" role="group" aria-label="Garage bay">
      <button
        type="button"
        className={`garage-bay${category === 'drag' ? ' is-active' : ''}`}
        aria-pressed={category === 'drag'}
        onClick={() => onChange('drag')}
      >
        <span className="garage-bay__name">DRAG CAR</span>
        <span className="garage-bay__note">300 m strip build</span>
      </button>
      <button
        type="button"
        className={`garage-bay${category === 'circuit' ? ' is-active' : ''}`}
        aria-pressed={category === 'circuit'}
        onClick={() => onChange('circuit')}
      >
        <span className="garage-bay__name">CIRCUIT CAR</span>
        <span className="garage-bay__note">Throttle &amp; brake build</span>
      </button>
    </div>
  );
}

/** Read-only showroom for a saved bay. No draft, no APPLY. */
export function GarageScreen({
  profile,
  category,
  onCategoryChange,
  onBack,
  onCustomize,
}: {
  profile: PlayerProfile;
  category: GarageCategory;
  onCategoryChange: (category: GarageCategory) => void;
  onBack: () => void;
  onCustomize?: () => void;
}): ReactNode {
  const car = carForCategory(profile, category);
  const isCircuit = category === 'circuit';
  const report = calculateCarReport(car);
  const cosmeticKeys = COSMETIC_SLOT_GROUPS.map((entry) => entry.key);

  return (
    <div className="screen screen--split">
      <main className="sheet">
        <header className="sheet__head">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
            ‹ MENU
          </button>
          <div>
            <h2 className="sheet__title">GARAGE</h2>
            <p className="sheet__sub">
              {isCircuit ? 'FORMULA' : BODY_TYPE_LABEL[car.body.type]} · build {buildScore(car)}/8 ·{' '}
              {formatRecord(profile)}
            </p>
          </div>
          {onCustomize ? (
            <button type="button" className="btn btn--ghost" onClick={onCustomize}>
              CUSTOMIZE ›
            </button>
          ) : null}
        </header>

        <GarageBays category={category} onChange={onCategoryChange} />

        <CarPreview car={car} category={category} />

        <section className="panel">
          <h3 className="panel__title">
            {isCircuit ? 'CIRCUIT CAR' : 'DRAG CAR'} · LUMEN MK-I
          </h3>
          <p className="panel__note">{STARTER_CAR.description}</p>
          <StatBars car={car} />
        </section>

        <section className="panel">
          <h3 className="panel__title">BUILD</h3>
          <dl className="spec-list">
            {UPGRADE_CATEGORIES.map((entry) => (
              <div key={entry}>
                <dt>{entry.toUpperCase()}</dt>
                <dd className="mono">LEVEL {car.performance[entry]}</dd>
              </div>
            ))}
            <div>
              <dt>PEAK POWER</dt>
              <dd className="mono">{report.powerKw.toFixed(0)} kW</dd>
            </div>
            <div>
              <dt>TOP SPEED</dt>
              <dd className="mono">{report.topSpeedKph.toFixed(0)} km/h</dd>
            </div>
          </dl>
        </section>

        {isCircuit ? (
          <section className="panel">
            <h3 className="panel__title">LIVERY</h3>
            <dl className="spec-list">
              {COLOR_SLOT_ENTRIES.map(({ slot, label }) => (
                <div key={slot}>
                  <dt>{label}</dt>
                  <dd className="mono">
                    <span className="swatch-dot" style={{ background: colorOf(car, slot) }} />{' '}
                    {colorOf(car, slot).toUpperCase()}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <section className="panel">
            <h3 className="panel__title">COSMETICS</h3>
            <dl className="spec-list">
              {cosmeticKeys.map((key) => (
                <div key={key}>
                  <dt>{COSMETIC_META[key].label}</dt>
                  <dd className="mono">LVL {cosmeticOf(car, key)}</dd>
                </div>
              ))}
              <div>
                <dt>BODY</dt>
                <dd className="mono">{BODY_TYPE_LABEL[car.body.type].toUpperCase()}</dd>
              </div>
            </dl>
          </section>
        )}
      </main>

      <aside className="sidebar">
        <section className="panel">
          <h3 className="panel__title">{isCircuit ? 'THE FORMULA CHASSIS' : 'BODY TYPES'}</h3>
          <p className="panel__note">
            {isCircuit
              ? 'A fixed single-seater chassis: paint and setup only, no body or road-car parts.'
              : BODY_TYPE_ORDER.map((id) => BODY_TYPE_LABEL[id]).join(' · ')}
          </p>
        </section>
        <WalletPanel compact />
      </aside>
    </div>
  );
}

function formatRecord(profile: PlayerProfile): string {
  return `${profile.races} races · ${profile.wins} wins`;
}
