/**
 * Shared control state.
 *
 * The React control overlay writes to this object and the Phaser scene reads it,
 * which keeps the DOM UI and the game loop decoupled. Level-triggered is fine
 * here because Drivetrain does its own edge detection on shift buttons.
 */
export interface ControlState {
  gas: boolean;
  upshift: boolean;
  downshift: boolean;
}

export function createControlState(): ControlState {
  return { gas: false, upshift: false, downshift: false };
}

export const KEY_BINDINGS: ReadonlyArray<{ keys: string[]; action: keyof ControlState; label: string }> = [
  { keys: ['Space', 'ArrowUp', 'KeyW'], action: 'gas', label: 'GAS' },
  { keys: ['ShiftLeft', 'ShiftRight', 'KeyE'], action: 'upshift', label: 'UPSHIFT' },
  { keys: ['KeyQ', 'KeyD', 'ArrowDown'], action: 'downshift', label: 'DOWNSHIFT' },
];