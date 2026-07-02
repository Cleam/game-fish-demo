/**
 * GameController.ts —— 主战斗流程编排(移植自源项目 GameScene)
 *
 * 与源项目保持一致:100% 代码驱动、async/await 流程、7 层容器架构。
 * 流程:5 波 NPC「吸食」+ 4 次进化(lv0→lv120)→ win(结算弹窗→CTA) / lose(Boss 吞噬→失败弹窗→重试/退出)。
 *
 * 适配点:
 * - Phaser Scene → PfScene(兼容层);所有帧资源已预加载,ensureFramesReady 立即返回。
 * - Scene.restart() → 通过 hooks.requestRestart 由入口重建控制器。
 * - 背景滚动在 update(dtMs) 中推进,delta 单位保持毫秒以复用源项目速度参数。
 */
import { Mathx, PfContainer, PfScene } from '../core/pf'
import { GAME_HEIGHT, GAME_WIDTH, LAYER_DEPTH } from '../config/constants'
import type { GameMode } from '../config/mode'
import { CARD_SLOTS } from '../config/assetMapping'
import { HERO_LEVELS, type HeroLevel, NPC_WAVES, type NpcWaveId, getNextHeroLevel } from '../config/progression'
import { stateManager } from '../core/StateManager'
import { SuctionEffectPlayer } from '../effects/SuctionEffectPlayer'
import { Actor } from './Actor'
import { NpcWaveController } from './NpcWaveController'
import { ManifestLoader } from '../util/ManifestLoader'
import { CtaPage } from '../ui/CtaPage'
import { EvolutionCard } from '../ui/EvolutionCard'
import { LoseModal } from '../ui/LoseModal'
import { StaminaBar } from '../ui/StaminaBar'
import { TimerDisplay } from '../ui/TimerDisplay'
import { WinModal } from '../ui/WinModal'

const HERO_CARD_LEVELS: HeroLevel[] = ['lv30', 'lv60', 'lv90', 'lv120']
const HUD_FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif'

const NPC_SUCTION_LIFT_RATIO: Record<NpcWaveId, number> = {
  '01': 0.22, '02': 0.25, '03': 0.2, '04': 0.1, '05': 0.12,
}

const HERO_SUCTION_CONFIG: Record<HeroLevel, {
  holdFrameIndex: number; holdFrameRate: number; funnelOffsetX: number; funnelOffsetY: number
  mouthOffsetX: number; mouthOffsetY: number; spreadX: number; spreadY: number
}> = {
  lv0: { holdFrameIndex: 9, holdFrameRate: 24, funnelOffsetX: 22, funnelOffsetY: 6, mouthOffsetX: 4, mouthOffsetY: 2, spreadX: 12, spreadY: 10 },
  lv30: { holdFrameIndex: 9, holdFrameRate: 24, funnelOffsetX: 30, funnelOffsetY: 4, mouthOffsetX: 8, mouthOffsetY: 0, spreadX: 15, spreadY: 12 },
  lv60: { holdFrameIndex: 9, holdFrameRate: 24, funnelOffsetX: 38, funnelOffsetY: -4, mouthOffsetX: 12, mouthOffsetY: -4, spreadX: 18, spreadY: 14 },
  lv90: { holdFrameIndex: 9, holdFrameRate: 26, funnelOffsetX: 48, funnelOffsetY: -16, mouthOffsetX: 18, mouthOffsetY: -10, spreadX: 22, spreadY: 16 },
  lv120: { holdFrameIndex: 9, holdFrameRate: 26, funnelOffsetX: 58, funnelOffsetY: -14, mouthOffsetX: 22, mouthOffsetY: -8, spreadX: 24, spreadY: 18 },
}

function indexAngle(seed: number): number {
  return (seed / 60) * 0.7 + Math.PI * 0.2
}

interface ScrollItem {
  object: { x: number }
  speed: number
  wrapX: number
  resetX: number
}

export interface GameHooks {
  /** CTA 主按钮点击穿透回调(由宿主提供) */
  onClickthrough?: () => void
  /** 重试:由入口重建控制器 */
  requestRestart: () => void
}

export class GameController {
  private pf: PfScene
  private mode: GameMode
  private hooks: GameHooks

  backgroundLayer!: PfContainer
  battleLayer!: PfContainer
  effectLayer!: PfContainer
  hudLayer!: PfContainer
  evolutionLayer!: PfContainer
  modalLayer!: PfContainer
  ctaLayer!: PfContainer

  private currentHeroLevel: HeroLevel = 'lv0'
  private currentNpcWaveIndex = 0
  private isUpgrading = false
  private isFinalLoseSequence = false

  private heroActor?: Actor
  private bossActor?: Actor
  private npcController?: NpcWaveController
  private suctionEffect?: SuctionEffectPlayer
  private staminaBar?: StaminaBar
  private timerDisplay?: TimerDisplay
  private loseModal?: LoseModal
  private winModal?: WinModal
  private ctaPage?: CtaPage
  private evolutionCards: EvolutionCard[] = []
  private scrollingObjects: ScrollItem[] = []
  private flowToken = 0
  private isSceneAlive = false

  constructor(pf: PfScene, mode: GameMode, hooks: GameHooks) {
    this.pf = pf
    this.mode = mode
    this.hooks = hooks
  }

  /** 等价源项目 init + create */
  start(): void {
    this.currentHeroLevel = 'lv0'
    this.currentNpcWaveIndex = 0
    this.isUpgrading = false
    this.isFinalLoseSequence = false
    this.flowToken++
    this.isSceneAlive = true
    // bundle 可被反复实例化/重试,这里把状态机拉回初始态再进入 playing,避免非法跳转警告
    stateManager.reset()
    stateManager.enter('playing')

    this.createLayers()
    this.createBackground()
    this.createTopHud()
    this.createEvolutionPanel()
    this.createOverlayUi()
    this.npcController = new NpcWaveController(this.pf, this.battleLayer)
    this.suctionEffect = new SuctionEffectPlayer(this.pf, this.effectLayer)
    const token = this.flowToken
    void this.bootstrapFlow(token)
  }

  private async bootstrapFlow(token: number): Promise<void> {
    await this.ensureFramesReady()
    if (!this.isFlowValid(token)) return
    this.spawnHero('lv0')
    if (!this.isFlowValid(token)) return
    if (this.mode === 'lose') this.spawnLoseBoss()
    if (!this.isFlowValid(token)) return
    await this.startFlow(token)
  }

  /** 由入口逐帧调用,dtMs 单位毫秒(复用源项目滚动速度参数) */
  update(dtMs: number): void {
    for (const item of this.scrollingObjects) {
      item.object.x -= dtMs * item.speed
      if (item.object.x <= item.wrapX) item.object.x = item.resetX
    }
  }

  private createLayers(): void {
    this.backgroundLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.background)
    this.battleLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.battle)
    this.effectLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.effect)
    this.hudLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.hud)
    this.evolutionLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.evolution)
    this.modalLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.modal)
    this.ctaLayer = this.pf.add.container(0, 0).setDepth(LAYER_DEPTH.cta)
  }

  private createBackground(): void {
    const bgKey = ManifestLoader.getUiKey('bg')
    const probe = this.pf.add.image(0, 0, bgKey)
    const srcW = probe.width || GAME_WIDTH
    const srcH = probe.height || GAME_HEIGHT
    probe.destroy()

    const bgScale = Math.max(GAME_WIDTH / srcW, GAME_HEIGHT / srcH)
    const bgDisplayWidth = srcW * bgScale
    const bg1 = this.pf.add.image(bgDisplayWidth / 2, GAME_HEIGHT / 2, bgKey)
    const bg2 = this.pf.add.image(bgDisplayWidth * 1.5, GAME_HEIGHT / 2, bgKey)
    bg1.setScale(bgScale)
    bg2.setScale(bgScale)
    this.backgroundLayer.add([bg1, bg2])
    this.scrollingObjects.push(
      { object: bg1, speed: 0.048, wrapX: -bgDisplayWidth / 2, resetX: bgDisplayWidth * 1.5 },
      { object: bg2, speed: 0.048, wrapX: -bgDisplayWidth / 2, resetX: bgDisplayWidth * 1.5 },
    )

    const as2Key = ManifestLoader.getUiKey('as2')
    const as2 = this.pf.add.image(GAME_WIDTH / 2, 128, as2Key)
    if (as2.width) as2.setScale(GAME_WIDTH / as2.width)
    this.hudLayer.add(as2)

    const levelBg = this.pf.add.rectangle(GAME_WIDTH / 2, 112, 188, 44, 0x000000, 0.42)
    const levelTxt = this.pf.add.text(GAME_WIDTH / 2, 112, '第185关', {
      fontSize: '18px', color: '#ffd95d', fontFamily: HUD_FONT, fontStyle: 'bold',
    }).setOrigin(0.5)
    this.hudLayer.add([levelBg, levelTxt])

    const reef1 = this.pf.add.rectangle(552, 802, 228, 64, 0xd1f1ff, 0.9)
    const reef2 = this.pf.add.rectangle(112, 852, 152, 48, 0xc0ecff, 0.85)
    const seaweedPositions = [150, 188, 512, 550, 590]
    for (const x of seaweedPositions) {
      const weed = this.pf.add.rectangle(x, 822, 12, 108, 0x57c09f, 0.72)
      this.backgroundLayer.add(weed)
      this.scrollingObjects.push({ object: weed, speed: 0.112, wrapX: -80, resetX: GAME_WIDTH + 80 })
    }

    const bubble1 = this.pf.add.circle(348, 836, 18, 0xffffff, 0.28)
    const bubble2 = this.pf.add.circle(626, 732, 14, 0xffffff, 0.24)
    this.backgroundLayer.add([reef1, reef2, bubble1, bubble2])
    this.scrollingObjects.push(
      { object: reef1, speed: 0.08, wrapX: -180, resetX: GAME_WIDTH + 220 },
      { object: reef2, speed: 0.096, wrapX: -180, resetX: GAME_WIDTH + 220 },
    )

    for (const bubble of [bubble1, bubble2]) {
      this.pf.tweens.add({
        targets: bubble,
        y: bubble.y - 36,
        alpha: 0.08,
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    const vignette = this.pf.add.graphics()
    vignette.fillGradientStyle(0x042445, 0x042445, 0x071c35, 0x071c35, 0.22)
    vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.backgroundLayer.add(vignette)
  }

  private createTopHud(): void {
    const titleTxt = this.pf.add.text(GAME_WIDTH / 2, 50, '海底幽牢', {
      fontSize: '34px', color: '#ffffff', fontFamily: HUD_FONT, fontStyle: 'bold', stroke: '#1b215f', strokeThickness: 8,
    }).setOrigin(0.5)
    this.hudLayer.add(titleTxt)
  }

  private createEvolutionPanel(): void {
    // 源项目用 as1 图裁剪出面板/徽标;兼容层不支持裁剪,这里用半透明面板近似,
    // 不影响进化卡这一核心内容的表现。
    const panel = this.pf.add.rectangle(GAME_WIDTH / 2, 1041, 720, 398, 0x1a2544, 0.82)
    const panelTop = this.pf.add.rectangle(GAME_WIDTH / 2, 846, 720, 6, 0x4e61b5, 0.9)

    const titleTxt = this.pf.add.text(GAME_WIDTH / 2, 1118, '生物进化', {
      fontSize: '16px', color: '#ffffff', fontFamily: HUD_FONT, fontStyle: 'bold', stroke: '#4e61b5', strokeThickness: 4,
    }).setOrigin(0.5)

    this.evolutionLayer.add([panel, panelTop, titleTxt])

    const positions = [882, 988, 1094, 1200]
    CARD_SLOTS.forEach((slot, index) => {
      const card = new EvolutionCard(this.pf, GAME_WIDTH / 2, positions[index], slot, this.mode, this.evolutionLayer)
      this.evolutionCards.push(card)
    })
    this.refreshEvolutionCards(0)
  }

  private createOverlayUi(): void {
    if (this.mode === 'lose') {
      this.timerDisplay = new TimerDisplay(this.pf, 112, 276, this.hudLayer)
      this.staminaBar = new StaminaBar(this.pf, GAME_WIDTH / 2, 154, this.hudLayer)
      this.loseModal = new LoseModal(this.pf, this.modalLayer, 'final_actor', () => this.onRetry(), () => this.onExitChallenge())
    } else {
      this.winModal = new WinModal(this.pf, this.modalLayer, 'final_actor', () => this.onClaimReward())
    }
    this.ctaPage = new CtaPage(this.pf, this.ctaLayer, 'final_actor')
  }

  private spawnHero(level: HeroLevel): void {
    this.heroActor?.destroy()
    const frames = ManifestLoader.getHeroFrames(level)
    const pose = this.getHeroPose(level)
    this.heroActor = new Actor(this.pf, this.battleLayer, frames, frames[0])
    this.heroActor.spawn(pose, true, 15)
    this.currentHeroLevel = level
  }

  private spawnLoseBoss(): void {
    const bossFrames = ManifestLoader.getBossFrames()
    this.bossActor = new Actor(this.pf, this.battleLayer, bossFrames, bossFrames[0])
    this.bossActor.spawn(this.getBossPose(), true, 12)
    this.pf.tweens.add({
      targets: this.bossActor.player.gameObject,
      y: this.bossActor.y - 12,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private async startFlow(token: number): Promise<void> {
    await this.delay(500)
    if (!this.isFlowValid(token)) return
    for (const wave of NPC_WAVES) {
      if (!this.isFlowValid(token)) return
      this.currentNpcWaveIndex = NPC_WAVES.indexOf(wave)
      await this.playWave(wave, token)
      if (!this.isFlowValid(token)) return

      const nextLevel = getNextHeroLevel(this.currentHeroLevel)
      if (wave !== '05' && nextLevel) {
        await this.upgradeHero(nextLevel, token)
        if (!this.isFlowValid(token)) return
      }
    }

    if (!this.isFlowValid(token)) return
    if (this.mode === 'lose') await this.playLoseEnding(token)
    else await this.playWinEnding(token)
  }

  private async playWave(wave: NpcWaveId, token: number): Promise<void> {
    await this.ensureFramesReady()
    if (!this.isFlowValid(token)) return
    const heroMouth = this.heroActor?.getMouthWorldPoint() ?? { x: 300, y: 590 }
    const npcs = this.npcController?.spawnWave(wave, heroMouth) ?? []
    this.refreshEvolutionCards(0.12)
    const suctionConfig = HERO_SUCTION_CONFIG[this.currentHeroLevel]
    this.heroActor?.play(false, suctionConfig.holdFrameRate, undefined, suctionConfig.holdFrameIndex)
    this.followBossBehindHero()

    for (const npc of npcs) {
      npc.moveTo(npc.x + 54, npc.y, 1800)
    }

    await this.delay(480)
    if (!this.isFlowValid(token)) return
    const chasePose = this.getHeroChasePose()
    await new Promise<void>((resolve) => this.heroActor?.tweenPose(chasePose, 420, resolve))

    await this.delay(120)
    if (!this.isFlowValid(token)) return
    const mouth = this.getHeroSuctionMouthPoint()
    this.suctionEffect?.play(mouth.x, mouth.y, wave === '05' ? 92 : 72, 720)
    await this.consumeWave(npcs)
    if (!this.isFlowValid(token)) return

    this.heroActor?.play(true, 14)
    this.npcController?.destroy()
    await new Promise<void>((resolve) => this.heroActor?.tweenPose(this.getHeroPose(this.currentHeroLevel), 260, resolve))
  }

  private async consumeWave(npcs: Actor[]): Promise<void> {
    await Promise.all(npcs.map((npc, index) => this.consumeNpc(npc, index)))
  }

  private consumeNpc(npc: Actor, index: number): Promise<void> {
    return new Promise((resolve) => {
      const target = npc.player.gameObject
      const startX = target.x
      const startY = target.y
      const startScale = Math.abs(target.scaleX)
      const spiral = { t: 0 }
      const delayMs = index * 60
      const config = HERO_SUCTION_CONFIG[this.currentHeroLevel]
      const laneX = (index % 3) - 1
      const laneY = Math.floor(index / 3) - 0.5
      const currentWave = NPC_WAVES[this.currentNpcWaveIndex] ?? '01'
      const verticalLift = target.displayHeight * NPC_SUCTION_LIFT_RATIO[currentWave]

      this.pf.time.delayedCall(delayMs, () => {
        this.pf.tweens.add({
          targets: spiral,
          t: 1,
          duration: 650,
          ease: 'Sine.easeIn',
          onUpdate: () => {
            const t = spiral.t
            const angle = indexAngle(delayMs) + t * 5.6
            const radius = (1 - t) * (44 + index * 6)
            const mouth = this.getHeroSuctionMouthPoint()
            const funnelTarget = {
              x: mouth.x + config.funnelOffsetX + laneX * config.spreadX,
              y: mouth.y + config.funnelOffsetY + laneY * config.spreadY - verticalLift,
            }
            const finalTarget = {
              x: mouth.x + config.mouthOffsetX,
              y: mouth.y + config.mouthOffsetY,
            }

            if (t < 0.76) {
              const p = t / 0.76
              target.x = Mathx.Linear(startX, funnelTarget.x, p) + Math.cos(angle) * radius
              target.y = Mathx.Linear(startY, funnelTarget.y, p) + Math.sin(angle) * radius * 0.48
              target.setScale(startScale * (1 - p * 0.52))
              target.setAlpha(1 - p * 0.38)
              return
            }

            const p = (t - 0.76) / 0.24
            target.x = Mathx.Linear(funnelTarget.x, finalTarget.x, p)
            target.y = Mathx.Linear(funnelTarget.y, finalTarget.y, p)
            target.setScale(startScale * (0.48 - p * 0.4))
            target.setAlpha(0.62 - p * 0.58)
          },
          onComplete: () => {
            npc.destroy()
            resolve()
          },
        })
      })
    })
  }

  /** 吸食过程跟随 hero 当前停住的攻击帧计算口部位置,避免大体型阶段穿模。 */
  private getHeroSuctionMouthPoint(): { x: number; y: number } {
    return this.heroActor?.getMouthWorldPoint() ?? { x: 250, y: 580 }
  }

  private async upgradeHero(nextLevel: HeroLevel, token: number): Promise<void> {
    this.isUpgrading = true
    await this.ensureFramesReady()
    if (!this.isFlowValid(token)) return
    const mouth = this.heroActor?.getMouthWorldPoint() ?? { x: 250, y: 580 }
    this.suctionEffect?.playBurst(mouth.x - 32, mouth.y + 8)
    await this.delay(260)

    const prevActor = this.heroActor
    prevActor?.fadeOut(220)

    const frames = ManifestLoader.getHeroFrames(nextLevel)
    const nextPose = this.getHeroPose(nextLevel)
    this.heroActor = new Actor(this.pf, this.battleLayer, frames, frames[0])
    this.heroActor.spawn({
      ...nextPose,
      x: mouth.x - 58,
      y: mouth.y + 24,
      alpha: 0.1,
      scale: nextPose.scale * 0.86,
    }, true, 15)

    await new Promise<void>((resolve) => this.heroActor?.tweenPose({ ...nextPose, alpha: 1 }, 320, resolve))
    if (!this.isFlowValid(token)) return
    prevActor?.destroy()
    this.currentHeroLevel = nextLevel
    this.refreshEvolutionCards(1)
    this.followBossBehindHero()
    this.isUpgrading = false
    await this.delay(280)
  }

  private async playWinEnding(token: number): Promise<void> {
    if (!this.isFlowValid(token)) return
    stateManager.enter('resultWin')
    await this.delay(650)
    if (!this.isFlowValid(token)) return
    this.winModal?.show()
  }

  private async playLoseEnding(token: number): Promise<void> {
    if (!this.isFlowValid(token)) return
    this.isFinalLoseSequence = true
    stateManager.enter('finalBattle')

    this.timerDisplay?.show(10)
    this.staminaBar?.show()
    this.staminaBar?.setPercent(1)

    const hero = this.heroActor
    const boss = this.bossActor
    if (!hero || !boss) return

    hero.playFrames(this.getLv120MoveFrames(), true, 52)
    this.pf.tweens.add({
      targets: hero.player.gameObject,
      x: hero.x + 96,
      duration: 90,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    const mouth = hero.getMouthWorldPoint()
    await new Promise<void>((resolve) => boss.tweenPose({ x: hero.x - 384, y: hero.y + 2 }, 900, resolve))
    if (!this.isFlowValid(token)) return

    for (const value of [0.82, 0.58, 0.34, 0.12, 0]) {
      if (!this.isFlowValid(token)) return
      this.staminaBar?.setPercent(value)
      this.timerDisplay?.setValue(10 * value)
      this.suctionEffect?.play(mouth.x - 188, mouth.y - 18, 102, 600)
      hero.flashHit()
      await this.delay(360)
    }

    const bossMouth = boss.getMouthWorldPoint()
    await new Promise<void>((resolve) => {
      const target = hero.player.gameObject
      this.pf.tweens.killTweensOf(target)
      const startX = target.x
      const startY = target.y
      const startScale = Math.abs(target.scaleX)
      const state = { t: 0 }
      this.pf.tweens.add({
        targets: state,
        t: 1,
        duration: 880,
        ease: 'Sine.easeIn',
        onUpdate: () => {
          const t = state.t
          const angle = Math.PI + t * 6
          const radius = (1 - t) * 66
          target.x = Mathx.Linear(startX, bossMouth.x, t) + Math.cos(angle) * radius
          target.y = Mathx.Linear(startY, bossMouth.y, t) + Math.sin(angle) * radius * 0.45
          target.setScale(startScale * (1 - t * 0.88))
          target.setAlpha(1 - t * 0.95)
        },
        onComplete: () => resolve(),
      })
    })
    if (!this.isFlowValid(token)) return

    hero.destroy()
    this.heroActor = undefined
    stateManager.enter('resultLose')
    await this.delay(300)
    this.loseModal?.show()
  }

  private refreshEvolutionCards(currentProgress: number): void {
    if (!this.isSceneAlive || this.evolutionCards.length === 0) return
    const currentIndex = HERO_LEVELS.indexOf(this.currentHeroLevel)
    this.evolutionCards.forEach((card, index) => {
      const levelIndex = HERO_LEVELS.indexOf(HERO_CARD_LEVELS[index])
      if (currentIndex > levelIndex) {
        card.setState('unlocked')
        card.setProgress(1)
      } else if (currentIndex === levelIndex) {
        card.setState('current')
        card.setProgress(this.mode === 'win' ? currentProgress : 1)
      } else {
        card.setState('locked')
        card.setProgress(0)
      }
    })
  }

  private getHeroPose(level: HeroLevel): { x: number; y: number; scale: number; flipX: boolean } {
    const base = { x: 228, y: 620, scale: 1, flipX: false }
    const targetVisibleWidth: Record<HeroLevel, number> = {
      lv0: 154, lv30: 198, lv60: 382, lv90: 500, lv120: 620,
    }
    const frame = ManifestLoader.getHeroFrames(level)[0] ?? ''
    return {
      ...base,
      y: level === 'lv0' ? 626 : level === 'lv30' ? 636 : level === 'lv60' ? 648 : level === 'lv90' ? 666 : 694,
      scale: this.scaleForVisibleWidth(frame, targetVisibleWidth[level]),
    }
  }

  private getHeroChasePose(): { x: number; y: number; scale: number } {
    const pose = this.getHeroPose(this.currentHeroLevel)
    return { x: pose.x + 74, y: pose.y - 10, scale: pose.scale * 1.08 }
  }

  private getBossPose(): { x: number; y: number; scale: number; flipX: boolean } {
    const bossFrame = ManifestLoader.getBossFrame()
    return {
      x: -412,
      y: 660,
      scale: this.scaleForVisibleWidth(bossFrame, 920),
      flipX: false,
    }
  }

  private followBossBehindHero(): void {
    if (this.mode !== 'lose' || !this.heroActor || !this.bossActor || this.isFinalLoseSequence) return
    this.bossActor.tweenPose({ x: this.heroActor.x - 648, y: this.heroActor.y + 6 }, 420)
  }

  private scaleForVisibleWidth(frameUrl: string, visibleWidth: number): number {
    const trim = ManifestLoader.getTrimmedFrame(frameUrl)
    if (!trim || trim.bounds.width === 0) return 0.5
    return visibleWidth / trim.bounds.width
  }

  private getLv120MoveFrames(): string[] {
    // lose 结算里 hero 逃跑动作使用的 move 帧;来源于 manifest.heroMove。
    return ManifestLoader.getHeroMoveFrames()
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.pf.time.delayedCall(ms, () => resolve()))
  }

  /** 源项目按需异步加载帧;Cocos 版已预加载,立即返回。 */
  private async ensureFramesReady(): Promise<void> {
    return Promise.resolve()
  }

  private isFlowValid(token: number): boolean {
    return this.isSceneAlive && token === this.flowToken
  }

  private onClaimReward(): void {
    stateManager.enter('cta')
    this.winModal?.hide()
    this.battleLayer.setVisible(false)
    this.effectLayer.setVisible(false)
    this.hudLayer.setVisible(false)
    this.evolutionLayer.setVisible(false)
    this.ctaPage?.show()
  }

  private onRetry(): void {
    stateManager.enter('restarting')
    this.hooks.requestRestart()
  }

  private onExitChallenge(): void {
    stateManager.enter('cta')
    this.loseModal?.hide()
    this.battleLayer.setVisible(false)
    this.effectLayer.setVisible(false)
    this.hudLayer.setVisible(false)
    this.evolutionLayer.setVisible(false)
    this.ctaPage?.show()
  }

  /** CTA 主按钮点击穿透(供入口/CTA 调用) */
  triggerClickthrough(): void {
    this.hooks.onClickthrough?.()
  }

  /** 销毁:清理角色、卡片、控制器持有的对象(节点由 PfScene.reset 统一移除) */
  destroy(): void {
    this.isSceneAlive = false
    this.flowToken++
    this.npcController?.destroy()
    this.heroActor?.destroy()
    this.bossActor?.destroy()
    for (const card of this.evolutionCards) card.destroy()
    this.evolutionCards = []
    this.scrollingObjects = []
  }
}
