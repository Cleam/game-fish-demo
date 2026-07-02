/**
 * FrameAnimPlayer.ts —— 通用 PNG 帧序列播放器(Cocos 版)
 *
 * 与源项目差异:Cocos 版所有帧已在加载阶段预载为 SpriteFrame,
 * 因此不再走原生 Image 动态加载,直接通过 ManifestLoader 同步解析。
 * 保留要点:
 * - 代次计数(playGen)保证中断安全:随时切换动作不残留旧帧回调
 * - 支持 loop(idle/move)与 once(atk/die)两种模式
 * - stopFrameIndex:once 模式播到目标帧后停住,形成可维持的关键姿态
 */
import { Mathx, PfImage, PfScene, PfTimerEvent } from '../core/pf'
import { ManifestLoader } from '../util/ManifestLoader'

export interface PlayOptions {
  frameRate: number
  loop: boolean
  onComplete?: () => void
  stopFrameIndex?: number
}

export class FrameAnimPlayer {
  private scene: PfScene
  readonly gameObject: PfImage

  private frameTimer: PfTimerEvent | null = null
  /** 每次调用 play() 自增,回调用此值判断是否已被中断 */
  private playGen = 0
  private currentUrls: string[] = []
  private currentFrameIndex = 0

  constructor(scene: PfScene) {
    this.scene = scene
    this.gameObject = scene.add.image(0, 0, '__DEFAULT')
    this.gameObject.setVisible(false)
  }

  play(urls: string[], options: PlayOptions): void {
    const gen = ++this.playGen
    this.stopFrameTimer()
    this.currentUrls = urls
    this.currentFrameIndex = 0
    if (urls.length === 0) return
    // 帧已预加载,直接启动动画
    this.startAnim(urls, options, gen)
  }

  stop(): void {
    this.playGen++ // 使任何挂起的回调失效
    this.stopFrameTimer()
    this.gameObject.setVisible(false)
  }

  destroy(): void {
    this.stop()
    this.gameObject.destroy()
  }

  getCurrentFrameUrl(): string | null {
    return this.currentUrls[this.currentFrameIndex] ?? null
  }

  // ──────────────────────────────────────────────────────────────────

  private startAnim(urls: string[], options: PlayOptions, gen: number): void {
    if (this.playGen !== gen) return

    const total = urls.length
    // 显示第 0 帧(取首个可解析帧)
    const firstIndex = urls.findIndex(u => ManifestLoader.getSpriteFrame(u) !== null)
    if (firstIndex < 0) return
    this.gameObject.setTexture(urls[firstIndex])
    this.gameObject.setVisible(true)
    this.currentFrameIndex = firstIndex

    let ticks = 0
    const delay = 1000 / options.frameRate
    const stopFrameIndex = Mathx.Clamp(options.stopFrameIndex ?? total - 1, 0, total - 1)

    this.frameTimer = this.scene.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        if (this.playGen !== gen) return // 已被新的 play() 中断

        ticks++
        const idx = ticks % total
        const sf = ManifestLoader.getSpriteFrame(urls[idx])
        if (sf) {
          this.gameObject.setTexture(urls[idx])
          this.currentFrameIndex = idx
        }

        // once 模式:播到目标帧后停住当前帧
        if (!options.loop && ticks >= stopFrameIndex) {
          this.stopFrameTimer()
          options.onComplete?.()
        }
      },
    })
  }

  private stopFrameTimer(): void {
    if (this.frameTimer) {
      this.scene.time.removeEvent(this.frameTimer)
      this.frameTimer = null
    }
  }
}
