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