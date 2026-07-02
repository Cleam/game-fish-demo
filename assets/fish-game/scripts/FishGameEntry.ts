/**
 * FishGameEntry.ts —— bundle 对外入口组件
 *
 * 用法(宿主项目):
 *   assetManager.loadBundle('fish-game'(或远程 URL), (err, bundle) => {
 *     bundle.load('FishGame', Prefab, (e, prefab) => {
 *       const node = instantiate(prefab)
 *       canvas.addChild(node)                       // 必须挂在 Canvas 下
 *       const entry = node.getComponent('FishGameEntry')
 *       entry.mode = 'win'                          // 或 'lose'
 *       entry.onClickthrough = () => { ... }        // CTA 点击穿透(可选)
 *       // autoPlay=true 时会自动开始;否则调用 entry.play('win')
 *     })
 *   })
 *
 * 组件职责:
 * - 自加载所属 bundle,预载 manifest.json 与全部帧 SpriteFrame
 * - 构建 720×1280 游戏区(等比缩放 + RECT 裁剪),运行 GameController
 * - 逐帧驱动兼容层的补间/定时器与背景滚动
 * - 提供 play / restart / setMode 与 onClickthrough 回调
 */
import { _decorator, assetManager, AssetManager, Component, Graphics, JsonAsset, Label, Layers, Mask, Node, Size, SpriteFrame, UITransform, view, Color, Canvas } from 'cc'
import { DESIGN_H, DESIGN_W, PfScene } from './core/pf'
import { normalizeMode, type GameMode } from './config/mode'
import { ManifestLoader } from './util/ManifestLoader'
import { stateManager } from './core/StateManager'
import { GameController } from './game/GameController'

const { ccclass, property } = _decorator

interface RawManifest {
  heroesByLevel: Record<string, { atk: string[] }>
  heroEnd: string[]
  heroMove: string[]
  npcWaves: Record<string, { idle: string[] }>
  boss: { frames: string[] }
  ui: Record<string, string>
}

@ccclass('FishGameEntry')
export class FishGameEntry extends Component {
  @property({ tooltip: '游戏模式:win 或 lose' })
  mode = 'win'

  @property({ tooltip: '加载完成后是否自动开始' })
  autoPlay = true

  @property({ tooltip: '所属 Asset Bundle 名称' })
  bundleName = 'fish-game'

  /** CTA 主按钮点击穿透回调(宿主可在运行时赋值) */
  onClickthrough: (() => void) | null = null

  private pf?: PfScene
  private controller?: GameController
  private gameArea?: Node
  private contentRoot?: Node
  private loadingLabel?: Label
  private canvasUT?: UITransform
  private loaded = false
  private starting = false
  private lastSize = new Size(0, 0)

  onLoad(): void {
    this.setupNodes()
  }

  // 用 start() 而非 onLoad 触发自动开始:延后一拍,使宿主在 addChild 后
  // 同步设置的 mode / onClickthrough 能在开始前生效。
  start(): void {
    this.drawMaskStencil()
    if (this.autoPlay) this.play(this.mode)
  }

  /** 绘制裁剪 stencil(此时 Mask 已自动创建 Graphics) */
  private drawMaskStencil(): void {
    const g = this.gameArea?.getComponent(Graphics)
    if (!g) return
    g.clear()
    g.rect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H)
    g.fill()
  }

  /** 开始游戏(可指定模式) */
  play(mode?: string): void {
    if (mode) this.mode = normalizeMode(mode)
    if (this.starting) return
    this.starting = true
    if (ManifestLoader.isReady()) {
      this.startGame()
    } else {
      this.loadAssets()
    }
  } 

  /** 切换模式(下次 play/restart 生效) */
  setMode(mode: string): void { this.mode = normalizeMode(mode) }

  /** 完整重置并重新播放当前模式(等价源项目失败弹窗“重新挑战”) */
  restart(): void {
    if (!this.pf || !this.loaded) return
    this.controller?.destroy()
    this.pf.reset()
    this.controller = new GameController(this.pf, this.mode as GameMode, {
      onClickthrough: () => this.onClickthrough?.(),
      requestRestart: () => this.restart(),
    })
    this.controller.start()
  }

  // ────────────────────────────── 内部 ──────────────────────────────

  private setupNodes(): void {
    // 查找 Canvas 以获取用于等比缩放的尺寸
    let p: Node | null = this.node
    while (p) {
      const c = p.getComponent(Canvas)
      if (c) { this.canvasUT = p.getComponent(UITransform) ?? undefined; break }
      p = p.parent
    }

    this.gameArea = new Node('FishGameArea')
    this.gameArea.layer = Layers.Enum.UI_2D
    const ut = this.gameArea.addComponent(UITransform)
    ut.setContentSize(DESIGN_W, DESIGN_H)
    ut.setAnchorPoint(0.5, 0.5)
    // 用 GRAPHICS_STENCIL 类型做等价裁剪(3.8.8 无 Mask.Type.RECT)。
    // 裁剪矩形延到 start() 绘制:此时 Mask.onLoad 已自动创建其 Graphics,避免画到空 stencil。
    const mask = this.gameArea.addComponent(Mask)
    mask.type = Mask.Type.GRAPHICS_STENCIL
    this.node.addChild(this.gameArea)
    this.gameArea.setPosition(0, 0, 0)

    // contentRoot:锚点左上,使子节点可直接用设计坐标(x, -y)
    this.contentRoot = new Node('FishContentRoot')
    this.contentRoot.layer = Layers.Enum.UI_2D
    const cut = this.contentRoot.addComponent(UITransform)
    cut.setContentSize(DESIGN_W, DESIGN_H)
    cut.setAnchorPoint(0, 1)
    this.gameArea.addChild(this.contentRoot)
    this.contentRoot.setPosition(-DESIGN_W / 2, DESIGN_H / 2, 0)

    this.createLoadingLabel()
    this.applyFit(true)
  }

  private createLoadingLabel(): void {
    const n = new Node('FishLoading')
    n.layer = Layers.Enum.UI_2D
    n.addComponent(UITransform).setAnchorPoint(0.5, 0.5)
    const label = n.addComponent(Label)
    label.string = '加载中 0%'
    label.fontSize = 32
    label.lineHeight = 36
    label.color = new Color(170, 204, 255, 255)
    this.gameArea!.addChild(n)
    n.setPosition(0, 0, 0)
    this.loadingLabel = label
  }

  private loadAssets(): void {
    stateManager.reset()
    stateManager.enter('loading')
    const existing = assetManager.getBundle(this.bundleName)
    if (existing) { this.onBundleReady(existing); return }
    assetManager.loadBundle(this.bundleName, (err, bundle) => {
      if (err || !bundle) { console.error('[FishGame] 加载 bundle 失败:', err); return }
      this.onBundleReady(bundle)
    })
  }

  private onBundleReady(bundle: AssetManager.Bundle): void {
    bundle.load('data/manifest', JsonAsset, (err, asset) => {
      if (err || !asset) { console.error('[FishGame] 加载 manifest 失败:', err); return }
      const json = asset.json as Record<string, unknown>
      const raw = json as unknown as RawManifest
      const keys = this.collectFrameKeys(raw)
      this.loadFrames(bundle, keys, (frames) => {
        ManifestLoader.init(json as never, frames)
        this.destroyLoadingLabel()
        this.loaded = true
        this.startGame()
      })
    })
  }

  private collectFrameKeys(raw: RawManifest): string[] {
    const keys: string[] = []
    for (const level of Object.keys(raw.heroesByLevel)) keys.push(...raw.heroesByLevel[level].atk)
    keys.push(...raw.heroEnd, ...raw.heroMove)
    for (const wave of Object.keys(raw.npcWaves)) keys.push(...raw.npcWaves[wave].idle)
    keys.push(...raw.boss.frames)
    for (const name of Object.keys(raw.ui)) keys.push(raw.ui[name])
    return keys
  }

  private basename(key: string): string {
    const seg = key.split('/').pop() ?? key
    return seg.replace(/\.png$/i, '')
  }

  /** 逐帧加载 SpriteFrame(路径 = textures/<key>/spriteFrame),按 basename 建映射 */
  private loadFrames(bundle: AssetManager.Bundle, keys: string[], done: (frames: Map<string, SpriteFrame>) => void): void {
    const map = new Map<string, SpriteFrame>()
    const total = keys.length
    let finished = 0
    if (total === 0) { done(map); return }
    for (const key of keys) {
      bundle.load(`textures/${key}/spriteFrame`, SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
        if (!err && sf) map.set(this.basename(key), sf)
        else console.warn('[FishGame] 帧加载失败:', key, err)
        finished++
        if (this.loadingLabel) this.loadingLabel.string = `加载中 ${Math.floor((finished / total) * 100)}%`
        if (finished === total) done(map)
      })
    }
  }

  private startGame(): void {
    if (!this.pf && this.contentRoot) {
      this.pf = new PfScene(this.contentRoot, (key: string) => ManifestLoader.getSpriteFrame(key))
    }
    if (!this.pf) return
    this.controller = new GameController(this.pf, this.mode as GameMode, {
      onClickthrough: () => this.onClickthrough?.(),
      requestRestart: () => this.restart(),
    })
    this.controller.start()
  }

  private destroyLoadingLabel(): void {
    if (this.loadingLabel && this.loadingLabel.node.isValid) this.loadingLabel.node.destroy()
    this.loadingLabel = undefined
  }

  update(dt: number): void {
    this.applyFit(false)
    if (!this.loaded) return
    this.pf?.update(dt)
    this.controller?.update(dt * 1000)
  }

  /** 等比缩放游戏区以适配画布(SHOW_ALL) */
  private applyFit(force: boolean): void {
    if (!this.gameArea) return
    let w: number, h: number
    if (this.canvasUT) { w = this.canvasUT.width; h = this.canvasUT.height }
    else { const vs = view.getVisibleSize(); w = vs.width; h = vs.height }
    if (!force && Math.abs(w - this.lastSize.width) < 0.5 && Math.abs(h - this.lastSize.height) < 0.5) return
    this.lastSize.width = w
    this.lastSize.height = h
    const s = Math.min(w / DESIGN_W, h / DESIGN_H)
    this.gameArea.setScale(s, s, 1)
  }

  onDestroy(): void {
    this.controller?.destroy()
    this.pf?.reset()
  }
}
