import Phaser from 'phaser';
import { PHASER } from './config';

/**
 * Creates the Phaser game used by the race screens.
 *
 * The React shell owns the lifecycle (mount/unmount on navigation) and hands the
 * race payload to the scene when the game reports READY, which keeps navigation
 * state in React and simulation state inside Phaser.
 *
 * `parent` is the DOM id of the canvas host, so the drag race and the
 * circuit race can each own a stage without sharing a div.
 */
export function createPhaserGame(parent = 'lumen-race-root'): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: PHASER.width,
    height: PHASER.height,
    backgroundColor: PHASER.backgroundColor,
    // Crisp pixels via nearest-neighbour sampling, but NO integer rounding of
    // positions: `pixelArt` forces `roundPixels:true`, which snaps every car to
    // whole screen pixels and makes the zoomed circuit camera stutter. Textures
    // stay sharp because `antialias`/`antialiasGL` are off; only motion is
    // sub-pixel now, so high-FPS movement renders smoothly.
    pixelArt: false,
    antialias: false,
    antialiasGL: false,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Scenes are added manually so the race payload can be handed over at once.
    scene: [],
    banner: false,
  });
}