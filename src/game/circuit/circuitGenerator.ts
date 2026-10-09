import { Rng } from '../ai/aiDriver';
import { CIRCUIT } from '../config';
import { PREDEFINED_CIRCUITS } from './predefinedCircuits';
import type { Circuit, CircuitSample, LayoutNode } from './types';

/**
 * Procedural circuit generator.
 *
 * A circuit is built from a library of reusable segment motifs
 * (straights, gentle curves, sweeps, hairpins, S-bends, chicanes).
 * Each motif contributes a signed angular span and a set of nodes
 * around a base circle; the node list is turned into a *closed*
 * Catmull-Rom spline, which is guaranteed to form a continuous loop
 * with a start/finish line at node zero.
 *
 * The raw spline is resampled at a fixed arc-length step, then
 * validated: minimum corner radius, total length, no self-intersection
 * and a closed loop. Anything invalid is regenerated from the next
 * deterministic seed step, and after every attempt fails the generator
 * falls back to one of the predefined circuits — so a race can never
 * be handed an impossible or visually broken track.
 */

/** One reusable track segment. */
interface Motif {
  id: 'straight' | 'gentle' | 'sweep' | 'hairpin' | 's-bend' | 'chicane';
  /** Nominal angular span in degrees. */
  span: number;
  /** Random jitter added to the span, degrees. */
  spanJitter: number;
  /**
   * Node offsets as `[fractionOfSpan, radiusMultiplier]` pairs,
   * excluding the shared entry node. `radiusMultiplier` scales the
   * base circle radius, so values above 1 bulge outward and values
   * below 1 cut inward.
   */
  nodes: ReadonlyArray<readonly [number, number]>;
}

const MOTIFS: readonly Motif[] = [
  {
    id: 'straight',
    span: 46,
    spanJitter: 14,
    nodes: [[0.5, 1.0]],
  },
  {
    id: 'gentle',
    span: 34,
    spanJitter: 10,
    nodes: [
      [0.3, 1.1],
      [0.7, 1.1],
    ],
  },
  {
    id: 'sweep',
    span: 58,
    spanJitter: 14,
    nodes: [
      [0.22, 1.16],
      [0.55, 1.27],
      [0.82, 1.12],
    ],
  },
  {
    id: 'hairpin',
    span: 26,
    spanJitter: 8,
    nodes: [
      [0.16, 1.3],
      [0.36, 1.52],
      [0.64, 1.52],
      [0.86, 1.28],
    ],
  },
  {
    id: 's-bend',
    span: 44,
    spanJitter: 10,
    nodes: [
      [0.24, 1.15],
      [0.5, 1.0],
      [0.76, 0.87],
    ],
  },
  {
    id: 'chicane',
    span: 34,
    spanJitter: 8,
    nodes: [
      [0.2, 1.14],
      [0.4, 0.93],
      [0.6, 1.13],
      [0.8, 0.96],
    ],
  },
];

/** Motifs that may appear after the opening straight. */
const MID_MOTIFS = MOTIFS.filter((motif) => motif.id !== 'straight');

/** Picked motifs and their realised angular spans. */
interface ChosenMotif {
  motif: Motif;
  span: number;
}

const DEG = Math.PI / 180;

/** Deterministic circuit generation from a seed. Never returns null. */
export function generateCircuit(seed: number): Circuit {
  for (let attempt = 0; attempt < CIRCUIT.maxAttempts; attempt += 1) {
    const attemptSeed = (seed >>> 0) + attempt * 7919;
    const candidate = buildCandidate(attemptSeed);
    if (candidate && validateCircuit(candidate)) {
      return { ...candidate, seed: attemptSeed };
    }
  }
  // Every attempt failed: fall back to a predefined, pre-validated
  // circuit so a race is always playable.
  const fallback = PREDEFINED_CIRCUITS[seed % PREDEFINED_CIRCUITS.length];
  const built = buildFromMotifs(fallback.nodes, fallback.name);
  if (built && validateCircuit(built)) {
    return { ...built, seed: 0 };
  }
  // The fallbacks are pre-validated, so this is unreachable; the
  // simplest possible loop is the last line of defence.
  return emergencyLoop();
}

/** Picks motifs, lays out nodes and runs the spline pipeline. */
function buildCandidate(seed: number): Circuit | null {
  const rng = new Rng(seed || 0x2f6e2b1);
  const motifs: ChosenMotif[] = [];

  // The opening straight guarantees a clean start/finish straight.
  const opening = MOTIFS[0];
  const openingSpan = 44 + rng.next() * 18;
  motifs.push({ motif: opening, span: openingSpan });

  let remaining = 360 - openingSpan;
  while (remaining > 0.5) {
    const motif = MID_MOTIFS[Math.floor(rng.next() * MID_MOTIFS.length)];
    let span = motif.span + (rng.next() * 2 - 1) * motif.spanJitter;
    if (span > remaining) span = remaining;
    if (span < 8) span = 8;
    motifs.push({ motif, span });
    remaining -= span;
  }

  // Distribute the last sliver over the earlier motifs so the total
  // is exactly 360 degrees and the loop closes on node zero.
  const total = motifs.reduce((sum, entry) => sum + entry.span, 0);
  const scale = 360 / total;
  const nodes: LayoutNode[] = [{ angle: 0, radius: CIRCUIT.baseRadiusM }];
  let cursor = 0;
  for (const entry of motifs) {
    const span = entry.span * scale;
    for (const [fraction, multiplier] of entry.motif.nodes) {
      nodes.push({
        angle: cursor + fraction * span,
        radius: CIRCUIT.baseRadiusM * multiplier,
      });
    }
    cursor += span;
  }

  return buildFromMotifs(nodes, nameCircuit(rng, motifs));
}

function nameCircuit(rng: Rng, motifs: ChosenMotif[]): string {
  const hasHairpin = motifs.some((entry) => entry.motif.id === 'hairpin');
  const hasChicane = motifs.some((entry) => entry.motif.id === 'chicane' || entry.motif.id === 's-bend');
  const prefixes = hasHairpin
    ? ['HAIRPIN', 'CLUB', 'TWIST']
    : hasChicane
      ? ['TECH', 'KART', 'CLUB']
      : ['GP', 'SPEED', 'ROYAL'];
  const names = ['LUMEN LOOP', 'SOLANA RING', 'DEVNET PARK', 'PIXEL GP', 'SEEKER CIRCUIT', 'PHANTOM WAY'];
  return `${prefixes[Math.floor(rng.next() * prefixes.length)]} · ${names[Math.floor(rng.next() * names.length)]}`;
}

// ----------------------------------------------------------------- spline --

/**
 * Closed Catmull-Rom spline through the layout nodes, resampled to
 * an even arc-length step with tangents and curvature attached.
 */
function buildFromMotifs(nodes: LayoutNode[], name: string): Circuit | null {
  if (nodes.length < 6) return null;

  // Sample the spline densely (canvas space, y down).
  const dense: Array<readonly [number, number]> = [];
  const count = nodes.length;
  const perSegment = 24;
  for (let i = 0; i < count; i += 1) {
    const p0 = nodes[(i - 1 + count) % count];
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % count];
    const p3 = nodes[(i + 2) % count];
    for (let j = 0; j < perSegment; j += 1) {
      const t = j / perSegment;
      dense.push([
        catmullRom(p0.radius * Math.cos(p0.angle * DEG), p1.radius * Math.cos(p1.angle * DEG),
          p2.radius * Math.cos(p2.angle * DEG), p3.radius * Math.cos(p3.angle * DEG), t),
        catmullRom(p0.radius * Math.sin(p0.angle * DEG), p1.radius * Math.sin(p1.angle * DEG),
          p2.radius * Math.sin(p2.angle * DEG), p3.radius * Math.sin(p3.angle * DEG), t),
      ]);
    }
  }

  // Resample at a fixed arc-length step, walking segment by segment.
  const step = CIRCUIT.stepM;
  const samples: Array<[number, number]> = [[dense[0][0], dense[0][1]]];
  let carried = 0;
  for (let i = 1; i <= dense.length; i += 1) {
    let ax = dense[i - 1][0];
    let ay = dense[i - 1][1];
    const bx = dense[i % dense.length][0];
    const by = dense[i % dense.length][1];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (carried + segLen >= step && segLen > 1e-9) {
      const need = step - carried;
      const t = need / segLen;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      samples.push([px, py]);
      ax = px;
      ay = py;
      segLen = Math.hypot(bx - px, by - py);
      carried = 0;
    }
    carried += segLen;
  }
  // Drop the duplicated closing sample if it landed on the first.
  if (
    samples.length > 2 &&
    Math.hypot(
      samples[samples.length - 1][0] - samples[0][0],
      samples[samples.length - 1][1] - samples[0][1],
    ) <
      step * 0.5
  ) {
    samples.pop();
  }
  if (samples.length < 80) return null;

  // One round of circular Laplacian smoothing softens spline overshoot
  // (which is what would otherwise make a hairpin impossibly tight).
  smoothPositions(samples, 1);

  return finishCircuit(samples, name);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** In-place circular smoothing of `[x, y]` pairs. */
function smoothPositions(samples: Array<readonly [number, number]>, passes: number): void {
  const n = samples.length;
  let current = samples;
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Array<readonly [number, number]> = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const [px, py] = current[(i - 1 + n) % n];
      const [cx, cy] = current[i];
      const [nx, ny] = current[(i + 1) % n];
      next[i] = [cx * 0.5 + (px + nx) * 0.25, cy * 0.5 + (py + ny) * 0.25];
    }
    current = next;
    samples.length = 0;
    samples.push(...next);
  }
}

/** Computes tangents, curvature and bounds, and assembles the `Circuit`. */
function finishCircuit(
  samples: Array<readonly [number, number]>,
  name: string,
): Circuit {
  const n = samples.length;
  const step = CIRCUIT.stepM;
  const out: CircuitSample[] = new Array(n);

  // Tangents from central differences.
  const tangents: Array<readonly [number, number]> = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[(i - 1 + n) % n];
    const [bx, by] = samples[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    tangents[i] = [dx / len, dy / len];
  }

  // Signed Menger curvature over a ~6 m window, then smoothed.
  const k = Math.max(2, Math.round(6 / step));
  const raw: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[(i - k + n) % n];
    const [cx, cy] = samples[i];
    const [bx, by] = samples[(i + k) % n];
    const ux = cx - ax;
    const uy = cy - ay;
    const vx = bx - cx;
    const vy = by - cy;
    const cross = ux * vy - uy * vx;
    const denom = Math.hypot(ux, uy) * Math.hypot(vx, vy) * Math.hypot(ux + vx, uy + vy);
    raw[i] = denom > 1e-9 ? (2 * cross) / denom : 0;
  }
  const curvature = smoothScalars(raw, 3);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const [x, y] = samples[i];
    const [tx, ty] = tangents[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    out[i] = {
      x,
      y,
      tx,
      ty,
      nx: ty,
      ny: -tx,
      curvature: curvature[i],
    };
  }

  let length = 0;
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[i];
    const [bx, by] = samples[(i + 1) % n];
    length += Math.hypot(bx - ax, by - ay);
  }

  return {
    name,
    samples: out,
    length,
    stepM: step,
    halfWidth: CIRCUIT.trackHalfWidthM,
    bounds: { minX, minY, maxX, maxY },
    seed: 0,
  };
}

function smoothScalars(values: readonly number[], window: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = -window; j <= window; j += 1) {
      sum += values[(i + j + n) % n];
    }
    out[i] = sum / (window * 2 + 1);
  }
  return out;
}

// ------------------------------------------------------------ validation --

function validateCircuit(circuit: Circuit): boolean {
  if (circuit.length < CIRCUIT.minLengthM || circuit.length > CIRCUIT.maxLengthM) return false;

  const minRadius = 1 / CIRCUIT.minRadiusM;
  for (const sample of circuit.samples) {
    if (Math.abs(sample.curvature) > minRadius) return false;
  }

  // Closure: the loop must end where it begins.
  const last = circuit.samples[circuit.samples.length - 1];
  const first = circuit.samples[0];
  if (Math.hypot(last.x - first.x, last.y - first.y) > CIRCUIT.stepM * 2) return false;

  return !hasSelfIntersection(circuit);
}

/**
 * Non-adjacent sections of the centreline must never come within
 * one track width of each other. A spatial hash keeps this O(n).
 */
function hasSelfIntersection(circuit: Circuit): boolean {
  const samples = circuit.samples;
  const n = samples.length;
  const cell = CIRCUIT.trackWidthM;
  const minSeparation = Math.round(40 / circuit.stepM);
  const limit = CIRCUIT.trackWidthM * 1.12;
  const limitSq = limit * limit;

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
          if (dx * dx + dy * dy < limitSq) return true;
        }
      }
    }
  }
  return false;
}

/** Last-resort loop: a circle always closes, fits and is drivable. */
function emergencyLoop(): Circuit {
  const radius = CIRCUIT.baseRadiusM;
  const nodes: LayoutNode[] = [];
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    nodes.push({ angle: (i * 360) / steps, radius });
  }
  const built = buildFromMotifs(nodes, 'LUMEN LOOP');
  if (built) return { ...built, seed: 0 };
  // Truly unreachable: a circle cannot fail validation.
  throw new Error('Circuit generation failed');
}

/**
 * Builds a circuit from an explicit node list.
 *
 * Exported for the predefined fallbacks and for tests.
 */
export function buildCircuitFromNodes(nodes: LayoutNode[], name: string): Circuit | null {
  return buildFromMotifs(nodes, name);
}
