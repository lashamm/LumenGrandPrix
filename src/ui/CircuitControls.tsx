import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CircuitControlState, CircuitPhase } from '../game/circuit/types';

const THROTTLE_KEYS = ['KeyW', 'ArrowUp'];
const BRAKE_KEYS = ['KeyS', 'ArrowDown', 'Space'];
const PAUSE_KEYS = ['Escape', 'KeyP'];

/**
 * Touch/mouse/keyboard controls for circuit racing.
 *
 * Same contract as the drag `RaceControls`: keys and pedals write
 * the same mutable `CircuitControlState` the Phaser scene reads, so
 * the simulation never waits on a React render. The local `pressed`
 * state exists purely so the pedals light up.
 */
export function CircuitControls({
  controls,
  phase,
  onPause,
}: {
  controls: CircuitControlState;
  phase: CircuitPhase;
  onPause: () => void;
}): ReactNode {
  const [pressed, setPressed] = useState({ throttle: false, brake: false });

  // Read inside the long-lived listeners without re-subscribing on
  // every phase change (re-subscribing would clear the held set).
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pauseRef = useRef(onPause);
  pauseRef.current = onPause;

  const set = (key: 'throttle' | 'brake', value: boolean) => {
    // Pedals only bite once the race is actually running, so a pedal
    // never lights up for a press the sim is going to ignore.
    if (phaseRef.current !== 'racing') value = false;
    controls[key] = value;
    setPressed((previous) => (previous[key] === value ? previous : { ...previous, [key]: value }));
  };

  const syncRef = useRef<() => void>(() => {});
  const releaseRef = useRef<() => void>(() => {});

  useEffect(() => {
    const held = new Set<string>();

    const syncHeld = () => {
      set(
        'throttle',
        [...held].some((code) => THROTTLE_KEYS.includes(code)),
      );
      set(
        'brake',
        [...held].some((code) => BRAKE_KEYS.includes(code)),
      );
    };
    syncRef.current = syncHeld;

    const releaseAll = () => {
      held.clear();
      set('throttle', false);
      set('brake', false);
    };
    releaseRef.current = releaseAll;

    const onKeyDown = (event: KeyboardEvent) => {
      // Once the result card is up the keys belong to the UI again, so
      // SPACE and ENTER work on RACE AGAIN like they would anywhere else.
      if (phaseRef.current === 'finished') return;
      if (event.repeat) return;

      if (PAUSE_KEYS.includes(event.code)) {
        event.preventDefault();
        pauseRef.current();
        return;
      }
      if (THROTTLE_KEYS.includes(event.code) || BRAKE_KEYS.includes(event.code)) {
        // Stop Space activating a focused pedal and arrows scrolling.
        event.preventDefault();
        held.add(event.code);
        syncHeld();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (phaseRef.current === 'finished') return;
      if (!THROTTLE_KEYS.includes(event.code) && !BRAKE_KEYS.includes(event.code)) return;
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

  // Finishing drops every held key so nothing keeps driving past the
  // flag. Every other phase re-reads the held set, so a throttle held
  // through the last countdown second applies the instant racing starts.
  useEffect(() => {
    if (phase === 'finished') releaseRef.current();
    else syncRef.current();
  }, [phase]);

  return (
    <div className="race-controls">
      <button
        type="button"
        className={`pedal pedal--gas${pressed.throttle ? ' is-pressed' : ''}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          set('throttle', true);
        }}
        onPointerUp={() => set('throttle', false)}
        onPointerCancel={() => set('throttle', false)}
        disabled={phase === 'finished'}
      >
        <span className="pedal__label">
          {phase === 'countdown' ? 'GET READY' : 'THROTTLE'}
        </span>
        <span className="pedal__hint">W / ↑</span>
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
        <span className="pedal__hint">S / ↓ / SPACE</span>
      </button>

      <div className="pedal-stack">
        <button
          type="button"
          className="pedal pedal--shift"
          onClick={onPause}
          disabled={phase === 'finished'}
        >
          <span className="pedal__label">PAUSE</span>
          <span className="pedal__hint">ESC / P</span>
        </button>
      </div>
    </div>
  );
}
