import { CIRCUIT } from '../config';
import { Rng } from '../ai/aiDriver';
import type { Circuit } from './types';

/**
 * Track and minimap painting — plain canvas 2D.
 *
 * The whole circuit is painted once, at race start, into a
 * single bitmap texture the scene then scrolls with its
 * camera. Pixel-art colours, chunky kerbs, a checkered
 * start/finish line and direction chevrons keep the track
 * readable at a glance.
 */

/** Fixed identity colours for the driving surface. */
export const TRACK_ART = {
  ground: 0x0b0e16,
  runoff: 0x11151f,
  asphalt: 0x1a1e2a,
  edge: 0x8b95ad,
  kerbRed: 0xd9402f,
  kerbWhite: 0xe8ecf7,
  centreLine: 0x3a4260,
  chevron: 0x4a5578,
  minimapBg: 0x0a0d15,
  minimapTrack: 0x3d4a6b,
  minimapStart: 0x37e0c8,
} as const;

/** Where the track bitmap sits in world space. */
export interface TrackLayout {
  width: number;
  height: number;
  pxPerM: number;
  /** World coordinates of the bitmap's top-left corner. */
  originX: number;
  originY: number;
}

/** Computes the bitmap size for a circuit. */
export function computeTrackLayout(circuit: Circuit): TrackLayout {
  const pad = circuit.halfWidth + 12;
  const minX = circuit.bounds.minX - pad;
  const minY = circuit.bounds.minY - pad;
  const widthM = circuit.bounds.maxX - circuit.bounds.minX + pad * 2;
  const heightM = circuit.bounds.maxY - circuit.bounds.minY + pad * 2;
  // Cap the bitmap at 4096px; shrink the resolution if a
  // huge circuit ever needs it.
  const pxPerM = Math.min(
    CIRCUIT.pxPerM,
    4096 / widthM,
    4096 / heightM,
  );
  return {
    width: Math.max(256, Math.ceil(widthM * pxPerM)),
    height: Math.max(256, Math.ceil(heightM * pxPerM)),
    pxPerM,
    originX: minX,
    originY: minY,
  };
}

/** `#rrggbb` from a 0xrrggbb integer. */
function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

type Painter = (x: number, y: number) => { x: number; y: number };

function makePainter(layout: TrackLayout): Painter {
  return (x, y) => ({
    x: (x - layout.originX) * layout.pxPerM,
    y: (y - layout.originY) * layout.pxPerM,
  });
}

/** Traces the closed centreline as a canvas path. */
function traceCentreline(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  toPx: Painter,
): void {
  const samples = circuit.samples;
  const first = toPx(samples[0].x, samples[0].y);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < samples.length; i += 1) {
    const p = toPx(samples[i].x, samples[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/** Traces a line offset from the centreline by `offset` metres. */
function traceOffset(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  toPx: Painter,
  offset: number,
): void {
  const samples = circuit.samples;
  const first = toPx(
    samples[0].x + samples[0].nx * offset,
    samples[0].y + samples[0].ny * offset,
  );
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < samples.length; i += 1) {
    const s = samples[i];
    const p = toPx(s.x + s.nx * offset, s.y + s.ny * offset);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/** Paints the full driving surface into `ctx`. */
export function paintTrack(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  layout: TrackLayout,
): void {
  const toPx = makePainter(layout);
  const px = layout.pxPerM;
  const width = layout.width;
  const height = layout.height;

  // Ground.
  ctx.fillStyle = css(TRACK_ART.ground);
  ctx.fillRect(0, 0, width, height);

  // Deterministic ground speckle so large flat areas are not dead.
  const rng = new Rng((circuit.seed || 0x2f6e2b1) >>> 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.016)';
  for (let i = 0; i < 900; i += 1) {
    ctx.fillRect(
      rng.next() * width,
      rng.next() * height,
      2,
      2,
    );
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let i = 0; i < 900; i += 1) {
    ctx.fillRect(
      rng.next() * width,
      rng.next() * height,
      2,
      2,
    );
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Runoff band.
  traceCentreline(ctx, circuit, toPx);
  ctx.strokeStyle = css(TRACK_ART.runoff);
  ctx.lineWidth = (circuit.halfWidth + 6) * 2 * px;
  ctx.stroke();

  // Kerbs on tight corners: alternating red and white strips
  // just inside both edges.
  drawKerbs(ctx, circuit, toPx, px);

  // Asphalt.
  traceCentreline(ctx, circuit, toPx);
  ctx.strokeStyle = css(TRACK_ART.asphalt);
  ctx.lineWidth = circuit.halfWidth * 2 * px;
  ctx.stroke();

  // Edge lines.
  for (const side of [1, -1] as const) {
    traceOffset(ctx, circuit, toPx, side * (circuit.halfWidth - 0.3));
    ctx.strokeStyle = css(TRACK_ART.edge);
    ctx.lineWidth = Math.max(1, 0.35 * px);
    ctx.stroke();
  }

  // Faint centre dashes.
  ctx.setLineDash([6 * px, 10 * px]);
  traceCentreline(ctx, circuit, toPx);
  ctx.strokeStyle = css(TRACK_ART.centreLine);
  ctx.lineWidth = Math.max(1, 0.18 * px);
  ctx.stroke();
  ctx.setLineDash([]);

  // Start/finish checker.
  drawStartFinish(ctx, circuit, toPx, px);

  // Direction chevrons.
  drawChevrons(ctx, circuit, toPx, px);
}

function drawKerbs(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  toPx: Painter,
  px: number,
): void {
  const samples = circuit.samples;
  const half = circuit.halfWidth;
  // Corners tighter than ~55 m radius get kerbs.
  const threshold = 1 / 55;
  let cell = 0;
  for (const side of [1, -1] as const) {
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (Math.abs(s.curvature) < threshold) {
        cell = 0;
        continue;
      }
      const next = samples[(i + 1) % samples.length];
      const a = toPx(s.x + s.nx * side * (half - 0.9), s.y + s.ny * side * (half - 0.9));
      const b = toPx(
        next.x + next.nx * side * (half - 0.9),
        next.y + next.ny * side * (half - 0.9),
      );
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const stripe = Math.floor(i / 5) % 2 === 0;
      ctx.strokeStyle = css(stripe ? TRACK_ART.kerbRed : TRACK_ART.kerbWhite);
      ctx.lineWidth = 1.1 * px;
      ctx.stroke();
      cell += 1;
    }
  }
}

function drawStartFinish(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  toPx: Painter,
  px: number,
): void {
  const s = circuit.samples[0];
  const centre = toPx(s.x, s.y);
  const angle = Math.atan2(s.ty, s.tx);
  const bandM = 1.4;
  const cols = 16;
  const rowM = bandM / 2;
  const colM = (circuit.halfWidth * 2) / cols;

  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(angle);
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const even = (row + col) % 2 === 0;
      ctx.fillStyle = css(even ? 0xf2f5ff : 0x0d0f18);
      ctx.fillRect(
        (row - 1) * rowM * px,
        (col - cols / 2) * colM * px,
        rowM * px + 0.5,
        colM * px + 0.5,
      );
    }
  }
  ctx.restore();
}

function drawChevrons(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  toPx: Painter,
  px: number,
): void {
  const samples = circuit.samples;
  const every = Math.max(1, Math.round(30 / circuit.stepM));
  ctx.strokeStyle = css(TRACK_ART.chevron);
  ctx.lineWidth = Math.max(1, 0.22 * px);
  for (let i = every; i < samples.length; i += every) {
    const s = samples[i];
    const centre = toPx(s.x, s.y);
    const angle = Math.atan2(s.ty, s.tx);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(angle);
    const arm = 1.6 * px;
    const spread = 1.1 * px;
    ctx.beginPath();
    ctx.moveTo(-arm, -spread);
    ctx.lineTo(0, 0);
    ctx.lineTo(-arm, spread);
    ctx.stroke();
    ctx.restore();
  }
}

/** Minimap transform: world metres → minimap pixels. */
export interface MinimapTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  toPx: (x: number, y: number) => { x: number; y: number };
}

/** Paints the static minimap track into `ctx` and returns its transform. */
export function paintMinimap(
  ctx: CanvasRenderingContext2D,
  circuit: Circuit,
  width: number,
  height: number,
): MinimapTransform {
  const pad = 10;
  const bw = circuit.bounds.maxX - circuit.bounds.minX;
  const bh = circuit.bounds.maxY - circuit.bounds.minY;
  const scale = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh);
  const offsetX =
    pad + ((width - pad * 2) - bw * scale) / 2 - circuit.bounds.minX * scale;
  const offsetY =
    pad + ((height - pad * 2) - bh * scale) / 2 - circuit.bounds.minY * scale;

  const toPx = (x: number, y: number) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY,
  });

  ctx.fillStyle = css(TRACK_ART.minimapBg);
  ctx.fillRect(0, 0, width, height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const first = toPx(circuit.samples[0].x, circuit.samples[0].y);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < circuit.samples.length; i += 1) {
    const p = toPx(circuit.samples[i].x, circuit.samples[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.strokeStyle = css(TRACK_ART.minimapTrack);
  ctx.lineWidth = Math.max(2.5, circuit.halfWidth * 2 * scale * 0.75);
  ctx.stroke();

  // Start/finish tick.
  const s = circuit.samples[0];
  const a = toPx(s.x - s.nx * circuit.halfWidth, s.y - s.ny * circuit.halfWidth);
  const b = toPx(s.x + s.nx * circuit.halfWidth, s.y + s.ny * circuit.halfWidth);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = css(TRACK_ART.minimapStart);
  ctx.lineWidth = 2;
  ctx.stroke();

  return { scale, offsetX, offsetY, toPx };
}
