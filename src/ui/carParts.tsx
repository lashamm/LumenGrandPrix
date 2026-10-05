import type { ReactNode } from 'react';
import { STARTER_CAR } from '../game/car/carData';
import { CATEGORY_META, LEVEL_TABLE } from '../game/car/carData';
import { categoryEffectPercent, deriveStats, normalisedBars } from '../game/physics/carStats';
import { MAX_LEVEL, MIN_LEVEL, UPGRADE_CATEGORIES, type UpgradeLevels } from '../game/types';

/** Shared pixel-art car preview, drawn with CSS so it scales without assets. */
export function CarPreview({ accent = STARTER_CAR.bodyColor, compact = false }: { accent?: number; compact?: boolean }): ReactNode {
  const hex = `#${accent.toString(16).padStart(6, '0')}`;
  return (
    <div className={`car-preview${compact ? ' car-preview--compact' : ''}`} style={{ ['--car-colour' as string]: hex }}>
      <div className="car-preview__shadow" />
      <div className="car-preview__body">
        <div className="car-preview__cabin" />
        <div className="car-preview__stripe" />
        <div className="car-preview__nose" />
      </div>
      <div className="car-preview__wheels">
        <span className="car-preview__wheel" />
        <span className="car-preview__wheel" />
      </div>
    </div>
  );
}

export function StatBars({ levels }: { levels: UpgradeLevels }): ReactNode {
  const bars = normalisedBars(deriveStats(levels));
  const entries: Array<[string, number]> = [
    ['POWER', bars.POWER],
    ['LAUNCH', bars.LAUNCH],
    ['AERO', bars.AERO],
    ['BRAKES', bars.BRAKES],
  ];
  return (
    <div className="stat-bars">
      {entries.map(([label, value]) => (
        <div className="stat-bar" key={label}>
          <span className="stat-bar__label">{label}</span>
          <span className="stat-bar__track">
            <span className="stat-bar__fill" style={{ width: `${Math.min(Math.max(value, 4), 100)}%` }} />
          </span>
          <span className="stat-bar__value mono">{Math.round(value)}</span>
        </div>
      ))}
    </div>
  );
}

/** One upgrade category: a level track plus a raw-number readout. */
export function UpgradeRow({
  category,
  level,
  onChange,
  disabled,
}: {
  category: (typeof UPGRADE_CATEGORIES)[number];
  level: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}): ReactNode {
  const meta = CATEGORY_META[category];
  const effect = categoryEffectPercent(category, level);
  const raw = LEVEL_TABLE[category][level - 1];
  const rawLabel =
    category === 'engine'
      ? `${raw} Nm`
      : category === 'weight'
        ? `${raw} kg`
        : category === 'aero'
          ? `CdA ${raw.toFixed(2)}`
          : `${(raw / 1000).toFixed(1)} kN`;

  return (
    <article className="upgrade">
      <header className="upgrade__head">
        <div>
          <h4 className="upgrade__title">{meta.label}</h4>
          <p className="upgrade__blurb">{meta.blurb}</p>
        </div>
        <div className="upgrade__stats">
          <span className="upgrade__raw mono">{rawLabel}</span>
          <span className={`upgrade__delta${effect > 0.5 ? ' is-up' : ''}`}>
            {level === MIN_LEVEL ? 'BASE' : `+${effect.toFixed(0)}% ${meta.effect}`}
          </span>
        </div>
      </header>

      <div className="upgrade__levels">
        {Array.from({ length: MAX_LEVEL }, (_, index) => index + 1).map((value) => {
          const unlocked = value <= level;
          return (
            <button
              type="button"
              key={value}
              className={`level${unlocked ? ' is-filled' : ''}${value === level ? ' is-current' : ''}`}
              onClick={() => onChange(value)}
              disabled={disabled || value === level}
              aria-label={`${meta.label} level ${value}`}
            >
              <span className="level__pip" />
              <span className="level__name">{meta.levelNames[value - 1]}</span>
              <span className="level__number mono">L{value}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}