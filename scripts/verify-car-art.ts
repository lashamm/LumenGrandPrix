/* eslint-disable no-console */
/**
 * Art verification.
 *
 * The garage preview and the race car come from the same renderer, so the only
 * thing left to prove is that the renderer actually *responds* to every choice
 * the garage offers. If a picker level ever stops changing the pixels — the
 * bug that spawned this script — this fails.
 *
 * Run: npx tsx scripts/verify-car-art.ts   (or npm run car-art)
 */
import {
  BODY_TYPE_ORDER,
  COLOR_PRESETS,
  COSMETIC_CATEGORIES,
  COSMETIC_META,
} from '../src/game/types';
import { buildCarImage, buildCarRows, carPalette, CAR_SPRITE } from '../src/game/car/render';
import {
  carFromCustomization,
  COLOR_SLOT_ENTRIES,
  DEFAULT_CAR,
  withBody,
  withColor,
  withCosmetic,
} from '../src/game/car/customization';
import type { CarCustomization, CosmeticLevel } from '../src/game/types';

let checks = 0;
let failures = 0;

function check(condition: boolean, label: string, detail = ''): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Hash of the *painted* image, not of the symbol grid.
 *
 * Two cars can share an identical grid of symbols and still differ in colour,
 * so the palette has to be resolved before hashing or a paint change would
 * look like "no change".
 */
function imageOf(car: CarCustomization): string {
  const definition = carFromCustomization(car, 'VERIFY');
  const { rows } = buildCarImage(definition);
  const palette = carPalette(definition);
  const painted: string[] = [];
  for (const row of rows) {
    for (const symbol of row) {
      const colour = symbol === '.' ? 0x111111 : palette[symbol];
      painted.push(colour === undefined ? 'x' : colour.toString(16));
    }
  }
  return hash(painted);
}

function hash(cells: readonly string[]): string {
  const text = cells.join(',');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function base(): CarCustomization {
  return JSON.parse(JSON.stringify(DEFAULT_CAR)) as CarCustomization;
}

function slotValue(preset: (typeof COLOR_PRESETS)[number], slot: string): string {
  switch (slot) {
    case 'primary':
      return preset.colors.primary;
    case 'secondary':
      return preset.colors.secondary;
    case 'rim':
      return preset.colors.rim;
    case 'window':
      return preset.colors.window;
    default:
      return preset.colors.accent;
  }
}

// --------------------------------------------------------------- geometry --

console.log('\nCar art — geometry and palette coverage');
{
  const definition = carFromCustomization(base(), 'VERIFY');
  const image = buildCarImage(definition);

  check(image.width === CAR_SPRITE.width, 'image width', `${image.width}`);
  check(image.height === CAR_SPRITE.height, 'image height', `${image.height}`);
  check(image.rows.length === image.height, 'row count', `${image.rows.length}`);
  check(
    image.rows.every((row) => row.length === image.width),
    'every row is the full sprite width',
  );

  const palette = carPalette(definition);
  const used = new Set(image.rows.join('').split(''));
  const unknown = [...used].filter((symbol) => symbol !== '.' && palette[symbol] === undefined);
  check(unknown.length === 0, 'every painted symbol has a colour', unknown.join(''));

  const bodyOnly = buildCarRows(definition).join('\n');
  const withWheels = image.rows.join('\n');
  check(bodyOnly !== withWheels, 'wheels are stamped into the preview image');
}

// ------------------------------------------------------------ body types --

console.log('\nCar art — body types');
{
  const hashes = BODY_TYPE_ORDER.map((type) => imageOf(withBody(base(), type)));
  const unique = new Set(hashes);
  check(unique.size === hashes.length, 'each body type renders differently', hashes.join(' '));
}

// -------------------------------------------------------- cosmetic levels --

console.log('\nCar art — every cosmetic level changes the pixels');
for (const category of COSMETIC_CATEGORIES) {
  const baseline = imageOf(base());
  const levels = ([1, 2, 3] as const).map((level) => imageOf(withCosmetic(base(), category, level)));
  const meta = COSMETIC_META[category];

  check(levels[0] === baseline, `${category} level 1 is the stock car`);
  check(levels[1] !== levels[0], `${category} "${meta.levelNames[1]}" differs from "${meta.levelNames[0]}"`);
  check(levels[2] !== levels[0], `${category} "${meta.levelNames[2]}" differs from "${meta.levelNames[0]}"`);
  check(levels[1] !== levels[2], `${category} "${meta.levelNames[1]}" differs from "${meta.levelNames[2]}"`);
  console.log(`  ${category.padEnd(14)} ${levels.join(' ')}`);
}

// ---------------------------------------------------------------- colours --

console.log('\nCar art — every colour slot is painted');
{
  for (const { slot } of COLOR_SLOT_ENTRIES) {
    const byColour = new Map<string, string>();
    let deterministic = true;

    for (const preset of COLOR_PRESETS) {
      const value = slotValue(preset, slot).toLowerCase();
      const painted = imageOf(withColor(base(), slot, value));
      const existing = byColour.get(value);
      if (existing === undefined) byColour.set(value, painted);
      else if (existing !== painted) deterministic = false;
    }

    const uniqueHashes = new Set(byColour.values()).size;
    check(deterministic, `${slot} renders the same colour the same way every time`);
    check(
      uniqueHashes === byColour.size,
      `${slot} each distinct colour renders distinctly`,
      `${uniqueHashes}/${byColour.size}`,
    );
    console.log(`  ${slot.padEnd(14)} ${uniqueHashes}/${byColour.size} distinct colours`);
  }
}

// ------------------------------------------------------------ combinations --

console.log('\nCar art — combined configurations stay distinct');
{
  /** Whole-car setups: every category follows the same level pattern. */
  const THEMES: ReadonlyArray<readonly CosmeticLevel[]> = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3, 3, 3, 3, 3],
    [1, 2, 3, 1, 2, 3, 1, 2, 3],
    [3, 2, 1, 3, 2, 1, 3, 2, 1],
  ];

  const seen = new Map<string, string>();
  let collisions = 0;
  let variants = 0;

  for (const type of BODY_TYPE_ORDER) {
    for (const preset of COLOR_PRESETS) {
      const painted = COLOR_SLOT_ENTRIES.reduce(
        (acc, { slot }) => withColor(acc, slot, slotValue(preset, slot)),
        withBody(base(), type),
      );

      THEMES.forEach((theme, themeIndex) => {
        const variant = COSMETIC_CATEGORIES.reduce(
          (acc, category, index) => withCosmetic(acc, category, theme[index]),
          painted,
        );
        const key = imageOf(variant);
        const label = `${type}/${preset.name}/theme${themeIndex}`;
        const existing = seen.get(key);
        if (existing) {
          collisions += 1;
          console.log(`  COLLISION ${label} == ${existing}`);
        }
        seen.set(key, label);
        variants += 1;
      });
    }
  }

  check(variants === BODY_TYPE_ORDER.length * COLOR_PRESETS.length * THEMES.length, 'variant count', `${variants}`);
  check(collisions === 0, 'no two configurations render identically', `${collisions} collisions`);
  console.log(`  ${variants} configurations, ${seen.size} unique images`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exitCode = 1;
} else {
  console.log('Car art verification passed');
}
