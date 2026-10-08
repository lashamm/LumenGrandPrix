import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_SELECTION,
  resolveTheme,
  sanitizeSelection,
  type ThemeConfig,
  type ThemeSelection,
} from '../theme/theme';

const STORAGE_KEY = 'lumengp.theme.v1';

/**
 * Loads the persisted theme selection.
 *
 * Never throws: an absent or corrupt entry degrades to the default identity
 * (Lumen) instead of blocking boot, and `sanitizeSelection` recovers every
 * field it can rather than throwing the whole choice away.
 */
export function loadThemeSelection(): ThemeSelection {
  if (typeof localStorage === 'undefined') return { id: DEFAULT_THEME_ID, custom: { ...DEFAULT_THEME_SELECTION.custom } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { id: DEFAULT_THEME_ID, custom: { ...DEFAULT_THEME_SELECTION.custom } };
    return sanitizeSelection(JSON.parse(raw));
  } catch {
    return { id: DEFAULT_THEME_ID, custom: { ...DEFAULT_THEME_SELECTION.custom } };
  }
}

export function saveThemeSelection(selection: ThemeSelection): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...selection }));
  } catch {
    // Storage unavailable (private mode, quota). The theme still applies live.
  }
}

/** Resolved identity for the current selection — used to avoid a first-paint flash. */
export function loadTheme(): ThemeConfig {
  return resolveTheme(loadThemeSelection());
}
