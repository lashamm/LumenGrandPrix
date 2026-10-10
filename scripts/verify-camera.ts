import { CIRCUIT, PHASER } from '../src/game/config';
import { resolveCircuit } from '../src/game/circuit/handcraftedTracks';
import {
  CircuitCar,
  circuitPointAt,
  circuitStats,
  carWorldPosition,
} from '../src/game/circuit/vehiclePhysics';
import { CircuitAiDriver } from '../src/game/circuit/circuitAi';
import type { UpgradeLevels } from '../src/game/types';

/**
 * Regression check for the circuit follow camera.
 *
 * Replays the exact camera maths from `CircuitRaceScene` while an AI drives a
 * full lap of every track, asserting that the player's car never drifts out of
 * the central band of the viewport and that the camera never jitters or snaps.
 * If the camera is ever reverted to a clamped, lagging or spin-prone variant,
 * this fails.
 */

const DT = 1 / 60;
const CAM_DIR_TAU_S = 0.18;
const CAM_BIAS_FRACTION = 0.14;
const SECONDS = 90;
const LEVELS: UpgradeLevels = { engine: 3, weight: 3, aero: 3, brakes: 3, tires: 3 };
const TRACKS: readonly (string | null)[] = ['kestrel', 'aurelia', 'kura', 'meridian', null];

interface Result {
  worstCarOffsetPx: number;
  worstJumpPx: number;
  worstCamToCarM: number;
  broken: boolean;
}

function runTrack(trackId: string | null, zoom: number): Result {
  const circuit = resolveCircuit(trackId, 0);
  const car = new CircuitCar(circuitStats(LEVELS));
  car.reset(circuit, 0, 0);
  const ai = new CircuitAiDriver({ difficulty: 'hard', levels: LEVELS, seed: 12345, baseLine: 0 });

  const lead = (PHASER.height / zoom) * CAM_BIAS_FRACTION;
  let dirX = 1;
  let dirY = 0;
  let ready = false;
  let prevCamX = Number.NaN;
  let prevCamY = Number.NaN;
  const result: Result = { worstCarOffsetPx: 0, worstJumpPx: 0, worstCamToCarM: 0, broken: false };

  const steps = Math.round(SECONDS / DT);
  for (let step = 0; step < steps; step += 1) {
    car.lineOffset = ai.lineOffsetAt(car.state.s);
    car.update(DT, ai.update(DT, car, circuit), circuit);

    const s = car.state.s;
    const position = carWorldPosition(circuit, s, car.state.lat);
    const point = circuitPointAt(circuit, s);
    const k = 1 - Math.exp(-DT / CAM_DIR_TAU_S);
    if (!ready) {
      dirX = point.tx;
      dirY = point.ty;
      ready = true;
    } else {
      dirX += (point.tx - dirX) * k;
      dirY += (point.ty - dirY) * k;
    }

    const camX = position.x + dirX * lead;
    const camY = position.y + dirY * lead;
    if (!Number.isFinite(camX) || !Number.isFinite(camY) || !Number.isFinite(position.x)) {
      result.broken = true;
    }

    const offsetPx = Math.hypot(position.x - camX, position.y - camY) * zoom;
    result.worstCarOffsetPx = Math.max(result.worstCarOffsetPx, offsetPx);
    result.worstCamToCarM = Math.max(
      result.worstCamToCarM,
      Math.hypot(position.x - camX, position.y - camY),
    );
    if (Number.isFinite(prevCamX)) {
      result.worstJumpPx = Math.max(
        result.worstJumpPx,
        Math.hypot(camX - prevCamX, camY - prevCamY) * zoom,
      );
    }
    prevCamX = camX;
    prevCamY = camY;
  }
  return result;
}

let failures = 0;
for (const zoom of [CIRCUIT.camZoom, CIRCUIT.camZoom * 1.35]) {
  for (const id of TRACKS) {
    const r = runTrack(id, zoom);
    const lead = (PHASER.height / zoom) * CAM_BIAS_FRACTION;
    const carHalfPx = 4 * zoom;
    const centreBand = Math.min(PHASER.width, PHASER.height) / 2 - carHalfPx;
    const ok = !r.broken && r.worstCamToCarM <= lead + 0.01 && r.worstCarOffsetPx < centreBand;
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${(id ?? 'random').padEnd(8)} @zoom${zoom.toFixed(2)} ` +
        `carOffset=${r.worstCarOffsetPx.toFixed(1)}px ` +
        `camJump=${r.worstJumpPx.toFixed(1)}px/f ` +
        `cam→car=${r.worstCamToCarM.toFixed(2)}m ` +
        `band=${centreBand.toFixed(0)}px`,
    );
  }
}

console.log(failures === 0 ? 'CAMERA CHECKS PASSED' : `${failures} CAMERA CHECK(S) FAILED`);
if (failures > 0) process.exitCode = 1;
