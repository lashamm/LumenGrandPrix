import Phaser from 'phaser';
import type { CarDefinition } from './car/carData';
import {
  BULB_ROWS,
  CAR_SCALE,
  CAR_SPRITE,
  CAR_WHEELS,
  LIGHT_TREE_ROWS,
  SCENERY,
  buildCarRows,
  bulbPalette,
  carPalette,
  hex,
  lightTreePalette,
  wheelPalette,
  WHEEL_SPRITES,
} from './car/render';

/**
 * Phaser adapter for the car renderer.
 *
 * All pixel data comes from `car/render.ts`, which is deliberately Phaser-free
 * so the garage preview can import it without dragging the engine into the main
 * bundle. This file only knows how to put rows into a texture.
 *
 * Re-exported so existing scene code keeps a single import point.
 */
export { CAR_SPRITE, CAR_SCALE, CAR_WHEELS, SCENERY };

/**
 * Paints rows into a canvas texture.
 *
 * An existing texture under the same key is destroyed first: textures are
 * cached by key, and a player who changes their paint between runs must not see
 * the previous car's bitmap.
 */
function paint(scene: Phaser.Scene, key: string, rows: readonly string[], palette: Record<string, number>): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);

  const width = rows[0].length;
  const height = rows.length;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();

  // Outline first, shell second, so the border sits outside the car.
  ctx.fillStyle = hex(palette.o ?? 0x07080d);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rows[y][x] !== 'o') continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const symbol = row[x];
      if (symbol === '.' || symbol === 'o') continue;
      const colour = palette[symbol];
      if (colour === undefined) continue;
      ctx.fillStyle = hex(colour);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.refresh();
}

export function generateCarTexture(scene: Phaser.Scene, key: string, car: CarDefinition): void {
  paint(scene, key, buildCarRows(car), carPalette(car));
}

export function generateWheelTexture(scene: Phaser.Scene, key: string, car: Pick<CarDefinition, 'colors' | 'options'>): void {
  const palette = wheelPalette(car);
  paint(scene, key, WHEEL_SPRITES[car.options.wheels], palette);
}

export function generateLightTreeTexture(scene: Phaser.Scene): void {
  paint(scene, 'light-tree', LIGHT_TREE_ROWS, lightTreePalette());
}

export function generateBulbTexture(scene: Phaser.Scene, key: string, colour: number): void {
  paint(scene, key, BULB_ROWS, bulbPalette(colour));
}
