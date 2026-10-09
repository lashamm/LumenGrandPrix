/* eslint-disable no-console */
/**
 * Circuit Racing — verification suite.
 *
 * Everything tested here is the engine-agnostic core in
 * `src/game/circuit`: the generator, the physics, the AI and
 * the race model. No Phaser, no React — the same headless
 * convention as `scripts/verify-car-art.ts`.
 *
 * Run: npx tsx scripts/test-circuit.ts   (or npm run test)
 */
import { CIRCUIT } from '../src/game/config';
import { Rng } from '../src/game/ai/aiDriver';
import { buildCircuitFromNodes, generateCircuit } from '../src/game/circuit/circuitGenerator';
import { PREDEFINED_CIRCUITS } from '../src/game/circuit/predefinedCircuits';
import { CircuitAiDriver } from '../src/game/circuit/circuitAi';
import { CircuitRaceModel } from '../src/game/circuit/raceModel';
import {
  CircuitCar,
  cornerBudget,
  gripStateFor,
  safeCornerSpeed,
  circuitStats,
} from '../src/game/circuit/vehiclePhysics';
import type {
  CarSpec,
  Circuit,
  CircuitInput,
  CircuitRaceSetup,
} from '../src/game/circuit/types';
import type { UpgradeLevels } from '../src/game/types';

let checks = 0;
let failures = 0;

function check(condition: boolean, label: string, detail = ''): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

const BASE: UpgradeLevels = { engine: 1, weight: 1, aero: 1, brakes: 1, tires: 1 };
const MID: UpgradeLevels = { engine: 2, weight: 2, aero: 2, brakes: 2, tires: 2 };
const BUILT: UpgradeLevels = { engine: 3, weight: 3, aero: 3, brakes: 3, tires: 3 };

const THROTTLE: CircuitInput = { throttle: true, brake: false };
const COAST: CircuitInput = { throttle: false, brake: false };
const BRAKE: CircuitInput = { throttle: false, brake: true };

/** Runs a car for `seconds` at a fixed frame time, tracking extremes. */
function drive(
  car: CircuitCar,
  circuit: Circuit,
  input: CircuitInput,
  seconds: number,
  dt = 1 / 60,
): {
  maxSlide: number;
  maxLockup: number;
  maxLat: number;
  spun: boolean;
  offTrack: boolean;
  minV: number;
  maxV: number;
  distance: number;
} {
  const startS = car.state.s;
  const steps = Math.round(seconds / dt);
  const seen = {
    maxSlide: 0,
    maxLockup: 0,
    maxLat: 0,
    spun: false,
    offTrack: false,
    minV: Number.POSITIVE_INFINITY,
    maxV: 0,
    distance: 0,
  };
  for (let i = 0; i < steps; i += 1) {
    car.update(dt, input, circuit);
    const state = car.state;
    seen.maxSlide = Math.max(seen.maxSlide, state.slide);
    seen.maxLockup = Math.max(seen.maxLockup, state.lockup);
    seen.maxLat = Math.max(seen.maxLat, Math.abs(state.lat));
    seen.minV = Math.min(seen.minV, state.v);
    seen.maxV = Math.max(seen.maxV, state.v);
    if (state.spinTimer > 0) seen.spun = true;
    if (state.offTrack) seen.offTrack = true;
  }
  seen.distance = car.state.s - startS;
  return seen;
}

/** Every invariant a circuit must hold, as a list of problems. */
function circuitProblems(circuit: Circuit): string[] {
  const problems: string[] = [];
  const samples = circuit.samples;
  const n = samples.length;

  if (circuit.length < CIRCUIT.minLengthM || circuit.length > CIRCUIT.maxLengthM) {
    problems.push(`length ${circuit.length.toFixed(0)}m out of range`);
  }

  let maxCurvature = 0;
  let minSpacing = Number.POSITIVE_INFINITY;
  let maxSpacing = 0;
  let maxTangentError = 0;
  let maxNormalError = 0;
  let nonFinite = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < n; i += 1) {
    const sample = samples[i];
    if (
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      !Number.isFinite(sample.tx) ||
      !Number.isFinite(sample.ty) ||
      !Number.isFinite(sample.curvature)
    ) {
      nonFinite += 1;
      continue;
    }
    maxCurvature = Math.max(maxCurvature, Math.abs(sample.curvature));
    minX = Math.min(minX, sample.x);
    minY = Math.min(minY, sample.y);
    maxX = Math.max(maxX, sample.x);
    maxY = Math.max(maxY, sample.y);

    const tangentLength = Math.hypot(sample.tx, sample.ty);
    maxTangentError = Math.max(maxTangentError, Math.abs(tangentLength - 1));
    const normalLength = Math.hypot(sample.nx, sample.ny);
    maxNormalError = Math.max(maxNormalError, Math.abs(normalLength - 1));
    const dot = sample.tx * sample.nx + sample.ty * sample.ny;
    maxNormalError = Math.max(maxNormalError, Math.abs(dot));

    const next = samples[(i + 1) % n];
    const spacing = Math.hypot(next.x - sample.x, next.y - sample.y);
    minSpacing = Math.min(minSpacing, spacing);
    maxSpacing = Math.max(maxSpacing, spacing);
  }

  if (nonFinite > 0) problems.push(`${nonFinite} non-finite samples`);
  if (maxCurvature > 1 / CIRCUIT.minRadiusM + 1e-9) {
    problems.push(`corner radius ${(1 / maxCurvature).toFixed(1)}m tighter than ${CIRCUIT.minRadiusM}m`);
  }

  const first = samples[0];
  const last = samples[n - 1];
  const closure = Math.hypot(last.x - first.x, last.y - first.y);
  if (closure > CIRCUIT.stepM * 2) problems.push(`open loop, ${closure.toFixed(1)}m gap`);

  if (minSpacing < CIRCUIT.stepM * 0.7 || maxSpacing > CIRCUIT.stepM * 1.35) {
    problems.push(`uneven spacing ${minSpacing.toFixed(2)}..${maxSpacing.toFixed(2)}m`);
  }
  if (maxTangentError > 0.02) problems.push(`tangent drift ${maxTangentError.toFixed(4)}`);
  if (maxNormalError > 0.02) problems.push(`normal drift ${maxNormalError.toFixed(4)}`);

  const expectedLength = n * CIRCUIT.stepM;
  if (Math.abs(circuit.length - expectedLength) > expectedLength * 0.02) {
    problems.push(`length ${circuit.length.toFixed(0)}m inconsistent with ${n} samples`);
  }
  if (
    Math.abs(minX - circuit.bounds.minX) > 1 ||
    Math.abs(minY - circuit.bounds.minY) > 1 ||
    Math.abs(maxX - circuit.bounds.maxX) > 1 ||
    Math.abs(maxY - circuit.bounds.maxY) > 1
  ) {
    problems.push('bounds do not contain the samples');
  }

  // Non-adjacent centreline sections must stay a track width apart.
  const cell = CIRCUIT.trackWidthM;
  const minSeparation = Math.round(40 / CIRCUIT.stepM);
  const limitSq = (CIRCUIT.trackWidthM * 1.12) ** 2;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i += 1) {
    const key = `${Math.floor(samples[i].x / cell)}:${Math.floor(samples[i].y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }
  for (let i = 0; i < n; i += 1) {
    const cx = Math.floor(samples[i].x / cell);
    const cy = Math.floor(samples[i].y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        const bucket = grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          const direct = Math.abs(i - j);
          const circular = Math.min(direct, n - direct);
          if (circular <= minSeparation) continue;
          const dx = samples[i].x - samples[j].x;
          const dy = samples[i].y - samples[j].y;
          if (dx * dx + dy * dy < limitSq) {
            problems.push('self-intersection');
            return problems;
          }
        }
      }
    }
  }

  return problems;
}

function assertValidCircuit(circuit: Circuit, label: string): void {
  const problems = circuitProblems(circuit);
  check(problems.length === 0, `${label} is a valid circuit`, problems.join('; '));
}

/** Index of the tightest / gentlest sample on the circuit. */
function extremeIndex(circuit: Circuit, tightest: boolean): number {
  let best = 0;
  let bestValue = tightest ? -1 : Number.POSITIVE_INFINITY;
  circuit.samples.forEach((sample, index) => {
    const value = Math.abs(sample.curvature);
    if (tightest ? value > bestValue : value < bestValue) {
      bestValue = value;
      best = index;
    }
  });
  return best;
}

// ================================================================ generator ==

console.log('\nCircuit generator — validity across 40 seeds');
{
  const names = new Set<string>();
  for (let seed = 1; seed <= 40; seed += 1) {
    const circuit = generateCircuit(seed);
    assertValidCircuit(circuit, `seed ${seed}`);
    names.add(circuit.name);
  }
  check(names.size >= 20, 'seeds produce varied circuits', `${names.size} distinct names`);
}

console.log('\nCircuit generator — determinism');
{
  const first = generateCircuit(1234);
  const second = generateCircuit(1234);
  check(
    JSON.stringify(first.samples) === JSON.stringify(second.samples),
    'same seed produces the identical circuit',
  );
  check(first.name === second.name, 'same seed produces the same name');

  const distinct = new Set<string>();
  for (let seed = 1; seed <= 20; seed += 1) {
    distinct.add(JSON.stringify(generateCircuit(seed).samples));
  }
  check(distinct.size >= 18, 'different seeds produce different circuits', `${distinct.size}/20`);
}

console.log('\nCircuit generator — motif coverage');
{
  // The circuit name encodes which motifs were picked: hairpin layouts
  // get the HAIRPIN/CLUB/TWIST prefix, chicane and S-bend layouts get
  // TECH/KART/CLUB.
  let sawHairpin = false;
  let sawTechnical = false;
  for (let seed = 1; seed <= 60; seed += 1) {
    const name = generateCircuit(seed).name;
    if (/^(HAIRPIN|CLUB|TWIST)/.test(name)) sawHairpin = true;
    if (/^(TECH|KART)/.test(name)) sawTechnical = true;
  }
  check(sawHairpin, 'hairpin motifs appear across seeds');
  check(sawTechnical, 'chicane / S-bend motifs appear across seeds');
}

console.log('\nCircuit generator — predefined fallbacks');
{
  for (const predefined of PREDEFINED_CIRCUITS) {
    const circuit = buildCircuitFromNodes(predefined.nodes, predefined.name);
    check(circuit !== null, `${predefined.name} builds`);
    if (circuit) assertValidCircuit(circuit, predefined.name);
  }
  // A hand-built circle is the simplest possible valid loop.
  const circle = Array.from({ length: 12 }, (_, index) => ({
    angle: (index * 360) / 12,
    radius: CIRCUIT.baseRadiusM,
  }));
  const loop = buildCircuitFromNodes(circle, 'CIRCLE');
  check(loop !== null, 'a plain circle builds');
  if (loop) assertValidCircuit(loop, 'circle');
}

// ================================================================ physics ==

console.log('\nPhysics — corner speed model');
{
  const stats = circuitStats(BASE);
  check(
    safeCornerSpeed(0, stats) === stats.topSpeedMps,
    'a straight allows top speed',
  );

  const gentle = safeCornerSpeed(1 / 120, stats);
  const tight = safeCornerSpeed(1 / 20, stats);
  check(gentle > tight, 'gentler corners are faster', `${gentle.toFixed(1)} vs ${tight.toFixed(1)}`);

  // With the aero term removed the model must reduce to the analytic
  // friction-circle solution v = sqrt(µ·g / |κ|).
  const flat = { ...stats, aeroDownforce: 0 };
  const curvature = 1 / 30;
  const analytic = Math.sqrt((stats.tireGrip * 9.81) / curvature);
  const modelled = safeCornerSpeed(curvature, flat);
  check(
    Math.abs(modelled - analytic) < 1e-6,
    'corner speed matches the friction circle',
    `${modelled.toFixed(4)} vs ${analytic.toFixed(4)}`,
  );

  const grippy = { ...circuitStats(BUILT), aeroDownforce: 0 };
  check(
    safeCornerSpeed(curvature, grippy) > modelled,
    'more tire grip raises the corner speed',
  );

  // Downforce adds effective weight at speed, so the wing matters
  // most in fast corners.
  const winged = circuitStats({ ...BASE, aero: 3 });
  check(
    safeCornerSpeed(1 / 60, winged) > safeCornerSpeed(1 / 60, stats),
    'aero raises fast-corner speed',
  );

  const slowBudget = cornerBudget(stats, 10);
  const fastBudget = cornerBudget(stats, stats.topSpeedMps * 0.8);
  check(fastBudget > slowBudget, 'grip budget grows with downforce');
  check(
    cornerBudget(circuitStats(BUILT), 10) > fastBudget,
    'tire upgrade raises the budget at any speed',
  );
}

console.log('\nPhysics — grip indicator states');
{
  check(gripStateFor(0) === 'green', 'no demand is green');
  check(gripStateFor(0.84) === 'green', 'under 85% is green');
  check(gripStateFor(0.85) === 'yellow', '85% is yellow');
  check(gripStateFor(0.99) === 'yellow', 'under 100% is yellow');
  check(gripStateFor(1) === 'red', '100% is red');
  check(gripStateFor(2) === 'red', 'over demand is red');
}

console.log('\nPhysics — upgrades change the numbers');
{
  const stock = circuitStats(BASE);
  const built = circuitStats(BUILT);

  check(built.tireGrip > stock.tireGrip, 'tires raise µ');
  check(built.brakeForceN > stock.brakeForceN, 'brakes raise force');
  check(built.accelBase > stock.accelBase, 'engine raises acceleration');
  check(built.massKg < stock.massKg, 'weight reduction lowers mass');
  check(built.topSpeedMps > stock.topSpeedMps, 'the built car is faster');
  check(built.aeroDownforce > stock.aeroDownforce, 'aero adds downforce');
}

console.log('\nPhysics — braking distances');
{
  /** Stopping distance from `speed` on a straight, full brakes. */
  function stoppingDistance(levels: UpgradeLevels, speed: number): number {
    const circuit = generateCircuit(7);
    const gentle = extremeIndex(circuit, false);
    const car = new CircuitCar(circuitStats(levels));
    car.reset(circuit, gentle * CIRCUIT.stepM, 0);
    car.state.v = speed;
    const seen = drive(car, circuit, BRAKE, 20);
    check(seen.maxLockup === 0, `stock braking never locks up (${levels.tires}/${levels.brakes})`);
    return seen.distance;
  }

  const stockStop = stoppingDistance(BASE, 40);
  const builtStop = stoppingDistance(BUILT, 40);
  check(builtStop < stockStop * 0.75, 'a built car stops much shorter', `${builtStop.toFixed(0)}m vs ${stockStop.toFixed(0)}m`);
  check(stockStop > 40 && stockStop < 200, 'stock stopping distance is physical', `${stockStop.toFixed(0)}m`);
}

console.log('\nPhysics — brake lock-up while cornering');
{
  const circuit = generateCircuit(11);
  const tight = extremeIndex(circuit, true);

  const car = new CircuitCar(circuitStats(BASE));
  car.reset(circuit, tight * CIRCUIT.stepM, 0);
  car.state.v = 30;
  const seen = drive(car, circuit, BRAKE, 0.6);
  check(
    seen.maxLockup > 0.3 || seen.spun,
    'braking mid-corner locks the wheels (or spins)',
    `lockup ${seen.maxLockup.toFixed(2)} spun ${seen.spun}`,
  );
  check(seen.maxSlide > 0.3, 'braking mid-corner slides the tires');
  check(seen.minV < 30, 'braking mid-corner scrubs speed');
}

console.log('\nPhysics — spin and recovery');
{
  const circuit = generateCircuit(5);
  const tight = extremeIndex(circuit, true);

  const car = new CircuitCar(circuitStats(BASE));
  car.reset(circuit, tight * CIRCUIT.stepM, 0);
  car.state.v = 35;
  const intoCorner = drive(car, circuit, THROTTLE, 2);
  check(intoCorner.spun, 'carrying too much speed into a hairpin spins the car');
  check(intoCorner.maxSlide > 1, 'the slide builds past the spin threshold');
  check(intoCorner.maxLat > CIRCUIT.trackHalfWidthM, 'the car drifts off the racing line');

  const recovered = drive(car, circuit, THROTTLE, 5);
  check(car.state.spinTimer === 0, 'the spin ends');
  check(car.state.v > 0, 'the car keeps moving after a spin');
  check(
    Math.abs(car.state.lat) <= CIRCUIT.trackHalfWidthM + 5.5,
    'the car stays inside the runoff',
    `lat ${car.state.lat.toFixed(1)}m`,
  );
  check(car.state.s > tight * CIRCUIT.stepM, 'the car makes progress after recovery');
}

console.log('\nPhysics — off-track detection and recovery');
{
  const circuit = generateCircuit(3);
  const gentle = extremeIndex(circuit, false);

  const car = new CircuitCar(circuitStats(BASE));
  car.reset(circuit, gentle * CIRCUIT.stepM, 0);
  car.state.lat = CIRCUIT.trackHalfWidthM + 2.5;
  car.state.v = 25;

  check(car.state.offTrack, 'beyond the edge is off-track');

  const seen = drive(car, circuit, THROTTLE, 5);
  check(seen.offTrack, 'the excursion is registered');
  check(!car.state.offTrack, 'the servo steers back onto the track');
  check(
    Math.abs(car.state.lat) < CIRCUIT.trackHalfWidthM,
    'the car is back within the track width',
    `lat ${car.state.lat.toFixed(1)}m`,
  );
  check(seen.minV > 0, 'the car keeps rolling through the runoff');
}

console.log('\nPhysics — frame-rate independence');
{
  const circuit = generateCircuit(9);
  const input = { throttle: true, brake: false };

  const fine = new CircuitCar(circuitStats(MID));
  fine.reset(circuit, 0, 0);
  for (let i = 0; i < 120; i += 1) fine.update(1 / 120, input, circuit);

  const coarse = new CircuitCar(circuitStats(MID));
  coarse.reset(circuit, 0, 0);
  for (let i = 0; i < 30; i += 1) coarse.update(1 / 30, input, circuit);

  const uneven = new CircuitCar(circuitStats(MID));
  uneven.reset(circuit, 0, 0);
  for (let i = 0; i < 7; i += 1) uneven.update(1 / 20, input, circuit);
  for (let i = 0; i < 26; i += 1) uneven.update(1 / 60, input, circuit);

  const key = (car: CircuitCar) =>
    [car.state.s, car.state.lat, car.state.v, car.state.heading, car.state.slide]
      .map((value) => value.toFixed(9))
      .join(',');
  check(key(fine) === key(coarse), '1/120 s and 1/30 s steps agree exactly');
  check(key(fine) === key(uneven), 'mixed frame times agree exactly');
}

// =================================================================== AI ==

console.log('\nAI — laps a circuit deterministically');
{
  const circuit = generateCircuit(21);

  function runAi(seed: number): { lapTimes: number[]; s: number; lap: number } {
    const driver = new CircuitAiDriver({
      difficulty: 'medium',
      levels: MID,
      seed,
      baseLine: 0,
    });
    const car = new CircuitCar(driver.stats, 0);
    car.reset(circuit, 0, 0);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 90; i += 1) {
      const input = driver.update(dt, car, circuit);
      car.lineOffset = driver.lineOffsetAt(car.state.s);
      car.update(dt, input, circuit);
      if (car.state.lap >= 2) break;
    }
    return { lapTimes: [...car.state.lapTimes], s: car.state.s, lap: car.state.lap };
  }

  const first = runAi(0x51ed5eed);
  const second = runAi(0x51ed5eed);
  check(first.lap >= 2, 'the AI completes laps', `lap ${first.lap}`);
  check(first.lapTimes.length >= 1, 'the AI records lap times', `${first.lapTimes.length} laps`);
  check(
    JSON.stringify(first) === JSON.stringify(second),
    'the same seed produces the identical run',
  );

  // Every AI difficulty must complete a lap too — an AI that cannot
  // finish its own practice would be a broken opponent.
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const driver = new CircuitAiDriver({
      difficulty,
      levels: MID,
      seed: 4242,
      baseLine: 0,
    });
    const car = new CircuitCar(driver.stats, 0);
    car.reset(circuit, 0, 0);
    const dt = 1 / 60;
    let seconds = 0;
    while (car.state.lap < 1 && seconds < 120) {
      const input = driver.update(dt, car, circuit);
      car.lineOffset = driver.lineOffsetAt(car.state.s);
      car.update(dt, input, circuit);
      seconds += dt;
    }
    check(car.state.lap >= 1, `${difficulty} AI finishes a lap within 120 s`, `${seconds.toFixed(0)}s`);
  }
}

console.log('\nAI — upgrades make the AI faster');
{
  const circuit = generateCircuit(21);

  function distanceFor(levels: UpgradeLevels): number {
    const driver = new CircuitAiDriver({
      difficulty: 'medium',
      levels,
      seed: 99,
      baseLine: 0,
    });
    const car = new CircuitCar(driver.stats, 0);
    car.reset(circuit, 0, 0);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 30; i += 1) {
      const input = driver.update(dt, car, circuit);
      car.lineOffset = driver.lineOffsetAt(car.state.s);
      car.update(dt, input, circuit);
    }
    return car.state.s;
  }

  const stock = distanceFor({ ...MID, tires: 1 });
  const grippy = distanceFor({ ...MID, tires: 3 });
  check(grippy > stock, 'tire upgrades let the AI carry more speed', `${grippy.toFixed(0)}m vs ${stock.toFixed(0)}m`);
}

// ================================================================ model ==

console.log('\nRace model — grid and countdown');
{
  const specs: CarSpec[] = [
    { label: 'RIVAL VX', color: '#ff7a5c', levels: { ...MID }, isPlayer: false, lineOffset: -3 },
    { label: 'KEIRO', color: '#5aa9ff', levels: { ...MID }, isPlayer: false, lineOffset: 3 },
    { label: 'YOU', color: '#37e0c8', levels: { ...BASE }, isPlayer: true, lineOffset: 0 },
  ];
  const model = new CircuitRaceModel({
    circuit: generateCircuit(31),
    specs,
    totalLaps: 3,
    seed: 31,
    difficulty: 'medium',
  });

  check(model.phase === 'countdown', 'the race starts in the countdown');
  check(model.countdownStep === 0, 'the first countdown step shows 3');

  model.update(0.4, COAST);
  check(model.countdownStep === 0, 'half a step stays on 3');
  model.update(0.4, COAST);
  check(model.countdownStep === 1, 'one step in shows 2');
  model.update(CIRCUIT.countdownStepS, COAST);
  check(model.countdownStep === 2, 'two steps in shows 1');
  model.update(CIRCUIT.countdownStepS, COAST);
  check(model.countdownStep === 3, 'the last step shows GO');
  model.update(CIRCUIT.countdownStepS, COAST);
  check(model.phase === 'racing', 'the race starts once the countdown ends');
  check(model.raceTime === 0, 'the clock starts at zero');

  const playerS = model.cars[model.playerIndex].state.s;
  check(playerS < 0, 'the player starts behind the line');
  const ahead = model.cars.filter((_, index) => index !== model.playerIndex);
  check(
    ahead.every((car) => car.state.s > playerS),
    'the player starts at the back of the grid',
  );
  check(
    new Set(model.cars.map((car) => car.state.lat)).size === model.cars.length,
    'grid slots are distinct',
  );
}

console.log('\nRace model — a full race produces results');
{
  const specs: CarSpec[] = [
    { label: 'RIVAL VX', color: '#ff7a5c', levels: { ...MID }, isPlayer: false, lineOffset: -3 },
    { label: 'KEIRO', color: '#5aa9ff', levels: { ...MID }, isPlayer: false, lineOffset: 3 },
    { label: 'YOU', color: '#37e0c8', levels: { ...BASE }, isPlayer: true, lineOffset: 0 },
  ];
  const setup: CircuitRaceSetup = {
    seed: 41,
    totalLaps: 1,
    opponentCount: 2,
    difficulty: 'easy',
  };
  const model = new CircuitRaceModel({
    circuit: generateCircuit(setup.seed),
    specs,
    totalLaps: setup.totalLaps,
    seed: setup.seed,
    difficulty: setup.difficulty,
  });

  // A throttle-only player: no braking, so corners are taken on
  // whatever speed the tires allow — the honest way to finish.
  let seconds = 0;
  const dt = 1 / 60;
  while (model.phase !== 'finished' && seconds < 300) {
    model.update(dt, THROTTLE);
    seconds += dt;
  }

  check(model.phase === 'finished', 'the race finishes', `${seconds.toFixed(0)}s`);
  const result = model.result();
  check(result.standings.length === 3, 'every car has a standing');
  check(
    result.playerPosition >= 1 && result.playerPosition <= 3,
    'the player position is valid',
    `P${result.playerPosition}`,
  );
  check(result.playerLapTimes.length === 1, 'the player has one lap time');
  check(
    result.playerTotalTime !== null && result.playerTotalTime > 0,
    'the player has a finish time',
  );
  check(
    result.playerBestLap !== null && result.playerBestLap > 0,
    'the player has a best lap',
  );
  check(result.totalLaps === 1, 'the result records the race distance');
  check(result.circuitLength > 0, 'the result records the circuit length');

  const positions = result.standings.map((standing) => standing.position);
  check(
    JSON.stringify(positions) === JSON.stringify([1, 2, 3]),
    'standings are ordered by position',
  );
  const playerStanding = result.standings.find((standing) => standing.isPlayer);
  check(playerStanding !== undefined, 'the player appears in the standings');

  // Live standings during the race agree with the finish order
  // for anyone who had already finished.
  const finished = result.standings.filter((standing) => standing.finished);
  check(finished.length >= 2, 'the AI opponents finished too', `${finished.length}/3`);
}

console.log('\nRace model — determinism');
{
  function runRace(): string {
    const specs: CarSpec[] = [
      { label: 'RIVAL VX', color: '#ff7a5c', levels: { ...MID }, isPlayer: false, lineOffset: -3 },
      { label: 'YOU', color: '#37e0c8', levels: { ...BASE }, isPlayer: true, lineOffset: 0 },
    ];
    const model = new CircuitRaceModel({
      circuit: generateCircuit(51),
      specs,
      totalLaps: 1,
      seed: 51,
      difficulty: 'medium',
    });
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 45; i += 1) {
      model.update(dt, THROTTLE);
    }
    const snapshot = model.cars.map((car) => ({
      s: car.state.s,
      lat: car.state.lat,
      v: car.state.v,
      lap: car.state.lap,
      lapTimes: car.state.lapTimes,
    }));
    return JSON.stringify(snapshot);
  }

  check(runRace() === runRace(), 'two identical races are identical');
}

console.log('\nRace model — the safety timeout ends a stalled race');
{
  const specs: CarSpec[] = [
    { label: 'RIVAL VX', color: '#ff7a5c', levels: { ...MID }, isPlayer: false, lineOffset: -3 },
    { label: 'YOU', color: '#37e0c8', levels: { ...BASE }, isPlayer: true, lineOffset: 0 },
  ];
  const model = new CircuitRaceModel({
    circuit: generateCircuit(61),
    specs,
    totalLaps: 1,
    seed: 61,
    difficulty: 'medium',
  });

  // The player never touches the throttle: the AI finishes, but the
  // race must still end — never hang on a stalled car.
  const dt = 1 / 30;
  let seconds = 0;
  while (model.phase !== 'finished' && seconds < 400) {
    model.update(dt, COAST);
    seconds += dt;
  }
  check(model.phase === 'finished', 'a stalled race still ends', `${seconds.toFixed(0)}s`);
  const result = model.result();
  check(
    result.playerTotalTime === null,
    'the stalled player is a DNF',
  );
  check(result.standings[0].finished, 'the AI winner is recorded');
}

console.log('\nRace model — pause is the scene\'s job, the model just steps');
{
  const specs: CarSpec[] = [
    { label: 'YOU', color: '#37e0c8', levels: { ...BASE }, isPlayer: true, lineOffset: 0 },
  ];
  const model = new CircuitRaceModel({
    circuit: generateCircuit(71),
    specs,
    totalLaps: 1,
    seed: 71,
    difficulty: 'easy',
  });
  // Step, "pause" (skip updates), step again: the model only moves
  // when stepped, so a paused scene freezes the simulation.
  model.update(1 / 60, THROTTLE);
  const before = model.cars[0].state.s;
  model.update(1 / 60, THROTTLE);
  const after = model.cars[0].state.s;
  check(after > before, 'the car advances while being stepped');
}

// ================================================================== end ==

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exitCode = 1;
} else {
  console.log('Circuit racing verification passed');
}
