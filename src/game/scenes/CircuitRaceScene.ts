import Phaser from 'phaser';
import { CIRCUIT, PHASER, SCENE_KEYS } from '../config';
import type { HudPalette } from '../../theme/theme';
import { resolveCircuit } from '../circuit/handcraftedTracks';
import {
  computeTrackLayout,
  paintMinimap,
  paintTrack,
  type MinimapTransform,
  type TrackLayout,
} from '../circuit/trackArt';
import { CircuitRaceModel } from '../circuit/raceModel';
import {
  carWorldPosition,
  circuitPointAt,
  safeCornerSpeed,
  wrapAngle,
} from '../circuit/vehiclePhysics';
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
/** Height of the top HUD bar, so the minimap clears it. */
const TOP_BAR_H = 30;
/** Screen-pixel inset from the canvas edge (mobile notch / rounded corners). */
const SAFE_INSET = 8;

/** Seconds a tire mark stays on the asphalt. */
const MARK_LIFE_S = 4;
const MAX_MARKS = 360;
const DUST_LIFE_S = 0.8;
const MAX_DUST = 140;

/** World metres of runway visible ahead of the car. */
const CAMERA_LOOK_BASE = 6;
const CAMERA_LOOK_PER_MPS = 0.25;
const CAMERA_LOOK_MAX = 18;

/**
 * The simulation is stepped at a fixed 1/60 s regardless of the
 * display frame rate, and the current frame carries the leftover
 * fraction as an interpolation factor. That keeps the race
 * deterministic and reproducible while the visuals stay smooth at
 * any refresh rate and never run in slow motion when the tab dips.
 */
const FIXED_DT = 1 / 60;
/** Longest wall-clock chunk fed into the accumulator (tab-switch shield). */
const MAX_FRAME_S = 0.25;
/** Hard cap on physics steps per rendered frame. */
const MAX_STEPS = 15;

/** Recompute live standings at most this often. */
const STANDINGS_INTERVAL_S = 0.25;
/** Recompute the brake warning at most this often. */
const WARNING_INTERVAL_S = 0.12;

interface PrevCarState {
  s: number;
  lat: number;
  heading: number;
}

interface InterpolatedCar {
  s: number;
  lat: number;
  heading: number;
}

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

/** Shortest-arc lerp between two angles. */
function lerpAngle(from: number, to: number, t: number): number {
  return from + wrapAngle(to - from) * t;
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
  private minimapBorder!: Phaser.GameObjects.Rectangle;
  private minimapMap!: Phaser.GameObjects.Image;
  private minimapVisible = true;
  private playerMarker!: Phaser.GameObjects.Graphics;
  private trackImageObj!: Phaser.GameObjects.Image;

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

  /**
   * The world camera carries the 5.5x race zoom; the UI camera
   * stays at 1x so HUD text, the minimap and the countdown are
   * always screen-pixel sized and pinned. `scrollFactor(0)` alone
   * would still be scaled by the zoom, which is why everything
   * looked huge and off-centre before.
   */
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private hudObjects: Phaser.GameObjects.GameObject[] = [];
  private worldObjects: Phaser.GameObjects.GameObject[] = [];

  private countdownStep = -1;
  private elapsed = 0;
  private reported = false;

  private timeAccum = 0;
  private alpha = 0;
  private prevStates: PrevCarState[] = [];

  private standingPos = 0;
  private standingTotal = 0;
  private standingAt = -10;
  private prevPhase: CircuitPhase = 'countdown';
  private warnCache = { active: false, severity: 0, category: 'warn' as 'warn' | 'danger' };
  private warnAt = -10;
  private cachedLapLength = 0;
  private cachedLastBest = { last: '' as string | null, best: '' as string | null };

  constructor() {
    super({ key: SCENE_KEYS.circuit });
  }

  init(data: CircuitSceneData): void {
    this.payload = data;
    this.circuit = resolveCircuit(data.setup.trackId, data.setup.seed);
  }

  create(): void {
    this.cameras.main.setZoom(CIRCUIT.camZoom);
    this.cameras.main.setBackgroundColor(PHASER.backgroundColor);
    this.uiCamera = this.cameras.add(0, 0, PHASER.width, PHASER.height);

    this.trackLayout = computeTrackLayout(this.circuit);
    this.paintTrackTexture();
    this.trackImage();

    this.paintMinimapTexture();

    // One spec list feeds both the sprites and the model, so
    // the car on the minimap is always the car on the road.
    this.specs = this.buildSpecs();
    this.buildCars();

    this.marksGraphics = this.add.graphics().setDepth(30);
    this.worldObjects.push(this.marksGraphics);
    this.dustGraphics = this.add.graphics().setDepth(29);
    this.worldObjects.push(this.dustGraphics);
    // Player indicator sits above every car (car depths grow with world Y).
    this.playerMarker = this.add.graphics().setDepth(200);
    this.worldObjects.push(this.playerMarker);
    this.minimapDots = this.add.graphics().setDepth(26).setScrollFactor(0);
    this.hudObjects.push(this.minimapDots);

    this.buildHud();
    this.buildCountdown();

    this.model = new CircuitRaceModel({
      circuit: this.circuit,
      specs: this.specs,
      totalLaps: this.payload.setup.totalLaps,
      seed: this.payload.setup.seed,
      difficulty: this.payload.setup.difficulty,
    });
    this.prevPhase = this.model.phase;

    // The HUD belongs to the 1x UI camera, the world to the zoomed camera.
    this.cameras.main.ignore(this.hudObjects);
    this.uiCamera.ignore(this.worldObjects);

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
    this.trackImageObj = this.add
      .image(
        originX + width / (2 * pxPerM),
        originY + height / (2 * pxPerM),
        'circuit-track',
      )
      .setScale(1 / pxPerM)
      .setDepth(1);
    this.worldObjects.push(this.trackImageObj);
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
      x: PHASER.width - MINIMAP_W - SAFE_INSET,
      y: TOP_BAR_H + SAFE_INSET,
    };
    const border = this.add
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
    const map = this.add
      .image(this.minimapOrigin.x, this.minimapOrigin.y, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);
    this.minimapBorder = border;
    this.minimapMap = map;
    this.hudObjects.push(border, map);
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
      const image = this.add
        .image(0, 0, key)
        .setScale(carScale)
        .setDepth(10);
      this.worldObjects.push(image);
      return image;
    });
  }

  private buildHud(): void {
    const palette = this.payload.palette;
    const cssColour = css;

    // Top bar.
    const bar = this.add
      .rectangle(0, 0, PHASER.width, 30, palette.background)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(20);
    const barLine = this.add
      .rectangle(0, 30, PHASER.width, 2, palette.line)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(21);
    this.hudObjects.push(bar, barLine);

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
    this.hudObjects.push(this.lapText, this.posText);

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
    this.hudObjects.push(this.timeText, this.splitText);

    // Speed, bottom left.
    this.speedText = this.add
      .text(12, 226, '0', { fontFamily: FONT, fontSize: '30px', color: cssColour(palette.text) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    const kmh = this.add
      .text(16, 258, 'KM/H', { fontFamily: FONT, fontSize: '8px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    this.hudObjects.push(this.speedText, kmh);

    // Pedal and grip bars, bottom right.
    const barX = 352;
    const thrLabel = this.add.text(barX, 232, 'THR', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    const thrTrack = this.add.rectangle(barX + 26, 233, 80, 5, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.thrFill = this.add.rectangle(barX + 26, 233, 0, 5, palette.success).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    const brkLabel = this.add.text(barX, 240, 'BRK', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    const brkTrack = this.add.rectangle(barX + 26, 241, 80, 5, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.brkFill = this.add.rectangle(barX + 26, 241, 0, 5, palette.danger).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    const gripLabel = this.add.text(barX, 250, 'GRIP', { fontFamily: FONT, fontSize: '7px', color: cssColour(palette.faint) })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    const gripTrack = this.add.rectangle(barX + 26, 251, 80, 7, palette.line).setOrigin(0, 0).setScrollFactor(0).setDepth(22);
    this.gripFill = this.add.rectangle(barX + 26, 251, 0, 7, palette.success).setOrigin(0, 0).setScrollFactor(0).setDepth(23);
    this.hudObjects.push(
      thrLabel, thrTrack, this.thrFill,
      brkLabel, brkTrack, this.brkFill,
      gripLabel, gripTrack, this.gripFill,
    );

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
    this.hudObjects.push(this.bannerText, this.warnText);
  }

  private buildCountdown(): void {
    // Dead centre of the viewport; the UI camera keeps it pinned there.
    this.countdownText = this.add
      .text(PHASER.width / 2, PHASER.height / 2, '', { fontFamily: FONT, fontSize: '44px', color: css(this.payload.palette.text) })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(40);
    this.hudObjects.push(this.countdownText);
  }

  // ---------------------------------------------------------------- loop --

  override update(_time: number, delta: number): void {
    const frameSec = Math.min(delta / 1000, MAX_FRAME_S);
    this.elapsed += frameSec;

    if (!this.payload.pauseState.paused) {
      // Fixed-step simulation with an interpolation remainder. Frames are
      // clamped so a long tab-switch hiccup can't spiral into a run-away
      // catch-up and a permanent slide into slow motion.
      this.timeAccum = Math.min(
        this.timeAccum + frameSec,
        FIXED_DT * MAX_STEPS,
      );
      let guard = MAX_STEPS;
      while (guard > 0 && this.timeAccum >= FIXED_DT) {
        this.stepSimulation(FIXED_DT);
        this.timeAccum -= FIXED_DT;
        guard -= 1;
      }
      if (guard <= 0) this.timeAccum = 0;
      this.updateEffects(frameSec);
    } else {
      // Do not bank simulated time while paused, or unpausing would
      // fire a burst of catch-up steps.
      this.timeAccum = 0;
    }

    this.alpha = Math.min(1, this.timeAccum / FIXED_DT);

    // The overlay owns the map toggle; the scene just obeys it.
    const showMap = this.payload.controls.mapVisible;
    if (showMap !== this.minimapVisible) {
      this.minimapVisible = showMap;
      this.minimapBorder.setVisible(showMap);
      this.minimapMap.setVisible(showMap);
      this.minimapDots.setVisible(showMap);
    }

    this.renderWorld();
    this.renderHud();
  }

  /** Advances the deterministic race model by exactly one fixed step. */
  private stepSimulation(dt: number): void {
    this.capturePrevStates();
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
  }

  private capturePrevStates(): void {
    for (let index = 0; index < this.model.cars.length; index += 1) {
      const state = this.model.cars[index].state;
      const prev = this.prevStates[index] ?? (this.prevStates[index] = { s: 0, lat: 0, heading: 0 });
      prev.s = state.s;
      prev.lat = state.lat;
      prev.heading = state.heading;
    }
  }

  /**
   * Renders between the pre-step snapshot and the post-step state so the
   * car moves continuously at any refresh rate instead of snagging on
   * each 1/60 s physics tick.
   */
  private interpolatedCar(index: number): InterpolatedCar {
    const prev = this.prevStates[index];
    const state = this.model.cars[index].state;
    if (!prev) return { s: state.s, lat: state.lat, heading: state.heading };
    return {
      s: prev.s + (state.s - prev.s) * this.alpha,
      lat: prev.lat + (state.lat - prev.lat) * this.alpha,
      heading: lerpAngle(prev.heading, state.heading, this.alpha),
    };
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
    const playerIndex = this.model.playerIndex;
    const playerView = this.interpolatedCar(playerIndex);

    // Follow camera with a speed-dependent lookahead,
    // clamped so the view never leaves the circuit.
    const position = carWorldPosition(this.circuit, playerView.s, playerView.lat);
    const point = circuitPointAt(this.circuit, playerView.s);
    const look = Math.min(
      CAMERA_LOOK_MAX,
      CAMERA_LOOK_BASE + (this.model.cars[playerIndex].state.v) * CAMERA_LOOK_PER_MPS,
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
      const view = this.interpolatedCar(index);
      const carPosition = carWorldPosition(this.circuit, view.s, view.lat);
      const image = this.carImages[index];
      image.x = carPosition.x;
      image.y = carPosition.y;
      image.setAngle((view.heading * 180) / Math.PI);
      image.setDepth(
        10 + Math.round((carPosition.y - this.circuit.bounds.minY) / 8),
      );
    }

    // Player indicator: a bobbing chevron hovering over the player's car
    // so it reads instantly among the near-identical AI field.
    this.drawPlayerMarker(position.x, position.y);

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

    // Minimap dots (UI space, driven by interpolated world positions).
    const dots = this.minimapDots;
    dots.clear();
    for (let index = 0; index < this.model.cars.length; index += 1) {
      const view = this.interpolatedCar(index);
      const carPosition = carWorldPosition(this.circuit, view.s, view.lat);
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

  /**
   * A downward chevron floating above the player's car.
   *
   * Drawn in world space (so it tracks the car exactly) but at a fixed
   * world offset, independent of the car's heading — the camera never
   * rotates, so "up on screen" is always a stable place to look. A slow
   * bob and a dark outline keep it legible against asphalt and paint.
   */
  private drawPlayerMarker(x: number, y: number): void {
    const marker = this.playerMarker;
    marker.clear();
    const palette = this.payload.palette;
    const bob = Math.sin(this.elapsed * 6) * 0.45;
    const tipY = y - 3.1 - bob;
    const halfW = 1.5;
    const height = 1.9;
    const outline = 0.35;
    marker.fillStyle(palette.background, 0.85);
    marker.fillTriangle(
      x - halfW - outline,
      tipY - height - outline,
      x + halfW + outline,
      tipY - height - outline,
      x,
      tipY + outline,
    );
    marker.fillStyle(palette.accent, 1);
    marker.fillTriangle(x - halfW, tipY - height, x + halfW, tipY - height, x, tipY);
  }

  private renderHud(): void {
    const palette = this.payload.palette;
    const player = this.model.cars[this.model.playerIndex];
    const state = player.state;
    const phase = this.model.phase;

    // Standings are sorted, so recompute them sparingly.
    if (phase !== this.prevPhase) {
      this.prevPhase = phase;
      this.standingAt = -10;
      this.cachedLapLength = 0;
      this.cachedLastBest = { last: null, best: null };
    }
    if (this.elapsed - this.standingAt >= STANDINGS_INTERVAL_S) {
      this.standingAt = this.elapsed;
      const standings = this.model.standings();
      this.standingTotal = standings.length;
      const playerStanding = standings.find((standing) => standing.isPlayer);
      this.standingPos = playerStanding?.position ?? standings.length;
    }

    this.lapText.setText(
      `LAP ${Math.min(Math.max(state.lap, 1), this.model.totalLaps)}/${this.model.totalLaps}`,
    );
    this.posText.setText(`POS ${this.standingPos}/${this.standingTotal}`);
    this.timeText.setText(formatRaceTime(this.model.raceTime));

    const lapLength = state.lapTimes.length;
    if (lapLength !== this.cachedLapLength) {
      this.cachedLapLength = lapLength;
      this.cachedLastBest = {
        last: lapLength > 0 ? formatRaceTime(state.lapTimes[lapLength - 1]) : null,
        best: lapLength > 0 ? formatRaceTime(Math.min(...state.lapTimes)) : null,
      };
    }
    this.splitText.setText(
      `${this.cachedLastBest.last !== null ? `LAST ${this.cachedLastBest.last}` : 'LAST —'}   ${this.cachedLastBest.best !== null ? `BEST ${this.cachedLastBest.best}` : 'BEST —'}`,
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
    if (this.elapsed - this.warnAt >= WARNING_INTERVAL_S) {
      this.warnAt = this.elapsed;
      const warning = this.cornerWarning();
      this.warnCache = {
        active: warning.active,
        severity: warning.severity,
        category: warning.severity > 10 ? 'danger' : 'warn',
      };
    }
    if (this.warnCache.active) {
      this.warnText.setText('▼ BRAKE');
      this.warnText.setColor(css(this.warnCache.category === 'danger' ? palette.danger : palette.warn));
      this.warnText.setAlpha(0.6 + 0.4 * Math.sin(this.elapsed * 10));
    } else {
      this.warnText.setText('');
    }

    // Countdown.
    if (phase === 'countdown') {
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