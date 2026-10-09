import type { ReactNode } from 'react';
import { CATEGORY_META, LEVEL_TABLE } from '../game/car/carData';
import { BODY_TYPE_LABEL } from '../game/car/cosmetics';
import { carFromCustomization } from '../game/car/customization';
import { carPreviewUrl } from '../game/car/render';
import { calculateCarReport, categoryEffectPercent, type CarReport } from '../game/physics/carStats';
import {
  BODY_TYPE_ORDER,
  COLOR_PRESETS,
  COLOR_SLOT_LABEL,
  COSMETIC_META,
  MAX_LEVEL,
  MIN_LEVEL,
  UPGRADE_CATEGORIES,
  type BodyType,
  type CarCustomization,
  type CosmeticCategory,
  type CosmeticLevel,
  type ColorSlot,
  type HexColor,
} from '../game/types';

/** Seven garage bars, each normalised so 100 === a fully built Level 3 car. */
const STAT_ROWS: ReadonlyArray<[string, keyof CarReport['bars']]> = [
  ['POWER', 'POWER'],
  ['ACCEL', 'ACCELERATION'],
  ['TOP SPEED', 'TOP_SPEED'],
  ['WEIGHT', 'WEIGHT'],
  ['AERO', 'AERO'],
  ['BRAKING', 'BRAKING'],
  ['GRIP', 'GRIP'],
];

/**
 * The car, rendered from the single shared pixel-art renderer.
 *
 * This is an `<img>` of the exact rows the race paints into its texture — not a
 * CSS approximation — so wheels, headlamps, spoilers and every option level
 * show up here exactly as they will in the run.
 */
export function CarPreview({
  car,
  compact = false,
}: {
  car: CarCustomization;
  compact?: boolean;
}): ReactNode {
  const url = carPreviewUrl(carFromCustomization(car, 'LUMEN MK-I'), compact ? 4 : 8);
  return (
    <div className={`car-preview${compact ? ' car-preview--compact' : ''}`}>
      <span className="car-preview__shadow" />
      <img className="car-preview__img" src={url} alt={`${BODY_TYPE_LABEL[car.body.type]} preview`} />
    </div>
  );
}

export function StatBars({ car }: { car: CarCustomization }): ReactNode {
  const { bars } = calculateCarReport(car);
  return (
    <div className="stat-bars">
      {STAT_ROWS.map(([label, key]) => {
        const value = bars[key];
        return (
          <div className="stat-bar" key={label}>
            <span className="stat-bar__label">{label}</span>
            <span className="stat-bar__track">
              <span className="stat-bar__fill" style={{ width: `${Math.min(Math.max(value, 4), 100)}%` }} />
            </span>
            <span className="stat-bar__value mono">{Math.round(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One upgrade category: a level track plus a raw-number readout. */
export function UpgradeRow({
  category,
  level,
  stored,
  onChange,
  disabled,
}: {
  category: (typeof UPGRADE_CATEGORIES)[number];
  /** Draft level currently shown. */
  level: number;
  /** Level last saved, so the row can show what would change on Apply. */
  stored?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}): ReactNode {
  const meta = CATEGORY_META[category];
  const effect = categoryEffectPercent(category, level);
  const raw = LEVEL_TABLE[category][level - 1];
  const rawLabel = rawValueLabel(category, raw);
  const pending = stored !== undefined && stored !== level;

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
          {pending ? (
            <span className="upgrade__pending mono" title="Not saved yet — press APPLY to commit">
              L{stored} → L{level} · {rawValueLabel(category, LEVEL_TABLE[category][stored - 1])}
            </span>
          ) : null}
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

function rawValueLabel(category: (typeof UPGRADE_CATEGORIES)[number], raw: number): string {
  if (category === 'engine') return `${raw} Nm`;
  if (category === 'weight') return `${raw} kg`;
  if (category === 'aero') return `CdA ${raw.toFixed(2)}`;
  return `${(raw / 1000).toFixed(1)} kN`;
}

/** Row of equally-sized choices, used for body types, presets and cosmetic levels. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  className = '',
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; text: string; note?: string }>;
  onChange: (next: T) => void;
  disabled?: boolean;
  className?: string;
}): ReactNode {
  return (
    <div className={`field ${className}`.trim()}>
      <span className="field__label">{label}</span>
      <div className="segmented">
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`segmented__option${option.id === value ? ' is-active' : ''}`}
            onClick={() => onChange(option.id)}
            disabled={disabled || option.id === value}
            title={option.note}
          >
            <span>{option.text}</span>
            {option.note ? <small>{option.note}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BodyTypePicker({
  value,
  onChange,
}: {
  value: BodyType;
  onChange: (next: BodyType) => void;
}): ReactNode {
  return (
    <Segmented<BodyType>
      label="BODY"
      value={value}
      onChange={onChange}
      options={BODY_TYPE_ORDER.map((id) => ({ id, text: BODY_TYPE_LABEL[id] }))}
    />
  );
}

export function ColorSlotRow({
  slot,
  value,
  onChange,
}: {
  slot: ColorSlot;
  value: HexColor;
  onChange: (next: HexColor) => void;
}): ReactNode {
  return (
    <div className="field">
      <span className="field__label">{COLOR_SLOT_LABEL[slot]}</span>
      <div className="swatches">
        {COLOR_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.name}
            className={`swatch${preset.colors[slot].toLowerCase() === value.toLowerCase() ? ' is-active' : ''}`}
            style={{ background: preset.colors[slot] }}
            onClick={() => onChange(preset.colors[slot])}
            aria-label={`${COLOR_SLOT_LABEL[slot]} ${preset.name}`}
            title={`${preset.name} · ${preset.colors[slot]}`}
          />
        ))}
        <label className="swatch swatch--custom" title="Custom colour">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${COLOR_SLOT_LABEL[slot]} custom colour`}
          />
        </label>
      </div>
    </div>
  );
}

export function CosmeticPicker({
  category,
  value,
  onChange,
}: {
  category: CosmeticCategory;
  value: CosmeticLevel;
  onChange: (next: CosmeticLevel) => void;
}): ReactNode {
  const meta = COSMETIC_META[category];
  return (
    <Segmented<CosmeticLevel>
      label={meta.label}
      value={value}
      onChange={onChange}
      options={meta.levelNames.map((text, index) => ({ id: (index + 1) as CosmeticLevel, text }))}
    />
  );
}
