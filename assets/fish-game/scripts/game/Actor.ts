import { PfContainer, PfImage, PfScene } from '../core/pf'
import { FrameAnimPlayer } from './FrameAnimPlayer'
import { ManifestLoader } from '../util/ManifestLoader'

export interface ActorPose {
  x: number
  y: number
  scale: number
  flipX?: boolean
  alpha?: number
  tint?: number
}

/**
 * 通用角色实例:
 * - hero: 使用 atk 序列循环或 once 播放
 * - npc: 使用 idle 序列循环游动
 * - boss: 使用单帧图
 */
export class Actor {
  readonly player: FrameAnimPlayer
  private scene: PfScene
  private frames: string[]
  private representativeFrame: string
  private moveTween?: { stop(): void }

  constructor(
    scene: PfScene,
    layer: PfContainer,
    frames: string[],
    representativeFrame?: string,
  ) {
    this.scene = scene
    this.frames = frames
    this.representativeFrame = representativeFrame ?? frames[0] ?? ''
    this.player = new FrameAnimPlayer(scene)
    layer.add(this.player.gameObject)
  }

  spawn(pose: ActorPose, loop = true, frameRate = 14): void {
    this.applyPose(pose)
    if (this.frames.length === 1) {
      this.player.play(this.frames, { frameRate: 1, loop: true })
      return
    }
    this.player.play(this.frames, { frameRate, loop })
  }

  play(loop: boolean, frameRate: number, onComplete?: () => void, stopFrameIndex?: number): void {
    this.player.play(this.frames, { frameRate, loop, onComplete, stopFrameIndex })
  }

  /**
   * 临时切换到其他动作资源(如失败结算里的 lv120 move 逃跑动画)。
   * 不覆盖代表帧,避免影响基于 atk trim 的既有定位逻辑。
   */
  playFrames(urls: string[], loop: boolean, frameRate: number, onComplete?: () => void, stopFrameIndex?: number): void {
    this.player.play(urls, { frameRate, loop, onComplete, stopFrameIndex })
  }

  applyPose(pose: ActorPose): void {
    const img = this.player.gameObject
    img.setPosition(pose.x, pose.y)
    img.setScale(pose.scale)
    img.setFlipX(pose.flipX ?? false)
    img.setAlpha(pose.alpha ?? 1)
    if (pose.tint !== undefined) img.setTint(pose.tint)
    else img.clearTint()

    const trim = ManifestLoader.getTrimmedFrame(this.representativeFrame)
    if (trim) {
      img.setOrigin(trim.centerAnchor.x, trim.centerAnchor.y)
    } else {
      img.setOrigin(0.5, 0.5)
    }
  }

  moveTo(x: number, y: number, duration: number, onComplete?: () => void): void {
    this.moveTween?.stop()
    this.moveTween = this.scene.tweens.add({
      targets: this.player.gameObject,
      x,
      y,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.moveTween = undefined
        onComplete?.()
      },
    })
  }

  tweenPose(pose: Partial<ActorPose>, duration: number, onComplete?: () => void): void {
    this.moveTween?.stop()
    const img = this.player.gameObject
    if (pose.flipX !== undefined) img.setFlipX(pose.flipX)
    if (pose.tint !== undefined) img.setTint(pose.tint)
    this.moveTween = this.scene.tweens.add({
      targets: img,
      x: pose.x ?? img.x,
      y: pose.y ?? img.y,
      scaleX: pose.scale ?? img.scaleX,
      scaleY: pose.scale ?? img.scaleY,
      alpha: pose.alpha ?? img.alpha,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.moveTween = undefined
        onComplete?.()
      },
    })
  }

  flashHit(): void {
    const img = this.player.gameObject
    const origX = img.x
    this.scene.tweens.add({
      targets: img,
      alpha: 0.35,
      duration: 65,
      yoyo: true,
      ease: 'Linear',
    })
    this.scene.tweens.add({
      targets: img,
      x: origX + 10,
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => { img.x = origX },
    })
  }

  fadeOut(duration: number, onComplete?: () => void): void {
    this.scene.tweens.add({
      targets: this.player.gameObject,
      alpha: 0,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => onComplete?.(),
    })
  }

  getMouthWorldPoint(): { x: number; y: number } {
    const currentFrame = this.player.getCurrentFrameUrl() ?? this.representativeFrame
    const trim = ManifestLoader.getTrimmedFrame(currentFrame) ?? ManifestLoader.getTrimmedFrame(this.representativeFrame)
    const img = this.player.gameObject
    if (!trim || !img.texture) {
      return { x: img.x, y: img.y }
    }

    const width = trim.sourceWidth * img.scaleX
    const height = trim.sourceHeight * img.scaleY
    const originX = trim.centerAnchor.x
    const originY = trim.centerAnchor.y
    const dir = img.flipX ? -1 : 1
    const mouthX = img.x + ((trim.mouthAnchor.x - originX) * width) * dir
    const mouthY = img.y + (trim.mouthAnchor.y - originY) * height
    return { x: mouthX, y: mouthY }
  }

  destroy(): void {
    this.moveTween?.stop()
    this.scene.tweens.killTweensOf(this.player.gameObject)
    this.player.destroy()
  }

  get x(): number { return this.player.gameObject.x }
  get y(): number { return this.player.gameObject.y }
}
