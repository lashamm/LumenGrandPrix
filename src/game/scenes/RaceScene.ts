import Phaser from 'phaser';
import { DRIVETRAIN, LAUNCH, PHASER, RACE_DISTANCE_M, SCENE_KEYS } from '../config';
import type { AiDifficulty, RaceResult, ShiftQuality, UpgradeLevels } from '../types';
import type { CarDefinition } from '../car/carData';
import { deriveStats } from '../physics/carStats';
import { Drivetrain } from '../physics/drivetrain';
import { AiDriver } from '../ai/aiDriver';
import {
  generateBulbTexture,
  generateCarTexture,
  generateLightTreeTexture,
  generateWheelTexture,
  SCENERY,
} from '../pixelArt';
import type { ControlState } from '../control';

export type RacePhase = 'staging' | 'racing' | 'finished';

export interface RaceSceneData {
  playerLevels: UpgradeLevels;
  playerCar: CarDefinition;
  aiCar: CarDefinition;
  difficulty: AiDifficulty;
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
  /** Screen pixels per metre of lead over the AI (exaggerated for readability). */
  pxPerMetreLead: 2.4,
  hudTop: 172,
  rpmBarX: 26,
  rpmBarWidth: 250,
  rpmBarY: 44,
  rpmBarHeight: 18,
  stageBarX: 96,
  stageBarWidth: 288,
  stageBarHeight: 20,
} as const;

const LAUNCH_BAND_SWEET: readonly [number, number] = [LAUNCH.optimalRpm - 400, LAUNCH.optimalRpm + 400];
const LAUNCH_BAND_GOOD: readonly [number, number] = [LAUNCH.optimalRpm - 1100, LAUNCH.optimalRpm + 800];

const QUALITY_COLOUR: Record<ShiftQuality, number> = {
  PERFECT: 0x37e0c8,
  GREAT: 0x7ee787,
  GOOD: 0xffd166,
  MISS: 0xff9f45,
  BAD: 0xff5c5c,
};

const FONT = '"Courier New", Courier, monospace';
const SHIFT_MESSAGE_TTL = 1100;

interface SceneryObject {
  object: Phaser.GameObjects.GameObject & { x: number; setVisible(v: boolean): unknown };
  worldX: number;
}

export class RaceScene extends Phaser.Scene {
  /** Race payload handed over by the React shell via `game.scene.add`. */
  private raceData!: RaceSceneData;
  private player!: Drivetrain;
  private ai!: AiDriver;

  private phase: RacePhase = 'staging';
  private stagingRevs: number = DRIVETRAIN.idleRpm;
  private aiStagingRevs: number = DRIVETRAIN.idleRpm;
  private raceTime = 0;
  private elapsed = 0;
  private frameDt = 1 / 60;
  private reported = false;

  private playerCar!: Phaser.GameObjects.Image;
  private aiCar!: Phaser.GameObjects.Image;
  private playerWheels: Phaser.GameObjects.Image[] = [];
  private aiWheels: Phaser.GameObjects.Image[] = [];
  private scenery: SceneryObject[] = [];
  private bulbs: Phaser.GameObjects.Image[] = [];

  private rpmBarFill!: Phaser.GameObjects.Rectangle;
  private rpmNeedle!: Phaser.GameObjects.Rectangle;
  private rpmText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private shiftBanner!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private playerProgress!: Phaser.GameObjects.Rectangle;
  private aiProgress!: Phaser.GameObjects.Rectangle;
  private stagingBarFill!: Phaser.GameObjects.Rectangle;
  private stagingGroup!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SCENE_KEYS.race });
  }

  init(data: RaceSceneData): void {
    this.raceData = data;
    this.player = new Drivetrain({ stats: deriveStats(data.playerLevels) });
    this.ai = new AiDriver({
      difficulty: data.difficulty,
      levels: data.playerLevels,
      seed: (Math.random() * 0xffffffff) >>> 0,
    });
    this.phase = 'staging';
    this.stagingRevs = DRIVETRAIN.idleRpm;
    this.aiStagingRevs = DRIVETRAIN.idleRpm;
    this.raceTime = 0;
    this.elapsed = 0;
    this.reported = false;
    this.playerWheels = [];
    this.aiWheels = [];
    this.scenery = [];
    this.bulbs = [];
  }

  create(): void {
    generateCarTexture(this, 'car-player', this.raceData.playerCar);
    generateCarTexture(this, 'car-ai', this.raceData.aiCar);
    generateWheelTexture(this, 'wheel');
    generateLightTreeTexture(this);
    generateBulbTexture(this, 'bulb-red', 0xff3b30);
    generateBulbTexture(this, 'bulb-amber', 0xffb020);
    generateBulbTexture(this, 'bulb-green', 0x37e0c8);

    this.drawSky();
    this.drawStrip();
    this.buildScenery();
    this.buildCars();
    this.buildHud();

    this.raceData.onPhaseChange('staging');
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

    for (let metres = 0; metres <= RACE_DISTANCE_M; metres += 25) {
      const x = metres * VIEW.pxPerMetre;
      const isFinish = metres === RACE_DISTANCE_M;
      this.track(
        this.add
          .rectangle(x, VIEW.playerLaneY - 12, 2, 38, isFinish ? SCENERY.finishGlow : 0x39415e)
          .setOrigin(0.5, 0.5)
          .setDepth(5),
        x,
      );
      if (!isFinish && metres % 50 === 0 && metres > 0) {
        const label = this.add
          .text(0, VIEW.playerLaneY - 24, `${metres}M`, { fontFamily: FONT, fontSize: '9px', color: '#7d88ab' })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.track(label, x);
      }
      if (isFinish) {
        const banner = this.add
          .text(x, VIEW.playerLaneY - 52, 'FINISH', { fontFamily: FONT, fontSize: '12px', color: '#37e0c8' })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.track(banner, x);
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            const even = (row + col) % 2 === 0;
            this.track(
              this.add
                .rectangle(x + (col - 1) * 6, VIEW.playerLaneY - 32 + row * 6, 6, 6, even ? 0xf2f5ff : 0x0d0f18)
                .setOrigin(0.5, 0.5)
                .setDepth(5),
              x,
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
          .rectangle(worldX, VIEW.horizon + height / 2 + 2, 92, height, i % 3 === 0 ? 0x1c2338 : 0x181e30)
          .setOrigin(0.5, 0.5)
          .setDepth(3),
        worldX,
      );
      if (i % 3 === 0) {
        this.track(
          this.add
            .text(worldX, VIEW.horizon + 5, 'LUMEN GP', { fontFamily: FONT, fontSize: '7px', color: '#4a5578' })
            .setOrigin(0.5, 0)
            .setDepth(4),
          worldX,
        );
      }
    }
  }

  private buildCars(): void {
    const makeCar = (
      texture: string,
      laneY: number,
    ): { car: Phaser.GameObjects.Image; wheels: Phaser.GameObjects.Image[] } => {
      const car = this.add.image(VIEW.playerX, laneY, texture).setOrigin(0.5, 1).setScale(2).setDepth(10);
      const wheels = [-20, 20].map((offset) =>
        this.add.image(VIEW.playerX + offset, laneY - 9, 'wheel').setOrigin(0.5, 0.5).setScale(2).setDepth(11),
      );
      return { car, wheels };
    };

    const ai = makeCar('car-ai', VIEW.aiLaneY);
    this.aiCar = ai.car;
    this.aiWheels = ai.wheels;
    this.aiCar.setAlpha(0.94);

    const player = makeCar('car-player', VIEW.playerLaneY);
    this.playerCar = player.car;
    this.playerWheels = player.wheels;

    const treeX = 40 * VIEW.pxPerMetre;
    this.add.image(treeX, VIEW.playerLaneY + 6, 'light-tree').setOrigin(0.5, 1).setDepth(9);
    ['bulb-red', 'bulb-amber', 'bulb-green'].forEach((key, index) => {
      const bulb = this.add.image(treeX, VIEW.playerLaneY - 46 + index * 15, key).setScale(2).setDepth(12);
      bulb.setTint(0x252c40);
      this.bulbs.push(bulb);
      this.track(bulb, treeX);
    });
  }

  // -------------------------------------------------------------------- HUD --

  private rpmToX(rpm: number, x: number, width: number): number {
    return x + (rpm / DRIVETRAIN.redlineRpm) * width;
  }

  private band(x: number, width: number, low: number, high: number, height: number, colour: number, depth: number) {
    return this.add
      .rectangle(
        this.rpmToX(low, x, width),
        VIEW.hudTop + VIEW.rpmBarY,
        ((high - low) / DRIVETRAIN.redlineRpm) * width,
        height,
        colour,
      )
      .setOrigin(0, 0)
      .setDepth(depth);
  }

  private buildHud(): void {
    const { rpmBarX: x, rpmBarWidth: width, rpmBarY: barYOffset, rpmBarHeight: height } = VIEW;
    const barY = VIEW.hudTop + barYOffset;

    this.add.rectangle(0, VIEW.hudTop, VIEW.width, VIEW.height - VIEW.hudTop, 0x080a11).setOrigin(0, 0).setDepth(20);
    this.add.rectangle(0, VIEW.hudTop, VIEW.width, 2, 0x1e2537).setOrigin(0, 0).setDepth(21);

    const progressX = 18;
    const progressWidth = VIEW.width - 36;
    this.add.rectangle(progressX, VIEW.hudTop + 10, progressWidth, 5, 0x161b28).setOrigin(0, 0).setDepth(21);
    this.aiProgress = this.add.rectangle(progressX, VIEW.hudTop + 10, 0, 5, SCENERY.aiAccent).setOrigin(0, 0).setDepth(22);
    this.playerProgress = this.add
      .rectangle(progressX, VIEW.hudTop + 17, 0, 5, SCENERY.finishGlow)
      .setOrigin(0, 0)
      .setDepth(22);

    this.add.rectangle(x, barY, width, height, 0x161b28).setOrigin(0, 0).setDepth(21);
    this.band(x, width, DRIVETRAIN.shiftUpRpm - 380, DRIVETRAIN.shiftUpRpm + 380, height, 0x24405c, 22);
    this.band(x, width, DRIVETRAIN.shiftUpRpm - 60, DRIVETRAIN.shiftUpRpm + 60, height, 0x37e0c8, 23).setAlpha(0.45);
    this.rpmBarFill = this.add.rectangle(x, barY, 0, height, 0x2f8f7d).setOrigin(0, 0).setDepth(24);
    this.band(x, width, DRIVETRAIN.revLimitRpm, DRIVETRAIN.redlineRpm, height, 0xff3b30, 25).setAlpha(0.8);
    this.rpmNeedle = this.add.rectangle(x, barY - 5, 2, height + 10, 0xffffff).setOrigin(0, 0).setDepth(26);

    for (let rpm = 0; rpm <= DRIVETRAIN.redlineRpm; rpm += 1000) {
      const tickX = this.rpmToX(rpm, x, width);
      this.add.rectangle(tickX, barY + height, 1, 4, 0x3a4259).setOrigin(0, 0).setDepth(22);
      if (rpm > 0) {
        this.add
          .text(tickX, barY + height + 6, `${rpm / 1000}`, { fontFamily: FONT, fontSize: '8px', color: '#5f6a8a' })
          .setOrigin(0.5, 0)
          .setDepth(22);
      }
    }
    this.add
      .text(this.rpmToX(DRIVETRAIN.shiftUpRpm, x, width), barY - 3, 'SHIFT HERE', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#37e0c8',
      })
      .setOrigin(0.5, 1)
      .setDepth(22);
    this.add
      .text(x, barY - 3, 'RPM', { fontFamily: FONT, fontSize: '9px', color: '#7d88ab' })
      .setOrigin(0, 1)
      .setDepth(22);

    this.rpmText = this.add
      .text(x + width + 12, barY, '0', { fontFamily: FONT, fontSize: '20px', color: '#e8ecf7' })
      .setOrigin(0, 0)
      .setDepth(26);
    this.add
      .text(x + width + 12, barY + 21, 'RPM', { fontFamily: FONT, fontSize: '8px', color: '#5f6a8a' })
      .setOrigin(0, 0)
      .setDepth(26);

    this.add
      .text(x, VIEW.hudTop + 72, 'GEAR', { fontFamily: FONT, fontSize: '9px', color: '#7d88ab' })
      .setOrigin(0, 0)
      .setDepth(22);
    this.gearText = this.add
      .text(x, VIEW.hudTop + 82, '1', { fontFamily: FONT, fontSize: '26px', color: '#e8ecf7' })
      .setOrigin(0, 0)
      .setDepth(22);
    this.add
      .text(x + 26, VIEW.hudTop + 96, '/ 6', { fontFamily: FONT, fontSize: '10px', color: '#5f6a8a' })
      .setOrigin(0, 0)
      .setDepth(22);

    this.add
      .text(x + 76, VIEW.hudTop + 72, 'KM/H', { fontFamily: FONT, fontSize: '9px', color: '#7d88ab' })
      .setOrigin(0, 0)
      .setDepth(22);
    this.speedText = this.add
      .text(x + 76, VIEW.hudTop + 82, '0', { fontFamily: FONT, fontSize: '26px', color: '#e8ecf7' })
      .setOrigin(0, 0)
      .setDepth(22);

    this.timeText = this.add
      .text(VIEW.width - 18, VIEW.hudTop + 26, '0.00s', { fontFamily: FONT, fontSize: '13px', color: '#e8ecf7' })
      .setOrigin(1, 0)
      .setDepth(22);

    this.shiftBanner = this.add
      .text(VIEW.width / 2, VIEW.hudTop + 74, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setDepth(27)
      .setAlpha(0);

    this.hintText = this.add
      .text(VIEW.width / 2, VIEW.hudTop + 26, '', { fontFamily: FONT, fontSize: '10px', color: '#9aa6c8' })
      .setOrigin(0.5, 0)
      .setDepth(27);

    this.buildStagingOverlay();
  }

  private buildStagingOverlay(): void {
    const { stageBarX: x, stageBarWidth: width, stageBarHeight: height } = VIEW;
    const barY = VIEW.hudTop + 52;

    this.stagingGroup = this.add.container(0, 0).setDepth(30);
    this.stagingGroup.add(this.add.rectangle(0, 0, VIEW.width, VIEW.height, 0x080a11).setOrigin(0, 0).setAlpha(0.97));
    this.stagingGroup.add(
      this.add
        .text(VIEW.width / 2, VIEW.hudTop + 22, 'STAGE   HOLD GAS TO REV   RELEASE TO LAUNCH', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#e8ecf7',
        })
        .setOrigin(0.5, 0),
    );
    this.stagingGroup.add(this.add.rectangle(x, barY, width, height, 0x161b28).setOrigin(0, 0));
    this.stagingGroup.add(
      this.add
        .rectangle(
          this.rpmToX(LAUNCH_BAND_GOOD[0], x, width),
          barY,
          ((LAUNCH_BAND_GOOD[1] - LAUNCH_BAND_GOOD[0]) / DRIVETRAIN.redlineRpm) * width,
          height,
          0x24405c,
        )
        .setOrigin(0, 0),
    );
    this.stagingGroup.add(
      this.add
        .rectangle(
          this.rpmToX(LAUNCH_BAND_SWEET[0], x, width),
          barY,
          ((LAUNCH_BAND_SWEET[1] - LAUNCH_BAND_SWEET[0]) / DRIVETRAIN.redlineRpm) * width,
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
        .text(VIEW.width / 2, barY + height + 8, `AIM FOR ${LAUNCH.optimalRpm} RPM`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#37e0c8',
        })
        .setOrigin(0.5, 0),
    );
    this.stagingGroup.add(
      this.add
        .text(
          VIEW.width / 2,
          barY + height + 24,
          'TOO LOW AND YOU BOG   TOO HIGH AND YOU HIT THE LIMITER',
          { fontFamily: FONT, fontSize: '8px', color: '#5f6a8a' },
        )
        .setOrigin(0.5, 0),
    );
  }

  // ------------------------------------------------------------------- loop --

  override update(_time: number, delta: number): void {
    this.frameDt = Math.min(delta / 1000, 1 / 20);
    this.elapsed += this.frameDt;

    if (this.phase === 'staging') {
      this.updateStaging(this.frameDt);
    } else {
      this.updateRacing(this.frameDt);
    }

    this.renderWorld();
    this.renderHud();
  }

  private updateStaging(dt: number): void {
    const controls = this.raceData.controls;
    this.player.setInput({ throttle: false, upshift: false, downshift: false });
    this.stagingRevs = this.player.stagingRpm(this.stagingRevs, dt, controls.gas);
    this.aiStagingRevs = this.ai.stagingRevs(dt, true, this.aiStagingRevs);

    if (!controls.gas && this.stagingRevs > DRIVETRAIN.idleRpm + 20) {
      this.launch();
    }
  }

  private launch(): void {
    const playerLaunch = this.player.beginRace(this.stagingRevs);
    this.ai.car.beginRace(this.aiStagingRevs);
    this.phase = 'racing';
    this.stagingGroup.setVisible(false);
    this.bulbs.forEach((bulb, index) => {
      this.time.delayedCall(index * 90, () => bulb.clearTint());
    });
    this.flashBanner(`${playerLaunch.quality} LAUNCH`, QUALITY_COLOUR[playerLaunch.quality]);
    this.hintText.setText('HOLD GAS   UPSHIFT AT 6K');
    this.raceData.onPhaseChange('racing');
  }

  private updateRacing(dt: number): void {
    this.raceTime += dt;

    this.player.setInput({
      throttle: this.raceData.controls.gas,
      upshift: this.raceData.controls.upshift,
      downshift: this.raceData.controls.downshift,
    });
    this.player.update(dt);
    this.onPlayerShift();

    const aiInput = this.player.finished ? { throttle: true, upshift: false, downshift: false } : this.ai.update(dt);
    this.ai.car.setInput(aiInput);
    this.ai.car.update(dt);

    if (!this.player.finished && this.player.distance >= RACE_DISTANCE_M) {
      this.player.markFinished(this.raceTime);
    }
    if (!this.ai.car.finished && this.ai.car.distance >= RACE_DISTANCE_M) {
      this.ai.car.markFinished(this.raceTime);
    }

    const waitAfterPlayer = this.player.finished && this.raceTime - this.player.finishTime > 2.5;
    const bothHome = this.player.finished && this.ai.car.finished;
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

    const playerFinished = this.player.finished;
    const aiFinished = this.ai.car.finished;
    const playerTime = playerFinished ? this.player.finishTime : Number.POSITIVE_INFINITY;
    const aiTime = aiFinished ? this.ai.car.finishTime : Number.POSITIVE_INFINITY;
    const history = this.player.shiftHistory;

    this.raceData.onComplete({
      playerTime,
      aiTime,
      playerFinished,
      aiFinished,
      win: playerFinished && (!aiFinished || playerTime < aiTime),
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
    const scroll = this.player.distance * VIEW.pxPerMetre;
    for (const item of this.scenery) {
      const x = item.worldX - scroll;
      item.object.x = x;
      item.object.setVisible(x > -70 && x < VIEW.width + 70);
    }

    const lead = this.ai.car.distance - this.player.distance;
    this.aiCar.x = clamp(VIEW.playerX + lead * VIEW.pxPerMetreLead, 24, VIEW.width - 24);
    this.aiCar.y = VIEW.aiLaneY + this.jitter(this.ai.car.redlined, 0.9, 0.25);
    this.playerCar.y = VIEW.playerLaneY + this.jitter(this.player.redlined, 1.1, 0.3) + (this.player.shifting ? 1.5 : 0);

    this.syncWheels(this.playerWheels, this.playerCar.x, this.playerCar.y, (this.player.speed / DRIVETRAIN.wheelRadiusM) * 3 * this.frameDt);
    this.syncWheels(this.aiWheels, this.aiCar.x, this.aiCar.y, (this.ai.car.speed / DRIVETRAIN.wheelRadiusM) * 3 * this.frameDt);
  }

  /** Wheelspin chatter when the limiter is bouncing, otherwise a light idle rumble. */
  private jitter(redlined: boolean, hot: number, calm: number): number {
    return Math.sin(this.elapsed * (redlined ? 38 : 15)) * (redlined ? hot : calm);
  }

  private syncWheels(wheels: Phaser.GameObjects.Image[], carX: number, carY: number, spin: number): void {
    wheels.forEach((wheel, index) => {
      wheel.angle += spin;
      wheel.x = carX + (index === 0 ? -20 : 20);
      wheel.y = carY - 9;
    });
  }

  private renderHud(): void {
    const { rpmBarX: x, rpmBarWidth: width } = VIEW;
    const rpm = this.phase === 'staging' ? this.stagingRevs : this.player.rpm;
    const inSweetSpot = rpm >= DRIVETRAIN.shiftUpRpm - 380 && rpm <= DRIVETRAIN.shiftUpRpm + 380;

    this.rpmBarFill.width = (rpm / DRIVETRAIN.redlineRpm) * width;
    this.rpmBarFill.fillColor = this.player.redlined ? 0xff3b30 : inSweetSpot ? 0x37e0c8 : 0x2f8f7d;
    this.rpmNeedle.x = x + (rpm / DRIVETRAIN.redlineRpm) * width;
    this.rpmText.setText(Math.round(rpm).toLocaleString('en-US'));
    this.gearText.setText(String(this.player.gear + 1));
    this.speedText.setText(String(Math.round(this.player.speedKph)));
    this.timeText.setText(`${(this.phase === 'staging' ? 0 : this.raceTime).toFixed(2)}s`);

    const progressWidth = VIEW.width - 36;
    this.playerProgress.width = progressWidth * Math.min(this.player.distance / RACE_DISTANCE_M, 1);
    this.aiProgress.width = progressWidth * Math.min(this.ai.car.distance / RACE_DISTANCE_M, 1);

    if (this.phase === 'staging') {
      const inLaunchSweet = this.stagingRevs >= LAUNCH_BAND_SWEET[0] && this.stagingRevs <= LAUNCH_BAND_SWEET[1];
      const inLaunchGood = this.stagingRevs >= LAUNCH_BAND_GOOD[0] && this.stagingRevs <= LAUNCH_BAND_GOOD[1];
      this.stagingBarFill.width = (this.stagingRevs / DRIVETRAIN.redlineRpm) * VIEW.stageBarWidth;
      this.stagingBarFill.fillColor = inLaunchSweet ? 0x37e0c8 : inLaunchGood ? 0x2f8f7d : 0xff9f45;
      this.gearText.setText('1');
      this.rpmText.setText(Math.round(this.stagingRevs).toLocaleString('en-US'));
      this.speedText.setText('0');
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