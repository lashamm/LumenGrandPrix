import Phaser from 'phaser';
import { CIRCUIT, PHASER, SCENE_KEYS } from '../config';
import type { HudPalette } from '../../theme/theme';
import { generateCircuit } from '../circuit/circuitGenerator';
import {
  computeTrackLayout,
  paintMinimap,
  paintTrack,
  type MinimapTransform,
  type TrackLayout,
} from '../circuit/trackArt';
import { CircuitRaceModel } from '../circuit/raceModel';
import { carWorldPosition, circuitPointAt, safeCornerSpeed } from '../circuit/vehiclePhysics';
import {
  CIRCUIT_CAR_LENGTH_M,
  CIRCUIT_CAR_ROWS,
  CIRCUIT_CAR_SPRITE,
  circuitCarPalette,
} from '../circuit/carSprite';
import {
  AI_ROSTER,
  type CarSpec,
  type Circuit,
  type CircuitControlState,
  type CircuitPhase,
  type CircuitRaceResult,
  type CircuitRaceSetup,
} from '../circuit/types';
import type { CarDefinition } from '../car/carData';
import type { CarColors, UpgradeLevels } from '../types';

const FONT = '"Courier New", Courier, monospace';

/** AI grid runs the same mid build the drag AI runs. */
const AI_LEVELS: UpgradeLevels = {
  engine: 2,
  weight: 2,
  aero: 2,
  brakes: 2,
  tires: 2,
};

const MINIMAP_W = 148;
const MINIMAP_H = 110;

/** Seconds a tire mark stays on the asphalt. */
const MARK_LIFE_S = 4;
const MAX_MARKS = 360;
const DUST_LIFE_S = 0.8;
const MAX_DUST = 140;

/** World metres of runway visible ahead of the car. */
const CAMERA_LOOK_BASE = 6;
const CAMERA_LOOK_PER_MPS = 0.25;
const CAMERA_LOOK_MAX = 18;

export interface CircuitSceneData {
  setup: CircuitRaceSetup;
  playerLevels: UpgradeLevels;
  playerCar: CarDefinition;
  controls: CircuitControlState;
  palette: HudPalette;
  /**
   * Shared pause flag. The React shell owns the pause
   * button and the Escape key; the scene just obeys.
   */
  pauseState: { paused: boolean };
  onPhaseChange: (phase: CircuitPhase) => void;
  onComplete: (result: CircuitRaceResult) => void;
}

interface TireMark {
  x: number;
  y: number;
  angle: number;
  life: number;
}

interface DustPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** `#rrggbb` from a 0xrrggbb integer. */
function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Race time as `m:ss.cc`. */
function formatRaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00.00';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds - minutes * 60;
  return `${minutes}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * The circuit race scene.
 *
 * The scene is a thin adapter: `CircuitRaceModel` owns
 * every simulation decision, this file owns the camera,
 * the once-per-race track bitmap, the car sprites,
 * tire marks, dust and the HUD. React owns navigation,
 * the pedals and the result card.
 */
export class CircuitRaceScene extends Phaser.Scene {
  private payload!: CircuitSceneData;
  private model!: CircuitRaceModel;
  private circuit!: Circuit;
  private specs: CarSpec[] = [];
  private trackLayout!: TrackLayout;
  private minimap!: MinimapTransform;
  private minimapOrigin = { x: 0, y: 0 };

  private carImages: Phaser.GameObjects.Image[] = [];
  private marks: TireMark[] = [];
  private dust: DustPuff[] = [];
  private marksGraphics!: Phaser.GameObjects.Graphics;
  private dustGraphics!: Phaser.GameObjects.Graphics;
  private minimapDots!: Phaser.GameObjects.Graphics;

  private lapText!: Phaser.GameObjects.Text;
  private posText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private splitText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private thrFill!: Phaser.GameObjects.Rectangle;
  private brkFill!: Phaser.GameObjects.Rectangle;
  private gripFill!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;

  private countdownStep = -1;
  private elapsed = 0;
  private reported = false;

  constructor() {
    super({ key: SCENE_KEYS.circuit });
  }

  init(data: CircuitSceneData): void {
    this.payload = data;
    this.circuit = generateCircuit(data.setup.seed);
  }

  create(): void {
    this.cameras.main.setZoom(CIRCUIT.camZoom);
    this.cameras.main.setBackgroundColor(PHASER.backgroundColor);

    this.trackLayout = computeTrackLayout(this.circuit);
    this.paintTrackTexture();
    this.trackImage();

    this.paintMinimapTexture();

    // One spec list feeds both the sprites and the model, so
    // the car on the minimap is always the car on the road.
    this.specs = this.buildSpecs();
    this.buildCars();

    this.marksGraphics = this.add.graphics().setDepth(30);
    this.dustGraphics = this.add.graphics().setDepth(29);
    this.minimapDots = this.add.graphics().setDepth(26);
    this.minimapDots.setScrollFactor(0);

    this.buildHud();
    this.buildCountdown();

    this.model = new CircuitRaceModel({
      circuit: this.circuit,
      specs: this.specs,
      totalLaps: this.payload.setup.totalLaps,
      seed: this.payload.setup.seed,
      difficulty: this.payload.setup.difficulty,
    });

    this.payload.onPhaseChange('countdown');
  }

  // ---------------------------------------------------------------- art --

  /** Paints the whole circuit into one cached bitmap. */
  private paintTrackTexture(): void {
    const key = 'circuit-track';
    if (this.textures.exists(key)) this.textures.remove(key);
    const texture = this.textures.createCanvas(
      key,
      this.trackLayout.width,
      this.trackLayout.height,
    );
    if (!texture) return;
    paintTrack(texture.getContext(), this.circuit, this.trackLayout);
    texture.refresh();
  }

  private trackImage(): void {
    const { width, height, pxPerM, originX, originY } = this.trackLayout;
    this.add
      .image(
        originX + width / (2 * pxPerM),
        originY + height / (2 * pxPerM),
        'circuit-track',
      )
      .setScale(1 / pxPerM)
      .setDepth(1);
  }

  private paintMinimapTexture(): void {
    const key = 'circuit-minimap';
    if (this.textures.exists(key)) this.textures.remove(key);
    const texture = this.textures.createCanvas(key, MINIMAP_W, MINIMAP_H);
    if (!texture) return;
    this.minimap = paintMinimap(
      texture.getContext(),
      this.circuit,
      MINIMAP_W,
      MINIMAP_H,
    );
    texture.refresh();

    this.minimapOrigin = {
      x: PHASER.width - MINIMAP_W - 6,
      y: 6,
    };
    this.add
      .rectangle(
        this.minimapOrigin.x - 3,
        this.minimapOrigin.y - 3,
        MINIMAP_W + 6,
        MINIMAP_H + 6,
        this.payload.palette.line,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);
    this.add
      .image(this.minimapOrigin.x, this.minimapOrigin.y, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);
  }

  /** Formula sprite per car, painted from its own colours. */
  private paintCarTexture(key: string, colors: CarColors): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const texture = this.textures.createCanvas(
      key,
      CIRCUIT_CAR_SPRITE.width,
      CIRCUIT_CAR_SPRITE.height,
    );
    if (!texture) return;
    const ctx = texture.getContext();
    const palette = circuitCarPalette(colors);
    const rows = CIRCUIT_CAR_ROWS;

    // Outline first so the border sits outside the body.
    ctx.fillStyle = css(palette.o);
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < rows[y].length; x += 1) {
        if (rows[y][x] === 'o') ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < rows[y].length; x += 1) {
        const symbol = rows[y][x];
        if (symbol === '.' || symbol === 'o') continue;
        const colour = palette[symbol];
        if (colour === undefined) continue;
        ctx.fillStyle = css(colour);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    texture.refresh();
  }

  // -------------------------------------------------------------- build --

  private buildSpecs(): CarSpec[] {
    const specs: CarSpec[] = [];
    const count = Math.min(
      CIRCUIT.maxGridSize - 1,
      Math.max(1, this.payload.setup.opponentCount),
    );
    for (let index = 0; index < count; index += 1) {
      const roster = AI_ROSTER[index % AI_ROSTER.length];
      specs.push({
        label: roster.label,
        color: roster.color,
        levels: { ...AI_LEVELS },
        isPlayer: false,
        lineOffset:
          count === 1 ? 0 : -4.5 + (9 * index) / (count - 1),
      });
    }
    specs.push({
      label: 'YOU',
      color: this.payload.playerCar.colors.primary,
      levels: { ...this.payload.playerLevels },
      isPlayer: true,
      lineOffset: 0,
    });
    this.specs = specs;
    return specs;
  }

  private buildCars(): void {
    const specs = this.specs;
    const carScale = CIRCUIT_CAR_LENGTH_M / CIRCUIT_CAR_SPRITE.width;
    this.carImages = specs.map((spec, index) => {
      const colors: CarColors = spec.isPlayer
        ? this.payload.playerCar.colors
        : aiColors(spec.color);
      const key = `circuit-car-${index}`;
      this.paintCarTexture(key, colors);
      return this.add
        .image(0, 0, key)
        .setScale(carScale)
        .setDepth(10);
    });
  }

  private buildHud(): void {
    const palette = this.payload.palette;
    const cssColour = css;

    // Top bar.
    this.add
      .rectangle(0, 0, PHASER.width, 30, palette.background)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(20);
    this.add
      .rectangle(0, 30, PHASER.width, 2, palette.line)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(21);

    this.lapText = this.add
      .text(10, 7, 'LAP 1/3', { fontFamily: FONT, fontSize: '11px', color: cssColour(palette.text) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.posText = this.add
      .text(10, 19, 'POS 6/6', { fontFamily: FONT, fontSize: '9px', color: cssColour(palette.ai) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);

    this.timeText = this.add
      .text(PHASER.width / 2, 4, '0:00.00', { fontFamily: FONT, fontSize: '15px', color: cssColour(palette.text) })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.splitText = this.add
      .text(PHASER.width / 2, 21, '', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(22);

    // Speed, bottom left.
    this.speedText = this.add
      .text(12, 226, '0', { fontFamily: FONT, fontSize: '30px', color: cssColour(palette.text) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.add
      .text(16, 258, 'KM/H', { fontFamily: FONT, fontSize: '8px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);

    // Pedal and grip bars, bottom right.
    const barX = 352;
    this.add.text(barX, 232, 'THR', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.add.rectangle(barX + 26, 233, 80, 5, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.thrFill = this.add.rectangle(barX + 26, 233, 0, 5, palette.success).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    this.add.text(barX, 240, 'BRK', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.add.rectangle(barX + 26, 241, 80, 5, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.brkFill = this.add.rectangle(barX + 26, 241, 0, 5, palette.danger).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    this.add.text(barX, 250, 'GRIP', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.add.rectangle(barX + 26, 251, 80, 7, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.gripFill = this.add.rectangle(barX + 26, 251, 0, 7, palette.success).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    // Banners and the corner warning.
    this.bannerText = this.add
      .text(PHASER.width / 2, 84, '', { fontFamily: FONT, fontSize: '16px', color: cssColour(palette.text) })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(27);
    this.warnText = this.add
      .text(PHASER.width / 2, 148, '', { fontFamily: FONT, fontSize: '13px', color: cssColour(palette.warn) })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(27);
  }

  private buildCountdown(): void {
    this.countdownText = this.add
      .text(PHASER.width / 2, 118, '', { fontFamily: FONT, fontSize: '44px', color: css(this.payload.palette.text) })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(40);
  }

  // ---------------------------------------------------------------- loop --

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    this.elapsed += dt;

    if (!this.payload.pauseState.paused) {
      const prevPhase = this.model.phase;
      this.model.update(dt, {
        throttle: this.payload.controls.throttle,
        brake: this.payload.controls.brake,
      });
      if (this.model.phase !== prevPhase) {
        this.payload.onPhaseChange(this.model.phase);
        if (this.model.phase === 'racing') {
          this.flashBanner('GO!', this.payload.palette.accent);
        }
      }
      if (this.model.phase === 'finished' && !this.reported) {
        this.reported = true;
        this.payload.onComplete(this.model.result());
      }
      this.updateEffects(dt);
    }

    this.renderWorld();
    this.renderHud();
  }

  // -------------------------------------------------------------- effects --

  private updateEffects(dt: number): void {
    for (const car of this.model.cars) {
      const state = car.state;
      const slipping = (state.slide > 0.3 || state.lockup > 0.4) && state.v > 4;
      if (slipping) this.spawnMarks(car);
      if (state.offTrack && state.v > 2) this.spawnDust(car);
    }

    for (let i = this.marks.length - 1; i >= 0; i -= 1) {
      this.marks[i].life -= dt;
      if (this.marks[i].life <= 0) this.marks.splice(i, 1);
    }
    for (let i = this.dust.length - 1; i >= 0; i -= 1) {
      const puff = this.dust[i];
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      if (puff.life <= 0) this.dust.splice(i, 1);
    }
  }

  private spawnMarks(car: { state: { s: number; lat: number; heading: number; v: number } }): void {
    const state = car.state;
    const position = carWorldPosition(this.circuit, state.s, state.lat);
    const point = circuitPointAt(this.circuit, state.s);
    const rearX = position.x - point.tx * 1.7;
    const rearY = position.y - point.ty * 1.7;
    for (const side of [-0.85, 0.85]) {
      this.marks.push({
        x: rearX + point.nx * side,
        y: rearY + point.ny * side,
        angle: state.heading,
        life: MARK_LIFE_S,
      });
    }
    while (this.marks.length > MAX_MARKS) this.marks.shift();
  }

  private spawnDust(car: { state: { s: number; lat: number; v: number } }): void {
    const state = car.state;
    const position = carWorldPosition(this.circuit, state.s, state.lat);
    this.dust.push({
      x: position.x,
      y: position.y,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      life: DUST_LIFE_S,
    });
    while (this.dust.length > MAX_DUST) this.dust.shift();
  }

  // ---------------------------------------------------------------- render --

  private renderWorld(): void {
    const player = this.model.cars[this.model.playerIndex];
    const state = player.state;

    // Follow camera with a speed-dependent lookahead,
    // clamped so the view never leaves the circuit.
    const position = carWorldPosition(this.circuit, state.s, state.lat);
    const point = circuitPointAt(this.circuit, state.s);
    const look = Math.min(
      CAMERA_LOOK_MAX,
      CAMERA_LOOK_BASE + state.v * CAMERA_LOOK_PER_MPS,
    );
    const viewW = PHASER.width / CIRCUIT.camZoom;
    const viewH = PHASER.height / CIRCUIT.camZoom;
    const margin = 30;
    const minX = this.circuit.bounds.minX - margin + viewW / 2;
    const maxX = this.circuit.bounds.maxX + margin - viewW / 2;
    const minY = this.circuit.bounds.minY - margin + viewH / 2;
    const maxY = this.circuit.bounds.maxY + margin - viewH / 2;
    const camX = minX > maxX ? (minX + maxX) / 2 : clamp(position.x + point.tx * look, minX, maxX);
    const camY = minY > maxY ? (minY + maxY) / 2 : clamp(position.y + point.ty * look, minY, maxY);
    this.cameras.main.centerOn(camX, camY);

    // Cars, depth-sorted by world Y so lower cars draw on top.
    for (let index = 0; index < this.model.cars.length; index += 1) {
      const car = this.model.cars[index];
      const carState = car.state;
      const carPosition = carWorldPosition(this.circuit, carState.s, carState.lat);
      const image = this.carImages[index];
      image.x = carPosition.x;
      image.y = carPosition.y;
      image.setAngle((carState.heading * 180) / Math.PI);
      image.setDepth(
        10 + Math.round((carPosition.y - this.circuit.bounds.minY) / 8),
      );
    }

    // Tire marks: rotated quads drawn as triangle pairs —
    // Phaser's Graphics has no transform stack.
    const marks = this.marksGraphics;
    marks.clear();
    for (const mark of this.marks) {
      const alpha = (mark.life / MARK_LIFE_S) * 0.5;
      const cos = Math.cos(mark.angle);
      const sin = Math.sin(mark.angle);
      const corner = (cx: number, cy: number): [number, number] => [
        mark.x + cx * cos - cy * sin,
        mark.y + cx * sin + cy * cos,
      ];
      const [ax, ay] = corner(-0.9, -0.32);
      const [bx, by] = corner(0.9, -0.32);
      const [cx2, cy2] = corner(0.9, 0.32);
      const [dx, dy] = corner(-0.9, 0.32);
      marks.fillStyle(0x05070c, alpha);
      marks.fillTriangle(ax, ay, bx, by, cx2, cy2);
      marks.fillTriangle(ax, ay, cx2, cy2, dx, dy);
    }

    // Dust.
    const dust = this.dustGraphics;
    dust.clear();
    for (const puff of this.dust) {
      const growth = 1 - puff.life / DUST_LIFE_S;
      dust.fillStyle(0x8a7f6a, (puff.life / DUST_LIFE_S) * 0.4);
      dust.fillCircle(puff.x, puff.y, 0.5 + growth * 0.9);
    }

    // Minimap dots.
    const dots = this.minimapDots;
    dots.clear();
    for (let index = 0; index < this.model.cars.length; index += 1) {
      const car = this.model.cars[index];
      const carPosition = carWorldPosition(this.circuit, car.state.s, car.state.lat);
      const dot = this.minimap.toPx(carPosition.x, carPosition.y);
      const isPlayer = this.model.specs[index].isPlayer;
      const colour = isPlayer
        ? this.payload.palette.accent
        : Number.parseInt(this.model.specs[index].color.replace('#', ''), 16);
      if (isPlayer) {
        dots.fillStyle(0xffffff, 0.9);
        dots.fillCircle(
          this.minimapOrigin.x + dot.x,
          this.minimapOrigin.y + dot.y,
          3.4,
        );
      }
      dots.fillStyle(colour, 0.95);
      dots.fillCircle(
        this.minimapOrigin.x + dot.x,
        this.minimapOrigin.y + dot.y,
        isPlayer ? 2.4 : 2,
      );
    }
  }

  private renderHud(): void {
    const palette = this.payload.palette;
    const player = this.model.cars[this.model.playerIndex];
    const state = player.state;
    const standings = this.model.standings();
    const playerStanding = standings.find((standing) => standing.isPlayer);

    this.lapText.setText(
      `LAP ${Math.min(Math.max(state.lap, 1), this.model.totalLaps)}/${this.model.totalLaps}`,
    );
    this.posText.setText(`POS ${playerStanding?.position ?? '—'}/${standings.length}`);
    this.timeText.setText(formatRaceTime(this.model.raceTime));

    const lastLap = state.lapTimes.length > 0 ? state.lapTimes[state.lapTimes.length - 1] : null;
    const bestLap = state.lapTimes.length > 0 ? Math.min(...state.lapTimes) : null;
    this.splitText.setText(
      `${lastLap !== null ? `LAST ${formatRaceTime(lastLap)}` : 'LAST —'}   ${bestLap !== null ? `BEST ${formatRaceTime(bestLap)}` : 'BEST —'}`,
    );
    this.speedText.setText(String(Math.round(state.v * 3.6)));

    // Pedals.
    const BAR_W = 80;
    this.thrFill.width = this.payload.controls.throttle ? BAR_W : 0;
    this.brkFill.width = this.payload.controls.brake ? BAR_W : 0;

    // Grip indicator: green stable, yellow near the limit,
    // red while the tires are sliding.
    this.gripFill.width = BAR_W * Math.min(1, state.gripRatio);
    this.gripFill.fillColor =
      state.gripState === 'green'
        ? palette.success
        : state.gripState === 'yellow'
          ? palette.warn
          : palette.danger;

    // Context banners.
    let banner = '';
    let bannerColour = palette.text;
    if (state.spinTimer > 0) {
      banner = 'SPIN!';
      bannerColour = palette.danger;
    } else if (state.offTrack) {
      banner = 'OFF TRACK';
      bannerColour = palette.warn;
    } else if (state.lockup > 0.4) {
      banner = 'LOCK-UP';
      bannerColour = palette.warn;
    } else if (state.slide > 0.35) {
      banner = 'SLIDING';
      bannerColour = palette.warn;
    }
    this.bannerText.setText(banner);
    this.bannerText.setColor(css(bannerColour));
    this.bannerText.setAlpha(banner ? 0.75 + 0.25 * Math.sin(this.elapsed * 14) : 0);

    // Braking-point warning: the slowest corner inside the
    // braking window is reachable slower than the car runs.
    const warning = this.cornerWarning();
    if (warning.active) {
      this.warnText.setText('▼ BRAKE');
      this.warnText.setColor(
        css(warning.severity > 10 ? palette.danger : palette.warn),
      );
      this.warnText.setAlpha(0.6 + 0.4 * Math.sin(this.elapsed * 10));
    } else {
      this.warnText.setText('');
    }

    // Countdown.
    if (this.model.phase === 'countdown') {
      const step = this.model.countdownStep;
      if (step !== this.countdownStep) {
        this.countdownStep = step;
        const label = step < CIRCUIT.countdownSteps ? String(CIRCUIT.countdownSteps - step) : 'GO!';
        this.countdownText.setText(label);
        this.countdownText.setColor(
          css(step < CIRCUIT.countdownSteps ? palette.text : palette.accent),
        );
        this.countdownText.setScale(1.25);
        this.tweens.add({
          targets: this.countdownText,
          scale: 1,
          duration: 260,
          ease: 'Quad.easeOut',
        });
      }
    } else if (this.countdownStep !== -1) {
      this.countdownStep = -1;
      this.countdownText.setText('');
    }
  }

  /** Slowest safe speed inside the player's braking window. */
  private cornerWarning(): { active: boolean; severity: number } {
    const player = this.model.cars[this.model.playerIndex];
    const state = player.state;
    if (state.v < 8 || state.spinTimer > 0) {
      return { active: false, severity: 0 };
    }
    const brakeDecel = (player.stats.brakeForceN * 2.2) / player.stats.massKg;
    const brakeDistance = (state.v * state.v) / (2 * brakeDecel * 0.85) + 14;
    let minSafe = Number.POSITIVE_INFINITY;
    for (let d = 4; d <= brakeDistance + 16; d += 3) {
      const point = circuitPointAt(this.circuit, state.s + d);
      const safe = safeCornerSpeed(point.curvature, player.stats);
      if (safe < minSafe) minSafe = safe;
    }
    const severity = state.v - minSafe;
    return { active: severity > 3, severity };
  }

  private flashBanner(message: string, colour: number): void {
    this.bannerText.setText(message);
    this.bannerText.setColor(css(colour));
    this.bannerText.setAlpha(1);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: 700,
      duration: 300,
      ease: 'Quad.easeIn',
    });
  }
}

/** Builds an AI car definition in one readable colour. */
function aiColors(hex: string): CarColors {
  return {
    primary: hex,
    secondary: '#0e2f3a',
    rim: '#c9d2e6',
    window: '#16233a',
    accent: '#0b0d14',
  };
}
