import Phaser from 'phaser';
import {
  DRIVETRAIN,
  LAUNCH,
  MAX_RPM,
  OPTIMAL_SHIFT_RPM,
  PHASER,
  RACE_LENGTH,
  REV_LIMIT_RPM,
  SCENE_KEYS,
  TACH,
} from '../config';
import type { RaceResult, ShiftQuality, UpgradeLevels } from '../types';
import type { CarDefinition } from '../car/carData';
import { deriveStats } from '../physics/carStats';
import { Drivetrain } from '../physics/drivetrain';
import { createOpponent, type OpponentDescriptor, type RaceOpponent } from '../opponents/RaceOpponent';
import {
  CAR_SCALE,
  CAR_SPRITE,
  CAR_WHEELS,
  generateBulbTexture,
  generateCarTexture,
  generateLightTreeTexture,
  generateWheelTexture,
  SCENERY,
} from '../pixelArt';
import type { ControlState } from '../control';

export type RacePhase = 'countdown' | 'staging' | 'racing' | 'finished';

export interface RaceSceneData {
  playerLevels: UpgradeLevels;
  playerCar: CarDefinition;
  opponent: OpponentDescriptor;
  bestTime: number | null;
  controls: ControlState;
  onPhaseChange: (phase: RacePhase) => void;
  onComplete: (result: RaceResult) => void;
}

const VIEW = {
  width: PHASER.width,
  height: PHASER.height,
  horizon: 52,
  playerLaneY: 158,
  aiLaneY: 108,
  playerX: 150,
  /** Screen pixels the strip scrolls per metre travelled. */
  pxPerMetre: 12,
  /** Screen pixels per metre of lead over the opponent (exaggerated for readability). */
  pxPerMetreLead: 2.4,
  hudTop: 172,
  /** Progress rails sit in the top strip of the HUD, right of the tachometer. */
  progressX: 134,
  progressWidth: 328,
  stageBarX: 176,
  stageBarWidth: 268,
  stageBarY: 236,
} as const;

const LAUNCH_BAND_SWEET: readonly [number, number] = [LAUNCH.optimalRpm - 400, LAUNCH.optimalRpm + 400];
const LAUNCH_BAND_GOOD: readonly [number, number] = [LAUNCH.optimalRpm - 1100, LAUNCH.optimalRpm + 800];
const SHIFT_BAND: readonly [number, number] = [OPTIMAL_SHIFT_RPM - 380, OPTIMAL_SHIFT_RPM + 380];

const QUALITY_COLOUR: Record<ShiftQuality, number> = {
  PERFECT: 0x37e0c8,
  GREAT: 0x7ee787,
  GOOD: 0xffd166,
  MISS: 0xff9f45,
  BAD: 0xff5c5c,
};

const FONT = '"Courier New", Courier, monospace';
const SHIFT_MESSAGE_TTL = 1100;
const COUNTDOWN_STEP_S = 0.8;
const COUNTDOWN_STEPS = ['3', '2', '1'];

interface SceneryObject {
  object: Phaser.GameObjects.GameObject & { x: number; setVisible(v: boolean): unknown };
  worldX: number;
}

export class RaceScene extends Phaser.Scene {
  /** Race payload handed over by the React shell via `game.scene.add`. */
  private raceData!: RaceSceneData;
  private player!: Drivetrain;
  private opponent!: RaceOpponent;

  private phase: RacePhase = 'countdown';
  private countdownT = 0;
  private countdownText!: Phaser.GameObjects.Text;
  private stagingRevs: number = DRIVETRAIN.idleRpm;
  private opponentStagingRevs: number = DRIVETRAIN.idleRpm;
  private raceTime = 0;
  private elapsed = 0;
  private frameDt = 1 / 60;
  private reported = false;

  private playerCar!: Phaser.GameObjects.Image;
  private opponentCar!: Phaser.GameObjects.Image;
  private playerWheels: Phaser.GameObjects.Image[] = [];
  private opponentWheels: Phaser.GameObjects.Image[] = [];
  private scenery: SceneryObject[] = [];
  private bulbs: Phaser.GameObjects.Image[] = [];

  private needle!: Phaser.GameObjects.Rectangle;
  private rpmText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private shiftBanner!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private splitText!: Phaser.GameObjects.Text;
  private leadText!: Phaser.GameObjects.Text;
  private playerProgress!: Phaser.GameObjects.Rectangle;
  private opponentProgress!: Phaser.GameObjects.Rectangle;
  private stagingBarFill!: Phaser.GameObjects.Rectangle;
  private stagingGroup!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SCENE_KEYS.race });
  }

  init(data: RaceSceneData): void {
    this.raceData = data;
    this.player = new Drivetrain({ stats: deriveStats(data.playerLevels) });
    this.opponent = createOpponent(data.opponent);
    this.phase = 'countdown';
    this.countdownT = 0;
    this.stagingRevs = DRIVETRAIN.idleRpm;
    this.opponentStagingRevs = DRIVETRAIN.idleRpm;
    this.raceTime = 0;
    this.elapsed = 0;
    this.reported = false;
    this.playerWheels = [];
    this.opponentWheels = [];
    this.scenery = [];
    this.bulbs = [];
  }

  create(): void {
    generateCarTexture(this, 'car-player', this.raceData.playerCar);
    generateCarTexture(this, 'car-opponent', this.opponent.car);
    generateWheelTexture(this, 'wheel-player', this.raceData.playerCar);
    generateWheelTexture(this, 'wheel-opponent', this.opponent.car);
    generateLightTreeTexture(this);
    generateBulbTexture(this, 'bulb-red', 0xff3b30);
    generateBulbTexture(this, 'bulb-amber', 0xffb020);
    generateBulbTexture(this, 'bulb-green', 0x37e0c8);

    this.drawSky();
    this.drawStrip();
    this.buildScenery();
    this.buildCars();
    this.buildHud();
    this.buildStagingOverlay();
    this.buildCountdown();

    this.raceData.onPhaseChange('countdown');
  }

  // ------------------------------------------------------------------ world --

  private drawSky(): void {
    this.add.rectangle(0, 0, VIEW.width, VIEW.horizon, SCENERY.skyTop).setOrigin(0, 0).setDepth(0);
    const bands = 12;
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const colour = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(SCENERY.skyTop),
        Phaser.Display.Color.ValueToColor(SCENERY.skyBottom),
        100,
        Math.round(t * 100),
      );
      const hex = (colour.r << 16) | (colour.g << 8) | colour.b;
      const height = VIEW.horizon / bands + 1;
      this.add.rectangle(0, i * height, VIEW.width, height, hex).setOrigin(0, 0).setDepth(0);
    }
  }

  private track(object: SceneryObject['object'], worldX: number): void {
    this.scenery.push({ object, worldX });
  }

  private drawStrip(): void {
    for (let i = 0; i < 40; i += 1) {
      const height = 10 + ((i * 37) % 13);
      this.add
        .rectangle(i * 26, VIEW.horizon - height / 2, 18, height, SCENERY.treeline)
        .setOrigin(0.5, 0.5)
        .setDepth(1);
    }

    this.add
      .rectangle(0, VIEW.horizon, VIEW.width, VIEW.hudTop - VIEW.horizon, SCENERY.asphalt)
      .setOrigin(0, 0)
      .setDepth(2);
    this.add.rectangle(0, VIEW.aiLaneY - 24, VIEW.width, 26, SCENERY.aiLane).setOrigin(0, 0).setDepth(3);
    this.add.rectangle(0, VIEW.playerLaneY - 26, VIEW.width, 28, SCENERY.playerLane).setOrigin(0, 0).setDepth(3);
    this.add.rectangle(0, VIEW.playerLaneY + 2, VIEW.width, 3, SCENERY.centreLine).setOrigin(0, 0).setDepth(4);

    for (let metres = 0; metres <= RACE_LENGTH; metres += 25) {
      const worldX = metres * VIEW.pxPerMetre;
      const isFinish = metres === RACE_LENGTH;
      this.track(
        this.add
          .rectangle(0, VIEW.playerLaneY - 12, 2, 38, isFinish ? SCENERY.finishGlow : 0x39415e)
          .setOrigin(0.5, 0.5)
          .setDepth(5),
        worldX,
      );
      if (!isFinish && metres % 50 === 0 && metres > 0) {
        const label = this.add
          .text(0, VIEW.playerLaneY - 24, `${metres}M`, { fontFamily: FONT, fontSize: '9px', color: '#7d88ab' })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.track(label, worldX);
      }
      if (isFinish) {
        const banner = this.add
          .text(0, VIEW.playerLaneY - 52, 'FINISH', { fontFamily: FONT, fontSize: '12px', color: '#37e0c8' })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.track(banner, worldX);
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            const even = (row + col) % 2 === 0;
            this.track(
              this.add
                .rectangle((col - 1) * 6, VIEW.playerLaneY - 32 + row * 6, 6, 6, even ? 0xf2f5ff : 0x0d0f18)
                .setOrigin(0.5, 0.5)
                .setDepth(5),
              worldX,
            );
          }
        }
      }
    }
  }

  private buildScenery(): void {
    for (let i = 0; i < 30; i += 1) {
      const worldX = i * 290;
      const height = 16 + ((i * 53) % 10);
      this.track(
        this.add
          .rectangle(0, VIEW.horizon + height / 2 + 2, 92, height, i % 3 === 0 ? 0x1c2338 : 0x181e30)
          .setOrigin(0.5, 0.5)
          .setDepth(3),
        worldX,
      );
      if (i % 3 === 0) {
        this.track(
          this.add
            .text(0, VIEW.horizon + 5, 'LUMEN GP', { fontFamily: FONT, fontSize: '7px', color: '#4a5578' })
            .setOrigin(0.5, 0)
            .setDepth(4),
          worldX,
        );
      }
    }
  }

  private buildCars(): void {
    const wheelDx = (CAR_WHEELS.rearX - CAR_SPRITE.width / 2) * CAR_SCALE;
    const wheelFrontDx = (CAR_WHEELS.frontX - CAR_SPRITE.width / 2) * CAR_SCALE;
    const wheelDy = (CAR_SPRITE.height - CAR_WHEELS.y) * CAR_SCALE;

    const makeCar = (
      texture: string,
      wheelTexture: string,
      laneY: number,
    ): { car: Phaser.GameObjects.Image; wheels: Phaser.GameObjects.Image[] } => {
      const car = this.add
        .image(VIEW.playerX, laneY, texture)
        .setOrigin(0.5, 1)
        .setScale(CAR_SCALE)
        .setDepth(10);
      const wheels = [wheelDx, wheelFrontDx].map((offset) =>
        this.add
          .image(VIEW.playerX + offset, laneY - wheelDy, wheelTexture)
          .setOrigin(0.5, 0.5)
          .setScale(CAR_SCALE)
          .setDepth(11),
      );
      return { car, wheels };
    };

    const rival = makeCar('car-opponent', 'wheel-opponent', VIEW.aiLaneY);
    this.opponentCar = rival.car;
    this.opponentWheels = rival.wheels;
    this.opponentCar.setAlpha(0.94);

    const player = makeCar('car-player', 'wheel-player', VIEW.playerLaneY);
    this.playerCar = player.car;
    this.playerWheels = player.wheels;

    const treeX = -70;
    this.add.image(treeX, VIEW.playerLaneY + 6, 'light-tree').setOrigin(0.5, 1).setDepth(9);
    ['bulb-red', 'bulb-amber', 'bulb-green'].forEach((key, index) => {
      const bulb = this.add.image(treeX, VIEW.playerLaneY - 46 + index * 15, key).setScale(2).setDepth(12);
      bulb.setTint(0x252c40);
      this.bulbs.push(bulb);
      this.track(bulb, treeX);
    });
  }

  // -------------------------------------------------------------------- HUD --

  /** Angle in Phaser canvas radians for a fraction of the sweep (0..1). */
  private static gaugeAngle(t: number): number {
    const degrees = TACH.startDeg + t * TACH.sweepDeg - 90;
    return (degrees * Math.PI) / 180;
  }

  private buildHud(): void {
    const { centreX: cx, centreY: cy, radius: r } = TACH;

    this.add.rectangle(0, VIEW.hudTop, VIEW.width, VIEW.height - VIEW.hudTop, 0x080a11).setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, VIEW.hudTop, VIEW.width, 2, 0x1e2537).setOrigin(0, 0).setDepth(21);

    const face = this.add.graphics().setDepth(21);
    face.fillStyle(0x0a0d15, 1);
    face.fillCircle(cx, cy, r - 1);
    face.lineStyle(2, 0x1e2536, 1);
    face.strokeCircle(cx, cy, r);

    const arc = (from: number, to: number, colour: number, width: number, alpha: number) => {
      const g = this.add.graphics().setDepth(22);
      g.lineStyle(width, colour, alpha);
      g.beginPath();
      g.arc(
        cx,
        cy,
        r - 6,
        RaceScene.gaugeAngle(Math.max(0, from) / MAX_RPM),
        RaceScene.gaugeAngle(Math.min(MAX_RPM, to) / MAX_RPM),
        false,
      );
      g.strokePath();
    };

    arc(SHIFT_BAND[0], SHIFT_BAND[1], 0x37e0c8, 7, 0.55);
    arc(REV_LIMIT_RPM, MAX_RPM, 0xff3b30, 7, 0.95);

    const ticks = this.add.graphics().setDepth(23);
    for (let rpm = 0; rpm <= MAX_RPM; rpm += 500) {
      const angle = RaceScene.gaugeAngle(rpm / MAX_RPM);
      const major = rpm % 1000 === 0;
      const inner = r - (major ? 13 : 9);
      const outer = r - 3;
      ticks.lineStyle(1, rpm >= REV_LIMIT_RPM ? 0xff5c5c : major ? 0x6d78a0 : 0x3a4259, 1);
      ticks.beginPath();
      ticks.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ticks.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ticks.strokePath();
    }

    this.add
      .text(cx, cy - r - 4, 'RPM x1000', { fontFamily: FONT, fontSize: '7px', color: '#5f6a8a' })
      .setOrigin(0.5, 1)
      .setDepth(23);

    this.gearText = this.add
      .text(cx, cy - 6, '1', { fontFamily: FONT, fontSize: '20px', color: '#e8ecf7' })
      .setOrigin(0.5, 0.5)
      .setDepth(25);
    this.rpmText = this.add
      .text(cx, cy + 18, '0', { fontFamily: FONT, fontSize: '9px', color: '#9aa6c8' })
      .setOrigin(0.5, 0.5)
      .setDepth(25);
    this.add
      .text(cx, cy + 32, 'GEAR', { fontFamily: FONT, fontSize: '6px', color: '#3f4763' })
      .setOrigin(0.5, 0.5)
      .setDepth(25);

    this.needle = this.add
      .rectangle(cx, cy, 2, r - 10, 0xffffff)
      .setOrigin(0.5, 1)
      .setDepth(26)
      .setAngle(TACH.startDeg);
    this.add.circle(cx, cy, 4, 0x0b0d14).setDepth(27);
    this.add.circle(cx, cy, 2, 0x37e0c8).setDepth(27);

    // Progress rails.
    this.add
      .rectangle(VIEW.progressX, VIEW.hudTop + 8, VIEW.progressWidth, 5, 0x161b28)
      .setOrigin(0, 0)
      .setDepth(21);
    this.opponentProgress = this.add
      .rectangle(VIEW.progressX, VIEW.hudTop + 8, 0, 5, SCENERY.aiAccent)
      .setOrigin(0, 0)
      .setDepth(22);
    this.playerProgress = this.add
      .rectangle(VIEW.progressX, VIEW.hudTop + 15, 0, 5, SCENERY.finishGlow)
      .setOrigin(0, 0)
      .setDepth(22);

    const rightX = VIEW.progressX;
    this.add
      .text(rightX, VIEW.hudTop + 30, 'SPEED', { fontFamily: FONT, fontSize: '8px', color: '#7d88ab' })
      .setOrigin(0, 0)
      .setDepth(22);
    this.speedText = this.add
      .text(rightX, VIEW.hudTop + 38, '0', { fontFamily: FONT, fontSize: '30px', color: '#e8ecf7' })
      .setOrigin(0, 0)
      .setDepth(22);
    this.add
      .text(rightX + 4, VIEW.hudTop + 74, 'KM/H', { fontFamily: FONT, fontSize: '8px', color: '#5f6a8a' })
      .setOrigin(0, 0)
      .setDepth(22);

    this.add
      .text(VIEW.width - 14, VIEW.hudTop + 30, 'TIME', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#7d88ab',
      })
      .setOrigin(1, 0)
      .setDepth(22);
    this.timeText = this.add
      .text(VIEW.width - 14, VIEW.hudTop + 38, '0.00', { fontFamily: FONT, fontSize: '24px', color: '#e8ecf7' })
      .setOrigin(1, 0)
      .setDepth(22);
    this.splitText = this.add
      .text(VIEW.width - 14, VIEW.hudTop + 70, '', { fontFamily: FONT, fontSize: '9px', color: '#5f6a8a' })
      .setOrigin(1, 0)
      .setDepth(22);

    this.leadText = this.add
      .text(VIEW.width - 14, VIEW.hudTop + 84, '', { fontFamily: FONT, fontSize: '9px', color: '#9aa6c8' })
      .setOrigin(1, 0)
      .setDepth(22);

    this.shiftBanner = this.add
      .text(VIEW.progressX + VIEW.progressWidth / 2, VIEW.hudTop + 58, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(27)
      .setAlpha(0);

    this.hintText = this.add
      .text(VIEW.progressX + VIEW.progressWidth / 2, VIEW.hudTop + 84, '', {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#9aa6c8',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(27);
  }

  private buildCountdown(): void {
    this.countdownText = this.add
      .text(VIEW.width / 2, VIEW.hudTop / 2 + 6, '', {
        fontFamily: FONT,
        fontSize: '52px',
        color: '#e8ecf7',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(40);
  }

  private buildStagingOverlay(): void {
    const { stageBarX: x, stageBarWidth: width, stageBarY: barY } = VIEW;
    const height = 20;

    this.stagingGroup = this.add.container(0, 0).setDepth(30).setVisible(false);
    this.stagingGroup.add(
      this.add.rectangle(124, VIEW.hudTop + 2, VIEW.width - 126, VIEW.height - VIEW.hudTop - 4, 0x080a11).setOrigin(0, 0).setAlpha(0.94),
    );
    this.stagingGroup.add(
      this.add
        .text(136, VIEW.hudTop + 14, 'STAGE — HOLD GAS TO REV, RELEASE TO LAUNCH', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#e8ecf7',
        })
        .setOrigin(0, 0),
    );
    this.stagingGroup.add(this.add.rectangle(x, barY, width, height, 0x161b28).setOrigin(0, 0));
    this.stagingGroup.add(
      this.add
        .rectangle(
          x + (LAUNCH_BAND_GOOD[0] / MAX_RPM) * width,
          barY,
          ((LAUNCH_BAND_GOOD[1] - LAUNCH_BAND_GOOD[0]) / MAX_RPM) * width,
          height,
          0x24405c,
        )
        .setOrigin(0, 0),
    );
    this.stagingGroup.add(
      this.add
        .rectangle(
          x + (LAUNCH_BAND_SWEET[0] / MAX_RPM) * width,
          barY,
          ((LAUNCH_BAND_SWEET[1] - LAUNCH_BAND_SWEET[0]) / MAX_RPM) * width,
          height,
          0x37e0c8,
        )
        .setOrigin(0, 0)
        .setAlpha(0.55),
    );
    this.stagingBarFill = this.add.rectangle(x, barY, 0, height, 0x2f8f7d).setOrigin(0, 0);
    this.stagingGroup.add(this.stagingBarFill);
    this.stagingGroup.add(
      this.add
        .text(x, barY + height + 8, `AIM FOR ${LAUNCH.optimalRpm} RPM`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#37e0c8',
        })
        .setOrigin(0, 0),
    );
    this.stagingGroup.add(
      this.add
        .text(x, barY + height + 22, 'TOO LOW AND YOU BOG — TOO HIGH AND YOU HIT THE LIMITER', {
          fontFamily: FONT,
          fontSize: '8px',
          color: '#5f6a8a',
        })
        .setOrigin(0, 0),
    );
  }

  // ------------------------------------------------------------------- loop --

  override update(_time: number, delta: number): void {
    this.frameDt = Math.min(delta / 1000, 1 / 20);
    this.elapsed += this.frameDt;

    if (this.phase === 'countdown') {
      this.updateCountdown(this.frameDt);
    } else if (this.phase === 'staging') {
      this.updateStaging(this.frameDt);
    } else if (this.phase === 'racing') {
      this.updateRacing(this.frameDt);
    }

    this.renderWorld();
    this.renderHud();
  }

  private updateCountdown(dt: number): void {
    this.countdownT += dt;
    this.player.setInput({ throttle: false, brake: false, upshift: false, downshift: false });
    this.stagingRevs = DRIVETRAIN.idleRpm;

    const index = Math.floor(this.countdownT / COUNTDOWN_STEP_S);
    if (index < COUNTDOWN_STEPS.length) {
      const label = COUNTDOWN_STEPS[index];
      this.countdownText.setText(label);
      this.countdownText.setColor(index === 0 ? '#ffb020' : '#e8ecf7');
      this.countdownText.setScale(1.15 - (this.countdownT % COUNTDOWN_STEP_S) * 0.3);
      // Green stays dark until the player actually launches.
      this.setBulbs(Math.min(index + 1, 2));
      return;
    }

    if (this.countdownT >= COUNTDOWN_STEPS.length * COUNTDOWN_STEP_S) {
      this.countdownText.setText('STAGE');
      this.countdownText.setColor('#37e0c8');
      this.setBulbs(2);
      this.phase = 'staging';
      this.stagingGroup.setVisible(true);
      this.raceData.onPhaseChange('staging');
    }
  }

  private setBulbs(lit: number): void {
    this.bulbs.forEach((bulb, index) => {
      if (index < lit) bulb.clearTint();
      else bulb.setTint(0x252c40);
    });
  }

  private updateStaging(dt: number): void {
    const controls = this.raceData.controls;
    this.player.setInput({ throttle: false, brake: false, upshift: false, downshift: false });
    this.stagingRevs = this.player.stagingRpm(this.stagingRevs, dt, controls.gas);
    this.opponentStagingRevs = this.opponent.stagingRevs(dt, true, this.opponentStagingRevs);

    if (!controls.gas && this.stagingRevs > DRIVETRAIN.idleRpm + 20) {
      this.launch();
    }
  }

  private launch(): void {
    const playerLaunch = this.player.beginRace(this.stagingRevs);
    this.opponent.drivetrain.beginRace(this.opponentStagingRevs);
    this.phase = 'racing';
    this.stagingGroup.setVisible(false);
    this.countdownText.setText('').setVisible(false);
    this.bulbs.forEach((bulb) => bulb.clearTint());
    this.flashBanner(`${playerLaunch.quality} LAUNCH`, QUALITY_COLOUR[playerLaunch.quality]);
    this.hintText.setText(`UPSHIFT AT ${(OPTIMAL_SHIFT_RPM / 1000).toFixed(0)}K`);
    this.raceData.onPhaseChange('racing');
  }

  private updateRacing(dt: number): void {
    this.raceTime += dt;

    this.player.setInput({
      throttle: this.raceData.controls.gas,
      brake: this.raceData.controls.brake,
      upshift: this.raceData.controls.upshift,
      downshift: this.raceData.controls.downshift,
    });
    this.player.update(dt);
    this.onPlayerShift();

    const opponentDrivetrain = this.opponent.drivetrain;
    const opponentInput = this.player.finished
      ? { throttle: true, brake: false, upshift: false, downshift: false }
      : this.opponent.readInput(dt);
    opponentDrivetrain.setInput(opponentInput);
    opponentDrivetrain.update(dt);

    if (!this.player.finished && this.player.distance >= RACE_LENGTH) {
      this.player.markFinished(this.raceTime);
    }
    if (!opponentDrivetrain.finished && opponentDrivetrain.distance >= RACE_LENGTH) {
      opponentDrivetrain.markFinished(this.raceTime);
    }

    const waitAfterPlayer = this.player.finished && this.raceTime - this.player.finishTime > 2.5;
    const bothHome = this.player.finished && opponentDrivetrain.finished;
    if (bothHome || waitAfterPlayer || this.raceTime > 30) {
      this.phase = 'finished';
      this.raceData.onPhaseChange('finished');
      this.report();
    }
  }

  private onPlayerShift(): void {
    if (!this.player.gearChanged) return;
    const shift = this.player.lastShift;
    if (!shift) return;
    this.flashBanner(shift.quality, QUALITY_COLOUR[shift.quality]);
  }

  private report(): void {
    if (this.reported) return;
    this.reported = true;

    const opponentDrivetrain = this.opponent.drivetrain;
    const playerFinished = this.player.finished;
    const opponentFinished = opponentDrivetrain.finished;
    const playerTime = playerFinished ? this.player.finishTime : Number.POSITIVE_INFINITY;
    const opponentTime = opponentFinished ? opponentDrivetrain.finishTime : Number.POSITIVE_INFINITY;
    const history = this.player.shiftHistory;

    this.raceData.onComplete({
      playerTime,
      aiTime: opponentTime,
      playerFinished,
      aiFinished: opponentFinished,
      win: playerFinished && (!opponentFinished || playerTime < opponentTime),
      launchRpm: Math.round(this.player.launch?.rpm ?? 0),
      launchQuality: this.player.launch?.quality ?? 'BAD',
      shiftCount: history.length,
      perfectShifts: history.filter((q) => q === 'PERFECT' || q === 'GREAT').length,
      goodShifts: history.filter((q) => q === 'GOOD').length,
      missedShifts: history.filter((q) => q === 'MISS' || q === 'BAD').length,
    });
  }

  // ----------------------------------------------------------------- render --

  private renderWorld(): void {
    // World x starts at the finish line offset by the player's screen position,
    // so `screen = worldX - scroll + playerX`.
    const scroll = this.player.distance * VIEW.pxPerMetre;
    for (const item of this.scenery) {
      const x = item.worldX - scroll + VIEW.playerX;
      item.object.x = x;
      item.object.setVisible(x > -70 && x < VIEW.width + 70);
    }

    const opponentDrivetrain = this.opponent.drivetrain;
    const lead = opponentDrivetrain.distance - this.player.distance;
    this.opponentCar.x = clamp(VIEW.playerX + lead * VIEW.pxPerMetreLead, 24, VIEW.width - 24);
    this.opponentCar.y = VIEW.aiLaneY + this.jitter(opponentDrivetrain.redlined, 0.9, 0.25);
    this.playerCar.y = VIEW.playerLaneY + this.jitter(this.player.redlined, 1.1, 0.3) + (this.player.shifting ? 1.5 : 0);

    const wheelDx = (CAR_WHEELS.rearX - CAR_SPRITE.width / 2) * CAR_SCALE;
    const wheelFrontDx = (CAR_WHEELS.frontX - CAR_SPRITE.width / 2) * CAR_SCALE;
    const wheelDy = (CAR_SPRITE.height - CAR_WHEELS.y) * CAR_SCALE;
    this.syncWheels(this.playerWheels, this.playerCar.x, this.playerCar.y, wheelDx, wheelFrontDx, wheelDy, (this.player.speed / DRIVETRAIN.wheelRadiusM) * 3 * this.frameDt);
    this.syncWheels(
      this.opponentWheels,
      this.opponentCar.x,
      this.opponentCar.y,
      wheelDx,
      wheelFrontDx,
      wheelDy,
      (opponentDrivetrain.speed / DRIVETRAIN.wheelRadiusM) * 3 * this.frameDt,
    );
  }

  /** Wheelspin chatter when the limiter is bouncing, otherwise a light idle rumble. */
  private jitter(redlined: boolean, hot: number, calm: number): number {
    return Math.sin(this.elapsed * (redlined ? 38 : 15)) * (redlined ? hot : calm);
  }

  private syncWheels(
    wheels: Phaser.GameObjects.Image[],
    carX: number,
    carY: number,
    rearDx: number,
    frontDx: number,
    dy: number,
    spin: number,
  ): void {
    wheels.forEach((wheel, index) => {
      wheel.angle += spin;
      wheel.x = carX + (index === 0 ? rearDx : frontDx);
      wheel.y = carY - dy;
    });
  }

  private renderHud(): void {
    const rpm = this.phase === 'staging' || this.phase === 'countdown' ? this.stagingRevs : this.player.rpm;
    const inSweetSpot = rpm >= SHIFT_BAND[0] && rpm <= SHIFT_BAND[1];

    this.needle.setAngle(TACH.startDeg + (rpm / MAX_RPM) * TACH.sweepDeg);
    this.needle.fillColor = this.player.redlined ? 0xff3b30 : inSweetSpot ? 0x37e0c8 : 0xffffff;
    this.rpmText.setText(Math.round(rpm).toLocaleString('en-US'));
    this.gearText.setText(this.phase === 'racing' ? String(this.player.gear + 1) : '1');
    this.speedText.setText(String(Math.round(this.phase === 'racing' ? this.player.speedKph : 0)));
    this.timeText.setText((this.phase === 'racing' ? this.raceTime : 0).toFixed(2));

    const opponentDrivetrain = this.opponent.drivetrain;
    this.playerProgress.width = VIEW.progressWidth * Math.min(this.player.distance / RACE_LENGTH, 1);
    this.opponentProgress.width = VIEW.progressWidth * Math.min(opponentDrivetrain.distance / RACE_LENGTH, 1);

    if (this.phase === 'racing') {
      const gap = opponentDrivetrain.distance - this.player.distance;
      this.leadText.setText(
        gap >= 0 ? `TRAILING ${gap.toFixed(1)} M` : `LEADING ${Math.abs(gap).toFixed(1)} M`,
      );
      this.leadText.setColor(gap >= 0 ? '#ff7a5c' : '#37e0c8');
      this.splitText.setText(
        this.raceData.bestTime ? `BEST ${this.raceData.bestTime.toFixed(2)}s` : 'NO TIME ON RECORD',
      );
    } else {
      this.leadText.setText('');
      this.splitText.setText('');
    }

    if (this.phase === 'staging') {
      const inLaunchSweet = this.stagingRevs >= LAUNCH_BAND_SWEET[0] && this.stagingRevs <= LAUNCH_BAND_SWEET[1];
      const inLaunchGood = this.stagingRevs >= LAUNCH_BAND_GOOD[0] && this.stagingRevs <= LAUNCH_BAND_GOOD[1];
      this.stagingBarFill.width = (this.stagingRevs / MAX_RPM) * VIEW.stageBarWidth;
      this.stagingBarFill.fillColor = inLaunchSweet ? 0x37e0c8 : inLaunchGood ? 0x2f8f7d : 0xff9f45;
    }
  }

  private flashBanner(message: string, colour: number): void {
    this.shiftBanner.setText(message);
    this.shiftBanner.setColor(`#${colour.toString(16).padStart(6, '0')}`);
    this.shiftBanner.setAlpha(1);
    this.shiftBanner.setScale(1);
    this.tweens.killTweensOf(this.shiftBanner);
    this.tweens.add({
      targets: this.shiftBanner,
      alpha: 0,
      scale: 0.9,
      delay: SHIFT_MESSAGE_TTL,
      duration: 420,
      ease: 'Quad.easeIn',
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
