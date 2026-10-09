/* eslint-disable no-console */
import { CIRCUIT } from '../src/game/config';
import { Rng } from '../src/game/ai/aiDriver';
import type { LayoutNode } from '../src/game/circuit/types';

const DEG = Math.PI / 180;

interface Motif {
  id: string;
  span: number;
  spanJitter: number;
  nodes: ReadonlyArray<readonly [number, number]>;
}

const MOTIFS: Record<string, Motif> = {
  straight: { id: 'straight', span: 46, spanJitter: 14, nodes: [[0.5, 1.0]] },
  gentle: { id: 'gentle', span: 34, spanJitter: 10, nodes: [[0.3, 1.1], [0.7, 1.1]] },
  sweep: { id: 'sweep', span: 58, spanJitter: 14, nodes: [[0.22, 1.16], [0.55, 1.27], [0.82, 1.12]] },
  hairpin: { id: 'hairpin', span: 26, spanJitter: 8, nodes: [[0.16, 1.3], [0.36, 1.52], [0.64, 1.52], [0.86, 1.28]] },
  's-bend': { id: 's-bend', span: 44, spanJitter: 10, nodes: [[0.24, 1.15], [0.5, 1.0], [0.76, 0.87]] },
  chicane: { id: 'chicane', span: 34, spanJitter: 8, nodes: [[0.2, 1.14], [0.4, 0.93], [0.6, 1.13], [0.8, 0.96]] },
};

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Build a candidate and ALSO return the node layout for diagnosis.
function buildCandidate(seed: number): { circuit: ReturnType<typeof finish> | null; nodes: LayoutNode[]; motifSpans: Array<{ id: string; start: number; end: number }> } {
  const rng = new Rng(seed || 0x2f6e2b1);
  const chosen: Array<{ motif: Motif; span: number }> = [];
  const openingSpan = 44 + rng.next() * 18;
  chosen.push({ motif: MOTIFS.straight, span: openingSpan });
  let remaining = 360 - openingSpan;
  const mid = Object.values(MOTIFS).filter((m) => m.id !== 'straight');
  while (remaining > 0.5) {
    const motif = mid[Math.floor(rng.next() * mid.length)];
    let span = motif.span + (rng.next() * 2 - 1) * motif.spanJitter;
    if (span > remaining) span = remaining;
    if (span < 8) span = 8;
    chosen.push({ motif, span });
    remaining -= span;
  }
  const total = chosen.reduce((sum, entry) => sum + entry.span, 0);
  const scale = 360 / total;
  const nodes: LayoutNode[] = [{ angle: 0, radius: CIRCUIT.baseRadiusM }];
  const motifSpans: Array<{ id: string; start: number; end: number }> = [];
  let cursor = 0;
  for (const entry of chosen) {
    const span = entry.span * scale;
    motifSpans.push({ id: entry.motif.id, start: cursor, end: cursor + span });
    for (const [fraction, multiplier] of entry.motif.nodes) {
      nodes.push({ angle: cursor + fraction * span, radius: CIRCUIT.baseRadiusM * multiplier });
    }
    cursor += span;
  }
  return { circuit: finish(nodes), nodes, motifSpans };
}

function finish(nodes: LayoutNode[]) {
  if (nodes.length < 6) return null;
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
        catmullRom(p0.radius * Math.cos(p0.angle * DEG), p1.radius * Math.cos(p1.angle * DEG), p2.radius * Math.cos(p2.angle * DEG), p3.radius * Math.cos(p3.angle * DEG), t),
        catmullRom(p0.radius * Math.sin(p0.angle * DEG), p1.radius * Math.sin(p1.angle * DEG), p2.radius * Math.sin(p2.angle * DEG), p3.radius * Math.sin(p3.angle * DEG), t),
      ]);
    }
  }
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
  if (samples.length > 2 && Math.hypot(samples[samples.length - 1][0] - samples[0][0], samples[samples.length - 1][1] - samples[0][1]) < step * 0.5) {
    samples.pop();
  }
  if (samples.length < 80) return null;
  // one smoothing pass, as the real generator does
  const n = samples.length;
  const smoothed: Array<readonly [number, number]> = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const [px, py] = samples[(i - 1 + n) % n];
    const [cx, cy] = samples[i];
    const [nx, ny] = samples[(i + 1) % n];
    smoothed[i] = [cx * 0.5 + (px + nx) * 0.25, cy * 0.5 + (py + ny) * 0.25];
  }
  samples.length = 0;
  samples.push(...smoothed);

  // curvature
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
  const curvature = raw.map((_, i) => {
    let sum = 0;
    for (let j = -3; j <= 3; j += 1) sum += raw[(i + j + n) % n];
    return sum / 7;
  });

  const out = samples.map(([x, y], i) => ({ x, y, curvature: curvature[i] }));
  let length = 0;
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[i];
    const [bx, by] = samples[(i + 1) % n];
    length += Math.hypot(bx - ax, by - ay);
  }
  return { samples: out, length, nodeCount: nodes.length };
}

/** Convert a world position back to an angle around the base circle. */
function angleOf(x: number, y: number): number {
  let a = Math.atan2(y, x) / DEG;
  if (a < 0) a += 360;
  return a;
}

// Find failing seeds and dump where their tightest corners sit.
let shown = 0;
for (let seed = 1; seed <= 60 && shown < 4; seed += 1) {
  let allFailed = true;
  for (let attempt = 0; attempt < CIRCUIT.maxAttempts; attempt += 1) {
    const { circuit, nodes, motifSpans } = buildCandidate((seed >>> 0) + attempt * 7919);
    if (!circuit) continue;
    let minR = Infinity;
    let minIndex = 0;
    circuit.samples.forEach((s, index) => {
      const r = 1 / Math.abs(s.curvature || 1e-9);
      if (r < minR) { minR = r; minIndex = index; }
    });
    if (minR >= CIRCUIT.minRadiusM) { allFailed = false; break; }
    if (attempt === CIRCUIT.maxAttempts - 1 && allFailed) {
      // This seed never succeeds. Dump the last candidate's tightest corner.
      const tight = circuit.samples[minIndex];
      const angle = angleOf(tight.x, tight.y);
      const near = motifSpans.find((span) => angle >= span.start && angle < span.end);
      const radiusHere = Math.hypot(tight.x, tight.y);
      console.log(`seed ${seed} attempt ${attempt}: tightest corner ${minR.toFixed(1)}m at angle ${angle.toFixed(1)}° (motif: ${near ? near.id : '?'}, radius ${radiusHere.toFixed(0)}m, sample ${minIndex}/${circuit.samples.length})`);
      // Show the node list around that angle.
      const nearby = nodes.filter((node) => Math.abs(node.angle - angle) < 30 || Math.abs(node.angle - angle) > 330);
      console.log('  nodes within 30°:', nearby.map((node) => `${node.angle.toFixed(1)}°@${node.radius.toFixed(0)}m`).join('  '));
      shown += 1;
    }
  }
}
