import { DEFAULT_AI_DIFFICULTY } from '../game/config';
import { cloneCar, customizationFromLegacy, DEFAULT_CAR, sanitizeCar } from '../game/car/customization';
import {
  CAR_SCHEMA_VERSION,
  type AiDifficulty,
  type CarCosmetics,
  type CarCustomization,
  type NetworkId,
  type RaceMode,
  type UpgradeLevels,
} from '../game/types';

const STORAGE_KEY = 'lumengp.profile.v1';

export interface PlayerProfile {
  /** Schema version of this object. Mirrors `car.version`. */
  version: number;
  /** The single source of truth for the player's car. */
  car: CarCustomization;
  /** Best 300 m time in seconds, or null if never finished. */
  bestTime: number | null;
  /** Best single circuit lap in seconds, or null if never set. */
  circuitBestLap: number | null;
  races: number;
  wins: number;
  difficulty: AiDifficulty;
  /** Selected cluster. Always devnet in this build. */
  network: NetworkId;
  /** Last race mode the player picked. */
  mode: RaceMode;
  /** Last entry used in wager mode, SOL. */
  lastEntrySol: number | null;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  version: CAR_SCHEMA_VERSION,
  car: cloneCar(DEFAULT_CAR),
  bestTime: null,
  circuitBestLap: null,
  races: 0,
  wins: 0,
  difficulty: DEFAULT_AI_DIFFICULTY,
  network: 'devnet',
  mode: 'offline',
  lastEntrySol: null,
};

const DIFFICULTIES: AiDifficulty[] = ['easy', 'medium', 'hard'];
const NETWORKS: NetworkId[] = ['devnet', 'mainnet'];
const MODES: RaceMode[] = ['offline', 'online-practice', 'online-ranked', 'wager'];

/**
 * Loads the profile, migrating whatever it finds.
 *
 * Two shapes exist in the wild: the current `{version, car, ...}` and the
 * older `{upgrades, cosmetics, ...}`. Both are accepted; anything unrecognised
 * falls back per field rather than resetting the whole profile.
 */
export function loadProfile(): PlayerProfile {
  if (typeof localStorage === 'undefined') return cloneProfile(DEFAULT_PROFILE);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneProfile(DEFAULT_PROFILE);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return cloneProfile(DEFAULT_PROFILE);
    const record = parsed as Record<string, unknown>;

    return {
      version: CAR_SCHEMA_VERSION,
      car: readCar(record),
      bestTime:
        typeof record.bestTime === 'number' && Number.isFinite(record.bestTime) && record.bestTime > 0
          ? record.bestTime
          : null,
      circuitBestLap:
        typeof record.circuitBestLap === 'number' &&
        Number.isFinite(record.circuitBestLap) &&
        record.circuitBestLap > 0
          ? record.circuitBestLap
          : null,
      races: typeof record.races === 'number' && record.races >= 0 ? Math.floor(record.races) : 0,
      wins: typeof record.wins === 'number' && record.wins >= 0 ? Math.floor(record.wins) : 0,
      difficulty: DIFFICULTIES.includes(record.difficulty as AiDifficulty)
        ? (record.difficulty as AiDifficulty)
        : DEFAULT_PROFILE.difficulty,
      network: NETWORKS.includes(record.network as NetworkId) ? (record.network as NetworkId) : DEFAULT_PROFILE.network,
      mode: MODES.includes(record.mode as RaceMode) ? (record.mode as RaceMode) : DEFAULT_PROFILE.mode,
      lastEntrySol:
        typeof record.lastEntrySol === 'number' && Number.isFinite(record.lastEntrySol) && record.lastEntrySol >= 0
          ? record.lastEntrySol
          : null,
    };
  } catch {
    return cloneProfile(DEFAULT_PROFILE);
  }
}

function readCar(record: Record<string, unknown>): CarCustomization {
  if (record.car !== undefined) return sanitizeCar(record.car);
  if (record.upgrades !== undefined || record.cosmetics !== undefined) {
    return customizationFromLegacy(
      record.upgrades as Partial<UpgradeLevels> | undefined,
      record.cosmetics as CarCosmetics | undefined,
    );
  }
  return cloneCar(DEFAULT_CAR);
}

export function saveProfile(profile: PlayerProfile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const { car, bestTime, circuitBestLap, races, wins, difficulty, network, mode, lastEntrySol } = profile;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CAR_SCHEMA_VERSION,
        car,
        bestTime,
        circuitBestLap,
        races,
        wins,
        difficulty,
        network,
        mode,
        lastEntrySol,
      }),
    );
  } catch {
    // Storage unavailable (private mode, quota). The prototype still plays.
  }
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return { ...profile, car: cloneCar(profile.car) };
}
