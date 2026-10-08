/**
 * Shared control state.
 *
 * The React control overlay writes to this object and the Phaser scene reads it,
 * which keeps the DOM UI and the game loop decoupled. Level-triggered is fine
 * here because Drivetrain does its own edge detection on shift buttons.
 */
export interface ControlState {
  gas: boolean;
  brake: boolean;
  upshift: boolean;
  downshift: boolean;
}

export function createControlState(): ControlState {
  return { gas: false, brake: false, upshift: false, downshift: false };
}

export type ControlAction = keyof ControlState;

/**
 * Keyboard bindings, listed in the order the race legend shows them.
 *
 * Pedals and legend both read this table, so the on-screen keys can never
 * drift from what the handlers actually listen for.
 */
export const KEY_BINDINGS: ReadonlyArray<{ keys: string[]; action: ControlAction; label: string }> = [
  { keys: ['KeyW', 'Space', 'ArrowUp'], action: 'gas', label: 'GAS' },
  { keys: ['KeyS', 'ArrowDown'], action: 'brake', label: 'BRAKE' },
  { keys: ['KeyQ', 'KeyD'], action: 'downshift', label: 'DOWNSHIFT' },
  { keys: ['KeyE', 'ShiftLeft', 'ShiftRight'], action: 'upshift', label: 'UPSHIFT' },
];

const KEY_DISPLAY: Readonly<Record<string, string>> = {
  Space: 'SPACE',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
};

/** Human-readable label for a `KeyboardEvent.code`, e.g. `KeyW` → `W`. */
export function keyLabel(code: string): string {
  const named = KEY_DISPLAY[code];
  if (named) return named;
  return code.startsWith('Key') ? code.slice(3) : code.toUpperCase();
}

/** The key shown on the pedal and in the legend for an action. */
export function primaryKey(action: ControlAction): string {
  const binding = KEY_BINDINGS.find((candidate) => candidate.action === action);
  return binding ? keyLabel(binding.keys[0]) : '';
}
