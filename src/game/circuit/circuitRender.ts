import { CIRCUIT_CAR_ROWS, circuitCarPalette } from './carSprite';
import type { CarColors } from '../types';

/**
 * DOM preview for the Formula-style circuit car.
 *
 * The race scene paints `CIRCUIT_CAR_ROWS` with `circuitCarPalette` into a
 * Phaser texture; this module paints the exact same rows with the exact same
 * palette into a canvas, so the garage preview is the car that lines up on the
 * grid — one sprite definition, two consumers, no drift. Phaser-free.
 */

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

const previewCache = new Map<string, string>();
const PREVIEW_CACHE_LIMIT = 64;

/** PNG data URL of the Formula car, at `scale`×, nearest-neighbour. */
export function circuitCarPreviewUrl(car: { colors: CarColors }, scale = 4): string {
  if (typeof document === 'undefined') return '';
  const key = `${scale}|${JSON.stringify(car.colors)}`;
  const cached = previewCache.get(key);
  if (cached) return cached;

  const palette = circuitCarPalette(car.colors);
  const width = CIRCUIT_CAR_ROWS[0].length;
  const height = CIRCUIT_CAR_ROWS.length;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Outline first so the border sits outside the body, matching the scene.
  ctx.fillStyle = hex(palette.o);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (CIRCUIT_CAR_ROWS[y][x] === 'o') ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const symbol = CIRCUIT_CAR_ROWS[y][x];
      if (symbol === '.' || symbol === 'o') continue;
      const colour = palette[symbol];
      if (colour === undefined) continue;
      ctx.fillStyle = hex(colour);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  const url = canvas.toDataURL();
  if (previewCache.size >= PREVIEW_CACHE_LIMIT) previewCache.clear();
  previewCache.set(key, url);
  return url;
}
