export type UpgradeCategory = 'engine' | 'weight' | 'aero' | 'brakes';

export type UpgradeLevels = Record<UpgradeCategory, number>;

export const UPGRADE_CATEGORIES: UpgradeCategory[] = ['engine', 'weight', 'aero', 'brakes'];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 3;

/** Arcade gearbox: gear index 0 === 1st gear. */
export const GEAR_COUNT = 6;

export type ShiftQuality = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS' | 'BAD';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface RaceResult {
  playerTime: number;
  aiTime: number;
  playerFinished: boolean;
  aiFinished: boolean;
  win: boolean;
  launchRpm: number;
  launchQuality: ShiftQuality;
  shiftCount: number;
  perfectShifts: number;
  goodShifts: number;
  missedShifts: number;
}

// --------------------------------------------------------------- car shape --

export type BodyType = 'coupe' | 'sedan' | 'hatchback';

export const BODY_TYPE_ORDER: readonly BodyType[] = ['coupe', 'sedan', 'hatchback'];

export type HexColor = string;

/** Every colour the pixel-art factory can paint. All values are `#rrggbb`. */
export interface CarColors {
  primary: HexColor;
  secondary: HexColor;
  rim: HexColor;
  window: HexColor;
  accent: HexColor;
}

export const COLOR_SLOTS = ['primary', 'secondary', 'rim', 'window', 'accent'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

export const COLOR_SLOT_LABEL: Record<ColorSlot, string> = {
  primary: 'BODY',
  secondary: 'TRIM',
  rim: 'WHEELS',
  window: 'GLASS',
  accent: 'ACCENT',
};

/** Named paint presets offered in the garage. */
export const COLOR_PRESETS: ReadonlyArray<{ name: string; colors: CarColors }> = [
  {
    name: 'MIDNIGHT',
    colors: { primary: '#141824', secondary: '#0a0d14', rim: '#c9d2e6', window: '#16233a', accent: '#37e0c8' },
  },
  {
    name: 'GLACIER',
    colors: { primary: '#e7edf7', secondary: '#aab6cc', rim: '#1b2133', window: '#24344f', accent: '#2f8fd0' },
  },
  {
    name: 'EMBER',
    colors: { primary: '#d9402f', secondary: '#7d1a12', rim: '#f0e3d2', window: '#241a2e', accent: '#ffb020' },
  },
  {
    name: 'TIDE',
    colors: { primary: '#1f9e8f', secondary: '#0d4a44', rim: '#e8f4f1', window: '#123043', accent: '#f2f5ff' },
  },
  {
    name: 'VOLT',
    colors: { primary: '#c9e63a', secondary: '#5c6b16', rim: '#1a1f14', window: '#1f2a1e', accent: '#141824' },
  },
  {
    name: 'ROYAL',
    colors: { primary: '#5a49d8', secondary: '#2a2170', rim: '#d8dcf0', window: '#1a1740', accent: '#37e0c8' },
  },
  {
    name: 'SUNSET',
    colors: { primary: '#f2822e', secondary: '#8a3c10', rim: '#221a14', window: '#2b1d1a', accent: '#f2e6d0' },
  },
  {
    name: 'GRAPHITE',
    colors: { primary: '#5d6678', secondary: '#30374a', rim: '#dfe5f2', window: '#1d263a', accent: '#ff7a5c' },
  },
];

/** Cosmetic part slots. Each has three presets, index 0 === stock. */
export type CosmeticCategory =
  | 'headlights'
  | 'wheels'
  | 'spoiler'
  | 'frontBumper'
  | 'rearBumper'
  | 'hood'
  | 'exhaust'
  | 'decal'
  | 'stripes';

export type CosmeticLevel = 1 | 2 | 3;
export type CosmeticOptions = Record<CosmeticCategory, CosmeticLevel>;

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  'headlights',
  'wheels',
  'spoiler',
  'frontBumper',
  'rearBumper',
  'hood',
  'exhaust',
  'decal',
  'stripes',
];

export const COSMETIC_META: Record<CosmeticCategory, { label: string; levelNames: [string, string, string] }> = {
  headlights: { label: 'HEADLIGHTS', levelNames: ['Stock', 'Projector', 'Rally Bar'] },
  wheels: { label: 'WHEELS', levelNames: ['Steelies', '5-Spoke', 'Mesh'] },
  spoiler: { label: 'SPOILER', levelNames: ['None', 'Ducktail', 'GT Wing'] },
  frontBumper: { label: 'FRONT', levelNames: ['Stock', 'Splitter', 'Canards'] },
  rearBumper: { label: 'REAR', levelNames: ['Stock', 'Diffuser', 'Vented'] },
  hood: { label: 'HOOD', levelNames: ['Closed', 'Vented', 'Scoop'] },
  exhaust: { label: 'EXHAUST', levelNames: ['Stock', 'Cat-Back', 'Straight'] },
  decal: { label: 'DECAL', levelNames: ['None', 'Numbers', 'Sponsor'] },
  stripes: { label: 'STRIPES', levelNames: ['None', 'Twin', 'Full Livery'] },
};

export interface CarCosmetics {
  bodyType: BodyType;
  colors: CarColors;
  options: CosmeticOptions;
}

export const DEFAULT_COSMETIC_OPTIONS: CosmeticOptions = {
  headlights: 1,
  wheels: 1,
  spoiler: 1,
  frontBumper: 1,
  rearBumper: 1,
  hood: 1,
  exhaust: 1,
  decal: 1,
  stripes: 1,
};

/**
 * The single source of truth for the player's car.
 *
 * Every screen reads and writes this one object: the garage edits a draft of
 * it, persistence stores it as versioned JSON, and the race derives both the
 * renderer payload and the physics stats from it. Nothing else is allowed to
 * hold a competing copy of "the player's car".
 */
export interface CarCustomization {
  /** Schema version. Bump when the shape changes so old saves migrate. */
  version: number;
  body: {
    type: BodyType;
    primary: HexColor;
    secondary: HexColor;
  };
  wheels: {
    /** Spoke pattern, 1-3. */
    style: CosmeticLevel;
    rimColor: HexColor;
  };
  appearance: {
    windowTint: HexColor;
    accentColor: HexColor;
    headlights: CosmeticLevel;
    decal: CosmeticLevel;
    stripes: CosmeticLevel;
  };
  parts: {
    spoiler: CosmeticLevel;
    frontBumper: CosmeticLevel;
    rearBumper: CosmeticLevel;
    hood: CosmeticLevel;
    exhaust: CosmeticLevel;
  };
  /** Performance upgrades. Level 1-3 per category, exactly as raced. */
  performance: UpgradeLevels;
}

/** Current schema version written to localStorage. */
export const CAR_SCHEMA_VERSION = 1;

// ------------------------------------------------------- network and modes --

export type NetworkId = 'devnet' | 'mainnet';

export type RaceMode = 'offline' | 'online-practice' | 'online-ranked' | 'wager';

export const RACE_MODE_ORDER: readonly RaceMode[] = [
  'offline',
  'online-practice',
  'online-ranked',
  'wager',
];

export const RACE_MODE_META: Record<
  RaceMode,
  { label: string; blurb: string; online: boolean; requiresNetwork: NetworkId | null; entry: boolean }
> = {
  offline: {
    label: 'OFFLINE AI',
    blurb: 'Rival VX over the full strip. No network, no entry.',
    online: false,
    requiresNetwork: null,
    entry: false,
  },
  'online-practice': {
    label: 'ONLINE PRACTICE',
    blurb: 'Friendly lobby against a live opponent. No entry, no ranking.',
    online: true,
    requiresNetwork: null,
    entry: false,
  },
  'online-ranked': {
    label: 'ONLINE RANKED',
    blurb: 'Rated lobby. Result is recorded once the server reports it.',
    online: true,
    requiresNetwork: null,
    entry: false,
  },
  wager: {
    label: 'WAGER · DEVNET',
    blurb: 'Stake DEVNET SOL against a live opponent. Practice settlement only.',
    online: true,
    requiresNetwork: 'devnet',
    entry: true,
  },
};

/** Where an online race's authority sits. Never claimed unless it is true. */
export type RaceAuthority = 'local-ai' | 'local-practice-settlement' | 'server' | 'on-chain';

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'matched' | 'unavailable' | 'error';
