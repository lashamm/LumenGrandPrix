import {
  DEFAULT_COSMETIC_OPTIONS,
  MAX_LEVEL,
  MIN_LEVEL,
  type BodyType,
  type CarColors,
  type CosmeticOptions,
  type UpgradeCategory,
  type UpgradeLevels,
} from '../types';

export interface CarDefinition {
  id: string;
  name: string;
  codename: string;
  description: string;
  bodyType: BodyType;
  colors: CarColors;
  /** Visual-only parts. Never touches the physics. */
  options: CosmeticOptions;
}

/** The single starter car shipped with the prototype. */
export const STARTER_CAR: CarDefinition = {
  id: 'lumen-mk1',
  name: 'LUMEN MK-I',
  codename: 'Starter Coupe',
  description: 'Balanced starter drag car. Fast enough to win on skill alone.',
  bodyType: 'coupe',
  colors: { primary: '#37e0c8', secondary: '#0e2f3a', rim: '#c9d2e6', window: '#16233a', accent: '#0b0d14' },
  options: { ...DEFAULT_COSMETIC_OPTIONS },
};

/** The one AI opponent. Swap this array for a roster later. */
export const AI_OPPONENT: CarDefinition = {
  id: 'rival-vx',
  name: 'RIVAL VX',
  codename: 'Shop Runner',
  description: 'The house car. Not quick, but driven hard.',
  bodyType: 'sedan',
  colors: { primary: '#ff7a5c', secondary: '#3a1410', rim: '#f0e3d2', window: '#241a2e', accent: '#1a1013' },
  options: { ...DEFAULT_COSMETIC_OPTIONS, spoiler: 2, decal: 2 },
};

export interface CategoryMeta {
  id: UpgradeCategory;
  label: string;
  blurb: string;
  effect: string;
  /** Per-level labels shown in the UI, index 0 === level 1. */
  levelNames: [string, string, string];
}

export const CATEGORY_META: Record<UpgradeCategory, CategoryMeta> = {
  engine: {
    id: 'engine',
    label: 'ENGINE',
    blurb: 'Peak torque and how hard the car pulls in each gear.',
    effect: '+ torque',
    levelNames: ['Stock Block', 'Street Intake', 'Built Motor'],
  },
  weight: {
    id: 'weight',
    label: 'WEIGHT',
    blurb: 'Less mass means harder launches and faster acceleration.',
    effect: '- mass',
    levelNames: ['Stock Shell', 'Stripped Shell', 'Tube Frame'],
  },
  aero: {
    id: 'aero',
    label: 'AERO',
    blurb: 'Downforce and drag. Keeps the car planted and straight.',
    effect: '+ grip / - drag',
    levelNames: ['Flat Hood', 'Splitter', 'Wing + Flat Floor'],
  },
  brakes: {
    id: 'brakes',
    label: 'BRAKES',
    blurb: 'Shortens the race if you ever need to scrub speed.',
    effect: '+ braking',
    levelNames: ['Stock Drums', 'Street Discs', 'Twin-Piston Drilled'],
  },
  tires: {
    id: 'tires',
    label: 'TIRES',
    blurb: 'Cornering grip. Keeps the circuit car planted through bends.',
    effect: '+ grip',
    levelNames: ['Street Rubber', 'Sport Soft', 'Circuit Soft'],
  },
};

/**
 * Per-level tuning. Deliberately gentle: the philosophy is
 * "your car gives you potential, your skill decides whether you can use it."
 *
 * TIRES holds the friction coefficient the circuit physics uses directly
 * (drag racing never reads it, so the drag mode is unchanged).
 */
export const LEVEL_TABLE: Record<UpgradeCategory, readonly number[]> = {
  engine: [220, 245, 272],
  weight: [1150, 1060, 970],
  aero: [0.78, 0.72, 0.66],
  brakes: [5500, 7000, 8500],
  tires: [1.25, 1.37, 1.49],
};

export const DEFAULT_UPGRADES: UpgradeLevels = {
  engine: 1,
  weight: 1,
  aero: 1,
  brakes: 1,
  tires: 1,
};

export function isValidLevels(levels: Partial<UpgradeLevels>): boolean {
  return Object.keys(LEVEL_TABLE).every((key) => {
    const category = key as UpgradeCategory;
    const value = levels[category];
    return value === undefined || (value >= MIN_LEVEL && value <= MAX_LEVEL && Number.isInteger(value));
  });
}

export function sanitizeLevels(levels: Partial<UpgradeLevels> | undefined | null): UpgradeLevels {
  const next: UpgradeLevels = { ...DEFAULT_UPGRADES };
  if (!levels) return next;
  for (const category of Object.keys(LEVEL_TABLE) as UpgradeCategory[]) {
    const value = levels[category];
    if (typeof value === 'number' && Number.isInteger(value) && value >= MIN_LEVEL && value <= MAX_LEVEL) {
      next[category] = value;
    }
  }
  return next;
}

export function totalUpgradeScore(levels: UpgradeLevels): number {
  return (Object.keys(LEVEL_TABLE) as UpgradeCategory[]).reduce(
    (sum, category) => sum + (levels[category] - MIN_LEVEL),
    0,
  );
}