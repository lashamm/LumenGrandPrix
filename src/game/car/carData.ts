import { MAX_LEVEL, MIN_LEVEL, type UpgradeCategory, type UpgradeLevels } from '../types';

export interface CarDefinition {
  id: string;
  name: string;
  codename: string;
  bodyColor: number;
  accentColor: number;
  description: string;
}

/** The single starter car shipped with the prototype. */
export const STARTER_CAR: CarDefinition = {
  id: 'lumen-mk1',
  name: 'LUMEN MK-I',
  codename: 'Starter Coupe',
  bodyColor: 0x37e0c8,
  accentColor: 0x0e2f3a,
  description: 'Balanced starter drag car. Fast enough to win on skill alone.',
};

/** The one AI opponent. Swap this array for a roster later. */
export const AI_OPPONENT: CarDefinition = {
  id: 'rival-vx',
  name: 'RIVAL VX',
  codename: 'Shop Runner',
  bodyColor: 0xff7a5c,
  accentColor: 0x3a1410,
  description: 'The house car. Not quick, but driven hard.',
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
};

/**
 * Per-level tuning. Deliberately gentle: the philosophy is
 * "your car gives you potential, your skill decides whether you can use it."
 */
export const LEVEL_TABLE: Record<UpgradeCategory, readonly number[]> = {
  engine: [220, 245, 272],
  weight: [1150, 1060, 970],
  aero: [0.78, 0.72, 0.66],
  brakes: [5500, 7000, 8500],
};

export const DEFAULT_UPGRADES: UpgradeLevels = {
  engine: 1,
  weight: 1,
  aero: 1,
  brakes: 1,
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