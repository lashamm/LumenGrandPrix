import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  isThemeId,
  resolveTheme,
  toHudPalette,
  type CustomThemeColors,
  type HudPalette,
  type ThemeConfig,
  type ThemeId,
  type ThemeSelection,
} from './theme';
import { loadThemeSelection, saveThemeSelection } from '../state/theme';

/**
 * Owns the active visual identity.
 *
 * Selection lives here rather than in the player profile: a theme is a display
 * preference, not player data, so it is persisted under its own key and cannot
 * change what the simulation or the garage write to disk.
 */
export interface ThemeState {
  selection: ThemeSelection;
  theme: ThemeConfig;
  /** Numeric copy of `theme`, handed to the Phaser race scene. */
  palette: HudPalette;
  /** Switches to a preset, or to `custom` to use the stored custom colours. */
  select: (id: ThemeId) => void;
  /** Patches one or more custom colours and switches the active theme to custom. */
  setCustom: (patch: Partial<CustomThemeColors>) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [selection, setSelection] = useState<ThemeSelection>(() => loadThemeSelection());

  const theme = useMemo(() => resolveTheme(selection), [selection]);
  const palette = useMemo(() => toHudPalette(theme), [theme]);

  // Live switch: every consumer reads CSS variables, so rewriting the root's
  // custom properties restyles the whole app in the same tick — no reload, no
  // per-component state.
  useEffect(() => {
    applyTheme(theme);
    saveThemeSelection(selection);
  }, [theme, selection]);

  const select = useCallback((id: ThemeId) => {
    if (!isThemeId(id)) return;
    setSelection((previous) => ({ ...previous, id }));
  }, []);

  const setCustom = useCallback((patch: Partial<CustomThemeColors>) => {
    setSelection((previous) => ({
      id: 'custom',
      custom: { ...previous.custom, ...patch },
    }));
  }, []);

  const value = useMemo<ThemeState>(
    () => ({ selection, theme, palette, select, setCustom }),
    [selection, theme, palette, select, setCustom],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
