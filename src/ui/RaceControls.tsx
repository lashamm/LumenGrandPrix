import { useEffect, useState, type ReactNode } from 'react';
import { KEY_BINDINGS, type ControlState } from '../game/control';

/**
 * Touch/mouse/keyboard controls for the race.
 *
 * Keys are handled here rather than inside Phaser so the DOM overlay stays the
 * single owner of player input. `ControlState` is a mutable struct shared with
 * the physics loop, so the simulation never waits on React; the local `pressed`
 * state below exists purely so the pedals can light up.
 */
export function RaceControls({
  controls,
  phase,
}: {
  controls: ControlState;
  phase: 'staging' | 'racing' | 'finished';
}): ReactNode {
  const [pressed, setPressed] = useState({ gas: false, upshift: false, downshift: false });

  const set = (key: 'gas' | 'upshift' | 'downshift', value: boolean) => {
    controls[key] = value;
    setPressed((previous) => (previous[key] === value ? previous : { ...previous, [key]: value }));
  };
  useEffect(() => {
    const held = new Set<string>();

    const syncGas = () => {
      set(
        'gas',
        KEY_BINDINGS.some(
          (binding) => binding.action === 'gas' && [...held].some((code) => binding.keys.includes(code)),
        ),
      );
    };

    const syncShift = (event: KeyboardEvent, isPressed: boolean) => {
      const binding = KEY_BINDINGS.find((candidate) => candidate.keys.includes(event.code));
      if (!binding || binding.action === 'gas') return false;
      set(binding.action, isPressed);
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const binding = KEY_BINDINGS.find((candidate) => candidate.keys.includes(event.code));
      if (!binding || event.repeat) return;
      event.preventDefault();
      held.add(event.code);
      if (syncShift(event, true)) return;
      syncGas();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_BINDINGS.some((candidate) => candidate.keys.includes(event.code))) return;
      event.preventDefault();
      held.delete(event.code);
      if (syncShift(event, false)) return;
      syncGas();
    };

    const releaseAll = () => {
      held.clear();
      set('gas', false);
      set('upshift', false);
      set('downshift', false);
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

  useEffect(() => {
    if (phase === 'finished') set('gas', false);
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
        <span className="pedal__label">{phase === 'staging' ? 'HOLD TO REV' : 'GAS'}</span>
        <span className="pedal__hint">SPACE</span>
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
          <span className="pedal__hint">SHIFT</span>
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
          <span className="pedal__hint">Q</span>
        </button>
      </div>
    </div>
  );
}