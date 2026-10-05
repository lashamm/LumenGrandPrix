import Phaser from 'phaser';
import { PHASER } from './config';

/**
 * Creates the Phaser game used by the Race screen.
 *
 * The React shell owns the lifecycle (mount/unmount on navigation) and hands the
 * race payload to the scene when the game reports READY, which keeps navigation
 * state in React and simulation state inside Phaser.
 */
export function createPhaserGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'lumen-race-root',
    width: PHASER.width,
    height: PHASER.height,
    backgroundColor: PHASER.backgroundColor,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Scenes are added manually so the race payload can be handed over at once.
    scene: [],
    banner: false,
  });
}