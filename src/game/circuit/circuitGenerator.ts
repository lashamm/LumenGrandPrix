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
    span: 64,
    spanJitter: 16,
    nodes: [[0.5, 1.0]],
  },
  {
    id: 'gentle',
    span: 56,
    spanJitter: 12,
    nodes: [
      [0.35, 1.05],
      [0.7, 1.05],
    ],
  },
  {
    id: 'sweep',
    span: 76,
    spanJitter: 16,
    nodes: [
      [0.28, 1.1],
      [0.55, 1.16],
      [0.8, 1.08],
    ],
  },
  {
    id: 'hairpin',
    span: 74,
    spanJitter: 14,
    nodes: [
      [0.24, 0.96],
      [0.42, 0.78],
      [0.6, 0.78],
      [0.78, 0.96],
    ],
  },
  {
    id: 's-bend',
    span: 72,
    spanJitter: 14,
    nodes: [
      [0.28, 1.08],
      [0.5, 1.0],
      [0.74, 0.92],
    ],
  },
  {
    id: 'chicane',
    span: 68,
    spanJitter: 12,
    nodes: [
      [0.22, 1.06],
      [0.4, 0.94],
      [0.6, 1.06],
      [0.8, 0.94],
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
 * Builds a closed loop from `(angle, radius)` layout nodes.
 *
 * The nodes are interpreted as a *radial profile* `r(θ)` — a smooth,
 * single-valued function of the polar angle — and the track is the
 * curve `r(θ)·(cosθ, sinθ)`. Because every ray from the origin meets
 * the curve exactly once, the result is always a simple closed loop:
 * it can never self-intersect, no matter how violent the radial
 * modulation. That removes the single biggest source of generator
 * failures. The profile is then resampled to an even arc-length step
 * so curvature, tangents and spacing come out clean.
 */
function buildFromMotifs(nodes: LayoutNode[], name: string): Circuit | null {
  if (nodes.length < 6) return null;

  // Control points, sorted by angle and folded into [0, 360).
  const control = [...nodes]
    .map((node) => ({ angle: ((node.angle % 360) + 360) % 360, radius: node.radius }))
    .sort((a, b) => a.angle - b.angle);

  // Drop degenerate control points that sit almost on top of their
  // neighbour: they would only add a near-vertical radial step.
  const trimmed: typeof control = [];
  for (const point of control) {
    const previous = trimmed[trimmed.length - 1];
    if (previous && point.angle - previous.angle < 4) {
      previous.radius = (previous.radius + point.radius) / 2;
      continue;
    }
    trimmed.push({ ...point });
  }
  if (trimmed.length < 6) return null;

  const angles = trimmed.map((point) => point.angle);
  const radii = trimmed.map((point) => point.radius);
  const radiusAt = radialProfile(angles, radii);

  // Dense polar sampling at half a degree, then a light radial
  // smoothing pass so spline-free motors never leave a kink.
  const denseCount = 720;
  const denseRadius: number[] = new Array(denseCount);
  for (let i = 0; i < denseCount; i += 1) {
    denseRadius[i] = radiusAt((i * 360) / denseCount);
  }
  smoothScalarsInPlace(denseRadius, 2);
  const dense: Array<readonly [number, number]> = new Array(denseCount);
  for (let i = 0; i < denseCount; i += 1) {
    const a = ((i * 360) / denseCount) * DEG;
    dense[i] = [denseRadius[i] * Math.cos(a), denseRadius[i] * Math.sin(a)];
  }

  return resampleAndFinish(dense, name);
}

/**
 * Resamples a dense closed polyline to a fixed arc-length step, smooths it
 * and builds the finished `Circuit`.
 *
 * Shared by the radial-profile generator and the explicit-path builder so
 * both produce byte-for-byte identical kinds of track.
 */
function resampleAndFinish(
  dense: ReadonlyArray<readonly [number, number]>,
  name: string,
  smoothPasses = 1,
): Circuit | null {
  if (dense.length < 3) return null;

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
  if (smoothPasses > 0) smoothPositions(samples, smoothPasses);

  return finishCircuit(samples, name);
}

/**
 * Smooth, single-valued radius function through the control points.
 *
 * Uses smoothstep between neighbours (C1, no overshoot), evaluated by
 * polar angle with a wrap-around segment back to the first node. The
 * result is the `r(θ)` of the star-shaped track.
 */
function radialProfile(angles: readonly number[], radii: readonly number[]): (deg: number) => number {
  const count = angles.length;
  return (deg: number): number => {
    const a = ((deg % 360) + 360) % 360;
    for (let i = 0; i < count; i += 1) {
      const a0 = angles[i];
      const a1 = i + 1 < count ? angles[i + 1] : angles[0] + 360;
      if (a >= a0 && a < a1) {
        const t = (a - a0) / (a1 - a0);
        const smooth = t * t * (3 - 2 * t);
        return radii[i] + (radii[(i + 1) % count] - radii[i]) * smooth;
      }
    }
    return radii[0];
  };
}

/** In-place circular mean filter over a numeric array. */
function smoothScalarsInPlace(values: number[], window: number): void {
  const n = values.length;
  const copy = values.slice();
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = -window; j <= window; j += 1) {
      sum += copy[(i + j + n) % n];
    }
    values[i] = sum / (window * 2 + 1);
  }
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

/** The validation the generator runs on its own candidates, exposed for tests. */
export function isValidCircuit(circuit: Circuit): boolean {
  return validateCircuit(circuit);
}

// ------------------------------------------------------- explicit paths ----

/**
 * Builds a circuit from an explicit 2D centreline.
 *
 * The control points are **not** a radial profile: they are any `[x, y]`
 * positions in metres, in loop order, so a layout can trace a real circuit
 * shape instead of a star-shaped blob. They are threaded with a closed
 * *centripetal* Catmull-Rom spline (alpha = 0.5), which passes through every
 * point and — unlike uniform Catmull-Rom — never loops back on itself between
 * close control points, so tight hairpins stay clean. The dense spline is then
 * resampled and finished exactly like a generated track, which is what keeps
 * the physics, the AI and the art unchanged.
 *
 * Returns null when the layout is too short to form a loop; the caller decides
 * whether an invalid layout is fatal (it should not be — validate it in tests).
 */
export function buildCircuitFromPath(
  points: ReadonlyArray<readonly [number, number]>,
  name: string,
  smoothPasses = 1,
): Circuit | null {
  const clean = dedupePoints(points);
  if (clean.length < 4) return null;
  return resampleAndFinish(catmullRomClosed(clean), name, smoothPasses);
}

/** Drops consecutive control points that sit closer than `minGapM` apart. */
function dedupePoints(
  points: ReadonlyArray<readonly [number, number]>,
  minGapM = 2,
): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < minGapM) continue;
    out.push([point[0], point[1]]);
  }
  // Also fold the wrap-around seam.
  if (
    out.length > 2 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < minGapM
  ) {
    out.pop();
  }
  return out;
}

/**
 * Closed centripetal Catmull-Rom spline through the control points.
 *
 * Each control segment is subdivided proportionally to its length, so the
 * dense polyline approximates the true curve closely enough that the
 * arc-length resample below never visibly cuts a corner.
 */
function catmullRomClosed(
  points: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> {
  const n = points.length;
  const at = (index: number) => points[((index % n) + n) % n];
  const alpha = 0.5;
  const dense: Array<readonly [number, number]> = [];

  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const d1 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), alpha);
    const d2 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), alpha);
    const d3 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), alpha);

    const t0 = 0;
    const t1 = t0 + Math.max(d1, 1e-4);
    const t2 = t1 + Math.max(d2, 1e-4);
    const t3 = t2 + Math.max(d3, 1e-4);

    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const subdiv = Math.min(240, Math.max(10, Math.ceil(segLen / 1.5)));
    for (let s = 0; s < subdiv; s += 1) {
      const t = t1 + ((t2 - t1) * s) / subdiv;
      dense.push(catmullRomPoint(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }
  }
  return dense;
}

function catmullRomPoint(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): readonly [number, number] {
  const a1 = mix2(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
  const a2 = mix2(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
  const a3 = mix2(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
  const b1 = mix2(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
  const b2 = mix2(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
  return mix2(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
}

function mix2(
  a: readonly [number, number],
  b: readonly [number, number],
  wa: number,
  wb: number,
): readonly [number, number] {
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
}
