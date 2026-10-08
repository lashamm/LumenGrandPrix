import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KEY_BINDINGS, primaryKey, type ControlAction, type ControlState } from '../game/control';

const ACTIONS: readonly ControlAction[] = ['gas', 'brake', 'upshift', 'downshift'];

/**
 * Touch/mouse/keyboard controls for the race.
 *
 * Keys are handled here rather than inside Phaser so the DOM overlay stays the
 * single owner of player input. `ControlState` is a mutable struct shared with
 * the physics loop, so the simulation never waits on React; the local `pressed`
 * state below exists purely so the pedals can light up.
 *
 * Keyboard and pedals write the same fields of the same object, so there is no
 * second gameplay path to drift out of sync.
 */
export function RaceControls({
  controls,
  phase,
}: {
  controls: ControlState;
  phase: 'countdown' | 'staging' | 'racing' | 'finished';
}): ReactNode {
  const [pressed, setPressed] = useState({
    gas: false,
    brake: false,
    upshift: false,
    downshift: false,
  });

  // Read inside the long-lived listeners without re-subscribing on every phase
  // change (re-subscribing would clear the held-key set mid-press).
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const set = (key: ControlAction, value: boolean) => {
    // The brake only does something while the car is actually racing, so the
    // pedal never lights up for a press the sim is going to ignore.
    if (key === 'brake' && phaseRef.current !== 'racing') value = false;
    controls[key] = value;
    setPressed((previous) => (previous[key] === value ? previous : { ...previous, [key]: value }));
  };

  const syncRef = useRef<() => void>(() => {});
  const releaseRef = useRef<() => void>(() => {});

  useEffect(() => {
    const held = new Set<string>();

    const syncHeld = () => {
      for (const action of ACTIONS) {
        const down = KEY_BINDINGS.some(
          (binding) =>
            binding.action === action &&
            [...held].some((code) => binding.keys.includes(code)),
        );
        set(action, down);
      }
    };
    syncRef.current = syncHeld;

    const releaseAll = () => {
      held.clear();
      for (const action of ACTIONS) set(action, false);
    };
    releaseRef.current = releaseAll;

    const onKeyDown = (event: KeyboardEvent) => {
      // Once the result card is up the keys belong to the UI again, so SPACE
      // and ENTER work on PLAY AGAIN / MENU like they would anywhere else.
      if (phaseRef.current === 'finished') return;
      const binding = KEY_BINDINGS.find((candidate) => candidate.keys.includes(event.code));
      if (!binding) return;
      // Stop Space activating a focused pedal and stop arrows scrolling.
      event.preventDefault();
      // Auto-repeat must never queue extra shifts or re-edge a held pedal.
      if (event.repeat) return;
      held.add(event.code);
      syncHeld();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (phaseRef.current === 'finished') return;
      if (!KEY_BINDINGS.some((candidate) => candidate.keys.includes(event.code))) return;
      event.preventDefault();
      held.delete(event.code);
      syncHeld();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
    };
    // `set` is recreated each render but only touches stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // Finishing drops every held key so nothing keeps driving past the flag.
  // Every other phase re-reads the held set, so a brake held through the
  // moment the light turns green applies the instant racing starts.
  useEffect(() => {
    if (phase === 'finished') releaseRef.current();
    else syncRef.current();
  }, [phase]);

  return (
    <div className="race-controls">
      <button
        type="button"
        className={`pedal pedal--gas${pressed.gas ? ' is-pressed' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          set('gas', true);
        }}
        onPointerUp={() => set('gas', false)}
        onPointerCancel={() => set('gas', false)}
        disabled={phase === 'finished'}
      >
        <span className="pedal__label">
          {phase === 'staging' ? 'HOLD TO REV' : phase === 'countdown' ? 'GET READY' : 'GAS'}
        </span>
        <span className="pedal__hint">{primaryKey('gas')}</span>
      </button>

      <button
        type="button"
        className={`pedal pedal--brake${pressed.brake ? ' is-pressed' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          set('brake', true);
        }}
        onPointerUp={() => set('brake', false)}
        onPointerCancel={() => set('brake', false)}
        disabled={phase !== 'racing'}
      >
        <span className="pedal__label">BRAKE</span>
        <span className="pedal__hint">{primaryKey('brake')}</span>
      </button>

      <div className="pedal-stack">
        <button
          type="button"
          className={`pedal pedal--shift${pressed.upshift ? ' is-pressed' : ''}`}
          onPointerDown={() => set('upshift', true)}
          onPointerUp={() => set('upshift', false)}
          onPointerCancel={() => set('upshift', false)}
          disabled={phase === 'finished'}
        >
          <span className="pedal__label">UPSHIFT</span>
          <span className="pedal__hint">{primaryKey('upshift')}</span>
        </button>
        <button
          type="button"
          className={`pedal pedal--shift pedal--down${pressed.downshift ? ' is-pressed' : ''}`}
          onPointerDown={() => set('downshift', true)}
          onPointerUp={() => set('downshift', false)}
          onPointerCancel={() => set('downshift', false)}
          disabled={phase === 'finished'}
        >
          <span className="pedal__label">DOWNSHIFT</span>
          <span className="pedal__hint">{primaryKey('downshift')}</span>
        </button>
      </div>
    </div>
  );
}
