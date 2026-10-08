import type { ReactNode } from 'react';
import { KEY_BINDINGS, keyLabel } from '../game/control';
import { THEME_ORDER, THEMES, isThemeId, type CustomThemeColors } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/** The six colours a custom theme exposes. Surfaces are derived from these. */
const CUSTOM_COLOR_FIELDS: ReadonlyArray<{ key: keyof CustomThemeColors; label: string }> = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Background' },
  { key: 'gradientStart', label: 'Gradient start' },
  { key: 'gradientEnd', label: 'Gradient end' },
];

/**
 * Display preferences only.
 *
 * Nothing here touches the profile, the stored car or the practice ledger, and
 * there is deliberately no sound toggle: this build has no audio system, so a
 * switch that claimed to mute it would be a lie.
 */
export function SettingsScreen({ onBack }: { onBack: () => void }): ReactNode {
  const { selection, theme, select, setCustom } = useTheme();

  return (
    <div className="screen screen--settings">
      <header className="sheet__head">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          ‹ MENU
        </button>
        <div>
          <h2 className="sheet__title">SETTINGS</h2>
          <p className="sheet__sub">Theme, custom colours and controls.</p>
        </div>
      </header>

      <div className="settings__grid">
        <section className="panel">
          <h3 className="panel__title">THEME</h3>

          <div className="field">
            <label className="field__label" htmlFor="theme-select">
              ACTIVE THEME
            </label>
            <select
              id="theme-select"
              className="select"
              value={selection.id}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (isThemeId(next)) select(next);
              }}
            >
              {THEME_ORDER.map((id) => (
                <option key={id} value={id}>
                  {id === 'custom' ? 'Custom' : THEMES[id].label}
                </option>
              ))}
            </select>
          </div>

          <div className="theme-preview" aria-hidden="true">
            <span className="theme-preview__chip" style={{ background: theme.accent }} />
            <span className="theme-preview__chip" style={{ background: theme.secondary }} />
            <span className="theme-preview__chip" style={{ background: theme.warning }} />
            <span className="theme-preview__chip" style={{ background: theme.danger }} />
            <span
              className="theme-preview__bar"
              style={{ background: `linear-gradient(90deg, ${theme.gradientStart}, ${theme.gradientEnd})` }}
            />
          </div>

          <p className="panel__note">
            The whole app restyles instantly. Editing a colour below switches the theme to Custom; the
            saved selection follows you back on the next visit.
          </p>

          <div className="color-grid">
            {CUSTOM_COLOR_FIELDS.map((field) => (
              <label className="color-field" key={field.key}>
                <span className="field__label">{field.label.toUpperCase()}</span>
                <input
                  className="color-field__input"
                  type="color"
                  value={selection.custom[field.key]}
                  onChange={(event) =>
                    setCustom({ [field.key]: event.currentTarget.value } as Partial<CustomThemeColors>)
                  }
                />
              </label>
            ))}
          </div>

          <div className="panel__row">
            <span>CURRENT</span>
            <span className="mono">{theme.label.toUpperCase()}</span>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">CONTROLS</h3>
          <div className="spec-list">
            {KEY_BINDINGS.map((binding) => (
              <div key={binding.action}>
                <dt>{binding.label}</dt>
                <dd className="mono">{binding.keys.map(keyLabel).join(' / ')}</dd>
              </div>
            ))}
          </div>
          <p className="panel__note">
            Keyboard and touch only. This prototype ships no audio, so there is nothing to mute.
          </p>
        </section>
      </div>
    </div>
  );
}
