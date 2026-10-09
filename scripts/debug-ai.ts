/* eslint-disable no-console */
import { generateCircuit } from '../src/game/circuit/circuitGenerator';
import { CircuitAiDriver } from '../src/game/circuit/circuitAi';
import { CircuitCar, circuitStats, safeCornerSpeed } from '../src/game/circuit/vehiclePhysics';
import { CIRCUIT } from '../src/game/config';

const MID = { engine: 2, weight: 2, aero: 2, brakes: 2, tires: 2 };

const circuit = generateCircuit(21);
console.log('circuit', circuit.name, 'length', circuit.length.toFixed(0), 'seed', circuit.seed);

let minRadius = Infinity;
for (const s of circuit.samples) minRadius = Math.min(minRadius, 1 / Math.abs(s.curvature || 1e-9));
console.log('tightest corner radius', minRadius.toFixed(1));

const driver = new CircuitAiDriver({ difficulty: 'medium', levels: MID, seed: 0x51ed5eed, baseLine: 0 });
const car = new CircuitCar(driver.stats, 0);
car.reset(circuit, 0, 0);

const dt = 1 / 60;
let t = 0;
let lastPrint = -10;
let maxSlide = 0;
let spins = 0;
let lockTime = 0;
while (car.state.lap < 2 && t < 120) {
  const input = driver.update(dt, car, circuit);
  car.lineOffset = driver.lineOffsetAt(car.state.s);
  car.update(dt, input, circuit);
  maxSlide = Math.max(maxSlide, car.state.slide);
  if (car.state.spinTimer > 0 && lastPrint > t - 0.1) spins += 0;
  if (car.state.lockup > 0.5) lockTime += dt;
  if (t - lastPrint >= 10) {
    lastPrint = t;
    console.log(
      `t=${t.toFixed(0)} s=${car.state.s.toFixed(0)} lat=${car.state.lat.toFixed(1)} v=${car.state.v.toFixed(1)} lap=${car.state.lap} slide=${car.state.slide.toFixed(2)} lock=${car.state.lockup.toFixed(2)} spin=${car.state.spinTimer.toFixed(2)} off=${car.state.offTrack}`,
    );
  }
  t += dt;
}
console.log('final', { s: car.state.s.toFixed(0), lap: car.state.lap, v: car.state.v.toFixed(1), maxSlide: maxSlide.toFixed(2), lockTime: lockTime.toFixed(1), lapTimes: car.state.lapTimes.map((x) => x.toFixed(1)) });

// How fast can the circuit's corners actually be taken?
const stats = circuitStats(MID);
let slowest = Infinity;
for (const s of circuit.samples) slowest = Math.min(slowest, safeCornerSpeed(s.curvature, stats));
console.log('slowest safe corner speed', slowest.toFixed(1), 'm/s =', (slowest * 3.6).toFixed(0), 'km/h');
console.log('topSpeedMps', stats.topSpeedMps.toFixed(1));
