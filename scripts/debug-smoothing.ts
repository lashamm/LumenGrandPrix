/* eslint-disable no-console */
import { CIRCUIT } from '../src/game/config';
import { Rng } from '../src/game/ai/aiDriver';
import type { Circuit, LayoutNode } from '../src/game/circuit/types';

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

function composeNodes(motifIds: readonly string[], openingSpan = 50): LayoutNode[] {
  const nodes: LayoutNode[] = [{ angle: 0, radius: CIRCUIT.baseRadiusM }];
  let remaining = 360 - openingSpan;
  let cursor = openingSpan;
  // Opening straight's midpoint node.
  nodes.push({ angle: openingSpan * 0.5, radius: CIRCUIT.baseRadiusM });
  let index = 0;
  while (remaining > 0.5 && index < motifIds.length) {
    const motif = MOTIFS[motifIds[index % motifIds.length]];
    index += 1;
    let span = Math.min(motif.span, remaining);
    if (span < 8) span = 8;
    for (const [fraction, multiplier] of motif.nodes) {
      nodes.push({ angle: cursor + fraction * span, radius: CIRCUIT.baseRadiusM * multiplier });
    }
    cursor += span;
    remaining -= span;
  }
  return nodes;
}

function buildFromNodes(nodes: LayoutNode[], name: string, smoothingPasses: number): Circuit | null {
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
  smoothPositions(samples, smoothingPasses);
  return finishCircuit(samples, name);
}

function smoothPositions(samples: Array<readonly [number, number]>, passes: number): void {
  const n = samples.length;
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Array<readonly [number, number]> = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const [px, py] = samples[(i - 1 + n) % n];
      const [cx, cy] = samples[i];
      const [nx, ny] = samples[(i + 1) % n];
      next[i] = [cx * 0.5 + (px + nx) * 0.25, cy * 0.5 + (py + ny) * 0.25];
    }
    samples.length = 0;
    samples.push(...next);
  }
}

function finishCircuit(samples: Array<readonly [number, number]>, name: string): Circuit {
  const n = samples.length;
  const step = CIRCUIT.stepM;
  const out = new Array(n);
  const tangents: Array<readonly [number, number]> = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[(i - 1 + n) % n];
    const [bx, by] = samples[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    tangents[i] = [dx / len, dy / len];
  }
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
    out[i] = { x, y, tx, ty, nx: ty, ny: -tx, curvature: curvature[i] };
  }
  let length = 0;
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = samples[i];
    const [bx, by] = samples[(i + 1) % n];
    length += Math.hypot(bx - ax, by - ay);
  }
  return { name, samples: out, length, stepM: step, halfWidth: CIRCUIT.trackHalfWidthM, bounds: { minX, minY, maxX, maxY }, seed: 0 };
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

function diagnose(circuit: Circuit): { ok: boolean; minRadius: number; reasons: string[] } {
  const reasons: string[] = [];
  if (circuit.length < CIRCUIT.minLengthM) reasons.push(`too short ${circuit.length.toFixed(0)}m`);
  if (circuit.length > CIRCUIT.maxLengthM) reasons.push(`too long ${circuit.length.toFixed(0)}m`);
  let minR = Infinity;
  for (const s of circuit.samples) minR = Math.min(minR, 1 / Math.abs(s.curvature || 1e-9));
  if (minR < CIRCUIT.minRadiusM) reasons.push(`tight corner ${minR.toFixed(1)}m`);
  const last = circuit.samples[circuit.samples.length - 1];
  const first = circuit.samples[0];
  const gap = Math.hypot(last.x - first.x, last.y - first.y);
  if (gap > CIRCUIT.stepM * 2) reasons.push(`open loop ${gap.toFixed(1)}m`);
  const samples = circuit.samples;
  const n = samples.length;
  const cell = CIRCUIT.trackWidthM;
  const minSeparation = Math.round(40 / circuit.stepM);
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
    let hit = false;
    for (let gx = cx - 1; gx <= cx + 1 && !hit; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1 && !hit; gy += 1) {
        const bucket = grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          const direct = Math.abs(i - j);
          const circular = Math.min(direct, n - direct);
          if (circular <= minSeparation) continue;
          const dx = samples[i].x - samples[j].x;
          const dy = samples[i].y - samples[j].y;
          if (dx * dx + dy * dy < limitSq) { hit = true; break; }
        }
      }
    }
    if (hit) { reasons.push('self-intersection'); break; }
  }
  return { ok: reasons.length === 0, minRadius: minR, reasons };
}

console.log('=== smoothing sweep: does more smoothing raise the success rate? ===');
for (const passes of [1, 2, 3]) {
  let ok = 0;
  let fail = 0;
  const reasons = new Map<string, number>();
  for (let seed = 1; seed <= 100; seed += 1) {
    for (let attempt = 0; attempt < CIRCUIT.maxAttempts; attempt += 1) {
      // Same motif-picking as the real generator.
      const rng = new Rng((seed >>> 0) + attempt * 7919 || 0x2f6e2b1);
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
      let cursor = 0;
      for (const entry of chosen) {
        const span = entry.span * scale;
        for (const [fraction, multiplier] of entry.motif.nodes) {
          nodes.push({ angle: cursor + fraction * span, radius: CIRCUIT.baseRadiusM * multiplier });
        }
        cursor += span;
      }
      const circuit = buildFromNodes(nodes, 'X', passes);
      if (!circuit) continue;
      const result = diagnose(circuit);
      if (result.ok) ok += 1;
      else {
        fail += 1;
        for (const reason of result.reasons) {
          const key = reason.replace(/[\d.]+/g, 'N');
          reasons.set(key, (reasons.get(key) ?? 0) + 1);
        }
      }
    }
  }
  console.log(`passes=${passes}: ok ${ok} fail ${fail} (${(100 * fail) / (ok + fail)}%)`);
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    console.log(`   ${count.toString().padStart(6)}  ${reason}`);
  }
}

console.log('\n=== motif compositions for predefined fallbacks (2 smoothing passes) ===');
const compositions: ReadonlyArray<{ name: string; motifs: readonly string[] }> = [
  { name: 'GP LOOP', motifs: ['gentle', 'sweep', 'hairpin', 'sweep', 'chicane', 'sweep', 'gentle', 'sweep', 'hairpin', 'sweep'] },
  { name: 'GP LOOP B', motifs: ['sweep', 'gentle', 'hairpin', 'sweep', 'sweep', 'chicane', 'gentle', 'sweep', 'hairpin', 'sweep'] },
  { name: 'GP LOOP C', motifs: ['sweep', 'hairpin', 'sweep', 'gentle', 'chicane', 'sweep', 'hairpin', 'sweep', 'gentle', 'sweep'] },
  { name: 'TECH PARK', motifs: ['chicane', 'hairpin', 's-bend', 'chicane', 'hairpin', 'sweep', 'gentle', 'chicane', 'hairpin', 's-bend', 'sweep'] },
  { name: 'TECH PARK B', motifs: ['hairpin', 'chicane', 's-bend', 'hairpin', 'gentle', 'chicane', 's-bend', 'hairpin', 'sweep', 'chicane'] },
  { name: 'TECH PARK C', motifs: ['gentle', 'chicane', 'hairpin', 's-bend', 'sweep', 'chicane', 'hairpin', 'gentle', 's-bend', 'chicane', 'hairpin'] },
  { name: 'TWIST PARK', motifs: ['s-bend', 'chicane', 's-bend', 'hairpin', 'chicane', 's-bend', 'gentle', 'hairpin', 'chicane', 's-bend', 'sweep'] },
];
for (const composition of compositions) {
  const nodes = composeNodes(composition.motifs);
  const circuit = buildFromNodes(nodes, composition.name, 2);
  if (!circuit) {
    console.log(`  ${composition.name}: FAILED TO BUILD`);
    continue;
  }
  const result = diagnose(circuit);
  console.log(`  ${composition.name}: ${result.ok ? 'VALID' : result.reasons.join('; ')} (len ${circuit.length.toFixed(0)}m, minR ${result.minRadius.toFixed(1)}m, ${circuit.samples.length} samples)`);
}
