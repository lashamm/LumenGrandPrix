/**
 * Central visual identity system.
 *
 * Every colour the UI paints flows from one of these `ThemeConfig` objects.
 * Components never hardcode a colour: they read CSS custom properties that the
 * active theme writes onto the document root (see `applyTheme`). The Phaser race
 * scene receives the same palette as numeric colours (`toHudPalette`) so the
 * canvas HUD shares the identity rather than drifting from the DOM.
 *
 * Custom shapes are user-authored: only a handful of colours are chosen, the
 * rest (surfaces, lines, readable text) are derived so a custom theme can never
 * collapse into an unreadable mess.
 */

export type ThemeId = 'lumen' | 'crimson' | 'purple-night' | 'neon' | 'arctic' | 'sunset' | 'custom';

/** The ids backed by `THEMES`; `custom` is built on demand from stored colours. */
export type PresetThemeId = Exclude<ThemeId, 'custom'>;

export const THEME_ORDER: readonly ThemeId[] = [
  'lumen',
  'crimson',
  'purple-night',
  'neon',
  'arctic',
  'sunset',
  'custom',
];

export const DEFAULT_THEME_ID: PresetThemeId = 'lumen';

/** Runtime guard for an untrusted id — `<select>` values arrive as strings. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_ORDER as readonly string[]).includes(value);
}
export const CUSTOM_THEME_ID: ThemeId = 'custom';

/**
 * One complete visual identity.
 *
 * All values are `#rrggbb`. Predefined themes state them explicitly; the custom
 * theme derives everything but the six keys the player actually picks.
 */
export interface ThemeConfig {
  id: ThemeId;
  label: string;
  /** Page background. */
  background: string;
  /** Cards, panels and the HUD face. */
  surface: string;
  /** Slightly raised surface (hover rows, secondary panels). */
  surfaceRaised: string;
  /** Recessed wells: inputs, progress tracks, gauge interior. */
  surfaceSunken: string;
  /** Hairline separators. */
  line: string;
  /** Emphasised separators and control borders. */
  lineStrong: string;
  /** Primary body text. Guaranteed readable on `background`. */
  text: string;
  /** Secondary text. */
  mutedText: string;
  /** Faint labels and hints. */
  faintText: string;
  /** Brand / primary colour. */
  primary: string;
  /** Secondary brand colour. */
  secondary: string;
  /** The single highlight used for selection, focus and the tachometer. */
  accent: string;
  /** A dimmed accent for gradients and resting borders. */
  accentDim: string;
  /** Readable text colour to place on top of `accent`. */
  accentContrast: string;
  /** Ambient page gradient start (top-left glow). */
  gradientStart: string;
  /** Ambient page gradient end (top-right glow). */
  gradientEnd: string;
  /** Semantic colours. */
  success: string;
  warning: string;
  danger: string;
  /** Opponent colour used on the race HUD. */
  ai: string;
}

// ------------------------------------------------------------------ colour --

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb` or `#rrggbb`; returns null when the string is not a colour. */
export function parseHex(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  const value = hex.trim();
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) body = body.split('').map((c) => c + c).join('');
  const int = Number.parseInt(body, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

export function isHexColor(hex: unknown): hex is string {
  return typeof hex === 'string' && parseHex(hex) !== null;
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function toHex({ r, g, b }: Rgb): string {
  const int = (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
  return `#${int.toString(16).padStart(6, '0')}`;
}

/** Linear blend. `t=0` returns `a`, `t=1` returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  const k = Math.min(1, Math.max(0, t));
  return toHex({
    r: from.r + (to.r - from.r) * k,
    g: from.g + (to.g - from.g) * k,
    b: from.b + (to.b - from.b) * k,
  });
}

/** Positive amounts move toward white, negative toward black. */
export function shade(hex: string, amount: number): string {
  if (amount === 0) return hex;
  return mix(hex, amount > 0 ? '#ffffff' : '#000000', Math.abs(amount));
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.42;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = '#f4f7ff';
const DARK_TEXT = '#0b0e15';

/** Picks a near-black or near-white ink that stays readable on `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

/**
 * Nudges `foreground` away from `background` until it clears a contrast floor.
 * Used to keep accent text and semantic colours legible on any custom surface.
 */
export function ensureContrast(foreground: string, background: string, min = 3): string {
  if (!parseHex(foreground) || !parseHex(background)) return foreground;
  if (contrastRatio(foreground, background) >= min) return foreground;
  const toward = isLight(background) ? '#000000' : '#ffffff';
  let result = foreground;
  for (let step = 0.1; step <= 1.0001; step += 0.1) {
    result = mix(foreground, toward, step);
    if (contrastRatio(result, background) >= min) return result;
  }
  return result;
}

// -------------------------------------------------------------- predefined --

export const THEMES: Readonly<Record<PresetThemeId, ThemeConfig>> = {
  lumen: {
    id: 'lumen',
    label: 'Lumen',
    background: '#06070c',
    surface: '#10141f',
    surfaceRaised: '#0c0f18',
    surfaceSunken: '#0a0d15',
    line: '#1e2536',
    lineStrong: '#2b3450',
    text: '#e8ecf7',
    mutedText: '#9aa6c8',
    faintText: '#5f6a8a',
    primary: '#37e0c8',
    secondary: '#5aa9ff',
    accent: '#37e0c8',
    accentDim: '#1c7d70',
    accentContrast: '#04221f',
    gradientStart: '#131a2c',
    gradientEnd: '#17202f',
    success: '#48d17a',
    warning: '#ffb020',
    danger: '#ff5c5c',
    ai: '#ff7a5c',
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson',
    background: '#0a0508',
    surface: '#170a10',
    surfaceRaised: '#120710',
    surfaceSunken: '#0c060b',
    line: '#2c1620',
    lineStrong: '#4a2230',
    text: '#f7e9ee',
    mutedText: '#c79aa8',
    faintText: '#7d5566',
    primary: '#ff4d5e',
    secondary: '#ff9d5c',
    accent: '#ff3b52',
    accentDim: '#8f1d2b',
    accentContrast: '#ffffff',
    gradientStart: '#2a0a12',
    gradientEnd: '#2c1210',
    success: '#4fd08a',
    warning: '#ffb020',
    danger: '#ff5c5c',
    ai: '#ffa066',
  },
  'purple-night': {
    id: 'purple-night',
    label: 'Purple Night',
    background: '#08060f',
    surface: '#120f1f',
    surfaceRaised: '#0d0b17',
    surfaceSunken: '#0b0914',
    line: '#241d3a',
    lineStrong: '#372c56',
    text: '#ece8fb',
    mutedText: '#a99fd0',
    faintText: '#635b86',
    primary: '#8b8cff',
    secondary: '#b98cff',
    accent: '#b98cff',
    accentDim: '#6a4bb0',
    accentContrast: '#140a24',
    gradientStart: '#1c1440',
    gradientEnd: '#241a3a',
    success: '#57d6a3',
    warning: '#ffb45c',
    danger: '#ff6b8b',
    ai: '#ff8fb0',
  },
  neon: {
    id: 'neon',
    label: 'Neon',
    background: '#04050b',
    surface: '#0b0f1c',
    surfaceRaised: '#080b14',
    surfaceSunken: '#070910',
    line: '#1b2140',
    lineStrong: '#2f3a6b',
    text: '#eafcff',
    mutedText: '#93b6d6',
    faintText: '#54708f',
    primary: '#22e0ff',
    secondary: '#ff4dd2',
    accent: '#22e0ff',
    accentDim: '#0f6f96',
    accentContrast: '#001a24',
    gradientStart: '#0a2440',
    gradientEnd: '#2a0b3a',
    success: '#4dffa6',
    warning: '#ffd23d',
    danger: '#ff3d7f',
    ai: '#ff4dd2',
  },
  arctic: {
    id: 'arctic',
    label: 'Arctic',
    background: '#04070f',
    surface: '#0d1626',
    surfaceRaised: '#0a1220',
    surfaceSunken: '#08101c',
    line: '#1b2b44',
    lineStrong: '#2c4568',
    text: '#eaf3ff',
    mutedText: '#a3bddb',
    faintText: '#617d9e',
    primary: '#8fd4ff',
    secondary: '#5aa9ff',
    accent: '#8fd4ff',
    accentDim: '#2f6f9e',
    accentContrast: '#04141f',
    gradientStart: '#0e2a44',
    gradientEnd: '#123a52',
    success: '#6fe0c0',
    warning: '#ffd27a',
    danger: '#ff7a7a',
    ai: '#ffb46b',
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    background: '#0d0609',
    surface: '#1a0f16',
    surfaceRaised: '#150b11',
    surfaceSunken: '#120910',
    line: '#33191f',
    lineStrong: '#522b34',
    text: '#ffeef0',
    mutedText: '#e0adb4',
    faintText: '#9c6b74',
    primary: '#ff8a4c',
    secondary: '#f2547d',
    accent: '#ff8a4c',
    accentDim: '#a34a22',
    accentContrast: '#1c0a02',
    gradientStart: '#3a1630',
    gradientEnd: '#4a2010',
    success: '#7fcf8a',
    warning: '#ffc24d',
    danger: '#ff5c7a',
    ai: '#c86bff',
  },
};

/** The six colours the custom panel exposes. */
export interface CustomThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  gradientStart: string;
  gradientEnd: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  primary: '#37e0c8',
  secondary: '#5aa9ff',
  accent: '#37e0c8',
  background: '#070910',
  gradientStart: '#122036',
  gradientEnd: '#1a1430',
};

/**
 * Derives a full, readable identity from the six chosen colours.
 *
 * Surfaces step subtly away from the background toward the contrast pole, text
 * flips to whichever of near-black / near-white reads best, and the semantic
 * colours are nudged until they clear a contrast floor on the derived surfaces.
 */
export function buildCustomTheme(colors: CustomThemeColors): ThemeConfig {
  const bg = colors.background;
  const light = isLight(bg);
  const pole = light ? '#000000' : '#ffffff';
  const text = readableOn(bg);
  const surface = mix(bg, pole, 0.06);
  const surfaceRaised = mix(bg, pole, 0.09);
  const surfaceSunken = mix(bg, pole, 0.02);
  const accent = colors.accent;
  const accentContrast = readableOn(accent);

  return {
    id: 'custom',
    label: 'Custom',
    background: bg,
    surface,
    surfaceRaised,
    surfaceSunken,
    line: mix(bg, pole, 0.16),
    lineStrong: mix(bg, pole, 0.3),
    text,
    mutedText: mix(text, bg, 0.4),
    faintText: mix(text, bg, 0.62),
    primary: colors.primary,
    secondary: colors.secondary,
    accent,
    accentDim: mix(accent, bg, 0.45),
    accentContrast,
    gradientStart: colors.gradientStart,
    gradientEnd: colors.gradientEnd,
    success: ensureContrast('#3fcf7f', surface, 3),
    warning: ensureContrast('#ffb020', surface, 3),
    danger: ensureContrast('#ff5c5c', surface, 3),
    ai: ensureContrast(mix(colors.secondary, '#ff7a5c', 0.4), surface, 3),
  };
}

export interface ThemeSelection {
  id: ThemeId;
  custom: CustomThemeColors;
}

export const DEFAULT_THEME_SELECTION: ThemeSelection = {
  id: DEFAULT_THEME_ID,
  custom: { ...DEFAULT_CUSTOM_COLORS },
};

/** Resolves a saved selection to a full config, falling back to Lumen. */
export function resolveTheme(selection: ThemeSelection): ThemeConfig {
  if (selection.id === CUSTOM_THEME_ID) return buildCustomTheme(selection.custom);
  const preset = THEMES[selection.id as PresetThemeId];
  return preset ?? THEMES[DEFAULT_THEME_ID];
}

/**
 * Validates an untrusted stored selection field-by-field rather than discarding
 * the whole thing: a broken custom colour only resets that colour.
 */
export function sanitizeSelection(input: unknown): ThemeSelection {
  if (typeof input !== 'object' || input === null) return { id: DEFAULT_THEME_ID, custom: { ...DEFAULT_CUSTOM_COLORS } };
  const record = input as Record<string, unknown>;
  const id = THEME_ORDER.includes(record.id as ThemeId) ? (record.id as ThemeId) : DEFAULT_THEME_ID;

  const rawCustom = (typeof record.custom === 'object' && record.custom !== null ? record.custom : {}) as Record<
    string,
    unknown
  >;
  const custom: CustomThemeColors = { ...DEFAULT_CUSTOM_COLORS };
  for (const key of Object.keys(DEFAULT_CUSTOM_COLORS) as Array<keyof CustomThemeColors>) {
    if (isHexColor(rawCustom[key])) custom[key] = (rawCustom[key] as string).toLowerCase();
  }

  return { id, custom };
}

// ------------------------------------------------------------- css + canvas --

/** Expands `#rrggbb` to the `"r, g, b"` triple used inside `rgba()` variables. */
export function rgbTriple(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '0, 0, 0';
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

/** Hex string to the `0xrrggbb` integer Phaser wants. */
export function hexToInt(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0x000000;
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

export interface ThemeCssVars {
  [name: string]: string;
}

/**
 * The full variable set written to the document root.
 *
 * The `--theme-*` names are semantic and stable; the shorter legacy aliases
 * (`--bg`, `--accent`, …) are what the existing stylesheet already consumes, so
 * a theme swap touches no component markup.
 */
export function themeCssVars(theme: ThemeConfig): ThemeCssVars {
  return {
    '--theme-primary': theme.primary,
    '--theme-secondary': theme.secondary,
    '--theme-accent': theme.accent,
    '--theme-accent-dim': theme.accentDim,
    '--theme-accent-contrast': theme.accentContrast,
    '--theme-background': theme.background,
    '--theme-surface': theme.surface,
    '--theme-surface-raised': theme.surfaceRaised,
    '--theme-surface-sunken': theme.surfaceSunken,
    '--theme-line': theme.line,
    '--theme-line-strong': theme.lineStrong,
    '--theme-text': theme.text,
    '--theme-muted': theme.mutedText,
    '--theme-faint': theme.faintText,
    '--theme-gradient-start': theme.gradientStart,
    '--theme-gradient-end': theme.gradientEnd,
    '--theme-success': theme.success,
    '--theme-warning': theme.warning,
    '--theme-danger': theme.danger,
    '--theme-ai': theme.ai,
    '--theme-accent-rgb': rgbTriple(theme.accent),
    '--theme-primary-rgb': rgbTriple(theme.primary),
    '--theme-danger-rgb': rgbTriple(theme.danger),
    '--theme-warning-rgb': rgbTriple(theme.warning),
    '--theme-ai-rgb': rgbTriple(theme.ai),

    // Legacy aliases consumed across styles.css.
    '--bg': theme.background,
    '--bg-raised': theme.surfaceRaised,
    '--bg-panel': theme.surface,
    '--bg-panel-2': theme.surfaceRaised,
    '--bg-sunken': theme.surfaceSunken,
    '--line': theme.line,
    '--line-strong': theme.lineStrong,
    '--text': theme.text,
    '--text-dim': theme.mutedText,
    '--text-faint': theme.faintText,
    '--accent': theme.accent,
    '--accent-dim': theme.accentDim,
    '--accent-contrast': theme.accentContrast,
    '--warn': theme.warning,
    '--danger': theme.danger,
    '--ai': theme.ai,
    '--success': theme.success,
    '--grad-start': theme.gradientStart,
    '--grad-end': theme.gradientEnd,

    // "r, g, b" triples — styles.css composes rgba() from these so no rule
    // outside :root ever needs a literal colour.
    '--bg-rgb': rgbTriple(theme.background),
    '--panel-rgb': rgbTriple(theme.surface),
    '--text-rgb': rgbTriple(theme.text),
    '--text-dim-rgb': rgbTriple(theme.mutedText),
    '--text-faint-rgb': rgbTriple(theme.faintText),
    '--accent-rgb': rgbTriple(theme.accent),
    '--warn-rgb': rgbTriple(theme.warning),
    '--danger-rgb': rgbTriple(theme.danger),
    '--ai-rgb': rgbTriple(theme.ai),
    '--success-rgb': rgbTriple(theme.success),
  };
}

/** Writes the theme onto the document root, immediately. */
export function applyTheme(theme: ThemeConfig, root?: HTMLElement): void {
  if (root === undefined && typeof document === 'undefined') return;
  const target = root ?? document.documentElement;
  const vars = themeCssVars(theme);
  for (const name of Object.keys(vars)) {
    target.style.setProperty(name, vars[name]);
  }
  if (root === undefined) document.documentElement.dataset.theme = theme.id;
}

// ------------------------------------------------------------------ palette --

/** Numeric colour set handed to the Phaser race scene. */
export interface HudPalette {
  accent: number;
  accentDim: number;
  ai: number;
  warn: number;
  danger: number;
  success: number;
  background: number;
  surface: number;
  surfaceRaised: number;
  surfaceSunken: number;
  line: number;
  lineStrong: number;
  text: number;
  muted: number;
  faint: number;
}

export function toHudPalette(theme: ThemeConfig): HudPalette {
  return {
    accent: hexToInt(theme.accent),
    accentDim: hexToInt(theme.accentDim),
    ai: hexToInt(theme.ai),
    warn: hexToInt(theme.warning),
    danger: hexToInt(theme.danger),
    success: hexToInt(theme.success),
    background: hexToInt(theme.background),
    surface: hexToInt(theme.surface),
    surfaceRaised: hexToInt(theme.surfaceRaised),
    surfaceSunken: hexToInt(theme.surfaceSunken),
    line: hexToInt(theme.line),
    lineStrong: hexToInt(theme.lineStrong),
    text: hexToInt(theme.text),
    muted: hexToInt(theme.mutedText),
    faint: hexToInt(theme.faintText),
  };
}
