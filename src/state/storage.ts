import { DEFAULT_AI_DIFFICULTY } from '../game/config';
import { sanitizeLevels } from '../game/car/carData';
import type { AiDifficulty, UpgradeLevels } from '../game/types';

const STORAGE_KEY = 'lumengp.profile.v1';

export interface PlayerProfile {
  upgrades: UpgradeLevels;
  /** Best 300 m time in seconds, or null if never finished. */
  bestTime: number | null;
  races: number;
  wins: number;
  difficulty: AiDifficulty;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  upgrades: sanitizeLevels(undefined),
  bestTime: null,
  races: 0,
  wins: 0,
  difficulty: DEFAULT_AI_DIFFICULTY,
};

const DIFFICULTIES: AiDifficulty[] = ['easy', 'medium', 'hard'];

export function loadProfile(): PlayerProfile {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PROFILE };
    const record = parsed as Record<string, unknown>;
    const bestTime =
      typeof record.bestTime === 'number' && Number.isFinite(record.bestTime) && record.bestTime > 0
        ? record.bestTime
        : null;
    return {
      upgrades: sanitizeLevels(record.upgrades as Partial<UpgradeLevels> | undefined),
      bestTime,
      races: typeof record.races === 'number' && record.races >= 0 ? Math.floor(record.races) : 0,
      wins: typeof record.wins === 'number' && record.wins >= 0 ? Math.floor(record.wins) : 0,
      difficulty: DIFFICULTIES.includes(record.difficulty as AiDifficulty)
        ? (record.difficulty as AiDifficulty)
        : DEFAULT_PROFILE.difficulty,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable (private mode, quota). The prototype still plays.
  }
}