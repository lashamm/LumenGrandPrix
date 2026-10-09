import {
  BODY_TYPE_ORDER,
  CAR_SCHEMA_VERSION,
  COLOR_SLOTS,
  COLOR_SLOT_LABEL,
  COSMETIC_META,
  DEFAULT_COSMETIC_OPTIONS,
  UPGRADE_CATEGORIES,
  type BodyType,
  type CarColors,
  type CarCustomization,
  type CarCosmetics,
  type CosmeticCategory,
  type CosmeticLevel,
  type CosmeticOptions,
  type ColorSlot,
  type HexColor,
  type UpgradeCategory,
  type UpgradeLevels,
} from '../types';
import { CATEGORY_META, sanitizeLevels, totalUpgradeScore, type CarDefinition } from './carData';
import { BODY_TYPE_LABEL, isHexColor } from './cosmetics';

/**
 * The car, end to end.
 *
 * This module owns the player's car: its default, the validation that runs
 * before anything is loaded, the bridge into the renderer's `CarDefinition`,
 * and the diff used by the garage's apply confirmation. The garage, the race
 * and persistence all go through here, so there is no second copy of the car
 * anywhere in the app.
 */

export const DEFAULT_CAR: CarCustomization = {
  version: CAR_SCHEMA_VERSION,
  body: { type: 'coupe', primary: '#141824', secondary: '#0a0d14' },
  wheels: { style: 1, rimColor: '#c9d2e6' },
  appearance: {
    windowTint: '#16233a',
    accentColor: '#37e0c8',
    headlights: 1,
    decal: 1,
    stripes: 1,
  },
  parts: { spoiler: 1, frontBumper: 1, rearBumper: 1, hood: 1, exhaust: 1 },
  performance: { engine: 1, weight: 1, aero: 1, brakes: 1, tires: 1 },
};

const COSMETIC_SLOTS: ReadonlyArray<{ group: 'appearance' | 'parts' | 'wheels'; key: CosmeticCategory }> = [
  { group: 'wheels', key: 'wheels' },
  { group: 'appearance', key: 'headlights' },
  { group: 'appearance', key: 'decal' },
  { group: 'appearance', key: 'stripes' },
  { group: 'parts', key: 'spoiler' },
  { group: 'parts', key: 'frontBumper' },
  { group: 'parts', key: 'rearBumper' },
  { group: 'parts', key: 'hood' },
  { group: 'parts', key: 'exhaust' },
];

function readLevel(raw: unknown, fallback: CosmeticLevel): CosmeticLevel {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 3) return raw as CosmeticLevel;
  return fallback;
}

function readColor(raw: unknown, fallback: HexColor): HexColor {
  return isHexColor(raw) ? (raw.toLowerCase() as HexColor) : fallback;
}

function readBodyType(raw: unknown, fallback: BodyType): BodyType {
  return BODY_TYPE_ORDER.includes(raw as BodyType) ? (raw as BodyType) : fallback;
}

/**
 * Rebuilds the car from untrusted storage.
 *
 * Every field falls back independently, so a hand-edited or outdated
 * localStorage entry can at worst reset one slot rather than the whole car.
 */
export function sanitizeCar(raw: unknown): CarCustomization {
  const fallback = DEFAULT_CAR;
  if (typeof raw !== 'object' || raw === null) return cloneCar(fallback);
  const record = raw as Record<string, unknown>;

  const body = nested(record, 'body');
  const wheels = nested(record, 'wheels');
  const appearance = nested(record, 'appearance');
  const parts = nested(record, 'parts');

  const next: CarCustomization = {
    version: CAR_SCHEMA_VERSION,
    body: {
      type: readBodyType(body?.type, fallback.body.type),
      primary: readColor(body?.primary, fallback.body.primary),
      secondary: readColor(body?.secondary, fallback.body.secondary),
    },
    wheels: {
      style: readLevel(wheels?.style, fallback.wheels.style),
      rimColor: readColor(wheels?.rimColor, fallback.wheels.rimColor),
    },
    appearance: {
      windowTint: readColor(appearance?.windowTint, fallback.appearance.windowTint),
      accentColor: readColor(appearance?.accentColor, fallback.appearance.accentColor),
      headlights: readLevel(appearance?.headlights, fallback.appearance.headlights),
      decal: readLevel(appearance?.decal, fallback.appearance.decal),
      stripes: readLevel(appearance?.stripes, fallback.appearance.stripes),
    },
    parts: {
      spoiler: readLevel(parts?.spoiler, fallback.parts.spoiler),
      frontBumper: readLevel(parts?.frontBumper, fallback.parts.frontBumper),
      rearBumper: readLevel(parts?.rearBumper, fallback.parts.rearBumper),
      hood: readLevel(parts?.hood, fallback.parts.hood),
      exhaust: readLevel(parts?.exhaust, fallback.parts.exhaust),
    },
    performance: sanitizeLevels(record.performance as Partial<UpgradeLevels> | undefined),
  };

  // The field-by-field parse above *is* the migration: it only ever accepts
  // values it understands, so an unknown or wrong version degrades to defaults
  // for that field instead of rejecting the whole car.
  return next;
}

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function cloneCar(car: CarCustomization): CarCustomization {
  return {
    version: CAR_SCHEMA_VERSION,
    body: { ...car.body },
    wheels: { ...car.wheels },
    appearance: { ...car.appearance },
    parts: { ...car.parts },
    performance: { ...car.performance },
  };
}

/** Upgrade levels, the shape the physics engine has always taken. */
export function performanceOf(car: CarCustomization): UpgradeLevels {
  return car.performance;
}

/** True when two cars are identical field-for-field (used for dirty checks). */
export function isSameCar(a: CarCustomization, b: CarCustomization): boolean {
  return describeCarDiff(a, b).length === 0;
}

/**
 * Turns the player's car into the definition the renderer consumes.
 *
 * This is the only bridge between "what the player configured" and "what gets
 * drawn", so the garage preview and the race car can never disagree.
 */
export function carFromCustomization(car: CarCustomization, name: string): CarDefinition {
  const colors: CarColors = {
    primary: car.body.primary,
    secondary: car.body.secondary,
    rim: car.wheels.rimColor,
    window: car.appearance.windowTint,
    accent: car.appearance.accentColor,
  };
  const options: CosmeticOptions = {
    ...DEFAULT_COSMETIC_OPTIONS,
    wheels: car.wheels.style,
    headlights: car.appearance.headlights,
    decal: car.appearance.decal,
    stripes: car.appearance.stripes,
    spoiler: car.parts.spoiler,
    frontBumper: car.parts.frontBumper,
    rearBumper: car.parts.rearBumper,
    hood: car.parts.hood,
    exhaust: car.parts.exhaust,
  };

  return {
    id: `player-${car.body.type}`,
    name,
    codename: BODY_TYPE_LABEL[car.body.type],
    description: '',
    bodyType: car.body.type,
    colors,
    options,
  };
}

/**
 * Migrates the pre-`CarCustomization` profile shape
 * (`upgrades` + `cosmetics`) into the single configuration.
 */
export function customizationFromLegacy(
  upgrades: Partial<UpgradeLevels> | undefined,
  cosmetics: CarCosmetics | undefined,
): CarCustomization {
  const colors: CarColors = cosmetics?.colors ?? DEFAULT_COLORS_LEGACY;
  const options: CosmeticOptions = { ...DEFAULT_COSMETIC_OPTIONS, ...cosmetics?.options };
  return sanitizeCar({
    version: CAR_SCHEMA_VERSION,
    body: { type: cosmetics?.bodyType, primary: colors.primary, secondary: colors.secondary },
    wheels: { style: options.wheels, rimColor: colors.rim },
    appearance: {
      windowTint: colors.window,
      accentColor: colors.accent,
      headlights: options.headlights,
      decal: options.decal,
      stripes: options.stripes,
    },
    parts: {
      spoiler: options.spoiler,
      frontBumper: options.frontBumper,
      rearBumper: options.rearBumper,
      hood: options.hood,
      exhaust: options.exhaust,
    },
    performance: upgrades,
  });
}

const DEFAULT_COLORS_LEGACY: CarColors = {
  primary: '#141824',
  secondary: '#0a0d14',
  rim: '#c9d2e6',
  window: '#16233a',
  accent: '#37e0c8',
};

/** One line of the apply-confirmation summary. */
export interface CarChange {
  label: string;
  before: string;
  after: string;
  /** Present for colour changes so the dialog can show the swatches. */
  swatch?: { before: HexColor; after: HexColor };
}

/** Every field that differs between two cars, in a readable order. */
export function describeCarDiff(from: CarCustomization, to: CarCustomization): CarChange[] {
  const changes: CarChange[] = [];

  if (from.body.type !== to.body.type) {
    changes.push({
      label: 'Body',
      before: BODY_TYPE_LABEL[from.body.type],
      after: BODY_TYPE_LABEL[to.body.type],
    });
  }

  const colors: Array<[string, HexColor, HexColor]> = [
    ['Primary', from.body.primary, to.body.primary],
    ['Secondary', from.body.secondary, to.body.secondary],
    ['Rim', from.wheels.rimColor, to.wheels.rimColor],
    ['Window tint', from.appearance.windowTint, to.appearance.windowTint],
    ['Accent', from.appearance.accentColor, to.appearance.accentColor],
  ];
  for (const [label, before, after] of colors) {
    if (before.toLowerCase() !== after.toLowerCase()) {
      changes.push({ label, before, after, swatch: { before, after } });
    }
  }

  const levels: Array<[string, CosmeticLevel, CosmeticLevel]> = [
    ['Wheels', from.wheels.style, to.wheels.style],
    ['Headlights', from.appearance.headlights, to.appearance.headlights],
    ['Decal', from.appearance.decal, to.appearance.decal],
    ['Stripes', from.appearance.stripes, to.appearance.stripes],
    ['Spoiler', from.parts.spoiler, to.parts.spoiler],
    ['Front bumper', from.parts.frontBumper, to.parts.frontBumper],
    ['Rear bumper', from.parts.rearBumper, to.parts.rearBumper],
    ['Hood', from.parts.hood, to.parts.hood],
    ['Exhaust', from.parts.exhaust, to.parts.exhaust],
  ];
  const cosmeticKeyByLabel: Record<string, CosmeticCategory> = {
    Wheels: 'wheels',
    Headlights: 'headlights',
    Decal: 'decal',
    Stripes: 'stripes',
    Spoiler: 'spoiler',
    'Front bumper': 'frontBumper',
    'Rear bumper': 'rearBumper',
    Hood: 'hood',
    Exhaust: 'exhaust',
  };
  for (const [label, before, after] of levels) {
    if (before === after) continue;
    const meta = COSMETIC_META[cosmeticKeyByLabel[label]];
    changes.push({
      label,
      before: meta.levelNames[before - 1],
      after: meta.levelNames[after - 1],
    });
  }

  for (const category of UPGRADE_CATEGORIES) {
    const before = from.performance[category];
    const after = to.performance[category];
    if (before === after) continue;
    changes.push({
      label: CATEGORY_META[category].label,
      before: `LV${before} ${CATEGORY_META[category].levelNames[before - 1]}`,
      after: `LV${after} ${CATEGORY_META[category].levelNames[after - 1]}`,
    });
  }

  return changes;
}

/** Compact build code, e.g. `E2 W1 A3 B1 T1`. */
export function buildCode(car: CarCustomization): string {
  return `E${car.performance.engine} W${car.performance.weight} A${car.performance.aero} B${car.performance.brakes} T${car.performance.tires}`;
}

/** Total upgrade points spent, `0`..`8`. */
export function buildScore(car: CarCustomization): number {
  return totalUpgradeScore(car.performance);
}

/** Every colour slot the garage can edit, with its label. */
export const COLOR_SLOT_ENTRIES = COLOR_SLOTS.map((slot) => ({ slot, label: COLOR_SLOT_LABEL[slot] }));

/** Cosmetic groups, in panel order. Exported so the garage cannot drift. */
export const COSMETIC_SLOT_GROUPS = COSMETIC_SLOTS;

// ------------------------------------------------------- edit combinators --

/*
 * Small immutable editors. The garage never mutates state in place — it asks
 * for the next car and keeps it as a draft until Apply — so each helper clones
 * and returns rather than modifying. Going through here is what stops a picker
 * from writing a value the renderer or the physics engine would reject.
 */

export function colorOf(car: CarCustomization, slot: ColorSlot): HexColor {
  switch (slot) {
    case 'primary':
      return car.body.primary;
    case 'secondary':
      return car.body.secondary;
    case 'rim':
      return car.wheels.rimColor;
    case 'window':
      return car.appearance.windowTint;
    case 'accent':
      return car.appearance.accentColor;
  }
}

export function withColor(car: CarCustomization, slot: ColorSlot, value: HexColor): CarCustomization {
  const next = cloneCar(car);
  switch (slot) {
    case 'primary':
      next.body.primary = readColor(value, next.body.primary);
      break;
    case 'secondary':
      next.body.secondary = readColor(value, next.body.secondary);
      break;
    case 'rim':
      next.wheels.rimColor = readColor(value, next.wheels.rimColor);
      break;
    case 'window':
      next.appearance.windowTint = readColor(value, next.appearance.windowTint);
      break;
    case 'accent':
      next.appearance.accentColor = readColor(value, next.appearance.accentColor);
      break;
  }
  return next;
}

export function cosmeticOf(car: CarCustomization, key: CosmeticCategory): CosmeticLevel {
  switch (key) {
    case 'wheels':
      return car.wheels.style;
    case 'headlights':
      return car.appearance.headlights;
    case 'decal':
      return car.appearance.decal;
    case 'stripes':
      return car.appearance.stripes;
    default:
      return car.parts[key];
  }
}

export function withCosmetic(car: CarCustomization, key: CosmeticCategory, level: CosmeticLevel): CarCustomization {
  const value = readLevel(level, 1);
  const next = cloneCar(car);
  switch (key) {
    case 'wheels':
      next.wheels.style = value;
      break;
    case 'headlights':
      next.appearance.headlights = value;
      break;
    case 'decal':
      next.appearance.decal = value;
      break;
    case 'stripes':
      next.appearance.stripes = value;
      break;
    default:
      next.parts[key] = value;
  }
  return next;
}

export function withBody(car: CarCustomization, type: BodyType): CarCustomization {
  const next = cloneCar(car);
  next.body.type = readBodyType(type, next.body.type);
  return next;
}

export function withPerformance(
  car: CarCustomization,
  category: UpgradeCategory,
  level: number,
): CarCustomization {
  const next = cloneCar(car);
  next.performance = sanitizeLevels({ ...next.performance, [category]: level });
  return next;
}
